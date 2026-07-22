-- ADOP Phase 1 Gate 1M — Shared Overhead Recording Through the Existing
-- Submission/Duplicate/Approval Pipeline
--
-- "Biaya Bersama / Overhead" (public.project_cost_ledger_entries.entry_scope
-- = 'shared_overhead', in use since Gate 1J-C for the import path only) is a
-- LOCKED canonical transaction type — this migration widens the
-- expense_submissions -> duplicate detection -> owner approval pipeline Gate
-- 1E/1F already built for "Biaya Project Kapal" so DIRECT UI entry can also
-- record shared overhead, with every existing guarantee project expenses
-- already have: draft/revise, mandatory duplicate-candidate detection before
-- approval, owner-only approval, append-only ledger posting, append-only
-- reversal. No new submission/approval engine is built — the same tables and
-- RPCs are widened.
--
-- Also:
--   - Adds an optional facility_location_id to both the ledger and the
--     submission revision (nullable everywhere — not required to record an
--     expense, project or overhead).
--   - Fixes a latent bug in reverse_project_expense: its INSERT never
--     carried entry_scope (or, now, facility_location_id) from the original
--     row, so reversing a 'shared_overhead' entry would violate
--     project_cost_ledger_entries_scope_project_id_check (entry_scope
--     defaults to 'project', which requires project_id not null — but a
--     shared_overhead original has project_id null). Untested until now
--     because no shared_overhead entry has ever been reversible outside of
--     import commit/rollback, which build their own reversal rows directly
--     and already carry entry_scope correctly.
--
-- Does not edit 20260719120000_project_cost_ledger.sql, 20260719130000_
-- expense_submission_approval.sql, or 20260719140000_expense_duplicate_
-- detection.sql — record_project_expense, create_expense_draft,
-- revise_expense_draft, reverse_project_expense, approve_expense_submission,
-- and private.detect_expense_duplicate_candidates are all extended here via
-- DROP+CREATE (when the parameter list grows) or CREATE OR REPLACE (when it
-- does not), the same non-destructive technique every prior gate uses.

-- =============================================================================
-- 1. facility_location_id — nullable, on both the ledger and the revision
-- =============================================================================

alter table public.project_cost_ledger_entries
  add column facility_location_id uuid;

alter table public.project_cost_ledger_entries
  add foreign key (facility_location_id, tenant_id) references public.facility_locations (id, tenant_id) on delete cascade;

alter table public.expense_submission_revisions
  add column facility_location_id uuid;

alter table public.expense_submission_revisions
  add foreign key (facility_location_id, tenant_id) references public.facility_locations (id, tenant_id) on delete cascade;

-- =============================================================================
-- 2. expense_submission_revisions — entry_scope, nullable project_id
-- =============================================================================
-- Reuses public.project_cost_ledger_entry_scope (Gate 1J-C) rather than a
-- new enum — the submission's scope and the ledger entry it eventually posts
-- must always agree, so they share one type. All existing rows default to
-- 'project', which trivially satisfies the check below since project_id was
-- already not-null for every one of them.

alter table public.expense_submission_revisions
  add column entry_scope public.project_cost_ledger_entry_scope not null default 'project';

alter table public.expense_submission_revisions
  alter column project_id drop not null;

alter table public.expense_submission_revisions
  add constraint expense_submission_revisions_scope_project_id_check check (
    (entry_scope = 'project' and project_id is not null)
    or (entry_scope = 'shared_overhead' and project_id is null)
  );

-- expense_submission_current — replaced to expose the two new columns; every
-- other column/join is unchanged from Gate 1E.
create or replace view public.expense_submission_current
with (security_invoker = true) as
select
  s.id as submission_id,
  s.tenant_id,
  s.status,
  s.created_by,
  s.created_at,
  s.updated_at,
  s.decided_by,
  s.decided_at,
  s.ledger_entry_id,
  r.id as revision_id,
  r.revision_number,
  r.pool_id,
  r.project_id,
  r.category_id,
  r.vendor_id,
  r.amount,
  r.description,
  r.reference_number,
  r.created_by as revision_created_by,
  r.created_at as revision_created_at,
  r.entry_scope,
  r.facility_location_id
