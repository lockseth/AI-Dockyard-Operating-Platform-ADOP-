-- ADOP Gate 4B — Evidence & Signed Document Schema/Storage Foundation
--
-- Implements the schema/storage contract frozen in
-- ADOP_GATE_4A_CONTRACT_v1.0.md: an immutable invoice-transaction binding
-- over the closed-project cost ledger, versioned/private evidence documents
-- (the signed+stamped invoice scan), manual verification, and a private
-- storage bucket with tenant-scoped, signed-URL-only access. No UI, OCR,
-- invoice rendering, or billing calculation is added here — `invoices` is
-- intentionally minimal (binding + lifecycle only); Phase 2 billing fields
-- (client_id, due_date, currency, delivery channel) are additive follow-ups
-- on top of this table, not part of this gate.
--
-- Does not edit any prior migration — reuses private.current_user_has_
-- tenant_role, private.set_updated_at, private.block_audit_mutation, and
-- public.access_audit_events (Gate 0A) for every authorization/audit need,
-- and public.project_cost_ledger_entries/public.vessel_projects (Gate 1B/
-- 1D) as the tenant-safe source-of-truth for what can be billed.
-- project_cost_ledger_entries' composite UNIQUE(id, tenant_id) — needed
-- below for invoice_transaction_lines' tenant-safe FK — already exists from
-- Gate 1H (20260722010000_shared_overhead_allocation.sql); not re-added
-- here.

-- =============================================================================
-- 2. Enums
-- =============================================================================

create type public.invoice_status as enum ('draft', 'issued', 'void');
create type public.invoice_evidence_kind as enum ('signed_invoice');
create type public.invoice_evidence_version_status as enum ('pending', 'verified', 'rejected');

-- =============================================================================
-- 3. Tables
-- =============================================================================

-- --- invoices ----------------------------------------------------------------
-- Minimal binding anchor + lifecycle (draft -> issued -> void). No amount/
-- currency/due_date/client columns — invoice value is the sum of its
-- invoice_transaction_lines snapshot (Gate 4A Contract §3/§4), and full
-- billing fields are explicitly out of scope for this gate. `void` is
-- reachable directly from `draft` (cancel before ever issuing) or from
-- `issued` (correction — pairs with reissue via predecessor_invoice_id).
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status public.invoice_status not null default 'draft',
  predecessor_invoice_id uuid,
  issued_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  void_at timestamptz,
  void_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite target for invoice_transaction_lines/invoice_evidence below,
  -- and for the self-referencing predecessor FK.
  unique (id, tenant_id),
  foreign key (predecessor_invoice_id, tenant_id) references public.invoices (id, tenant_id),
  constraint invoices_issued_shape check (
    (status = 'issued' and issued_at is not null and issued_by is not null)
    or (status <> 'issued')
  ),
  constraint invoices_void_shape check (
    (status = 'void' and void_at is not null and void_by is not null and void_reason is not null and btrim(void_reason) <> '')
    or (status <> 'void' and void_at is null and void_by is null and void_reason is null)
  )
);

create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_tenant_id_status_idx on public.invoices (tenant_id, status);
create index invoices_predecessor_invoice_id_idx on public.invoices (predecessor_invoice_id);

-- --- invoice_transaction_lines -------------------------------------------------
-- Immutable binding of one closed project_cost_ledger_entries row to one
-- invoice. amount/description/project_id are snapshotted at bind time
-- (Gate 4A Contract §3 "nilai invoice berasal dari snapshot") — never
-- recomputed live from the ledger. Rows are only insertable/deletable while
-- the parent invoice is `draft` (enforced by trigger in §5); never updated
-- (also enforced by trigger).
create table public.invoice_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null,
  transaction_entry_id uuid not null,
  project_id uuid not null,
  amount numeric(16, 2) not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  created_at timestamptz not null default now(),
  foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  foreign key (transaction_entry_id, tenant_id) references public.project_cost_ledger_entries (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade
);

create index invoice_transaction_lines_tenant_id_idx on public.invoice_transaction_lines (tenant_id);
create index invoice_transaction_lines_invoice_id_idx on public.invoice_transaction_lines (tenant_id, invoice_id);
create index invoice_transaction_lines_transaction_entry_id_idx on public.invoice_transaction_lines (transaction_entry_id);

