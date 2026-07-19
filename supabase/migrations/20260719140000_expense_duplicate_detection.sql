-- ADOP Phase 1 Gate 1F — Deterministic Duplicate Expense Detection
--
-- Adds server-side, deterministic duplicate-candidate detection that runs
-- every time an expense submission (re)enters 'submitted' status — both the
-- first submit from 'draft' and a resubmission from 'needs_correction'.
-- Candidates are informational only: they never block a submission from
-- being submitted, are never deleted, and a human (owner) must always
-- resolve them. approve_expense_submission is tightened so a submission
-- with an unresolved ('pending') or 'confirmed_duplicate' candidate cannot
-- be approved until the owner resolves it.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719090000_master_data_audit_
-- atomicity.sql, 20260719100000_vessel_project_lifecycle.sql,
-- 20260719110000_shared_daily_cash_pool.sql, 20260719120000_project_cost_
-- ledger.sql, or 20260719130000_expense_submission_approval.sql — reuses
-- private.current_user_has_tenant_role, private.block_audit_mutation, and
-- the append-only/status-transition trigger shapes Gate 1E established.
-- public.submit_expense and public.approve_expense_submission are
-- intentionally replaced here via `create or replace function` (the same
-- technique Gate 1E used on reverse_project_expense and Gate 1D used on
-- cash_pool_daily_summary) to hook in detection and the approval gate
-- without editing the Gate 1E migration file.

-- =============================================================================
-- 1. Composite tenant-safe FK target on expense_submission_revisions
-- =============================================================================
-- expense_submission_revisions did not previously need a composite
-- (id, tenant_id) target — no other table referenced it. The candidate
-- table below references two revisions per row and must do so tenant-safely,
-- matching the same pattern Gate 1D added for vendors and Gate 1E already
-- has on expense_submissions.

alter table public.expense_submission_revisions
  add constraint expense_submission_revisions_id_tenant_id_key unique (id, tenant_id);

-- =============================================================================
-- 2. Enums
-- =============================================================================

create type public.expense_duplicate_reason_code as enum (
  'reference_match',
  'exact_financial_match',
  'cross_project_reference_match',
  'same_day_amount_vendor_match'
);

create type public.expense_duplicate_candidate_status as enum (
  'pending', 'not_duplicate', 'confirmed_duplicate'
);

-- =============================================================================
-- 3. Tables
-- =============================================================================

-- --- expense_duplicate_candidates --------------------------------------------
-- One row per (revision pair, reason code). revision_id_1/revision_id_2 are
-- always stored in a canonical (text) order — never client-chosen — so a
-- pair detected as "new revision vs existing revision" can never be stored
-- twice as both A-B and B-A: the pair-order check constraint plus the unique
-- index in §3a make this a database-level guarantee, not just an
-- application convention. Rows are never deleted (no DELETE grant exists for
-- `authenticated`/`service_role` beyond nothing at all — see §7) and
-- status only moves pending -> {not_duplicate, confirmed_duplicate}, once,
-- enforced by the trigger in §4b.
create table public.expense_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  revision_id_1 uuid not null,
  revision_id_2 uuid not null,
  submission_id_1 uuid not null,
  submission_id_2 uuid not null,
  reason_code public.expense_duplicate_reason_code not null,
  match_evidence jsonb not null,
  status public.expense_duplicate_candidate_status not null default 'pending',
  detected_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolved_reason text,
  -- Composite target for expense_duplicate_candidate_resolution_events' own
  -- tenant-safe composite FK below.
  unique (id, tenant_id),
  constraint expense_duplicate_candidates_pair_order check (revision_id_1 < revision_id_2),
  constraint expense_duplicate_candidates_distinct_submissions check (submission_id_1 <> submission_id_2),
  foreign key (revision_id_1, tenant_id) references public.expense_submission_revisions (id, tenant_id) on delete cascade,
  foreign key (revision_id_2, tenant_id) references public.expense_submission_revisions (id, tenant_id) on delete cascade,
  foreign key (submission_id_1, tenant_id) references public.expense_submissions (id, tenant_id) on delete cascade,
  foreign key (submission_id_2, tenant_id) references public.expense_submissions (id, tenant_id) on delete cascade
);

