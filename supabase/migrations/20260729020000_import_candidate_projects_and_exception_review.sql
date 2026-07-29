-- ADOP Gate 6I-A — Scalable Import Automation & Exception-Only Review
--
-- Closes two gaps left open by Gate 1J-B/C/D (cash-import-staging):
--   1. approve_and_commit_cash_import_batch hard-blocked any included row
--      still mapped 'new_project_candidate' (MAPPING_NOT_COMMITTABLE) — a
--      "Kandidat Project Baru" label could never actually become a real
--      vessel/project. This migration lets it, atomically, at approval time
--      only (never at mapping time).
--   2. Every row's disposition had to be set one at a time by an admin, even
--      when the outcome was unambiguous. This migration adds one RPC that
--      bulk-decides disposition for whatever is currently mapped and valid,
--      leaving only genuine exceptions (error/duplicate/incomplete mapping)
--      for manual review.
--
-- Does not edit 20260719100000_vessel_project_lifecycle.sql,
-- 20260720000000_cash_import_staging.sql, or
-- 20260720120000_owner_approved_cash_import_commit.sql on disk — every
-- change here is ALTER TYPE / ALTER TABLE / CREATE OR REPLACE / DROP+CREATE,
-- the same non-destructive extension technique every prior gate uses.
--
-- Design decisions (see task LOCK + plan discussion):
--   - Auto-disposition NEVER invents mapping_kind — it only decides
--     disposition for rows whose label has already been mapped by an admin
--     (mapping stays a deliberate one-time-per-label action, already cheap:
--     12 labels, not 500 rows). This keeps "saran bukan commit otomatis"
--     intact and the auto-apply RPC fully deterministic/idempotent (it only
--     ever touches disposition IS NULL rows).
--   - No cross-batch vessel-name matching / no get-or-create-vessel-by-name.
--     A candidate is scoped to THIS batch's label; at most one vessel+
--     project is created per unique vessel_label per batch, which falls out
--     for free from looping over distinct labels once inside the single
--     atomic approval invocation. A same-named vessel from a later batch is
--     mapped via the existing existing_vessel_project path instead.
--   - cash_import_rows.mapped_vessel_project_id is left untouched for
--     candidate rows (the existing check constraint already forbids setting
--     it unless mapping_kind = 'existing_vessel_project') — the approval RPC
--     resolves a candidate row's project via a join on vessel_label against
--     the new plan table at posting time instead.
--   - vessel_project_lifecycle_status gains 'draft': a candidate project is
--     created in 'draft', promotable to 'active' via the EXISTING
--     transition_vessel_project_lifecycle RPC once the trigger below permits
--     the arm (that RPC has no hardcoded transition list of its own — it
--     relies entirely on the trigger, see 20260719100000...sql:227-229).
--
-- Corrective addendum (same gate, amended before push — draft operational
-- safety + activation guard):
--   - A 'draft' project is a real, but INCOMPLETE, Project Kapal — it must
--     never be offered as a normal Shared Overhead allocation target
--     alongside active/ready_to_close ones. allocate_shared_overhead_entry
--     (20260722010000_shared_overhead_allocation.sql §6a) only ever rejected
--     'closed'; widened here to an explicit active/ready_to_close allow-list
--     so 'draft' is excluded by construction, not by omission. Imported cash-
--     import costs still bind to a draft project fine — that path
--     (approve_and_commit_cash_import_batch, §7 above) inserts directly into
--     project_cost_ledger_entries and never goes through this RPC.
--   - draft -> active must fail closed when required operational metadata is
--     still missing. facility_location_id is the one vessel_projects field
--     that's nullable at the DB level AND optional at creation (LOCK H.1,
--     src/lib/vessel-projects/validation.ts's createVesselProjectInputSchema
--     — the canonical vessel-project validation this reuses) — every other
--     required field (vessel_id/client_id/service_type_id/start_date) is
--     NOT NULL at the DB level already, so it can never actually be missing
--     on any row, draft or not. The completeness check therefore lives on
--     facility_location_id specifically, enforced in the SAME trigger that
--     is already this schema's one authoritative transition gate (see §1a),
--     not duplicated in the RPC. transition_vessel_project_lifecycle gains
--     an optional p_facility_location_id so a caller can complete-and-
--     activate in one atomic call ("Lengkapi & Aktifkan") — the trigger sees
--     NEW.facility_location_id already reflecting that same UPDATE's SET
--     clause, so no separate two-step edit-then-activate flow is needed.
--     draft can still only ever reach 'active' (never ready_to_close/closed
--     directly) — unchanged from §1a below.

-- =============================================================================
-- 1. vessel_project_lifecycle_status gains 'draft'
-- =============================================================================

alter type public.vessel_project_lifecycle_status add value 'draft' before 'active';
commit;

