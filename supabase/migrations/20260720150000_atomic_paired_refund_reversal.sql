-- ADOP Phase 1 Gate 1K.1 — Atomic Paired Refund Reversal (corrective gate)
--
-- Gate 1K's read model correctly PRESENTS a paired project refund (a
-- cash_pool_entries row with entry_type='project_refund' + a
-- project_cost_ledger_entries row with entry_kind='refund', always inserted
-- together by approve_and_commit_cash_import_batch under one shared
-- import_row_id) as a single logical transaction — but nothing in the
-- schema before this gate PREVENTED reversing only one of the two physical
-- rows: reverse_cash_pool_entry (owner+admin) could reverse the cash-in leg
-- alone, and while reverse_project_expense's own `entry_kind <> 'expense'`
-- guard already happened to reject reversing the cost-reduction leg
-- (entry_kind='refund') outright, that rejection was an accident of a
-- stale check, not a structural guarantee, and gave no path to a correct
-- paired reversal at all. Root cause: two independent single-entry RPCs,
-- each unaware the other side of a business event exists.
--
-- This migration closes that gap with two layers, both required:
--   1. Two DEFERRABLE INITIALLY DEFERRED constraint triggers (one per
--      table) — the actual database-enforced invariant, checked at
--      transaction commit, not per statement. This is what makes "insert
--      both reversals in the same transaction, or none persist" possible:
--      an ordinary (immediate) trigger would reject the FIRST insert of an
--      atomic pair before the second one is even attempted. Deferred
--      triggers are new to this schema (no prior gate needed a check that
--      spans two INSERTs from two separate statements within one RPC) but
--      are standard Postgres (supported since 9.1; this schema targets 17
--      per supabase/config.toml) — not a deviation in capability, only in
--      which existing mechanism this specific invariant requires.
--   2. Early, explicit guards added to reverse_cash_pool_entry and
--      reverse_project_expense (CREATE OR REPLACE, identical signatures
--      and grants) so a caller gets a clear, stable
--      PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL error immediately, rather
--      than relying solely on the deferred trigger's late failure.
--
-- A new SECURITY DEFINER RPC, reverse_paired_project_refund, is the only
-- sanctioned way to reverse a paired refund: it locks both original rows
-- (cash row first, then cost row — the exact order rollback_cash_import_
-- batch already uses, so the two can never deadlock against each other),
-- validates the pair is a genuine counterpart (same tenant, same
-- import_row_id, correct entry_type/entry_kind, neither already a
-- reversal), inserts both reversals in one transaction, and is idempotent
-- (retry after full success returns the existing pair; retry after a
-- genuine partial state raises PAIRED_REFUND_PARTIALLY_REVERSED and never
-- auto-repairs).
--
-- rollback_cash_import_batch (20260720130000) is NOT modified — it already
-- inserts both reversal rows raw, in one transaction, in the same cash-
-- then-cost lock order this migration's new RPC uses, so the new deferred
-- triggers pass for it unchanged. No signature, grant, or behavior in any
-- prior migration file is altered on disk; every function touched here is
-- replaced via CREATE OR REPLACE with its existing signature and grants
-- preserved.
--
-- trusted_transaction_history (20260720140000) gains a third status value,
-- 'partially_reversed', computed from counting how many of a logical
-- transaction's physical legs (1 for a single-ledger transaction, 2 for a
-- paired refund) have their own reversal — 0 reversed legs stays 'active',
-- all legs reversed is 'reversed', and (only reachable for a pre-existing
-- legacy inconsistency, since this gate prevents new occurrences)
-- some-but-not-all legs reversed is 'partially_reversed'. The view's
-- column list, types, and every other column's semantics are unchanged.

-- =============================================================================
-- 1. Deferred constraint triggers — the structural, transaction-wide
--    invariant for paired project refund reversal
-- =============================================================================