from public.expense_submissions s
join public.expense_submission_revisions r on r.id = s.current_revision_id;

-- grants unchanged — CREATE OR REPLACE VIEW keeps existing grants.

-- =============================================================================
-- 3. record_project_expense — add facility_location_id. This is a NEW
--    trailing parameter, so the old 7-arg signature is dropped first (CREATE
--    OR REPLACE cannot change a function's argument list; it would create a
--    second overload alongside the old one instead of replacing it).
-- =============================================================================

drop function public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text);

create function public.record_project_expense(
  p_pool_id uuid,
  p_project_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_vendor_id uuid default null,
  p_reference_number text default null,
  p_facility_location_id uuid default null
)
returns public.project_cost_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.project_cost_ledger_entries;
begin
  select tenant_id into v_tenant_id
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record project expense';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
    facility_location_id, amount, description, reference_number, actor_user_id
  ) values (
    v_tenant_id, p_pool_id, p_project_id, p_category_id, p_vendor_id, 'expense', 'project',
    p_facility_location_id, p_amount, p_description, p_reference_number, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- Same posture as Gate 1E: not reachable by `authenticated` directly — only
-- approve_expense_submission (function-owner privilege) can call it.
revoke execute on function public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text, uuid) from public;

-- =============================================================================
-- 4. record_shared_overhead_expense — new. Mirrors record_project_expense
--    exactly except project_id is always null and entry_scope is always
--    'shared_overhead'. Same authorization/validation/append-only posture,
--    and the same "not directly callable by `authenticated`" posture —
--    approve_expense_submission is the only caller.
-- =============================================================================

create function public.record_shared_overhead_expense(
  p_pool_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_vendor_id uuid default null,
  p_reference_number text default null,
  p_facility_location_id uuid default null
)
returns public.project_cost_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.project_cost_ledger_entries;
begin
  select tenant_id into v_tenant_id
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record shared overhead expense';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
    facility_location_id, amount, description, reference_number, actor_user_id
  ) values (
    v_tenant_id, p_pool_id, null, p_category_id, p_vendor_id, 'expense', 'shared_overhead',
    p_facility_location_id, p_amount, p_description, p_reference_number, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.record_shared_overhead_expense(uuid, uuid, numeric, text, uuid, text, uuid) from public;

-- =============================================================================
-- 5. reverse_project_expense — bug fix: propagate entry_scope and
--    facility_location_id from the original row. Same signature as the
--    Gate 1K harden version, so CREATE OR REPLACE in place. Every other
--    behavior (owner-only, refund-needs-atomic-reversal, already-reversed
--    guard, reason required) is byte-for-byte unchanged.
-- =============================================================================

create or replace function public.reverse_project_expense(
  p_entry_id uuid,
  p_reason text
)
returns public.project_cost_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.project_cost_ledger_entries;
  v_result public.project_cost_ledger_entries;
begin
  select * into v_original
  from public.project_cost_ledger_entries
  where id = p_entry_id
  for update;

  if v_original.id is null then
    raise exception 'project cost ledger entry not found';
  end if;

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reverse project expense';
  end if;

  if v_original.entry_kind = 'refund' then
    raise exception 'PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL';
  end if;

  if v_original.entry_kind <> 'expense' then
    raise exception 'only an original expense can be reversed';
  end if;

  if exists (select 1 from public.project_cost_ledger_entries where reverses_entry_id = p_entry_id) then
    raise exception 'project expense already reversed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
    facility_location_id, amount, description, reference_number, reverses_entry_id, actor_user_id
  ) values (
    v_original.tenant_id, v_original.pool_id, v_original.project_id, v_original.category_id, v_original.vendor_id,
    'reversal', v_original.entry_scope, v_original.facility_location_id,
    v_original.amount, p_reason, null, p_entry_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- grants unchanged (owner-only, since Gate 1E) — CREATE OR REPLACE keeps them.

-- =============================================================================
-- 6. create_expense_draft / revise_expense_draft — add entry_scope and
--    facility_location_id (two new trailing parameters each), plus the
--    scope<->project_id consistency check mirroring §2's table constraint at
--    the RPC boundary (so a caller gets a clear RPC-level error rather than a
--    bare 23514 from the table check).
-- =============================================================================

drop function public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text);