-- --- 1a. Transition guard: add draft -> active -------------------------------
-- Identical body to the Gate 1D original plus one new arm; `create or
-- replace function` — that migration file itself is not edited. Insert with
-- lifecycle_status = 'draft' does not touch this trigger at all (it only
-- fires `before update of lifecycle_status`), so candidate creation below
-- needs no change here — this arm only matters for the later, separate act
-- of promoting a draft project to active.
create or replace function private.enforce_vessel_project_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.lifecycle_status = old.lifecycle_status then
    raise exception 'vessel project lifecycle status unchanged: already %', old.lifecycle_status;
  end if;

  if not (
    (old.lifecycle_status = 'draft' and new.lifecycle_status = 'active')
    or (old.lifecycle_status = 'active' and new.lifecycle_status = 'ready_to_close')
    or (old.lifecycle_status = 'ready_to_close' and new.lifecycle_status = 'closed')
  ) then
    raise exception 'invalid vessel project lifecycle transition from % to %', old.lifecycle_status, new.lifecycle_status;
  end if;

  -- Corrective: draft -> active fails closed when required operational
  -- metadata is still missing. NEW already reflects transition_vessel_
  -- project_lifecycle's own UPDATE ... SET facility_location_id = coalesce(
  -- p_facility_location_id, facility_location_id) — so a caller completing
  -- and activating in one call passes this the same statement that fills it.
  if old.lifecycle_status = 'draft' and new.lifecycle_status = 'active' and new.facility_location_id is null then
    raise exception 'DRAFT_ACTIVATION_MISSING_FACILITY_LOCATION';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 2. cash_import_candidate_plans — the "creation plan", not the creation
-- =============================================================================
-- One row per (batch_id, vessel_label). Set/replaced by
-- set_cash_import_label_mapping whenever a label is mapped
-- 'new_project_candidate' (§4) — never written anywhere else. resolved_
-- vessel_id/resolved_project_id stay null until approve_and_commit_cash_
-- import_batch (§7) actually creates the vessel/project; their presence is
-- the durable proof of "already created for this batch", which is what
-- makes candidate creation exactly-once (see §7 comment).

create table public.cash_import_candidate_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  vessel_label text not null,
  vessel_name text not null,
  client_id uuid not null,
  service_type_id uuid not null,
  facility_location_id uuid,
  start_date date not null,
  priority public.vessel_project_priority not null default 'standard',
  resolved_vessel_id uuid,
  resolved_project_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, tenant_id) references public.cash_import_batches (id, tenant_id) on delete cascade,
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id),
  foreign key (service_type_id, tenant_id) references public.service_types (id, tenant_id),
  foreign key (facility_location_id, tenant_id) references public.facility_locations (id, tenant_id),
  foreign key (resolved_vessel_id, tenant_id) references public.vessels (id, tenant_id),
  foreign key (resolved_project_id, tenant_id) references public.vessel_projects (id, tenant_id),
  unique (batch_id, vessel_label)
);

create index cash_import_candidate_plans_tenant_id_idx on public.cash_import_candidate_plans (tenant_id);
create index cash_import_candidate_plans_batch_id_idx on public.cash_import_candidate_plans (tenant_id, batch_id);

create trigger set_updated_at before update on public.cash_import_candidate_plans
  for each row execute function private.set_updated_at();

alter table public.cash_import_candidate_plans enable row level security;
revoke all on public.cash_import_candidate_plans from public;

-- Same read posture as the other three staging tables (owner+admin only) —
-- mutation only through the SECURITY DEFINER RPCs below, no INSERT/UPDATE/
-- DELETE grant for `authenticated`.
create policy cash_import_candidate_plans_select_owner_admin
  on public.cash_import_candidate_plans for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.cash_import_candidate_plans to authenticated;
grant all on public.cash_import_candidate_plans to service_role;

-- =============================================================================
-- 3. cash_import_events — widen event_type for the new auto-apply action
-- =============================================================================

alter table public.cash_import_events
  drop constraint cash_import_events_event_type_check;

alter table public.cash_import_events
  add constraint cash_import_events_event_type_check check (
    event_type in (
      'batch_created', 'batch_reopened', 'label_mapping_set', 'row_disposition_set',
      'ready_for_review', 'owner_approved_and_committed', 'owner_rejected',
      'owner_rolled_back_import', 'auto_disposition_applied'
    )
  );

-- =============================================================================
-- 4. set_cash_import_label_mapping — candidate plan capture
-- =============================================================================
-- Signature changes (6 new trailing params), so this is DROP + CREATE, not
-- CREATE OR REPLACE (Postgres identifies functions by name + argument
-- types). Body is otherwise identical to the Gate 1J-C version (committed-
-- batch immutability, existing_vessel_project checks unchanged) plus the new
-- candidate-plan upsert/cleanup at the end.

drop function public.set_cash_import_label_mapping(uuid, text, public.cash_import_mapping_kind, uuid);