-- --- 3a. Canonical pair uniqueness -------------------------------------------
-- A given revision pair can only produce one candidate row per reason code —
-- the database-level "A-B is never duplicated, not even as A-B again"
-- guarantee (ON CONFLICT DO NOTHING in the detection function in §5 relies
-- on this exact index).
create unique index expense_duplicate_candidates_pair_reason_unique
  on public.expense_duplicate_candidates (revision_id_1, revision_id_2, reason_code);

create index expense_duplicate_candidates_tenant_id_idx on public.expense_duplicate_candidates (tenant_id);
create index expense_duplicate_candidates_status_idx on public.expense_duplicate_candidates (tenant_id, status);
create index expense_duplicate_candidates_revision_id_1_idx on public.expense_duplicate_candidates (revision_id_1);
create index expense_duplicate_candidates_revision_id_2_idx on public.expense_duplicate_candidates (revision_id_2);

-- --- expense_duplicate_candidate_resolution_events ---------------------------
-- Append-only trail of every status transition on a candidate, including the
-- initial null -> pending detection event (logged automatically, see §4c) —
-- same shape as expense_submission_status_events from Gate 1E. This is what
-- makes "resolution kedua pada candidate yang sama ditolak" auditable: the
-- history always shows exactly one pending -> {not_duplicate,
-- confirmed_duplicate} transition per candidate, never more.
create table public.expense_duplicate_candidate_resolution_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null,
  from_status public.expense_duplicate_candidate_status,
  to_status public.expense_duplicate_candidate_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, tenant_id) references public.expense_duplicate_candidates (id, tenant_id) on delete cascade,
  -- Role-independent, database-level guarantee that a resolution decision
  -- always carries a reason (the automatic null -> pending creation event is
  -- exempt, matching expense_submission_status_events' shape).
  constraint expense_duplicate_candidate_resolution_events_reason_required check (
    to_status = 'pending' or (reason is not null and btrim(reason) <> '')
  )
);

create index expense_duplicate_candidate_resolution_events_tenant_id_idx on public.expense_duplicate_candidate_resolution_events (tenant_id);
create index expense_duplicate_candidate_resolution_events_candidate_id_idx on public.expense_duplicate_candidate_resolution_events (tenant_id, candidate_id);

-- =============================================================================
-- 4. Triggers
-- =============================================================================

-- --- 4a. Append-only guarantee, reused from Gate 1A, role-independent -------
create trigger expense_duplicate_candidate_resolution_events_append_only
  before update or delete on public.expense_duplicate_candidate_resolution_events
  for each row execute function private.block_audit_mutation();

-- --- 4b. Role-independent resolution transition guard ------------------------
-- BEFORE UPDATE OF status, fires regardless of caller — the real database
-- constraint that a candidate can only move pending -> {not_duplicate,
-- confirmed_duplicate}, exactly once. Mirrors
-- private.enforce_expense_submission_status_transition from Gate 1E.
create function private.enforce_expense_duplicate_candidate_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'expense duplicate candidate status unchanged: already %', old.status;
  end if;

  if not (
    old.status = 'pending' and new.status in ('not_duplicate', 'confirmed_duplicate')
  ) then
    raise exception 'invalid expense duplicate candidate status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_expense_duplicate_candidate_status_transition() from public;

create trigger expense_duplicate_candidates_enforce_status_transition
  before update of status on public.expense_duplicate_candidates
  for each row execute function private.enforce_expense_duplicate_candidate_status_transition();

-- --- 4c. Automatic creation event ---------------------------------------------
-- Mirrors private.log_expense_submission_creation from Gate 1E: every
-- candidate insert logs its own null -> pending event in the same
-- statement, so a candidate can never exist without a matching history row.
create function private.log_expense_duplicate_candidate_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.expense_duplicate_candidate_resolution_events (
    tenant_id, candidate_id, from_status, to_status, actor_user_id, reason
  ) values (
    new.tenant_id, new.id, null, new.status, auth.uid(), null
  );
  return new;
end;
$$;

revoke execute on function private.log_expense_duplicate_candidate_creation() from public;

create trigger expense_duplicate_candidate_creation_log
  after insert on public.expense_duplicate_candidates
  for each row execute function private.log_expense_duplicate_candidate_creation();

