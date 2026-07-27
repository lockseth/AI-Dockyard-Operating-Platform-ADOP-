-- ADOP Phase 2A — Billing Metadata & Invoice Cardinality
--
-- Implements the schema/RPC contract frozen in
-- ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md
-- (Amendment 1): billing metadata columns on `invoices` (§6.1), invoice
-- cardinality — one tenant + one legal entity + one client + one Project
-- Kapal per Billing Record (§5) — manual invoice number registration (§7),
-- immutable transaction coverage snapshot fields (§8.3), double-billing/
-- partial-billing rules (§9, unchanged — already enforced by Gate 4B), void
-- + replacement numbering (§16), and legacy manual invoice registration
-- (§15).
--
-- Purely additive on top of 20260723000000_invoice_evidence_documents.sql —
-- does not edit that migration. New columns are nullable so pre-existing
-- `invoices`/`invoice_transaction_lines` rows are never broken (§25); the
-- extended `invoices_issued_shape` check is added `not valid` so it is not
-- retroactively enforced against any row that reached `issued` before this
-- migration (Contract §25, Test Matrix P-03) while still applying to every
-- write from this point on. `create_draft_invoice`/`reissue_invoice` change
-- signature to require `project_id` explicitly (Contract §21 "breaking
-- change kecil dan terkontrol") since cardinality must be locked at
-- creation time, not inferred later.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.invoice_origin as enum ('native', 'legacy_import');
create type public.invoice_legacy_coverage_status as enum ('full', 'partial', 'unknown');

-- =============================================================================
-- 2. legal_entities — composite tenant-safe FK target (missing since Gate 0A;
--    clients/vessel_projects already have this, legal_entities never needed
--    it until invoices.legal_entity_id below)
-- =============================================================================

alter table public.legal_entities
  add constraint legal_entities_id_tenant_id_key unique (id, tenant_id);

-- =============================================================================
-- 3. invoices — billing metadata columns (Contract §6.1)
-- =============================================================================

alter table public.invoices
  add column legal_entity_id uuid,
  add column client_id uuid,
  add column project_id uuid,
  add column invoice_number text,
  add column invoice_date date,
  add column due_date date,
  add column origin public.invoice_origin not null default 'native',
  add column legacy_coverage_status public.invoice_legacy_coverage_status,
  add column imported_by uuid references auth.users (id) on delete set null,
  add column imported_at timestamptz;

alter table public.invoices
  add constraint invoices_legal_entity_id_fkey
    foreign key (legal_entity_id, tenant_id) references public.legal_entities (id, tenant_id) on delete cascade,
  add constraint invoices_client_id_fkey
    foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade,
  add constraint invoices_project_id_fkey
    foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade;

create index invoices_legal_entity_id_idx on public.invoices (tenant_id, legal_entity_id);
create index invoices_client_id_idx on public.invoices (tenant_id, client_id);
create index invoices_project_id_idx on public.invoices (tenant_id, project_id);

-- --- Invoice number: text, non-blank when present, unique per legal entity,
--     never freed even after void (Contract §6.2/§16.1 — FROZEN, not
--     excluded for void).
alter table public.invoices
  add constraint invoices_invoice_number_not_blank
    check (invoice_number is null or btrim(invoice_number) <> '');

create unique index invoices_legal_entity_invoice_number_uidx
  on public.invoices (tenant_id, legal_entity_id, invoice_number)
  where invoice_number is not null;

-- --- invoice_date / due_date relation (Contract §10.2)
alter table public.invoices
  add constraint invoices_due_date_after_invoice_date
    check (due_date is null or invoice_date is null or due_date >= invoice_date);

-- --- Legacy provenance shape (Contract §6.1, §15.2)
alter table public.invoices
  add constraint invoices_legacy_coverage_status_shape
    check (origin = 'legacy_import' or legacy_coverage_status is null),
  add constraint invoices_legacy_provenance_shape
    check (
      (origin = 'legacy_import' and imported_by is not null and imported_at is not null)
      or (origin = 'native' and imported_by is null and imported_at is null)
    );

-- --- Extended issued-shape: billing metadata must be complete before a
--     Billing Record can be `issued` (Contract §6.1, §10.2, §11
--     DRAFT_READY_TO_ISSUE / §27 acceptance #4). due_date is exempt for
--     legacy registrations (§15.2 "due_date jika diketahui"). `not valid` —
--     applies to every write from here on, but does not retroactively
--     reject any invoice that was already `issued` before this migration
--     (Contract §25, Test Matrix P-03/B-01..B-03).
alter table public.invoices drop constraint invoices_issued_shape;
alter table public.invoices add constraint invoices_issued_shape check (
  (status <> 'issued')
  or (
    issued_at is not null and issued_by is not null
    and project_id is not null
    and client_id is not null
    and legal_entity_id is not null
    and invoice_number is not null and btrim(invoice_number) <> ''
    and invoice_date is not null
    and (origin = 'legacy_import' or due_date is not null)
  )
) not valid;

-- =============================================================================
-- 4. invoice_transaction_lines — immutable coverage snapshot columns
--    (Contract §8.3: transaction_date, transaction_category)
-- =============================================================================

alter table public.invoice_transaction_lines
  add column transaction_date date,
  add column transaction_category text;

-- =============================================================================
-- 5. Role-independent structural guards
-- =============================================================================

-- --- 5a. invoices: metadata immutability -----------------------------------
-- project_id/client_id are locked from creation onward (Contract §5.1 —
-- cardinality is fixed the moment a Billing Record exists, never
-- reassignable). legal_entity_id/invoice_number/invoice_date/due_date may
-- change freely while `draft` but are frozen the instant status leaves
-- `draft` (Contract §10.1) — this also transitively covers §7.5 (number
-- frozen once `issued`, since `issued` already freezes all of §6.1).
-- origin/legacy_coverage_status/imported_by/imported_at are immutable from
-- insert (provenance, never edited after registration).

create function private.enforce_invoice_metadata_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'invoice project_id is immutable once set';
  end if;
  if new.client_id is distinct from old.client_id then
    raise exception 'invoice client_id is immutable once set';
  end if;
  if new.origin is distinct from old.origin
     or new.legacy_coverage_status is distinct from old.legacy_coverage_status
     or new.imported_by is distinct from old.imported_by
     or new.imported_at is distinct from old.imported_at
  then
    raise exception 'invoice legacy provenance fields are immutable';
  end if;

  if old.status <> 'draft' then
    if new.legal_entity_id is distinct from old.legal_entity_id
       or new.invoice_number is distinct from old.invoice_number
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date is distinct from old.due_date
    then
      raise exception 'invoice billing metadata is locked outside draft status';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_metadata_locked() from public;

create trigger invoices_enforce_metadata_locked
  before update on public.invoices
  for each row execute function private.enforce_invoice_metadata_locked();

-- --- 5b. invoice_transaction_lines: draft-only lock, extended for legacy --
-- Legacy coverage rows are registered once, directly, by
-- register_legacy_invoice against an invoice that is never `draft`
-- (Contract §15.7) — the draft-only lock does not apply to `legacy_import`
-- origin invoices. Native invoices keep the exact Gate 4B behavior
-- unchanged (Test Matrix RG-01/RG-02).

create or replace function private.enforce_invoice_transaction_line_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);

  if v_invoice.origin = 'legacy_import' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice binding is locked outside draft status';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 6. RPCs
-- =============================================================================

-- --- 6a. create_draft_invoice — now requires project_id explicitly --------
-- Signature change from create_draft_invoice(uuid) (Contract §21 "breaking
-- change kecil dan terkontrol pada gate implementasi berikutnya"):
-- cardinality (§5) must be locked the moment a Billing Record is created,
-- not inferred later from whatever transaction happens to be bound first.
-- client_id is always derived from the project (§5.1), never accepted
-- independently.

drop function public.create_draft_invoice(uuid);

create function public.create_draft_invoice(p_tenant_id uuid, p_project_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.vessel_projects;
  v_result public.invoices;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create invoice';
  end if;

  if p_project_id is null then
    raise exception 'project_id is required to create a billing record';
  end if;

  select * into v_project from public.vessel_projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'project not found';
  end if;
  if v_project.tenant_id <> p_tenant_id then
    raise exception 'project belongs to a different tenant';
  end if;

  insert into public.invoices (tenant_id, status, project_id, client_id, origin, created_by)
  values (p_tenant_id, 'draft', p_project_id, v_project.client_id, 'native', auth.uid())
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (p_tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.created', null, to_jsonb(v_result));

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    p_tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.project_locked',
    null, jsonb_build_object('project_id', p_project_id, 'client_id', v_project.client_id)
  );

  return v_result;
end;
$$;

revoke execute on function public.create_draft_invoice(uuid, uuid) from public;
grant execute on function public.create_draft_invoice(uuid, uuid) to authenticated;

-- --- 6b. reissue_invoice — cardinality carried from the predecessor -------
-- Test Matrix VR-04: no step is inherited automatically from the
-- predecessor (number, coverage, PDF, verification all restart), but
-- cardinality (§5) is not a "step" the admin repeats — a reissue corrects
-- the same billing engagement, it does not repoint an invoice at a
-- different Project Kapal. p_project_id is therefore optional: when the
-- predecessor already carries a project_id (every invoice created after
-- this migration will), it is reused automatically; a predecessor with no
-- project_id (pre-Phase 2A) requires it explicitly. Supplying a
-- p_project_id that conflicts with an already-set predecessor project is
-- rejected.

drop function public.reissue_invoice(uuid);

create function public.reissue_invoice(p_predecessor_invoice_id uuid, p_project_id uuid default null)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_predecessor public.invoices;
  v_project public.vessel_projects;
  v_target_project_id uuid;
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

  if v_predecessor.project_id is not null and p_project_id is not null and v_predecessor.project_id <> p_project_id then
    raise exception 'reissue must target the same project as its predecessor';
  end if;

  v_target_project_id := coalesce(v_predecessor.project_id, p_project_id);
  if v_target_project_id is null then
    raise exception 'project_id is required to create a billing record';
  end if;

  select * into v_project from public.vessel_projects where id = v_target_project_id;
  if v_project.id is null then
    raise exception 'project not found';
  end if;
  if v_project.tenant_id <> v_predecessor.tenant_id then
    raise exception 'project belongs to a different tenant';
  end if;

  insert into public.invoices (tenant_id, status, predecessor_invoice_id, project_id, client_id, origin, created_by)
  values (v_predecessor.tenant_id, 'draft', p_predecessor_invoice_id, v_target_project_id, v_project.client_id, 'native', auth.uid())
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_predecessor.tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.created', null, to_jsonb(v_result));

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_predecessor.tenant_id, auth.uid(), 'invoice', v_result.id, 'invoice.project_locked',
    null, jsonb_build_object('project_id', v_target_project_id, 'client_id', v_project.client_id)
  );

  return v_result;
end;
$$;

revoke execute on function public.reissue_invoice(uuid, uuid) from public;
grant execute on function public.reissue_invoice(uuid, uuid) to authenticated;

-- --- 6c. bind_invoice_transaction — extended with project match + snapshot
-- Same signature as Gate 4B (only the body changes): rejects a transaction
-- whose project_id differs from the invoice's locked project_id (Contract
-- §5.1/§8.2, closing the §2.2/§2.6 gap), and snapshots transaction_date/
-- transaction_category (§8.3) at bind time.

create or replace function public.bind_invoice_transaction(
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
  v_category_name text;
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
  if v_invoice.project_id is not null and v_entry.project_id <> v_invoice.project_id then
    raise exception 'transaction entry belongs to a different Project Kapal than this invoice';
  end if;

  select name into v_category_name from public.expense_categories where id = v_entry.category_id;

  insert into public.invoice_transaction_lines (
    tenant_id, invoice_id, transaction_entry_id, project_id, amount, description,
    transaction_date, transaction_category
  ) values (
    v_invoice.tenant_id, p_invoice_id, p_transaction_entry_id, v_entry.project_id, v_entry.amount, v_entry.description,
    v_entry.created_at::date, v_category_name
  )
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_invoice.tenant_id, auth.uid(), 'invoice_transaction_line', v_result.id, 'invoice.transaction_bound', null, to_jsonb(v_result));

  return v_result;
end;
$$;

-- --- 6d. issue_invoice — explicit metadata-completeness error messages ----
-- The extended invoices_issued_shape check (§3) is the real enforcement;
-- these checks exist only to give issue_invoice's caller a specific field
-- name instead of a generic constraint-violation error (Contract §22).

create or replace function public.issue_invoice(p_invoice_id uuid)
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

  if v_before.project_id is null then
    raise exception 'project_id is required before issuance';
  end if;
  if v_before.client_id is null then
    raise exception 'client_id is required before issuance';
  end if;
  if v_before.legal_entity_id is null then
    raise exception 'legal_entity_id is required before issuance';
  end if;
  if v_before.invoice_number is null then
    raise exception 'invoice_number must be registered before issuance';
  end if;
  if v_before.invoice_date is null then
    raise exception 'invoice_date is required before issuance';
  end if;
  if v_before.due_date is null then
    raise exception 'due_date is required before issuance';
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

-- --- 6e. finalize_invoice_evidence_version — number must be registered ----

create or replace function public.finalize_invoice_evidence_version(
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

  if v_invoice.invoice_number is null then
    raise exception 'invoice number must be registered before uploading evidence';
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

-- --- 6f. register_invoice_number — Contract §7 -----------------------------
-- Explicit registration step, separate from general metadata edits (§19
-- `invoice.number_registered` vs `invoice.metadata_updated`). Only while
-- `draft` (locked thereafter by the §5a trigger); uniqueness is enforced by
-- the partial unique index in §3 (23505 on conflict).

create function public.register_invoice_number(p_invoice_id uuid, p_invoice_number text)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.invoices;
  v_result public.invoices;
  v_normalized text;
begin
  select * into v_before from public.invoices where id = p_invoice_id for update;
  if v_before.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_before.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to register invoice number';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'invoice number can only be registered while draft';
  end if;

  v_normalized := btrim(p_invoice_number);
  if v_normalized is null or v_normalized = '' then
    raise exception 'invoice number is required';
  end if;

  update public.invoices
  set invoice_number = v_normalized
  where id = p_invoice_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_before.tenant_id, auth.uid(), 'invoice', p_invoice_id, 'invoice.number_registered',
    jsonb_build_object('invoice_number', v_before.invoice_number),
    jsonb_build_object('invoice_number', v_result.invoice_number)
  );

  return v_result;
end;
$$;

revoke execute on function public.register_invoice_number(uuid, text) from public;
grant execute on function public.register_invoice_number(uuid, text) to authenticated;

-- --- 6g. update_invoice_billing_metadata — legal_entity_id/dates ----------
-- project_id/client_id are excluded here on purpose — they are locked at
-- creation (§5.1/§10.1) and cannot be edited through any RPC.

create function public.update_invoice_billing_metadata(
  p_invoice_id uuid,
  p_legal_entity_id uuid,
  p_invoice_date date,
  p_due_date date
)
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
    raise exception 'not authorized to update invoice billing metadata';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'invoice billing metadata is locked outside draft status';
  end if;

  if p_legal_entity_id is not null and not exists (
    select 1 from public.legal_entities where id = p_legal_entity_id and tenant_id = v_before.tenant_id
  ) then
    raise exception 'legal entity not found for this tenant';
  end if;

  if p_due_date is not null and p_invoice_date is not null and p_due_date < p_invoice_date then
    raise exception 'due_date must not be before invoice_date';
  end if;

  update public.invoices
  set legal_entity_id = p_legal_entity_id,
      invoice_date = p_invoice_date,
      due_date = p_due_date
  where id = p_invoice_id
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_before.tenant_id, auth.uid(), 'invoice', p_invoice_id, 'invoice.metadata_updated',
    jsonb_build_object('legal_entity_id', v_before.legal_entity_id, 'invoice_date', v_before.invoice_date, 'due_date', v_before.due_date),
    jsonb_build_object('legal_entity_id', v_result.legal_entity_id, 'invoice_date', v_result.invoice_date, 'due_date', v_result.due_date)
  );

  return v_result;