-- --- invoice_evidence ----------------------------------------------------------
-- One evidence "slot" per (invoice, kind) — v1 has exactly one kind
-- (`signed_invoice`), matching Gate 4A Contract §5's single document-final
-- concept. current_version_id is the explicit "current version" pointer
-- (Contract §5); the FK to invoice_evidence_versions is added in §4 below
-- once that table exists.
create table public.invoice_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null,
  kind public.invoice_evidence_kind not null default 'signed_invoice',
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (invoice_id, kind),
  foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade
);

create index invoice_evidence_tenant_id_idx on public.invoice_evidence (tenant_id);
create index invoice_evidence_invoice_id_idx on public.invoice_evidence (tenant_id, invoice_id);

-- --- invoice_evidence_versions --------------------------------------------------
-- Never overwritten (Contract §5 "tidak boleh di-overwrite") — a new upload
-- is always a new row with a new storage_path and incremented
-- version_number. Verification is per-version (`pending` by default) and,
-- once decided, immutable except for the pending->verified/rejected
-- transition itself (enforced in §5 below).
create table public.invoice_evidence_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  evidence_id uuid not null,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  status public.invoice_evidence_version_status not null default 'pending',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  rejected_reason text,
  unique (id, tenant_id),
  unique (evidence_id, version_number),
  unique (storage_path),
  foreign key (evidence_id, tenant_id) references public.invoice_evidence (id, tenant_id) on delete cascade,
  constraint invoice_evidence_versions_verified_shape check (
    (status = 'verified' and verified_by is not null and verified_at is not null)
    or (status <> 'verified')
  ),
  constraint invoice_evidence_versions_rejected_shape check (
    (status = 'rejected' and rejected_reason is not null and btrim(rejected_reason) <> '')
    or (status <> 'rejected')
  )
);

create index invoice_evidence_versions_tenant_id_idx on public.invoice_evidence_versions (tenant_id);
create index invoice_evidence_versions_evidence_id_idx on public.invoice_evidence_versions (tenant_id, evidence_id);

alter table public.invoice_evidence
  add constraint invoice_evidence_current_version_id_fkey
  foreign key (current_version_id, tenant_id) references public.invoice_evidence_versions (id, tenant_id);

-- =============================================================================
-- 4. updated_at trigger (reuses private.set_updated_at() from Gate 0A)
-- =============================================================================

create trigger set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();

-- =============================================================================
-- 5. Role-independent structural guards (fire regardless of caller — the
--    RPCs in §6, or a service-role/background write)
-- =============================================================================

-- --- 5a. invoices: lifecycle transition guard ---------------------------------
-- The real database constraint for "draft -> issued -> void, or draft ->
-- void directly", mirroring private.enforce_vessel_project_lifecycle_
-- transition. Skip/reverse/reopen/no-op transitions are all rejected.

create function private.enforce_invoice_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'invoice status unchanged: already %', old.status;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('issued', 'void'))
    or (old.status = 'issued' and new.status = 'void')
  ) then
    raise exception 'invalid invoice status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_lifecycle_transition() from public;

create trigger invoices_enforce_lifecycle_transition
  before update of status on public.invoices
  for each row execute function private.enforce_invoice_lifecycle_transition();

-- --- 5b. invoices: predecessor integrity ---------------------------------------
-- A reissue's predecessor_invoice_id must point at a real, same-tenant
-- invoice that is already `void` — the explicit "void + reissue" mechanism
-- Contract §3 requires instead of a silent update.

create function private.enforce_invoice_predecessor_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_predecessor public.invoices;
begin
  if new.predecessor_invoice_id is not null then
    select * into v_predecessor from public.invoices where id = new.predecessor_invoice_id;

    if v_predecessor.id is null then
      raise exception 'predecessor invoice not found';
    end if;
    if v_predecessor.tenant_id <> new.tenant_id then
      raise exception 'predecessor invoice must belong to the same tenant';
    end if;
    if v_predecessor.status <> 'void' then
      raise exception 'predecessor invoice must be void before reissue';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_predecessor_integrity() from public;

create trigger invoices_enforce_predecessor_integrity
  before insert on public.invoices
  for each row execute function private.enforce_invoice_predecessor_integrity();