create function public.set_cash_import_label_mapping(
  p_batch_id uuid,
  p_vessel_label text,
  p_mapping_kind public.cash_import_mapping_kind,
  p_mapped_vessel_project_id uuid default null,
  p_candidate_vessel_name text default null,
  p_candidate_client_id uuid default null,
  p_candidate_service_type_id uuid default null,
  p_candidate_facility_location_id uuid default null,
  p_candidate_start_date date default null,
  p_candidate_priority public.vessel_project_priority default 'standard'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_batch_status public.cash_import_batch_status;
  v_project_tenant_id uuid;
  v_affected integer;
begin
  select tenant_id, status into v_tenant_id, v_batch_status
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to edit cash import batch mapping';
  end if;

  -- 'rolled_back' is blocked too (Gate 1J-D, 20260720130000...sql §8) — this
  -- DROP+CREATE carries that widened guard forward unchanged.
  if v_batch_status in ('committed', 'rolled_back') then
    raise exception 'BATCH_COMMITTED_IMMUTABLE';
  end if;

  if p_mapping_kind = 'existing_vessel_project' then
    if p_mapped_vessel_project_id is null then
      raise exception 'MAPPING_PROJECT_REQUIRED';
    end if;

    select tenant_id into v_project_tenant_id
    from public.vessel_projects
    where id = p_mapped_vessel_project_id;

    if v_project_tenant_id is null or v_project_tenant_id <> v_tenant_id then
      raise exception 'CROSS_TENANT_PROJECT_MAPPING_REJECTED';
    end if;
  end if;

  if p_mapping_kind = 'new_project_candidate' then
    if p_candidate_vessel_name is null or btrim(p_candidate_vessel_name) = ''
      or p_candidate_client_id is null
      or p_candidate_service_type_id is null
      or p_candidate_start_date is null
    then
      raise exception 'CANDIDATE_PLAN_FIELDS_REQUIRED';
    end if;
  end if;

  update public.cash_import_rows
  set
    mapping_kind = p_mapping_kind,
    mapped_vessel_project_id = case when p_mapping_kind = 'existing_vessel_project' then p_mapped_vessel_project_id else null end
  where batch_id = p_batch_id
    and vessel_label is not distinct from p_vessel_label
    and provisional_classification <> 'opening_cash';

  get diagnostics v_affected = row_count;

  -- Candidate plan is a pure creation PLAN — never touches vessels/
  -- vessel_projects. Re-running this with a different mapping_kind for the
  -- same label deletes any stale plan first, so a label can never carry a
  -- leftover plan for a kind it is no longer mapped to.
  delete from public.cash_import_candidate_plans
  where batch_id = p_batch_id and vessel_label is not distinct from p_vessel_label;

  if p_mapping_kind = 'new_project_candidate' then
    insert into public.cash_import_candidate_plans (
      tenant_id, batch_id, vessel_label, vessel_name, client_id, service_type_id,
      facility_location_id, start_date, priority, created_by
    ) values (
      v_tenant_id, p_batch_id, p_vessel_label, btrim(p_candidate_vessel_name), p_candidate_client_id,
      p_candidate_service_type_id, p_candidate_facility_location_id, p_candidate_start_date,
      coalesce(p_candidate_priority, 'standard'), auth.uid()
    );
  end if;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_tenant_id, p_batch_id, 'label_mapping_set', auth.uid(),
    jsonb_build_object(
      'vessel_label', p_vessel_label,
      'mapping_kind', p_mapping_kind,
      'mapped_vessel_project_id', p_mapped_vessel_project_id,
      'affected_row_count', v_affected
    )
  );

  perform private.touch_cash_import_batch_after_edit(p_batch_id);

  return v_affected;
end;
$$;

revoke execute on function public.set_cash_import_label_mapping(
  uuid, text, public.cash_import_mapping_kind, uuid, text, uuid, uuid, uuid, date, public.vessel_project_priority
) from public;
grant execute on function public.set_cash_import_label_mapping(
  uuid, text, public.cash_import_mapping_kind, uuid, text, uuid, uuid, uuid, date, public.vessel_project_priority
) to authenticated;

-- =============================================================================
-- 5. mark_cash_import_batch_ready_for_review — candidate plan completeness
-- =============================================================================
-- Identical body to the Gate 1L version (20260721000000_owner_control_
-- notification_outbox.sql §8a — which itself already added v_event_id + the
-- import_review_requested notification enqueue on top of the Gate 1J-B
-- original) plus one new precondition; `create or replace function` — none
-- of those migration files themselves are edited.

create or replace function public.mark_cash_import_batch_ready_for_review(p_batch_id uuid)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.cash_import_batch_status;
  v_error_count integer;
  v_calculated_closing numeric(16, 2);
  v_workbook_closing numeric(16, 2);
  v_result public.cash_import_batches;
  v_event_id uuid;