end;
$$;

revoke execute on function public.update_invoice_billing_metadata(uuid, uuid, date, date) from public;
grant execute on function public.update_invoice_billing_metadata(uuid, uuid, date, date) to authenticated;

-- --- 6h. register_legacy_invoice — Contract §15 ----------------------------
-- Retroactive registration of an invoice that was already issued (or
-- voided) physically before it existed in ADOP. Inserts directly as
-- `issued`/`void` (never `draft` — §2.1 notes no before-insert lifecycle
-- trigger blocks this), origin = 'legacy_import'. issued_at/issued_by (and
-- void_at/void_by/void_reason when voided) are stamped with the
-- registration actor/time — they represent "when this row started existing
-- in ADOP", distinct from imported_by/imported_at which is the explicit
-- provenance field (§15.2) and from the historical invoice_date. Coverage
-- mapping is optional and explicit (§15.7) — no fabricated lines are ever
-- created for transactions that cannot be reconstructed.

create function public.register_legacy_invoice(
  p_tenant_id uuid,
  p_legal_entity_id uuid,
  p_project_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_status public.invoice_status,
  p_legacy_coverage_status public.invoice_legacy_coverage_status default 'unknown',
  p_void_reason text default null,
  p_transaction_entry_ids uuid[] default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.vessel_projects;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_result public.invoices;
  v_entry_id uuid;
  v_entry public.project_cost_ledger_entries;
  v_normalized_number text;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to register legacy invoice';
  end if;

  if p_status not in ('issued', 'void') then
    raise exception 'legacy invoice must be registered as issued or void';
  end if;

  if p_project_id is null then
    raise exception 'project_id is required to register a legacy invoice';
  end if;

  select * into v_project from public.vessel_projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'project not found';
  end if;
  if v_project.tenant_id <> p_tenant_id then
    raise exception 'project belongs to a different tenant';
  end if;

  if p_legal_entity_id is null then
    raise exception 'legal_entity_id is required for legacy registration';
  end if;
  if not exists (select 1 from public.legal_entities where id = p_legal_entity_id and tenant_id = p_tenant_id) then
    raise exception 'legal entity not found for this tenant';
  end if;

  v_normalized_number := btrim(p_invoice_number);
  if v_normalized_number is null or v_normalized_number = '' then
    raise exception 'invoice number is required for legacy registration';
  end if;

  if p_invoice_date is null then
    raise exception 'invoice_date is required for legacy registration';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'due_date must not be before invoice_date';
  end if;

  if p_status = 'void' and (p_void_reason is null or btrim(p_void_reason) = '') then
    raise exception 'void reason is required for a legacy invoice registered as void';
  end if;

  insert into public.invoices (
    tenant_id, status, legal_entity_id, client_id, project_id,
    invoice_number, invoice_date, due_date,
    origin, legacy_coverage_status, imported_by, imported_at,
    issued_at, issued_by,
    void_at, void_by, void_reason,
    created_by
  ) values (
    p_tenant_id, p_status, p_legal_entity_id, v_project.client_id, p_project_id,
    v_normalized_number, p_invoice_date, p_due_date,
    'legacy_import', p_legacy_coverage_status, v_actor, v_now,
    v_now, v_actor,
    case when p_status = 'void' then v_now else null end,
    case when p_status = 'void' then v_actor else null end,
    case when p_status = 'void' then p_void_reason else null end,
    v_actor
  )
  returning * into v_result;

  if p_transaction_entry_ids is not null then
    foreach v_entry_id in array p_transaction_entry_ids loop
      select * into v_entry from public.project_cost_ledger_entries where id = v_entry_id;
      if v_entry.id is null then
        raise exception 'transaction entry not found: %', v_entry_id;
      end if;
      if v_entry.tenant_id <> p_tenant_id then
        raise exception 'transaction entry belongs to a different tenant';
      end if;
      if v_entry.project_id <> p_project_id then
        raise exception 'transaction entry belongs to a different Project Kapal than this invoice';
      end if;

      insert into public.invoice_transaction_lines (
        tenant_id, invoice_id, transaction_entry_id, project_id, amount, description,
        transaction_date, transaction_category
      )
      select
        p_tenant_id, v_result.id, v_entry.id, v_entry.project_id, v_entry.amount, v_entry.description,
        v_entry.created_at::date, ec.name
      from public.expense_categories ec
      where ec.id = v_entry.category_id;
    end loop;
  end if;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (p_tenant_id, v_actor, 'invoice', v_result.id, 'invoice.legacy_registered', null, to_jsonb(v_result));

  return v_result;
end;
$$;

revoke execute on function public.register_legacy_invoice(
  uuid, uuid, uuid, text, date, date, public.invoice_status, public.invoice_legacy_coverage_status, text, uuid[]
) from public;
grant execute on function public.register_legacy_invoice(
  uuid, uuid, uuid, text, date, date, public.invoice_status, public.invoice_legacy_coverage_status, text, uuid[]
) to authenticated;