-- --- 5c. invoice_transaction_lines: locked outside draft ------------------------
-- Binding may only be added/removed while the parent invoice is `draft`
-- (Contract §3 "binding transaksi masih dapat disunting selama draft").
-- Rows are never updated in place (§5d).

create function private.enforce_invoice_transaction_line_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);

  if v_status <> 'draft' then
    raise exception 'invoice binding is locked outside draft status';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_invoice_transaction_line_locked() from public;

create trigger invoice_transaction_lines_enforce_locked
  before insert or delete on public.invoice_transaction_lines
  for each row execute function private.enforce_invoice_transaction_line_locked();

-- --- 5d. invoice_transaction_lines: no in-place update --------------------------
-- Reuses the same role-independent append-only guard Gate 0A/1B/1D use —
-- lines are only ever inserted or deleted (§5c), never updated.

create trigger invoice_transaction_lines_block_update
  before update on public.invoice_transaction_lines
  for each row execute function private.block_audit_mutation();

-- --- 5e. invoice_transaction_lines: source integrity ----------------------------
-- The transaction entry must be a same-tenant, non-reversed `expense` row
-- belonging to a `closed` Project Kapal (Contract §3 "hanya... transaksi
-- yang sudah closed"). Mirrors private.enforce_project_cost_ledger_
-- reversal_integrity's structure.

create function private.enforce_invoice_transaction_line_source_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entry public.project_cost_ledger_entries;
  v_project_status public.vessel_project_lifecycle_status;
begin
  select * into v_entry from public.project_cost_ledger_entries where id = new.transaction_entry_id;

  if v_entry.id is null then
    raise exception 'transaction entry not found';
  end if;
  if v_entry.tenant_id <> new.tenant_id then
    raise exception 'transaction entry must belong to the same tenant as the invoice';
  end if;
  if v_entry.entry_kind <> 'expense' then
    raise exception 'only expense entries can be billed';
  end if;
  if exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = new.transaction_entry_id) then
    raise exception 'transaction entry has been reversed and cannot be billed';
  end if;

  select lifecycle_status into v_project_status from public.vessel_projects where id = v_entry.project_id;
  if v_project_status is distinct from 'closed' then
    raise exception 'vessel project must be closed before billing its transactions';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_transaction_line_source_integrity() from public;

create trigger invoice_transaction_lines_enforce_source_integrity
  before insert on public.invoice_transaction_lines
  for each row execute function private.enforce_invoice_transaction_line_source_integrity();

-- --- 5f. invoice_transaction_lines: one active invoice per transaction ---------
-- Contract §3 "satu transaksi tidak boleh terikat ke lebih dari satu
-- invoice aktif" — active = draft or issued. Structural, role-independent
-- backstop; public.bind_invoice_transaction (§6) additionally takes a row
-- lock on the ledger entry so concurrent binds serialize deterministically
-- (Gate 4A Contract F3/F10, Test Matrix B-08).

create function private.enforce_invoice_transaction_line_uniqueness()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.invoice_transaction_lines l
    join public.invoices i on i.id = l.invoice_id
    where l.transaction_entry_id = new.transaction_entry_id
      and l.id <> new.id
      and i.status in ('draft', 'issued')
  ) then
    raise exception 'transaction entry is already bound to an active invoice';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_transaction_line_uniqueness() from public;

create trigger invoice_transaction_lines_enforce_uniqueness
  before insert on public.invoice_transaction_lines
  for each row execute function private.enforce_invoice_transaction_line_uniqueness();

-- --- 5g. invoice_evidence: source status + immutable core ----------------------
-- Evidence can only be created against an `issued` invoice (Gate 4A
-- Workflow v1 step 4 happens after issuance/signing). Only current_
-- version_id may ever change on an existing row; DELETE is always blocked
-- (Contract §5 "harus dapat ditelusuri" — evidence never disappears once
-- an issued invoice has it).

create function private.enforce_invoice_evidence_source_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = new.invoice_id;
  if v_status <> 'issued' then
    raise exception 'evidence can only be created for an issued invoice';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_invoice_evidence_source_status() from public;

create trigger invoice_evidence_enforce_source_status
  before insert on public.invoice_evidence
  for each row execute function private.enforce_invoice_evidence_source_status();

create function private.enforce_invoice_evidence_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoice_evidence is append-only: DELETE not allowed';
  end if;

  if new.tenant_id <> old.tenant_id
     or new.invoice_id <> old.invoice_id
     or new.kind <> old.kind
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
  then
    raise exception 'invoice_evidence core fields are immutable; only current_version_id may change';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_evidence_mutation() from public;

