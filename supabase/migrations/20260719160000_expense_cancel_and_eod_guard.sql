-- ADOP Phase 1 Gate 1G.1 — Unresolved Expense Daily-Close Guard
--
-- Closes a gap left open by Gate 1G: a cash pool could be submitted for EOD
-- reconciliation (and approved/closed) while one or more of its expense
-- submissions were still draft/submitted/needs_correction — i.e. had no
-- final decision yet. This migration adds:
--   1. A new terminal expense_submission_status value, 'cancelled', plus the
--      owner/admin-only public.cancel_expense_submission RPC (only from
--      draft/needs_correction, reason required, append-only status event —
--      same shape as reject_expense_submission from Gate 1E).
--   2. A tenant-safe unresolved-expense count
--      (private.count_unresolved_expense_submissions_for_pool, wrapped for
--      client use by public.get_unresolved_expense_count).
--   3. A daily-close guard: public.submit_cash_reconciliation and
--      public.approve_cash_reconciliation now reject with the stable error
--      'UNRESOLVED_EXPENSES' whenever the target pool has any
--      draft/submitted/needs_correction expense submission — approve
--      re-checks defensively, since a draft can still be created for a
--      pending_close pool (create_expense_draft is not pool-status gated,
--      matching Gate 1G's existing "only actual ledger posting is blocked"
--      posture).
--   4. A concurrency fix: public.submit_expense now locks the same
--      cash_pools row (`for update`) submit_cash_reconciliation/
--      approve_cash_reconciliation lock, and rejects if the pool is not
--      'open' — this is what actually prevents the race Task LOCK §4
--      describes (an expense concurrently becoming 'submitted' while an EOD
--      submission concurrently closes the same pool): whichever transaction
--      acquires the pool row lock first commits, and the other blocks, then
--      re-evaluates against the now-committed state instead of racing.
--
-- Does not edit any prior migration file — reuses private.
-- current_user_is_active_tenant_member, private.current_user_has_tenant_role,
-- and private.block_audit_mutation from earlier gates.
-- private.enforce_expense_submission_status_transition (Gate 1E),
-- public.submit_expense (Gate 1E, replaced again by Gate 1F),
-- public.submit_cash_reconciliation, and public.approve_cash_reconciliation
-- (both Gate 1G) are intentionally replaced here via
-- `create or replace function` — the same technique every prior gate in this
-- schema has used to extend an earlier gate's function without touching its
-- migration file on disk. All four replacements keep their original
-- signature.

-- =============================================================================
-- 1. New terminal status: 'cancelled'
-- =============================================================================
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that added
-- it (PostgreSQL restriction, unchanged since PG12). Supabase applies each
-- top-level statement in a migration file as its own implicit transaction
-- (no explicit BEGIN in this file), so this is expected to already be safe
-- by the time later statements run — the explicit commit below is a
-- defensive no-op in that case (a bare COMMIT with nothing open only emits a
-- harmless "no transaction in progress" warning) and a real safety net if it
-- is not.
alter type public.expense_submission_status add value 'cancelled';
commit;

-- =============================================================================
-- 2. Status transition guard: allow {draft, needs_correction} -> cancelled
-- =============================================================================
-- Identical to the Gate 1E original except the two added transition arms;
-- `create or replace function` — the Gate 1E migration file itself is not
-- edited. 'cancelled' remains terminal: no arm below ever transitions out of
-- it, so the existing "new.status = old.status" / else-raise structure
-- rejects any further transition attempt on a cancelled submission exactly
-- like it already does for 'approved' and 'rejected'.
create or replace function private.enforce_expense_submission_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'expense submission status unchanged: already %', old.status;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status = 'approved')
    or (old.status = 'submitted' and new.status = 'rejected')
    or (old.status = 'submitted' and new.status = 'needs_correction')
    or (old.status = 'needs_correction' and new.status = 'submitted')
    or (old.status = 'draft' and new.status = 'cancelled')
    or (old.status = 'needs_correction' and new.status = 'cancelled')
  ) then
    raise exception 'invalid expense submission status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 3. cancel_expense_submission RPC