begin
  select tenant_id, status, error_count, calculated_closing_balance, workbook_closing_balance
    into v_tenant_id, v_status, v_error_count, v_calculated_closing, v_workbook_closing
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to prepare cash import batch for review';
  end if;

  if v_status not in ('draft', 'mapping_required') then
    raise exception 'BATCH_NOT_ELIGIBLE_FOR_REVIEW';
  end if;

  if v_error_count > 0 then
    raise exception 'VALIDATION_ERRORS_PRESENT';
  end if;

  if v_workbook_closing is null or v_workbook_closing <> v_calculated_closing then
    raise exception 'RECONCILIATION_VARIANCE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and (
        mapping_kind is null
        or (mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id is null)
      )
  ) then
    raise exception 'MAPPING_INCOMPLETE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition is null
  ) then
    raise exception 'DISPOSITION_INCOMPLETE';
  end if;

  if exists (
    select distinct vessel_label from public.cash_import_rows r
    where r.batch_id = p_batch_id
      and r.disposition = 'include'
      and r.mapping_kind = 'new_project_candidate'
      and not exists (
        select 1 from public.cash_import_candidate_plans p
        where p.batch_id = p_batch_id and p.vessel_label is not distinct from r.vessel_label
      )
  ) then
    raise exception 'CANDIDATE_PLAN_INCOMPLETE';
  end if;

  update public.cash_import_batches
  set status = 'ready_for_review'
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (v_tenant_id, p_batch_id, 'ready_for_review', auth.uid(), '{}'::jsonb)
  returning id into v_event_id;

  -- Gate 1L: notify the owner a batch is waiting — unchanged from
  -- 20260721000000...sql §8a.
  perform private.enqueue_notification_event(
    v_tenant_id,
    'import_review_requested',
    'cash_import_batch',
    p_batch_id,
    v_event_id,
    jsonb_build_object(
      'message_line1', 'Pak Hanafi, ada hasil import kas yang menunggu pemeriksaan.',
      'link_path', '/owner/review/cash-import/' || p_batch_id::text
    )
  );

  return v_result;
end;
$$;

-- =============================================================================
-- 6. auto_apply_cash_import_batch_dispositions — exception-only review
-- =============================================================================
-- Only ever sets disposition on rows that currently have disposition IS
-- NULL — never overwrites a decision a human (or a prior auto-apply call)
-- already made, so this is naturally idempotent and manual override always
-- remains available afterward. Direction/completeness checks mirror
-- approve_and_commit_cash_import_batch's own UNEXPECTED_ROW_DIRECTION/
-- INVALID_ROW_AMOUNT logic exactly, so a row that would fail to post never
-- gets auto-included.

create type public.cash_import_auto_disposition_result as (
  auto_included_count integer,
  manual_review_count integer
);

create function public.auto_apply_cash_import_batch_dispositions(
  p_batch_id uuid,
  p_vessel_label text default null,
  p_scope_to_label boolean default false
)
returns public.cash_import_auto_disposition_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_batch_status public.cash_import_batch_status;
  v_included integer := 0;
  v_manual integer := 0;
  v_result public.cash_import_auto_disposition_result;
begin
  select tenant_id, status into v_tenant_id, v_batch_status
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to edit cash import batch mapping';
  end if;

  if v_batch_status = 'committed' then
    raise exception 'BATCH_COMMITTED_IMMUTABLE';
  end if;

  with candidate_ok as (
    select r.id
    from public.cash_import_rows r
    where r.batch_id = p_batch_id
      and r.provisional_classification <> 'opening_cash'
      and r.disposition is null
      and (not p_scope_to_label or r.vessel_label is not distinct from p_vessel_label)
      and r.status <> 'error'
      and r.duplicate_group_key is null
      and r.mapping_kind is not null
      and r.mapping_kind <> 'unresolved'
      and (r.mapping_kind <> 'existing_vessel_project' or r.mapped_vessel_project_id is not null)
      and (
        r.mapping_kind <> 'new_project_candidate'
        or exists (
          select 1 from public.cash_import_candidate_plans p
          where p.batch_id = p_batch_id and p.vessel_label is not distinct from r.vessel_label
        )
      )
      and (
        (r.mapping_kind = 'cash' and coalesce(r.debit, 0) > 0 and coalesce(r.credit, 0) <= 0)
        or (r.mapping_kind = 'shared_overhead' and coalesce(r.credit, 0) > 0 and coalesce(r.debit, 0) <= 0)
        or (
          r.mapping_kind in ('existing_vessel_project', 'new_project_candidate')
          and (
            (coalesce(r.debit, 0) > 0 and coalesce(r.credit, 0) <= 0)
            or (coalesce(r.credit, 0) > 0 and coalesce(r.debit, 0) <= 0)
          )
        )
      )
  ),
  included as (
    update public.cash_import_rows
    set disposition = 'include', disposition_reason = 'Auto-disposition: baris valid, dimasukkan otomatis.'
    where id in (select id from candidate_ok)
    returning id
  )
  select count(*) into v_included from included;

  with manual_ok as (
    select r.id
    from public.cash_import_rows r
    where r.batch_id = p_batch_id
      and r.provisional_classification <> 'opening_cash'
      and r.disposition is null
      and (not p_scope_to_label or r.vessel_label is not distinct from p_vessel_label)
  ),
  reviewed as (
    update public.cash_import_rows r
    set disposition = 'manual_review', disposition_reason = 'Auto-disposition: perlu tinjauan manual (error/duplikat/mapping belum lengkap/arah nominal tidak sesuai).'
    where id in (select id from manual_ok)
    returning id
  )
  select count(*) into v_manual from reviewed;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_tenant_id, p_batch_id, 'auto_disposition_applied', auth.uid(),
    jsonb_build_object(
      'vessel_label', case when p_scope_to_label then p_vessel_label else null end,
      'auto_included_count', v_included,
      'manual_review_count', v_manual
    )
  );

  perform private.touch_cash_import_batch_after_edit(p_batch_id);

  v_result.auto_included_count := v_included;
  v_result.manual_review_count := v_manual;
  return v_result;