-- Fires once per newly-inserted reversal row, deferred to the end of the
-- transaction that inserted it. If that row reverses the CASH leg of a
-- paired project refund, its exact cost-side counterpart (same tenant_id +
-- import_row_id, entry_kind='refund' — the only fields this schema ever
-- uses to identify a counterpart, never amount/date/description/order) is
-- looked up and must itself already have a reversal by commit time.
-- Symmetric for a reversal of the COST leg. Every other reversal (a normal
-- cash-in reversal, a normal project-expense reversal, or either leg of an
-- import-batch-rollback pair that reverses both legs together) passes
-- through unaffected: the first `if` condition is only ever true for a row
-- that reverses a project_refund/refund original.
create function private.enforce_paired_refund_reversal_atomicity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cash_original public.cash_pool_entries;
  v_cost_original public.project_cost_ledger_entries;
  v_counterpart_cost public.project_cost_ledger_entries;
  v_counterpart_cash public.cash_pool_entries;
begin
  if tg_table_name = 'cash_pool_entries' then
    select * into v_cash_original from public.cash_pool_entries where id = new.reverses_entry_id;

    if v_cash_original.id is not null and v_cash_original.entry_type = 'project_refund' and v_cash_original.import_row_id is not null then
      select * into v_counterpart_cost
      from public.project_cost_ledger_entries
      where tenant_id = v_cash_original.tenant_id
        and import_row_id = v_cash_original.import_row_id
        and entry_kind = 'refund';

      if v_counterpart_cost.id is null then
        raise exception 'PAIRED_REFUND_COUNTERPART_NOT_FOUND';
      end if;

      if not exists (
        select 1 from public.project_cost_ledger_entries where reverses_entry_id = v_counterpart_cost.id
      ) then
        raise exception 'PAIRED_REFUND_PARTIALLY_REVERSED';
      end if;
    end if;

  elsif tg_table_name = 'project_cost_ledger_entries' then
    select * into v_cost_original from public.project_cost_ledger_entries where id = new.reverses_entry_id;

    if v_cost_original.id is not null and v_cost_original.entry_kind = 'refund' and v_cost_original.import_row_id is not null then
      select * into v_counterpart_cash
      from public.cash_pool_entries
      where tenant_id = v_cost_original.tenant_id
        and import_row_id = v_cost_original.import_row_id
        and entry_type = 'project_refund';

      if v_counterpart_cash.id is null then
        raise exception 'PAIRED_REFUND_COUNTERPART_NOT_FOUND';
      end if;

      if not exists (
        select 1 from public.cash_pool_entries where reverses_entry_id = v_counterpart_cash.id
      ) then
        raise exception 'PAIRED_REFUND_PARTIALLY_REVERSED';
      end if;
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function private.enforce_paired_refund_reversal_atomicity() from public;

create constraint trigger cash_pool_entries_paired_refund_atomicity
  after insert on public.cash_pool_entries
  deferrable initially deferred
  for each row
  when (new.entry_kind = 'reversal')
  execute function private.enforce_paired_refund_reversal_atomicity();

create constraint trigger project_cost_ledger_entries_paired_refund_atomicity
  after insert on public.project_cost_ledger_entries
  deferrable initially deferred
  for each row
  when (new.entry_kind = 'reversal')
  execute function private.enforce_paired_refund_reversal_atomicity();

-- =============================================================================
-- 2. Harden reverse_cash_pool_entry — reject a paired refund's cash leg
--    early, with a stable domain error, before any insert is attempted.
--    Identical signature/grants/every other behavior to the Gate 1C
--    version; only the new check is added, placed after the role check so
--    an unauthorized caller learns nothing about the target's shape.
-- =============================================================================

create or replace function public.reverse_cash_pool_entry(
  p_entry_id uuid,
  p_reason text
)
returns public.cash_pool_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.cash_pool_entries;
  v_result public.cash_pool_entries;