-- =============================================================================
-- Owner/admin of the same tenant, only from draft/needs_correction, reason
-- required (also enforced at the table level by the new check constraint in
-- §4). tenant/actor/timestamp are server-derived exactly like every other
-- RPC in this schema — never accepted as arguments. `for update` locks the
-- header so a concurrent second cancel/decision attempt blocks until the
-- first commits, then sees a non-cancellable status and raises — the status
-- transition trigger in §2 is the backstop guarantee even under weaker
-- isolation. Cancelled submissions never reach approve_expense_submission
-- (submitted is the only status that RPC accepts), so a cancelled submission
-- can never post a ledger entry or affect the cash summary.
create function public.cancel_expense_submission(
  p_submission_id uuid,
  p_reason text
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

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to cancel expense submission';
  end if;

  if v_status not in ('draft', 'needs_correction') then
    raise exception 'expense submission cannot be cancelled from its current status';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'cancellation reason is required';
  end if;

  update public.expense_submissions
  set status = 'cancelled'
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, v_status, 'cancelled', auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.cancel_expense_submission(uuid, text) from public;
grant execute on function public.cancel_expense_submission(uuid, text) to authenticated;

-- Reason is required for a cancellation event — additive constraint (the
-- Gate 1E reason-required check already covers rejected/needs_correction;
-- that constraint is not edited here, this is a second, independent check).
alter table public.expense_submission_status_events
  add constraint expense_submission_status_events_cancel_reason_required check (
    to_status <> 'cancelled' or (reason is not null and btrim(reason) <> '')
  );

-- =============================================================================
-- 4. Unresolved-expense count — tenant-safe read helper
-- =============================================================================

-- Counts, for a given pool, every expense submission whose CURRENT revision
-- targets that pool and whose status is still draft/submitted/
-- needs_correction (Task LOCK §1's unresolved definition) — approved/
-- rejected/cancelled are excluded, matching the spec exactly. SECURITY
-- DEFINER, no grant to `authenticated`/`public` — only called from the two
-- RPCs in §5/§6 (both already SECURITY DEFINER) and from
-- public.get_unresolved_expense_count below.
create function private.count_unresolved_expense_submissions_for_pool(p_pool_id uuid)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.expense_submissions s
  join public.expense_submission_revisions r on r.id = s.current_revision_id
  where r.pool_id = p_pool_id
    and s.status in ('draft', 'submitted', 'needs_correction')
$$;

revoke execute on function private.count_unresolved_expense_submissions_for_pool(uuid) from public;

-- Tenant-safe wrapper any active tenant member can call — same visibility as
-- expense_submissions_select_member from Gate 1E — so the UI can later
-- explain why EOD close is blocked without exposing other tenants' data.
create function public.get_unresolved_expense_count(p_pool_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.cash_pools where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_is_active_tenant_member(v_tenant_id) then
    raise exception 'not authorized to view cash pool';
  end if;

  return private.count_unresolved_expense_submissions_for_pool(p_pool_id);
end;
$$;

revoke execute on function public.get_unresolved_expense_count(uuid) from public;
grant execute on function public.get_unresolved_expense_count(uuid) to authenticated;

-- =============================================================================
-- 5. submit_expense — pool-open guard, locked via the same cash_pools row
--    submit_cash_reconciliation/approve_cash_reconciliation lock (Task LOCK
--    §4 concurrency serialization)
-- =============================================================================
-- Identical body to the Gate 1F original except the added pool lookup, lock,
-- and open-status guard inserted right before the status update;
-- `create or replace function` — the Gate 1F migration file itself is not
-- edited. Locking cash_pools here even though this function never writes to
-- it is exactly what makes the serialization work: whichever of
-- submit_expense / submit_cash_reconciliation / approve_cash_reconciliation
-- acquires this row's lock first runs to completion (commit), and the other
-- blocks until then, re-reading fresh state afterward instead of racing —
-- so it is never possible for an expense to newly become 'submitted' for a
-- pool that has just become pending_close/closed, or for an EOD submission
-- to succeed against an unresolved-count snapshot that a concurrent
-- expense-submit has since invalidated.
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
  v_pool_id uuid;
  v_pool public.cash_pools;
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

  select pool_id into v_pool_id from public.expense_submission_revisions where id = v_current_revision_id;

  select * into v_pool from public.cash_pools where id = v_pool_id for update;

  if v_pool.daily_close_status <> 'open' then
    raise exception 'cash pool is not open for expense submission';
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

-- =============================================================================
-- 6. submit_cash_reconciliation / approve_cash_reconciliation — unresolved-
--    expense guard
-- =============================================================================

-- Identical body to the Gate 1G original except the added unresolved-expense
-- check, inserted after the pool lock and open-status check and before the
-- variance/explanation check; `create or replace function` — the Gate 1G
-- migration file itself is not edited. The pool row is already locked
-- (`for update`) above this point, so the unresolved count read here is
-- consistent with §5's lock — a concurrent submit_expense either already
-- committed (and is counted) or is blocked until this transaction ends.
create or replace function public.submit_cash_reconciliation(
  p_reconciliation_id uuid
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_current_revision_id uuid;
  v_needs_correction_revision_id uuid;
  v_pool public.cash_pools;
  v_summary public.cash_pool_daily_summary;
  v_revision public.cash_reconciliation_revisions;
  v_variance numeric(16, 2);
  v_unresolved_count integer;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, current_revision_id, needs_correction_revision_id
    into v_tenant_id, v_pool_id, v_status, v_current_revision_id, v_needs_correction_revision_id
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to submit cash reconciliation';
  end if;

  if v_status = 'needs_correction' then
    if v_current_revision_id is not distinct from v_needs_correction_revision_id then
      raise exception 'cash reconciliation requires a new revision before resubmission';
    end if;
  elsif v_status <> 'draft' then
    raise exception 'cash reconciliation cannot be submitted from its current status';
  end if;

  select * into v_pool from public.cash_pools where id = v_pool_id for update;

  if v_pool.daily_close_status <> 'open' then
    raise exception 'cash pool is not open for reconciliation submission';
  end if;

  v_unresolved_count := private.count_unresolved_expense_submissions_for_pool(v_pool_id);
  if v_unresolved_count > 0 then
    raise exception 'UNRESOLVED_EXPENSES';
  end if;

  select * into v_summary from public.cash_pool_daily_summary where pool_id = v_pool_id;
  select * into v_revision from public.cash_reconciliation_revisions where id = v_current_revision_id;

  v_variance := v_revision.actual_counted_cash - coalesce(v_summary.closing_cash, 0);

  if v_variance <> 0 and (v_revision.explanation is null or btrim(v_revision.explanation) = '') then
    raise exception 'explanation is required when variance is non-zero';
  end if;

  update public.cash_reconciliations
  set
    status = 'submitted',
    submitted_by = auth.uid(),
    submitted_opening_cash = v_summary.opening_cash,
    submitted_cash_top_up = v_summary.cash_top_up,
    submitted_other_cash_in = v_summary.other_cash_in,
    submitted_total_cash_out = v_summary.total_cash_out,
    submitted_expected_closing_cash = v_summary.closing_cash,
    submitted_variance = v_variance,
    submitted_financial_version = v_pool.financial_version,
    submitted_at = now()
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_current_revision_id, v_status, 'submitted', auth.uid(), null
  );

  update public.cash_pools set daily_close_status = 'pending_close' where id = v_pool_id;

  return v_result;
end;
$$;

revoke execute on function public.submit_cash_reconciliation(uuid) from public;
grant execute on function public.submit_cash_reconciliation(uuid) to authenticated;

-- Identical body to the Gate 1G original except the added defensive
-- unresolved-expense recheck, inserted after the financial_version staleness
-- check and before the pool is closed; `create or replace function` — the
-- Gate 1G migration file itself is not edited. This recheck exists because
-- create_expense_draft is not pool-status gated (Gate 1G's own design: only
-- actual ledger posting is blocked while pending_close), so a brand-new
-- draft can still appear against a pending_close pool between submit and
-- approve — submit's own check cannot see into the future, so approve must
-- verify again, atomically, before flipping the pool to closed.
create or replace function public.approve_cash_reconciliation(
  p_reconciliation_id uuid
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_submitted_financial_version bigint;
  v_pool public.cash_pools;
  v_unresolved_count integer;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, submitted_financial_version
    into v_tenant_id, v_pool_id, v_status, v_submitted_financial_version
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review cash reconciliation';
  end if;

  if v_status <> 'submitted' then
    raise exception 'cash reconciliation is not awaiting review';
  end if;

  select * into v_pool from public.cash_pools where id = v_pool_id for update;

  if v_pool.daily_close_status <> 'pending_close' then
    raise exception 'cash pool is not pending close';
  end if;

  if v_pool.financial_version <> v_submitted_financial_version then
    raise exception 'RECONCILIATION_STALE';
  end if;

  v_unresolved_count := private.count_unresolved_expense_submissions_for_pool(v_pool_id);
  if v_unresolved_count > 0 then
    raise exception 'UNRESOLVED_EXPENSES';
  end if;

  update public.cash_pools set daily_close_status = 'closed' where id = v_pool_id;

  update public.cash_reconciliations
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_result.current_revision_id, 'submitted', 'approved', auth.uid(), null
  );

  return v_result;
end;
$$;

revoke execute on function public.approve_cash_reconciliation(uuid) from public;
grant execute on function public.approve_cash_reconciliation(uuid) to authenticated;