end;
$$;

revoke execute on function public.auto_apply_cash_import_batch_dispositions(uuid, text, boolean) from public;
grant execute on function public.auto_apply_cash_import_batch_dispositions(uuid, text, boolean) to authenticated;

-- =============================================================================
-- 7. approve_and_commit_cash_import_batch — candidate creation + commit
-- =============================================================================
-- `create or replace function` — same signature (p_batch_id uuid) as the
-- Gate 1J-C original, so 20260720120000...sql is not edited and every
-- existing caller keeps working unchanged.
--
-- Idempotency/atomicity: candidate vessel/project creation happens strictly
-- AFTER the batch-row `for update` lock and the `status = 'ready_for_review'`
-- check, and strictly BEFORE `status` flips to 'committed' — all inside this
-- one function invocation, which Postgres runs as a single transaction. Any
-- exception anywhere (including mid-loop) rolls back everything: the new
-- vessels/vessel_projects rows, the candidate-plan resolved_* updates, and
-- every ledger posting already made in this call. A retry after a genuine
-- failure starts clean (nothing survived). A retry after success immediately
-- hits BATCH_ALREADY_COMMITTED before the candidate loop is ever reached, so
-- creation is exactly-once by construction — no new idempotency mechanism
-- needed beyond the existing status-lock pattern.
create or replace function public.approve_and_commit_cash_import_batch(
  p_batch_id uuid
)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.cash_import_batches;
  v_pool public.cash_pools;
  v_existing_financial_count integer;
  v_opening_row_id uuid;
  v_row record;
  v_plan record;
  v_description text;
  v_vessel_id uuid;
  v_project_id uuid;
  v_canonical_opening numeric(16, 2) := 0;
  v_canonical_cash_top_up numeric(16, 2) := 0;
  v_canonical_project_refund numeric(16, 2) := 0;
  v_canonical_project_expense numeric(16, 2) := 0;
  v_canonical_shared_overhead numeric(16, 2) := 0;
  v_result public.cash_import_batches;
  v_event_id uuid;