create function public.create_expense_draft(
  p_tenant_id uuid,
  p_pool_id uuid,
  p_project_id uuid default null,
  p_category_id uuid default null,
  p_amount numeric default null,
  p_description text default null,
  p_vendor_id uuid default null,
  p_reference_number text default null,
  p_entry_scope public.project_cost_ledger_entry_scope default 'project',
  p_facility_location_id uuid default null
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission_id uuid;
  v_revision_id uuid;
  v_result public.expense_submissions;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create expense submission';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  if p_entry_scope = 'project' and p_project_id is null then
    raise exception 'project is required for a project-scoped expense';
  end if;

  if p_entry_scope = 'shared_overhead' and p_project_id is not null then
    raise exception 'shared overhead expense cannot carry a project';
  end if;

  insert into public.expense_submissions (tenant_id, status, created_by)
  values (p_tenant_id, 'draft', auth.uid())
  returning id into v_submission_id;

  insert into public.expense_submission_revisions (
    tenant_id, submission_id, revision_number, entry_scope, pool_id, project_id, category_id, vendor_id,
    facility_location_id, amount, description, reference_number, created_by
  ) values (
    p_tenant_id, v_submission_id, 1, p_entry_scope, p_pool_id, p_project_id, p_category_id, p_vendor_id,
    p_facility_location_id, p_amount, p_description, p_reference_number, auth.uid()
  )
  returning id into v_revision_id;

  update public.expense_submissions
  set current_revision_id = v_revision_id
  where id = v_submission_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text, public.project_cost_ledger_entry_scope, uuid) from public;
grant execute on function public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text, public.project_cost_ledger_entry_scope, uuid) to authenticated;

drop function public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text);

create function public.revise_expense_draft(
  p_submission_id uuid,
  p_pool_id uuid,
  p_project_id uuid default null,
  p_category_id uuid default null,
  p_amount numeric default null,
  p_description text default null,
  p_vendor_id uuid default null,
  p_reference_number text default null,
  p_entry_scope public.project_cost_ledger_entry_scope default 'project',
  p_facility_location_id uuid default null
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_next_revision_number integer;
  v_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status into v_tenant_id, v_status
  from public.expense_submissions
  where id = p_submission_id
  for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to revise expense submission';
  end if;

  if v_status not in ('draft', 'needs_correction') then
    raise exception 'expense submission cannot be revised in its current status';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  if p_entry_scope = 'project' and p_project_id is null then
    raise exception 'project is required for a project-scoped expense';
  end if;

  if p_entry_scope = 'shared_overhead' and p_project_id is not null then
    raise exception 'shared overhead expense cannot carry a project';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next_revision_number
  from public.expense_submission_revisions
  where submission_id = p_submission_id;

  insert into public.expense_submission_revisions (
    tenant_id, submission_id, revision_number, entry_scope, pool_id, project_id, category_id, vendor_id,
    facility_location_id, amount, description, reference_number, created_by
  ) values (
    v_tenant_id, p_submission_id, v_next_revision_number, p_entry_scope, p_pool_id, p_project_id, p_category_id, p_vendor_id,
    p_facility_location_id, p_amount, p_description, p_reference_number, auth.uid()
  )
  returning id into v_revision_id;

  update public.expense_submissions
  set current_revision_id = v_revision_id
  where id = p_submission_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text, public.project_cost_ledger_entry_scope, uuid) from public;