-- =============================================================================
-- 5. Detection — deterministic, server-side only, no client-supplied
--    fingerprint/score/status is ever accepted (see §6, no INSERT grant
--    exists for `authenticated` on expense_duplicate_candidates at all)
-- =============================================================================

-- Canonical description normalization used by exact_financial_match:
-- trims, collapses internal whitespace, and lowercases so "Beli  Spare Part"
-- and "beli spare part" compare equal. IMMUTABLE — pure function of its
-- input, safe to call from the detection query below.
create function private.normalize_expense_description(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(p_text), '\s+', ' ', 'g'));
$$;

revoke execute on function private.normalize_expense_description(text) from public;

-- Compares the given (just-submitted) revision against the CURRENT revision
-- of every OTHER submission in the same tenant that is currently 'submitted'
-- or 'approved' — never a draft, never a stale (non-current) revision of
-- another submission, and never a different tenant's data (the query is
-- scoped by the revision's own real tenant_id, never a caller-supplied
-- value). Only ever called from submit_expense (§6b), itself SECURITY
-- DEFINER, so this function runs with the same elevated privileges and
-- needs none of its own beyond SECURITY DEFINER + a locked-down search_path.
create function private.detect_expense_duplicate_candidates(p_revision_id uuid)
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
          when v_project_id = v_other.project_id then 'reference_match'::public.expense_duplicate_reason_code
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
       and v_project_id = v_other.project_id
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

-- =============================================================================
-- 6. RPCs
-- =============================================================================

-- --- 6a. resolve_expense_duplicate_candidate ---------------------------------
-- Owner-only. Reason required (also enforced at the table level by
-- expense_duplicate_candidate_resolution_events_reason_required in §3).
-- tenant/actor/timestamp are always server-derived; `for update` locks the
-- candidate row so a concurrent second resolution attempt blocks until the
-- first commits, then sees status already resolved and raises — the status
-- transition trigger in §4b is the backstop guarantee even under weaker
-- isolation.
create function public.resolve_expense_duplicate_candidate(
  p_candidate_id uuid,
  p_resolution public.expense_duplicate_candidate_status,
  p_reason text
)
returns public.expense_duplicate_candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_duplicate_candidate_status;
  v_result public.expense_duplicate_candidates;