begin
  select * into v_batch from public.cash_import_batches where id = p_batch_id for update;

  if v_batch.id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_batch.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to approve cash import batch';
  end if;

  if v_batch.status = 'committed' then
    raise exception 'BATCH_ALREADY_COMMITTED';
  end if;

  if v_batch.status <> 'ready_for_review' then
    raise exception 'BATCH_NOT_READY_FOR_REVIEW';
  end if;

  -- Revalidation (defense in depth) — mirrors mark_cash_import_batch_ready_
  -- for_review's own checks exactly.
  if v_batch.error_count > 0 then
    raise exception 'VALIDATION_ERRORS_PRESENT';
  end if;

  if v_batch.workbook_closing_balance is null or v_batch.workbook_closing_balance <> v_batch.calculated_closing_balance then
    raise exception 'RECONCILIATION_VARIANCE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and (
        mapping_kind is null
        or (mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id is null)
      )
  ) then
    raise exception 'MAPPING_INCOMPLETE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition is null
  ) then
    raise exception 'DISPOSITION_INCOMPLETE';
  end if;

  -- Additional gates unique to the commit step.
  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id and disposition = 'manual_review'
  ) then
    raise exception 'MANUAL_REVIEW_UNRESOLVED';
  end if;

  -- 'new_project_candidate' is no longer blocked here (Gate 6I-A) — only a
  -- genuinely unresolved mapping still is.
  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and disposition = 'include'
      and mapping_kind = 'unresolved'
  ) then
    raise exception 'MAPPING_NOT_COMMITTABLE';
  end if;

  if exists (
    select distinct vessel_label from public.cash_import_rows r
    where r.batch_id = p_batch_id
      and r.disposition = 'include'
      and r.mapping_kind = 'new_project_candidate'
      and not exists (
        select 1 from public.cash_import_candidate_plans p
        where p.batch_id = p_batch_id and p.vessel_label is not distinct from r.vessel_label
      )
  ) then
    raise exception 'CANDIDATE_PLAN_MISSING';
  end if;

  -- Pool for this batch's business date — owner is within
  -- get_or_create_daily_cash_pool's own ['owner','admin'] role check, and
  -- the batch-row lock above already proved the caller is an owner of this
  -- exact tenant.
  v_pool := public.get_or_create_daily_cash_pool(v_batch.tenant_id, v_batch.business_date);

  select * into v_pool from public.cash_pools where id = v_pool.id for update;

  if v_pool.daily_close_status <> 'open' then
    raise exception 'CASH_POOL_NOT_OPEN';
  end if;

  select count(*) into v_existing_financial_count
  from (
    select 1 from public.cash_pool_entries where pool_id = v_pool.id
    union all
    select 1 from public.project_cost_ledger_entries where pool_id = v_pool.id
  ) x;

  if v_existing_financial_count > 0 then
    raise exception 'OPENING_BALANCE_CONFLICT';
  end if;

  -- A'. Candidate creation — exactly one vessel + one draft Project Kapal
  -- per unique vessel_label with an included new_project_candidate row in
  -- THIS batch. `for update` locks each plan row so a concurrent second
  -- approval attempt on the SAME batch (already serialized by the batch
  -- lock above) can never double-create; a plan already carrying a
  -- resolved_project_id would only be re-visited on a retry, which cannot
  -- happen once status = 'committed' (see file header).
  for v_plan in
    select p.* from public.cash_import_candidate_plans p
    where p.batch_id = p_batch_id
      -- Defensive belt-and-suspenders: a plan that already carries a
      -- resolved_project_id was already created — structurally unreachable
      -- in practice (see file header), but this guard makes a second
      -- traversal of this loop a no-op instead of a silent duplicate create.
      and p.resolved_project_id is null
      and exists (
        select 1 from public.cash_import_rows r
        where r.batch_id = p_batch_id
          and r.disposition = 'include'
          and r.mapping_kind = 'new_project_candidate'
          and r.vessel_label is not distinct from p.vessel_label
      )
    for update
  loop
    insert into public.vessels (tenant_id, client_id, vessel_name, status, created_by)
    values (v_batch.tenant_id, v_plan.client_id, v_plan.vessel_name, 'active', auth.uid())
    returning id into v_vessel_id;

    insert into public.vessel_projects (
      tenant_id, vessel_id, client_id, service_type_id, facility_location_id,
      start_date, priority, lifecycle_status, created_by
    ) values (
      v_batch.tenant_id, v_vessel_id, v_plan.client_id, v_plan.service_type_id, v_plan.facility_location_id,
      v_plan.start_date, v_plan.priority, 'draft', auth.uid()
    )
    returning id into v_project_id;

    update public.cash_import_candidate_plans
    set resolved_vessel_id = v_vessel_id, resolved_project_id = v_project_id
    where id = v_plan.id;
  end loop;

  -- A. Opening balance — posted once, from the batch header (the synthetic
  -- opening_cash row itself carries no debit/credit; it exists for
  -- provenance linkage only). Zero opening balance posts no entry (amount
  -- must be > 0 per cash_pool_entries' own check constraint) — the pool
  -- simply opens at zero, which is a legitimate value, not an error.
  select id into v_opening_row_id
  from public.cash_import_rows
  where batch_id = p_batch_id and provisional_classification = 'opening_cash'
  limit 1;

  if v_batch.opening_balance > 0 then
    insert into public.cash_pool_entries (
      tenant_id, pool_id, entry_type, entry_kind, amount, description,
      import_batch_id, import_row_id, created_by
    ) values (
      v_batch.tenant_id, v_pool.id, 'opening_cash', 'entry', v_batch.opening_balance,
      'Saldo awal — import ' || v_batch.source_filename, v_batch.id, v_opening_row_id, auth.uid()
    );
    v_canonical_opening := v_batch.opening_balance;
  end if;

  -- B-E. Every included, non-opening row, in source order — one canonical
  -- posting (or, for a refund, one paired posting) per row.
  for v_row in
    select * from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition = 'include'
    order by source_row_number
  loop
    v_description := coalesce(
      nullif(btrim(v_row.description), ''),
      'Import baris ' || v_row.source_row_number || ' — ' || to_char(v_batch.business_date, 'YYYY-MM-DD')
    );

    if v_row.mapping_kind = 'cash' then
      -- B. Cash top-up.
      if coalesce(v_row.debit, 0) <= 0 or coalesce(v_row.credit, 0) > 0 then
        raise exception 'UNEXPECTED_ROW_DIRECTION';
      end if;

      insert into public.cash_pool_entries (
        tenant_id, pool_id, entry_type, entry_kind, amount, description,
        import_batch_id, import_row_id, created_by
      ) values (
        v_batch.tenant_id, v_pool.id, 'cash_top_up', 'entry', v_row.debit, v_description,
        v_batch.id, v_row.id, auth.uid()
      );
      v_canonical_cash_top_up := v_canonical_cash_top_up + v_row.debit;

    elsif v_row.mapping_kind = 'shared_overhead' then
      -- D. Shared overhead.
      if coalesce(v_row.credit, 0) <= 0 or coalesce(v_row.debit, 0) > 0 then
        raise exception 'UNEXPECTED_ROW_DIRECTION';
      end if;

      insert into public.project_cost_ledger_entries (
        tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
        amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
      ) values (
        v_batch.tenant_id, v_pool.id, null, null, null, 'expense', 'shared_overhead',
        v_row.credit, v_description, null, v_batch.id, v_row.id, auth.uid()
      );
      v_canonical_shared_overhead := v_canonical_shared_overhead + v_row.credit;

    elsif v_row.mapping_kind in ('existing_vessel_project', 'new_project_candidate') then
      -- Resolve the posting target: an existing mapping carries its own
      -- project id; a candidate row's project was just created above (or on
      -- an earlier iteration of the candidate loop for the same label).
      if v_row.mapping_kind = 'existing_vessel_project' then
        v_project_id := v_row.mapped_vessel_project_id;
      else
        select resolved_project_id into v_project_id
        from public.cash_import_candidate_plans
        where batch_id = p_batch_id and vessel_label is not distinct from v_row.vessel_label;

        if v_project_id is null then
          -- Defensive backstop — CANDIDATE_PLAN_MISSING above should have
          -- already caught this; a null resolved_project_id here would mean
          -- the candidate loop somehow skipped this label.
          raise exception 'CANDIDATE_PLAN_MISSING';
        end if;
      end if;

      if coalesce(v_row.debit, 0) > 0 and coalesce(v_row.credit, 0) <= 0 then
        -- E. Project refund — paired atomic posting, same import_row_id on
        -- both sides.
        insert into public.cash_pool_entries (
          tenant_id, pool_id, entry_type, entry_kind, amount, description,
          import_batch_id, import_row_id, created_by
        ) values (
          v_batch.tenant_id, v_pool.id, 'project_refund', 'entry', v_row.debit, v_description,
          v_batch.id, v_row.id, auth.uid()
        );

        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_project_id, null, null, 'refund', 'project',
          v_row.debit, v_description, null, v_batch.id, v_row.id, auth.uid()
        );
        v_canonical_project_refund := v_canonical_project_refund + v_row.debit;

      elsif coalesce(v_row.credit, 0) > 0 and coalesce(v_row.debit, 0) <= 0 then
        -- C. Project expense.
        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_project_id, null, null, 'expense', 'project',
          v_row.credit, v_description, null, v_batch.id, v_row.id, auth.uid()
        );
        v_canonical_project_expense := v_canonical_project_expense + v_row.credit;
      else
        raise exception 'INVALID_ROW_AMOUNT';
      end if;

    else
      -- mapping_kind is 'unresolved' — already blocked above; this branch
      -- exists only as a defensive backstop.
      raise exception 'MAPPING_NOT_COMMITTABLE';
    end if;
  end loop;

  update public.cash_import_batches
  set
    status = 'committed',
    committed_at = now(),
    committed_by = auth.uid(),
    canonical_opening_cash = v_canonical_opening,
    canonical_cash_top_up_total = v_canonical_cash_top_up,
    canonical_project_refund_total = v_canonical_project_refund,
    canonical_project_expense_total = v_canonical_project_expense,
    canonical_shared_overhead_total = v_canonical_shared_overhead,
    canonical_closing_cash = v_canonical_opening + v_canonical_cash_top_up + v_canonical_project_refund
      - v_canonical_project_expense - v_canonical_shared_overhead
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_batch.tenant_id, p_batch_id, 'owner_approved_and_committed', auth.uid(),
    jsonb_build_object(
      'pool_id', v_pool.id,
      'canonical_opening_cash', v_canonical_opening,
      'canonical_cash_top_up_total', v_canonical_cash_top_up,
      'canonical_project_refund_total', v_canonical_project_refund,
      'canonical_project_expense_total', v_canonical_project_expense,
      'canonical_shared_overhead_total', v_canonical_shared_overhead,
      'canonical_closing_cash', v_result.canonical_closing_cash
    )
  )
  returning id into v_event_id;

  -- Gate 1L: confirm to the owner that the import is now recorded —
  -- unchanged from 20260721000000...sql §8b.
  perform private.enqueue_notification_event(
    v_batch.tenant_id,
    'import_approved',
    'cash_import_batch',
    p_batch_id,
    v_event_id,
    jsonb_build_object(
      'message_line1', 'Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP.'
    )
  );

  return v_result;