create trigger invoice_evidence_enforce_mutation
  before update or delete on public.invoice_evidence
  for each row execute function private.enforce_invoice_evidence_mutation();

-- --- 5h. invoice_evidence_versions: immutable core + one-time verification ----
-- storage_path/sha256/size_bytes/mime_type/uploaded_by/uploaded_at/
-- version_number never change after insert (Contract §5 "tidak boleh
-- di-overwrite"). status may transition exactly once, from `pending` to
-- `verified` or `rejected` (Contract §5 "keputusan per versi"). DELETE is
-- always blocked (Contract F13 "versi lama tetap dapat diaudit").

create function private.enforce_invoice_evidence_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoice_evidence_versions is append-only: DELETE not allowed';
  end if;

  if old.status <> 'pending' then
    raise exception 'invoice evidence version decision is already final: %', old.status;
  end if;
  if new.status not in ('verified', 'rejected') then
    raise exception 'invoice evidence version status may only transition from pending to verified or rejected';
  end if;
  if new.tenant_id <> old.tenant_id
     or new.evidence_id <> old.evidence_id
     or new.version_number <> old.version_number
     or new.storage_path <> old.storage_path
     or new.sha256 <> old.sha256
     or new.size_bytes <> old.size_bytes
     or new.mime_type <> old.mime_type
     or new.uploaded_by is distinct from old.uploaded_by
     or new.uploaded_at <> old.uploaded_at
  then
    raise exception 'invoice evidence version core fields are immutable';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_evidence_version_mutation() from public;

create trigger invoice_evidence_versions_enforce_mutation
  before update or delete on public.invoice_evidence_versions
  for each row execute function private.enforce_invoice_evidence_version_mutation();

-- =============================================================================
-- 6. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated` on any table in this migration; see §8)
-- =============================================================================

-- --- 6a. create_draft_invoice --------------------------------------------------

create function public.create_draft_invoice(p_tenant_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.invoices;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create invoice';
  end if;

  insert into public.invoices (tenant_id, status, created_by)
  values (p_tenant_id, 'draft', auth.uid())
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (p_tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.created', null, to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.create_draft_invoice(uuid) from public;
grant execute on function public.create_draft_invoice(uuid) to authenticated;

-- --- 6b. bind_invoice_transaction -----------------------------------------------
-- `for update` on both the invoice and the ledger entry serializes
-- concurrent binds — two callers targeting the same transaction cannot both
-- pass the uniqueness check before either commits (Test Matrix B-08).

create function public.bind_invoice_transaction(
  p_invoice_id uuid,
  p_transaction_entry_id uuid
)
returns public.invoice_transaction_lines
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices;
  v_entry public.project_cost_ledger_entries;
  v_result public.invoice_transaction_lines;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_invoice.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to bind invoice transaction';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is not draft; binding is locked';
  end if;

  select * into v_entry from public.project_cost_ledger_entries where id = p_transaction_entry_id for update;
  if v_entry.id is null then
    raise exception 'transaction entry not found';
  end if;
  if v_entry.tenant_id <> v_invoice.tenant_id then
    raise exception 'transaction entry belongs to a different tenant';
  end if;

  insert into public.invoice_transaction_lines (
    tenant_id, invoice_id, transaction_entry_id, project_id, amount, description
  ) values (
    v_invoice.tenant_id, p_invoice_id, p_transaction_entry_id, v_entry.project_id, v_entry.amount, v_entry.description
  )
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_invoice.tenant_id, auth.uid(), 'invoice_transaction_line', v_result.id, 'invoice.transaction_bound', null, to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.bind_invoice_transaction(uuid, uuid) from public;
grant execute on function public.bind_invoice_transaction(uuid, uuid) to authenticated;

-- --- 6c. unbind_invoice_transaction ----------------------------------------------

create function public.unbind_invoice_transaction(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.invoice_transaction_lines;
  v_invoice public.invoices;
begin
  select * into v_line from public.invoice_transaction_lines where id = p_line_id;
  if v_line.id is null then
    raise exception 'invoice transaction line not found';
  end if;

  select * into v_invoice from public.invoices where id = v_line.invoice_id for update;

  if not private.current_user_has_tenant_role(v_invoice.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to unbind invoice transaction';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is not draft; binding is locked';
  end if;

  delete from public.invoice_transaction_lines where id = p_line_id;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_invoice.tenant_id, auth.uid(), 'invoice_transaction_line', p_line_id, 'invoice.transaction_unbound', to_jsonb(v_line), null);
end;
$$;

revoke execute on function public.unbind_invoice_transaction(uuid) from public;
grant execute on function public.unbind_invoice_transaction(uuid) to authenticated;

-- --- 6d. issue_invoice -----------------------------------------------------------
-- `for update` serializes two concurrent "Terbitkan" clicks on the same
-- invoice — the lifecycle trigger's "status unchanged" guard rejects the
-- second only after the first commits (Test Matrix L-08).

create function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.invoices;
  v_result public.invoices;
begin
  select * into v_before from public.invoices where id = p_invoice_id for update;
  if v_before.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_before.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to issue invoice';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'only a draft invoice can be issued';
  end if;

  if not exists (select 1 from public.invoice_transaction_lines where invoice_id = p_invoice_id) then
    raise exception 'invoice must have at least one bound transaction before issuance';
  end if;

  update public.invoices
  set status = 'issued', issued_at = now(), issued_by = auth.uid()
  where id = p_invoice_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_before.tenant_id, auth.uid(), 'invoice', p_invoice_id, 'invoice.issued', to_jsonb(v_before), to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- --- 6e. void_invoice -------------------------------------------------------------

create function public.void_invoice(p_invoice_id uuid, p_reason text)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.invoices;
  v_result public.invoices;
begin
  select * into v_before from public.invoices where id = p_invoice_id for update;
  if v_before.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_before.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to void invoice';
  end if;

  if v_before.status = 'void' then
    raise exception 'invoice is already void';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'void reason is required';
  end if;

  update public.invoices
  set status = 'void', void_at = now(), void_by = auth.uid(), void_reason = p_reason
  where id = p_invoice_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_before.tenant_id, auth.uid(), 'invoice', p_invoice_id, 'invoice.voided', to_jsonb(v_before), to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.void_invoice(uuid, text) from public;
grant execute on function public.void_invoice(uuid, text) to authenticated;

-- --- 6f. reissue_invoice -----------------------------------------------------------
-- Explicit void+reissue correction mechanism (Contract §3). Creates a new
-- `draft` invoice referencing the void predecessor; the admin re-binds
-- whichever transactions the void freed via bind_invoice_transaction — no
-- automatic copy of the predecessor's lines.

create function public.reissue_invoice(p_predecessor_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_predecessor public.invoices;
  v_result public.invoices;
begin
  select * into v_predecessor from public.invoices where id = p_predecessor_invoice_id for update;
  if v_predecessor.id is null then
    raise exception 'predecessor invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_predecessor.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to reissue invoice';
  end if;

  if v_predecessor.status <> 'void' then
    raise exception 'predecessor invoice must be void before reissue';
  end if;

  if exists (select 1 from public.invoices where predecessor_invoice_id = p_predecessor_invoice_id) then
    raise exception 'predecessor invoice has already been reissued';
  end if;

  insert into public.invoices (tenant_id, status, predecessor_invoice_id, created_by)
  values (v_predecessor.tenant_id, 'draft', p_predecessor_invoice_id, auth.uid())
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_predecessor.tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.created', null, to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.reissue_invoice(uuid) from public;
grant execute on function public.reissue_invoice(uuid) to authenticated;

-- --- 6g. finalize_invoice_evidence_version ----------------------------------------
-- The client uploads the file to Storage first (subject to the storage.
-- objects INSERT policy in §9, which already requires owner/admin + an
-- `issued` invoice), then calls this RPC to register it. The database never
-- declares the upload a success before cross-checking the real object's
-- metadata in storage.objects (Contract §5, task instruction C).
-- `for update` on invoice_evidence serializes concurrent uploads to the same
-- evidence parent so version_number allocation is deterministic (Test
-- Matrix E-09).

create function public.finalize_invoice_evidence_version(
  p_invoice_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
returns public.invoice_evidence_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices;
  v_object record;
  v_evidence public.invoice_evidence;
  v_previous_current uuid;
  v_next_version int;
  v_result public.invoice_evidence_versions;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_invoice.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to upload invoice evidence';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'evidence can only be uploaded for an issued invoice';
  end if;

  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'sha256 must be a 64-character lowercase hex digest';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then
    raise exception 'size_bytes must be between 1 and 52428800';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported mime type: %', p_mime_type;
  end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_invoice.tenant_id::text || '/' || p_invoice_id::text || '/') then
    raise exception 'storage_path does not match the expected tenant/invoice prefix';
  end if;

  select * into v_object
    from storage.objects
    where bucket_id = 'invoice-evidence' and name = p_storage_path;

  if v_object.id is null then
    raise exception 'storage object not found for the given path — upload before finalizing';
  end if;
  if coalesce((v_object.metadata ->> 'size')::bigint, -1) <> p_size_bytes then
    raise exception 'declared size_bytes does not match the stored object metadata';
  end if;
  if coalesce(v_object.metadata ->> 'mimetype', '') <> p_mime_type then
    raise exception 'declared mime_type does not match the stored object metadata';
  end if;

  insert into public.invoice_evidence (tenant_id, invoice_id, kind, created_by)
  values (v_invoice.tenant_id, p_invoice_id, 'signed_invoice', auth.uid())
  on conflict (invoice_id, kind) do nothing;

  select * into v_evidence
    from public.invoice_evidence
    where invoice_id = p_invoice_id and kind = 'signed_invoice'
    for update;

  v_previous_current := v_evidence.current_version_id;

  select coalesce(max(version_number), 0) + 1 into v_next_version
    from public.invoice_evidence_versions
    where evidence_id = v_evidence.id;

  insert into public.invoice_evidence_versions (
    tenant_id, evidence_id, version_number, storage_path, sha256, size_bytes, mime_type, uploaded_by
  ) values (
    v_invoice.tenant_id, v_evidence.id, v_next_version, p_storage_path, p_sha256, p_size_bytes, p_mime_type, auth.uid()
  )
  returning * into v_result;

  update public.invoice_evidence
  set current_version_id = v_result.id
  where id = v_evidence.id;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_invoice.tenant_id, auth.uid(), 'invoice_evidence_version', v_result.id, 'evidence.uploaded', null, to_jsonb(v_result));

  if v_previous_current is not null then
    insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values (
      v_invoice.tenant_id, auth.uid(), 'invoice_evidence', v_evidence.id, 'evidence.version_superseded',
      jsonb_build_object('current_version_id', v_previous_current),
      jsonb_build_object('current_version_id', v_result.id)
    );
  end if;

  return v_result;
end;
$$;

revoke execute on function public.finalize_invoice_evidence_version(uuid, text, text, bigint, text) from public;
grant execute on function public.finalize_invoice_evidence_version(uuid, text, text, bigint, text) to authenticated;

-- --- 6h. verify_invoice_evidence_version -------------------------------------------

create function public.verify_invoice_evidence_version(p_version_id uuid)
returns public.invoice_evidence_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.invoice_evidence_versions;
  v_result public.invoice_evidence_versions;
begin
  select * into v_version from public.invoice_evidence_versions where id = p_version_id for update;
  if v_version.id is null then
    raise exception 'invoice evidence version not found';
  end if;

  if not private.current_user_has_tenant_role(v_version.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to verify invoice evidence';
  end if;

  if v_version.status <> 'pending' then
    raise exception 'only a pending evidence version can be verified';
  end if;

  update public.invoice_evidence_versions
  set status = 'verified', verified_by = auth.uid(), verified_at = now()
  where id = p_version_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_version.tenant_id, auth.uid(), 'invoice_evidence_version', p_version_id, 'evidence.verified', to_jsonb(v_version), to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.verify_invoice_evidence_version(uuid) from public;
grant execute on function public.verify_invoice_evidence_version(uuid) to authenticated;

-- --- 6i. reject_invoice_evidence_version --------------------------------------------

create function public.reject_invoice_evidence_version(p_version_id uuid, p_reason text)
returns public.invoice_evidence_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.invoice_evidence_versions;
  v_result public.invoice_evidence_versions;
begin
  select * into v_version from public.invoice_evidence_versions where id = p_version_id for update;
  if v_version.id is null then
    raise exception 'invoice evidence version not found';
  end if;

  if not private.current_user_has_tenant_role(v_version.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to reject invoice evidence';
  end if;

  if v_version.status <> 'pending' then
    raise exception 'only a pending evidence version can be rejected';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.invoice_evidence_versions
  set status = 'rejected', verified_by = auth.uid(), rejected_reason = p_reason
  where id = p_version_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_version.tenant_id, auth.uid(), 'invoice_evidence_version', p_version_id, 'evidence.rejected', to_jsonb(v_version), to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.reject_invoice_evidence_version(uuid, text) from public;
grant execute on function public.reject_invoice_evidence_version(uuid, text) to authenticated;

-- =============================================================================
-- 7. RLS & Grants — table access
-- =============================================================================
-- auto_expose_new_tables is off, so every table below starts with zero
-- privileges for anon/authenticated/service_role; the REVOKE is defensive
-- belt-and-suspenders. Read access is restricted to owner/admin, mirroring
-- public.trusted_transaction_history's posture (financial-sensitive,
-- narrower than the reviewer/viewer-readable master-data pattern) — see
-- Gate 4A Contract §7 decision. No INSERT/UPDATE/DELETE grant exists for
-- `authenticated` anywhere below — the RPCs in §6 (SECURITY DEFINER,
-- running as the table owner) are the only mutation path.

alter table public.invoices enable row level security;
alter table public.invoice_transaction_lines enable row level security;
alter table public.invoice_evidence enable row level security;
alter table public.invoice_evidence_versions enable row level security;

revoke all on public.invoices from public;
revoke all on public.invoice_transaction_lines from public;
revoke all on public.invoice_evidence from public;
revoke all on public.invoice_evidence_versions from public;

create policy invoices_select_owner_admin
  on public.invoices for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;

create policy invoice_transaction_lines_select_owner_admin
  on public.invoice_transaction_lines for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.invoice_transaction_lines to authenticated;
grant all on public.invoice_transaction_lines to service_role;

create policy invoice_evidence_select_owner_admin
  on public.invoice_evidence for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.invoice_evidence to authenticated;
grant all on public.invoice_evidence to service_role;

create policy invoice_evidence_versions_select_owner_admin
  on public.invoice_evidence_versions for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.invoice_evidence_versions to authenticated;
grant all on public.invoice_evidence_versions to service_role;

-- =============================================================================
-- 8. Storage — private bucket + tenant-scoped policies
-- =============================================================================
-- Bucket is private (public = false) and MIME/size-restricted at the bucket
-- level as a first filter (Contract §5 "storage wajib private"). Path
-- convention is deterministic and tenant-scoped:
--   {tenant_id}/{invoice_id}/{version_number}-{uuid}.{ext}
-- — every path segment is validated by the INSERT policy below (both uuid
-- segments must parse and the tenant/invoice pair must be real), so a
-- forged or traversal path cannot satisfy the policy. No UPDATE or DELETE
-- policy exists on storage.objects for this bucket at all: with RLS
-- enabled and no matching policy, both operations are denied outright —
-- this is the "object never overwritten/deleted" guarantee (Contract F5)
-- enforced at the storage layer, not just the database layer.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-evidence', 'invoice-evidence', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy invoice_evidence_objects_insert_owner_admin
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoice-evidence'
    and array_length(string_to_array(name, '/'), 1) >= 3
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.current_user_has_tenant_role(
          ((string_to_array(name, '/'))[1])::uuid,
          array['owner', 'admin']::public.tenant_role[]
        )
    and exists (
      select 1 from public.invoices i
      where i.id = ((string_to_array(name, '/'))[2])::uuid
        and i.tenant_id = ((string_to_array(name, '/'))[1])::uuid
        and i.status = 'issued'
    )
  );

-- SELECT is gated through invoice_evidence_versions rather than re-parsing
-- the path — the database row is the single source of truth for "this
-- object is a registered evidence version", so an uploaded-but-never-
-- finalized object (no matching row yet) is not readable by anyone via
-- this policy either.
create policy invoice_evidence_objects_select_owner_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoice-evidence'
    and exists (
      select 1 from public.invoice_evidence_versions v
      where v.storage_path = storage.objects.name
        and private.current_user_has_tenant_role(v.tenant_id, array['owner', 'admin']::public.tenant_role[])
    )
  );

grant all on storage.buckets to service_role;
grant all on storage.objects to service_role;