begin
  select tenant_id, status into v_tenant_id, v_status
  from public.expense_duplicate_candidates
  where id = p_candidate_id
  for update;

  if v_tenant_id is null then
    raise exception 'expense duplicate candidate not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to resolve expense duplicate candidate';
  end if;

  if p_resolution not in ('not_duplicate', 'confirmed_duplicate') then
    raise exception 'invalid expense duplicate candidate resolution';
  end if;

  if v_status <> 'pending' then
    raise exception 'expense duplicate candidate already resolved';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'expense duplicate candidate resolution reason is required';
  end if;

  update public.expense_duplicate_candidates
  set status = p_resolution, resolved_by = auth.uid(), resolved_at = now(), resolved_reason = p_reason
  where id = p_candidate_id
  returning * into v_result;

  insert into public.expense_duplicate_candidate_resolution_events (
    tenant_id, candidate_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_candidate_id, 'pending', p_resolution, auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.resolve_expense_duplicate_candidate(uuid, public.expense_duplicate_candidate_status, text) from public;
grant execute on function public.resolve_expense_duplicate_candidate(uuid, public.expense_duplicate_candidate_status, text) to authenticated;

-- --- 6b. submit_expense — replaced to run detection after a successful
--     transition to 'submitted'. Identical body to the Gate 1E original
--     except the added call at the end; `create or replace function` — the
--     Gate 1E migration file itself is not edited.
create or replace function public.submit_expense(
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
  v_needs_correction_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id, needs_correction_revision_id
    into v_tenant_id, v_status, v_current_revision_id, v_needs_correction_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to submit expense submission';
  end if;

  if v_status = 'needs_correction' then
    if v_current_revision_id is not distinct from v_needs_correction_revision_id then
      raise exception 'expense submission requires a new revision before resubmission';
    end if;
  elsif v_status <> 'draft' then
    raise exception 'expense submission cannot be submitted from its current status';
  end if;

  update public.expense_submissions
  set status = 'submitted'
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, v_status, 'submitted', auth.uid(), null
  );

  perform private.detect_expense_duplicate_candidates(v_current_revision_id);

  return v_result;
end;
$$;

revoke execute on function public.submit_expense(uuid) from public;
grant execute on function public.submit_expense(uuid) to authenticated;

-- --- 6c. approve_expense_submission — replaced to reject approval when the
--     current revision has an unresolved or confirmed duplicate candidate.
--     Identical body to the Gate 1E original except the two guard blocks
--     inserted before the record_project_expense call; `create or replace
--     function` — the Gate 1E migration file itself is not edited.
--     DUPLICATE_REVIEW_REQUIRED / DUPLICATE_CONFIRMED are fixed, internally-
--     controlled message strings (never derived from user input), matched
--     verbatim by the application error mapper — the same "P0001 + stable
--     substring" posture every other RPC exception in this schema uses.
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

  v_entry := public.record_project_expense(
    v_revision.pool_id, v_revision.project_id, v_revision.category_id,
    v_revision.amount, v_revision.description, v_revision.vendor_id, v_revision.reference_number
  );

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

revoke execute on function public.approve_expense_submission(uuid) from public;
grant execute on function public.approve_expense_submission(uuid) to authenticated;

-- =============================================================================
-- 7. Read model — pending/resolved candidates joined to both sides' current
--    financial data, server-computed
-- =============================================================================
-- security_invoker = true: no elevated privilege of its own — evaluates
-- under the querying role's own grants and RLS, so cross-tenant rows are
-- excluded by the underlying tables' own SELECT policies exactly as a
-- direct table query would be.
create view public.expense_duplicate_candidate_current
with (security_invoker = true) as
select
  c.id as candidate_id,
  c.tenant_id,
  c.reason_code,
  c.status,
  c.match_evidence,
  c.detected_at,
  c.resolved_by,
  c.resolved_at,
  c.resolved_reason,
  c.submission_id_1,
  s1.status as submission_status_1,
  r1.revision_number as revision_number_1,
  r1.project_id as project_id_1,
  r1.category_id as category_id_1,
  r1.vendor_id as vendor_id_1,
  r1.amount as amount_1,
  r1.description as description_1,
  r1.reference_number as reference_number_1,
  c.submission_id_2,
  s2.status as submission_status_2,
  r2.revision_number as revision_number_2,
  r2.project_id as project_id_2,
  r2.category_id as category_id_2,
  r2.vendor_id as vendor_id_2,
  r2.amount as amount_2,
  r2.description as description_2,
  r2.reference_number as reference_number_2
from public.expense_duplicate_candidates c
join public.expense_submissions s1 on s1.id = c.submission_id_1
join public.expense_submission_revisions r1 on r1.id = c.revision_id_1
join public.expense_submissions s2 on s2.id = c.submission_id_2
join public.expense_submission_revisions r2 on r2.id = c.revision_id_2;

grant select on public.expense_duplicate_candidate_current to authenticated;
grant select on public.expense_duplicate_candidate_current to service_role;

-- =============================================================================
-- 8. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so both tables start with zero privileges
-- for anon/authenticated/service_role; the REVOKE below is defensive
-- belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE grant exists
-- for `authenticated` on either table — private.detect_expense_duplicate_
-- candidates (§5) and public.resolve_expense_duplicate_candidate (§6a),
-- both SECURITY DEFINER running as the table owner, are the only mutation
-- path. Visibility mirrors expense_submission_status_events from Gate 1E:
-- owner/admin/reviewer can read, plain viewer cannot; admin can read but the
-- RPC's own role check (owner-only) prevents admin from resolving.

alter table public.expense_duplicate_candidates enable row level security;
alter table public.expense_duplicate_candidate_resolution_events enable row level security;

revoke all on public.expense_duplicate_candidates from public;
revoke all on public.expense_duplicate_candidate_resolution_events from public;

create policy expense_duplicate_candidates_select_owner_admin_reviewer
  on public.expense_duplicate_candidates for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.expense_duplicate_candidates to authenticated;
grant all on public.expense_duplicate_candidates to service_role;

create policy expense_duplicate_candidate_resolution_events_select_owner_admin_reviewer
  on public.expense_duplicate_candidate_resolution_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.expense_duplicate_candidate_resolution_events to authenticated;
grant select, insert on public.expense_duplicate_candidate_resolution_events to service_role;