end;
$$;

-- =============================================================================
-- 8. Corrective — draft operational safety + activation guard
-- =============================================================================

-- --- 8a. transition_vessel_project_lifecycle — optional complete-and-activate
-- Signature gains one new trailing default-null param, so this is DROP +
-- CREATE (not CREATE OR REPLACE — Postgres identifies functions by name +
-- argument types). Body is the CURRENT one from Gate 1O
-- (20260722020000_project_close_overhead_guard.sql, which already extended
-- the Gate 1B/1D original with the ready_to_close->closed shared-overhead-
-- allocation guard via its own CREATE OR REPLACE — that file itself is not
-- edited, and its guard is preserved byte-for-byte here) plus two additions:
-- a tenant-safe check for an optional p_facility_location_id, and the UPDATE
-- now also sets facility_location_id when one is supplied. The trigger in
-- §1a above sees that same statement's NEW row, so completing and
-- activating in one call ("Lengkapi & Aktifkan") is atomic: either both
-- happen or neither does, never a project left activated-but-still-
-- incomplete or completed-but-still-draft.
drop function public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text);

create function public.transition_vessel_project_lifecycle(
  p_project_id uuid,
  p_to_status public.vessel_project_lifecycle_status,
  p_reason text default null,
  p_facility_location_id uuid default null
)
returns public.vessel_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from_status public.vessel_project_lifecycle_status;
  v_tenant_id uuid;
  v_start_date date;
  v_facility_location_id uuid;
  v_blocking_count integer;
  v_jakarta_today date;
  v_result public.vessel_projects;