grant execute on function public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text, public.project_cost_ledger_entry_scope, uuid) to authenticated;

-- =============================================================================
-- 7. approve_expense_submission — branch the posting call on the current
--    revision's entry_scope. Same 1-arg signature as Gate 1F, so CREATE OR
--    REPLACE in place. Every other behavior (owner-only, awaiting-review
--    check, duplicate-candidate guards, status event) is unchanged.
-- =============================================================================

create or replace function public.approve_expense_submission(
  p_submission_id uuid
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_current_revision_id uuid;
  v_revision public.expense_submission_revisions;
  v_entry public.project_cost_ledger_entries;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id
    into v_tenant_id, v_status, v_current_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review expense submission';
  end if;

  if v_status <> 'submitted' then
    raise exception 'expense submission is not awaiting review';
  end if;

  if exists (
    select 1 from public.expense_duplicate_candidates
    where (revision_id_1 = v_current_revision_id or revision_id_2 = v_current_revision_id)
      and status = 'pending'
  ) then
    raise exception 'DUPLICATE_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1 from public.expense_duplicate_candidates
    where (revision_id_1 = v_current_revision_id or revision_id_2 = v_current_revision_id)
      and status = 'confirmed_duplicate'
  ) then
    raise exception 'DUPLICATE_CONFIRMED';
  end if;

  select * into v_revision
  from public.expense_submission_revisions
  where id = v_current_revision_id;

  if v_revision.entry_scope = 'shared_overhead' then
    v_entry := public.record_shared_overhead_expense(
      v_revision.pool_id, v_revision.category_id, v_revision.amount, v_revision.description,
      v_revision.vendor_id, v_revision.reference_number, v_revision.facility_location_id
    );
  else
    v_entry := public.record_project_expense(
      v_revision.pool_id, v_revision.project_id, v_revision.category_id,
      v_revision.amount, v_revision.description, v_revision.vendor_id, v_revision.reference_number,
      v_revision.facility_location_id
    );
  end if;

  update public.expense_submissions
  set status = 'approved', ledger_entry_id = v_entry.id, decided_by = auth.uid(), decided_at = now()
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, 'submitted', 'approved', auth.uid(), null
  );

  return v_result;
end;
$$;

-- grants unchanged (owner-only, since Gate 1F) — CREATE OR REPLACE keeps them.

-- =============================================================================
-- 8. Duplicate detection — null-safe project_id comparison. Before this fix,
--    `v_project_id = v_other.project_id` evaluates to NULL (never true) when
--    BOTH sides are null (i.e. comparing two shared_overhead revisions),
--    silently defeating exact_financial_match/reference_match for overhead —
--    the same null-safety `vendor_id` already had via `is not distinct from`
--    two lines below it. Same 1-arg signature, so CREATE OR REPLACE in
--    place; every other line is byte-for-byte unchanged from Gate 1F.
-- =============================================================================