begin
  select * into v_original
  from public.cash_pool_entries
  where id = p_entry_id
  for update;

  if v_original.id is null then
    raise exception 'cash pool entry not found';
  end if;

  if v_original.entry_kind <> 'entry' then
    raise exception 'only an original entry can be reversed';
  end if;

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to reverse daily cash pool entry';
  end if;

  if v_original.entry_type = 'project_refund' then
    raise exception 'PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL';
  end if;

  if exists (select 1 from public.cash_pool_entries where reverses_entry_id = p_entry_id) then
    raise exception 'cash pool entry already reversed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  insert into public.cash_pool_entries (
    tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by
  ) values (
    v_original.tenant_id, v_original.pool_id, v_original.entry_type, 'reversal', v_original.amount, p_reason, p_entry_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reverse_cash_pool_entry(uuid, text) from public;
grant execute on function public.reverse_cash_pool_entry(uuid, text) to authenticated;

-- =============================================================================
-- 3. Harden reverse_project_expense — give the refund case its own stable
--    domain error instead of the generic "only an original expense can be
--    reversed" message. Identical signature/grants/every other behavior to
--    the Gate 1E version.
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
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind,
    amount, description, reference_number, reverses_entry_id, actor_user_id
  ) values (
    v_original.tenant_id, v_original.pool_id, v_original.project_id, v_original.category_id, v_original.vendor_id,
    'reversal', v_original.amount, p_reason, null, p_entry_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reverse_project_expense(uuid, text) from public;
grant execute on function public.reverse_project_expense(uuid, text) to authenticated;

-- =============================================================================
-- 4. reverse_paired_project_refund — the one sanctioned atomic path
-- =============================================================================
-- Owner-only: the strictest of the two reversal RPCs this replaces the
-- capability of (reverse_cash_pool_entry admits owner+admin,
-- reverse_project_expense is owner-only) — task LOCK "Jangan memperluas
-- izin Owner/Admin existing" means the narrower of the two applies here,
-- not the broader one. No p_tenant_id parameter, matching every other RPC
-- in this schema that operates on an already-identifiable row
-- (rollback_cash_import_batch derives tenant_id from the locked batch row;
-- this derives it from the locked original entries) — tenant is never
-- caller-supplied. Row lock order is hardcoded cash-table-then-cost-table
-- (not value-based) to exactly match rollback_cash_import_batch's own
-- order, so a concurrent call to either function against the same pair can
-- never deadlock against the other.
create function public.reverse_paired_project_refund(
  p_cash_entry_id uuid,
  p_cost_entry_id uuid,
  p_reason text
)
returns table (
  cash_reversal_id uuid,
  cost_reversal_id uuid,
  result_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cash_original public.cash_pool_entries;
  v_cost_original public.project_cost_ledger_entries;
  v_existing_cash_reversal public.cash_pool_entries;
  v_existing_cost_reversal public.project_cost_ledger_entries;
  v_cash_reversal public.cash_pool_entries;
  v_cost_reversal public.project_cost_ledger_entries;
begin
  select * into v_cash_original from public.cash_pool_entries where id = p_cash_entry_id for update;

  if v_cash_original.id is null then
    raise exception 'cash pool entry not found';
  end if;

  select * into v_cost_original from public.project_cost_ledger_entries where id = p_cost_entry_id for update;

  if v_cost_original.id is null then
    raise exception 'project cost ledger entry not found';
  end if;

  if v_cash_original.tenant_id <> v_cost_original.tenant_id then
    raise exception 'INVALID_PAIRED_REFUND';
  end if;

  if not private.current_user_has_tenant_role(v_cash_original.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reverse paired project refund';
  end if;

  if v_cash_original.entry_kind <> 'entry' or v_cash_original.entry_type <> 'project_refund' then
    raise exception 'INVALID_PAIRED_REFUND';
  end if;

  if v_cost_original.entry_kind <> 'refund' then
    raise exception 'INVALID_PAIRED_REFUND';
  end if;

  if v_cash_original.import_row_id is null
     or v_cost_original.import_row_id is null
     or v_cash_original.import_row_id <> v_cost_original.import_row_id then
    raise exception 'INVALID_PAIRED_REFUND';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  select * into v_existing_cash_reversal from public.cash_pool_entries where reverses_entry_id = v_cash_original.id;
  select * into v_existing_cost_reversal from public.project_cost_ledger_entries where reverses_entry_id = v_cost_original.id;

  if v_existing_cash_reversal.id is not null and v_existing_cost_reversal.id is not null then
    -- Idempotent success: both legs were already reversed (a retry of a
    -- prior successful call) — return the existing pair unchanged, never
    -- touch reason/metadata on the existing rows.
    return query select v_existing_cash_reversal.id, v_existing_cost_reversal.id, 'already_reversed'::text;
    return;
  end if;

  if v_existing_cash_reversal.id is not null or v_existing_cost_reversal.id is not null then
    -- Exactly one side already reversed — a genuine integrity exception
    -- (structurally prevented going forward by §1, but reachable from
    -- legacy data). Never attempt to "complete" it automatically.
    raise exception 'PAIRED_REFUND_PARTIALLY_REVERSED';
  end if;

  insert into public.cash_pool_entries (
    tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by
  ) values (
    v_cash_original.tenant_id, v_cash_original.pool_id, v_cash_original.entry_type, 'reversal',
    v_cash_original.amount, p_reason, v_cash_original.id, auth.uid()
  )
  returning * into v_cash_reversal;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
    amount, description, reference_number, reverses_entry_id, actor_user_id
  ) values (
    v_cost_original.tenant_id, v_cost_original.pool_id, v_cost_original.project_id, v_cost_original.category_id,
    v_cost_original.vendor_id, 'reversal', v_cost_original.entry_scope,
    v_cost_original.amount, p_reason, null, v_cost_original.id, auth.uid()
  )
  returning * into v_cost_reversal;

  return query select v_cash_reversal.id, v_cost_reversal.id, 'reversed'::text;
end;
$$;

revoke execute on function public.reverse_paired_project_refund(uuid, uuid, text) from public;
grant execute on function public.reverse_paired_project_refund(uuid, uuid, text) to authenticated;

-- =============================================================================
-- 5. trusted_transaction_history — add 'partially_reversed' status
-- =============================================================================
-- Same column list, names, order, and types as 20260720140000's version —
-- only the `enriched`/`grouped`/`final` CTEs' internal computation of
-- `status` changes. Every physical row already carries (via `enriched`)
-- whether SOME other row reverses it; that per-row signal is now carried
-- through grouping as reversed_leg_count / total_leg_count, and status
-- becomes a direct comparison instead of a same-key existence join — this
-- also correctly generalizes to single-ledger transactions (total legs
-- always 1, so reversed_leg_count is 0 or 1, never producing
-- 'partially_reversed' for them) without any special-casing.
create or replace view public.trusted_transaction_history
with (security_invoker = true) as
with cash_source as (
  select
    e.id,
    e.tenant_id,
    e.pool_id,
    cp.business_date,
    e.created_at,
    'cash_pool'::text as source_table,
    (e.entry_kind = 'reversal') as is_reversal,
    e.entry_type::text as effective_category,
    e.amount,
    e.description,
    null::text as reference_number,
    null::uuid as project_id,
    e.created_by as actor_user_id,
    e.reverses_entry_id,
    e.import_batch_id,
    e.import_row_id,
    -- Pairing must key off the ORIGINAL's import_row_id, not the
    -- reversal row's own — reverse_paired_project_refund (Gate 1K.1)
    -- deliberately leaves import_batch_id/import_row_id null on its own
    -- reversal rows (matching reverse_cash_pool_entry/reverse_project_
    -- expense's existing manual-reversal convention), unlike
    -- rollback_cash_import_batch which does stamp them. Looking the
    -- original up through reverses_entry_id makes pairing work
    -- identically for both provenance styles.
    case
      when e.entry_kind = 'reversal' then (
        select o.import_row_id from public.cash_pool_entries o where o.id = e.reverses_entry_id
      )
      else e.import_row_id
    end as pairing_import_row_id,
    e.amount as signed_cash_effect_raw,
    0::numeric(16, 2) as signed_project_cost_effect_raw,
    0::numeric(16, 2) as signed_shared_overhead_effect_raw
  from public.cash_pool_entries e
  join public.cash_pools cp on cp.id = e.pool_id
),
cost_source as (
  select
    c.id,
    c.tenant_id,
    c.pool_id,
    cp.business_date,
    c.created_at,
    'project_cost_ledger'::text as source_table,
    (c.entry_kind = 'reversal') as is_reversal,
    case
      when v_effective.entry_kind = 'refund' then 'project_refund'
      when c.entry_scope = 'shared_overhead' then 'shared_overhead_expense'
      else 'project_expense'
    end as effective_category,
    c.amount,
    c.description,
    c.reference_number,
    c.project_id,
    c.actor_user_id,
    c.reverses_entry_id,
    c.import_batch_id,
    c.import_row_id,
    -- Same rationale as cash_source's pairing_import_row_id above.
    v_effective.pairing_import_row_id,
    case when v_effective.entry_kind = 'expense' then -c.amount else 0 end as signed_cash_effect_raw,
    case
      when v_effective.entry_kind = 'expense' and c.entry_scope = 'project' then c.amount
      when v_effective.entry_kind = 'refund' then -c.amount
      else 0
    end as signed_project_cost_effect_raw,
    case
      when v_effective.entry_kind = 'expense' and c.entry_scope = 'shared_overhead' then c.amount
      else 0
    end as signed_shared_overhead_effect_raw
  from public.project_cost_ledger_entries c
  cross join lateral (
    select
      case
        when c.entry_kind = 'reversal' then (
          select o.entry_kind from public.project_cost_ledger_entries o where o.id = c.reverses_entry_id
        )
        else c.entry_kind
      end as entry_kind,
      case
        when c.entry_kind = 'reversal' then (
          select o.import_row_id from public.project_cost_ledger_entries o where o.id = c.reverses_entry_id
        )
        else c.import_row_id
      end as pairing_import_row_id
  ) as v_effective
  join public.cash_pools cp on cp.id = c.pool_id
),
normalized as (
  select * from cash_source
  union all
  select * from cost_source
),
keyed as (
  select
    n.*,
    case
      when n.effective_category = 'project_refund' and n.pairing_import_row_id is not null then
        'refund:' || n.pairing_import_row_id::text || case when n.is_reversal then ':reversal' else ':original' end
      else n.source_table || ':' || n.id::text
    end as pairing_key,
    case when n.is_reversal then n.effective_category || '_reversal' else n.effective_category end as transaction_type,
    case
      when n.is_reversal then 'reversal'
      when n.effective_category in ('opening_cash', 'cash_top_up', 'other_cash_in') then 'cash_in'
      when n.effective_category = 'shared_overhead_expense' then 'cash_out'
      when n.effective_category = 'project_expense' then 'cost_increase'
      when n.effective_category = 'project_refund' then 'cost_reduction'
      else 'cash_in'
    end as transaction_direction,
    case
      when n.is_reversal then 'reversal'
      when n.import_batch_id is not null then 'import'
      else 'direct_manual'
    end as source,
    (case when n.is_reversal then -1 else 1 end)::numeric as sign_multiplier
  from normalized n
),
enriched as (
  select
    k.*,
    k2.pairing_key as reversal_of_logical_id,
    -- Per-physical-row signal: does some OTHER row reverse this one? Used
    -- below to count how many of a logical transaction's legs (1 or 2)
    -- have actually been reversed, independent of whether the reversal's
    -- own counterpart leg also exists yet.
    exists (select 1 from keyed r where r.reverses_entry_id = k.id) as leg_has_reversal
  from keyed k
  left join keyed k2 on k2.id = k.reverses_entry_id
),
grouped as (
  select
    pairing_key as logical_transaction_id,
    min(tenant_id::text)::uuid as tenant_id,
    min(business_date) as business_date,
    min(created_at) as created_at,
    min(transaction_type) as transaction_type,
    min(transaction_direction) as transaction_direction,
    bool_or(is_reversal) as is_reversal,
    max(amount) as display_amount,
    sum(signed_cash_effect_raw * sign_multiplier)::numeric(16, 2) as signed_cash_effect,
    sum(signed_project_cost_effect_raw * sign_multiplier)::numeric(16, 2) as signed_project_cost_effect,
    sum(signed_shared_overhead_effect_raw * sign_multiplier)::numeric(16, 2) as signed_shared_overhead_effect,
    max(project_id::text)::uuid as project_id,
    min(pool_id::text)::uuid as pool_id,
    min(actor_user_id::text)::uuid as actor_user_id,
    min(source) as source,
    max(import_batch_id::text)::uuid as import_batch_id,
    max(import_row_id::text)::uuid as import_row_id,
    max(id::text) filter (where source_table = 'cash_pool')::uuid as cash_entry_id,
    max(id::text) filter (where source_table = 'project_cost_ledger')::uuid as cost_entry_id,
    max(reverses_entry_id::text) filter (where source_table = 'cash_pool')::uuid as cash_reverses_entry_id,
    max(reverses_entry_id::text) filter (where source_table = 'project_cost_ledger')::uuid as cost_reverses_entry_id,
    min(reversal_of_logical_id) as reversal_of_logical_id,
    min(description) as description,
    max(reference_number) as reference_number,
    count(*) as total_leg_count,
    count(*) filter (where leg_has_reversal) as reversed_leg_count
  from enriched
  group by pairing_key
),
final as (
  select
    g.*,
    case
      when g.is_reversal then 'reversal'
      when g.reversed_leg_count = 0 then 'active'
      when g.reversed_leg_count = g.total_leg_count then 'reversed'
      else 'partially_reversed'
    end as status,
    rb.logical_transaction_id as reversed_by_logical_id
  from grouped g
  left join grouped rb on rb.reversal_of_logical_id = g.logical_transaction_id
)
select
  f.logical_transaction_id,
  f.tenant_id,
  f.business_date,
  f.created_at,
  f.transaction_type,
  f.transaction_direction,
  f.status,
  f.display_amount,
  f.signed_cash_effect,
  f.signed_project_cost_effect,
  f.signed_shared_overhead_effect,
  f.project_id,
  vp.project_code,
  v.vessel_name,
  f.pool_id,
  f.actor_user_id,
  f.source,
  f.import_batch_id,
  f.import_row_id,
  f.cash_entry_id,
  f.cost_entry_id,
  f.cash_reverses_entry_id,
  f.cost_reverses_entry_id,
  f.reversal_of_logical_id,
  f.reversed_by_logical_id,
  f.description,
  f.reference_number
from final f
left join public.vessel_projects vp on vp.id = f.project_id and vp.tenant_id = f.tenant_id
left join public.vessels v on v.id = vp.vessel_id and v.tenant_id = vp.tenant_id;

grant select on public.trusted_transaction_history to service_role;

-- =============================================================================
-- 6. list_trusted_transactions / summarize_trusted_transactions —
--    p_status now also accepts 'partially_reversed'
-- =============================================================================
-- Bodies are byte-identical to 20260720140000's versions — p_status was
-- already an unconstrained `text` equality filter (no DB enum), so the new
-- status value is already accepted by the existing WHERE clause with zero
-- SQL changes. No CREATE OR REPLACE needed for either function.