begin
  select lifecycle_status, tenant_id, start_date, facility_location_id
    into v_from_status, v_tenant_id, v_start_date, v_facility_location_id
    from public.vessel_projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'vessel project not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to transition vessel project lifecycle';
  end if;

  -- Corrective: tenant-safe check for an optional complete-and-activate
  -- facility location supplied by the caller — checked before the composite
  -- FK would otherwise raise a bare 23503.
  if p_facility_location_id is not null
    and not exists (
      select 1 from public.facility_locations
      where id = p_facility_location_id and tenant_id = v_tenant_id
    )
  then
    raise exception 'CROSS_TENANT_FACILITY_LOCATION_REJECTED';
  end if;

  -- Gate 1O: shared overhead applicable to this project's cost period must
  -- be fully allocated before it can close. Server-side only — no UI-layer
  -- check can substitute for this, and it fires regardless of caller.
  -- Unchanged from 20260722020000...sql.
  if p_to_status = 'closed' then
    v_jakarta_today := (now() at time zone 'Asia/Jakarta')::date;

    select count(*) into v_blocking_count
    from public.shared_overhead_allocation_status s
    where s.tenant_id = v_tenant_id
      and s.business_date between v_start_date and v_jakarta_today
      and (
        v_facility_location_id is null
        or s.facility_location_id is null
        or s.facility_location_id = v_facility_location_id
      )
      and s.allocation_status in ('unallocated', 'partially_allocated');

    if v_blocking_count > 0 then
      raise exception 'SHARED_OVERHEAD_ALLOCATION_INCOMPLETE';
    end if;
  end if;

  -- The BEFORE UPDATE trigger in §1a is the authoritative state-machine AND
  -- draft-activation-completeness check (fires on this UPDATE and raises if
  -- the transition is invalid or the project is still incomplete); no
  -- duplicate validation here.
  update public.vessel_projects
  set
    lifecycle_status = p_to_status,
    facility_location_id = coalesce(p_facility_location_id, facility_location_id),
    ready_to_close_at = case when p_to_status = 'ready_to_close' then now() else ready_to_close_at end,
    closed_at = case when p_to_status = 'closed' then now() else closed_at end,
    closed_by = case when p_to_status = 'closed' then auth.uid() else closed_by end
  where id = p_project_id
  returning * into v_result;

  insert into public.vessel_project_lifecycle_events (
    tenant_id, project_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_project_id, v_from_status, p_to_status, auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.transition_vessel_project_lifecycle(
  uuid, public.vessel_project_lifecycle_status, text, uuid
) from public;
grant execute on function public.transition_vessel_project_lifecycle(
  uuid, public.vessel_project_lifecycle_status, text, uuid
) to authenticated;

-- --- 8b. allocate_shared_overhead_entry — exclude draft from normal targets -
-- Identical body to the Gate 1D.1 original (20260722010000_shared_overhead_
-- allocation.sql §6a) except the lifecycle_status guard becomes an explicit
-- active/ready_to_close allow-list instead of a closed-only deny-list — a
-- 'draft' project (incomplete, import-candidate-only) is excluded by
-- construction now, not merely by omission. `create or replace` — same
-- signature, that migration file itself is not edited.
create or replace function public.allocate_shared_overhead_entry(
  p_overhead_entry_id uuid,
  p_project_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.shared_overhead_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.project_cost_ledger_entries;
  v_project public.vessel_projects;
  v_allocated numeric;
  v_result public.shared_overhead_allocations;
begin
  select * into v_entry
  from public.project_cost_ledger_entries
  where id = p_overhead_entry_id
  for update;

  if v_entry.id is null then
    raise exception 'shared overhead entry not found';
  end if;

  if not private.current_user_has_tenant_role(v_entry.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to allocate shared overhead';
  end if;

  if v_entry.entry_scope <> 'shared_overhead' or v_entry.entry_kind <> 'expense' then
    raise exception 'only an original shared overhead expense can be allocated';
  end if;

  if exists (select 1 from public.project_cost_ledger_entries where reverses_entry_id = p_overhead_entry_id) then
    raise exception 'cannot allocate a reversed shared overhead entry';
  end if;

  select * into v_project
  from public.vessel_projects
  where id = p_project_id and tenant_id = v_entry.tenant_id;

  if v_project.id is null then
    raise exception 'vessel project not found';
  end if;

  if v_project.lifecycle_status not in ('active', 'ready_to_close') then
    raise exception 'CANNOT_ALLOCATE_OVERHEAD_TO_INELIGIBLE_PROJECT';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'allocation amount must be greater than zero';
  end if;

  select coalesce(sum(amount) filter (where allocation_kind = 'allocation'), 0)
       - coalesce(sum(amount) filter (where allocation_kind = 'reversal'), 0)
    into v_allocated
  from public.shared_overhead_allocations
  where overhead_entry_id = p_overhead_entry_id;

  if v_allocated + p_amount > v_entry.amount then
    raise exception 'allocation exceeds shared overhead entry amount';
  end if;

  insert into public.shared_overhead_allocations (
    tenant_id, overhead_entry_id, project_id, allocation_kind, amount, note, actor_user_id
  ) values (
    v_entry.tenant_id, p_overhead_entry_id, p_project_id, 'allocation', p_amount, p_note, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;