create or replace function private.detect_expense_duplicate_candidates(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_submission_id uuid;
  v_project_id uuid;
  v_category_id uuid;
  v_vendor_id uuid;
  v_amount numeric;
  v_description text;
  v_reference_number text;
  v_business_date date;
  v_normalized_description text;
  v_other record;
  v_other_normalized_description text;
  v_rev1 uuid;
  v_rev2 uuid;
  v_sub1 uuid;
  v_sub2 uuid;
begin
  select r.tenant_id, r.submission_id, r.project_id, r.category_id, r.vendor_id, r.amount, r.description,
         r.reference_number, p.business_date
    into v_tenant_id, v_submission_id, v_project_id, v_category_id, v_vendor_id, v_amount, v_description,
         v_reference_number, v_business_date
  from public.expense_submission_revisions r
  join public.cash_pools p on p.id = r.pool_id
  where r.id = p_revision_id;

  if v_tenant_id is null then
    return;
  end if;

  v_normalized_description := private.normalize_expense_description(v_description);

  for v_other in
    select s2.id as submission_id, r2.id as revision_id, r2.project_id, r2.category_id, r2.vendor_id,
           r2.amount, r2.description, r2.reference_number, p2.business_date
    from public.expense_submissions s2
    join public.expense_submission_revisions r2 on r2.id = s2.current_revision_id
    join public.cash_pools p2 on p2.id = r2.pool_id
    where s2.tenant_id = v_tenant_id
      and s2.id <> v_submission_id
      and s2.status in ('submitted', 'approved')
  loop
    v_other_normalized_description := private.normalize_expense_description(v_other.description);

    if p_revision_id < v_other.revision_id then
      v_rev1 := p_revision_id;
      v_rev2 := v_other.revision_id;
      v_sub1 := v_submission_id;
      v_sub2 := v_other.submission_id;
    else
      v_rev1 := v_other.revision_id;
      v_rev2 := p_revision_id;
      v_sub1 := v_other.submission_id;
      v_sub2 := v_submission_id;
    end if;

    -- reference_match / cross_project_reference_match: reference number
    -- (case/whitespace-insensitive) non-empty and equal on both sides.
    if v_reference_number is not null and btrim(v_reference_number) <> ''
       and v_other.reference_number is not null and btrim(v_other.reference_number) <> ''
       and lower(btrim(v_reference_number)) = lower(btrim(v_other.reference_number))
    then
      insert into public.expense_duplicate_candidates (
        tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence
      ) values (
        v_tenant_id, v_rev1, v_rev2, v_sub1, v_sub2,
        case
          when v_project_id is not distinct from v_other.project_id then 'reference_match'::public.expense_duplicate_reason_code
          else 'cross_project_reference_match'::public.expense_duplicate_reason_code
        end,
        jsonb_build_object(
          'reference_number', v_reference_number,
          'project_id_1', v_project_id, 'project_id_2', v_other.project_id
        )
      )
      on conflict (revision_id_1, revision_id_2, reason_code) do nothing;
    end if;

    -- exact_financial_match: business date, amount, project, category,
    -- vendor (both null counts as equal), and normalized description all
    -- equal.
    if v_business_date = v_other.business_date
       and v_amount = v_other.amount
       and v_project_id is not distinct from v_other.project_id
       and v_category_id = v_other.category_id
       and v_vendor_id is not distinct from v_other.vendor_id
       and v_normalized_description = v_other_normalized_description
    then
      insert into public.expense_duplicate_candidates (
        tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence
      ) values (
        v_tenant_id, v_rev1, v_rev2, v_sub1, v_sub2, 'exact_financial_match',
        jsonb_build_object(
          'business_date', v_business_date, 'amount', v_amount, 'project_id', v_project_id,
          'category_id', v_category_id, 'vendor_id', v_vendor_id, 'normalized_description', v_normalized_description
        )
      )
      on conflict (revision_id_1, revision_id_2, reason_code) do nothing;
    end if;

    -- same_day_amount_vendor_match: business date, amount, and a non-null
    -- shared vendor — weak signal, candidate only, regardless of project.
    if v_business_date = v_other.business_date
       and v_amount = v_other.amount
       and v_vendor_id is not null
       and v_other.vendor_id is not null
       and v_vendor_id = v_other.vendor_id
    then
      insert into public.expense_duplicate_candidates (
        tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence
      ) values (
        v_tenant_id, v_rev1, v_rev2, v_sub1, v_sub2, 'same_day_amount_vendor_match',
        jsonb_build_object('business_date', v_business_date, 'amount', v_amount, 'vendor_id', v_vendor_id)
      )
      on conflict (revision_id_1, revision_id_2, reason_code) do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function private.detect_expense_duplicate_candidates(uuid) from public;
