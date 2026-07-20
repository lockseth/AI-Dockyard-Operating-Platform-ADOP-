-- ADOP Phase 1 Gate 1K — Trusted Transaction History & Drill-Down
--
-- READ MODEL + READ-ONLY access over the two append-only canonical ledgers
-- (cash_pool_entries, project_cost_ledger_entries). Gate 1K introduces no
-- new financial write path, no new table that could become a second source
-- of truth, and no change to any prior gate's mutation logic — it only adds
-- a VIEW that normalizes/unifies existing rows for reading, plus three
-- SECURITY DEFINER query functions (list, summarize, detail) that gate that
-- view to Owner/Admin.
--
-- Normalization rules (see PRD/task LOCK for the full spec):
--   A. Single-ledger transaction -> one logical transaction (1 physical row).
--   B. Paired project refund (cash_pool_entries.entry_type='project_refund'
--      + project_cost_ledger_entries.entry_kind='refund', always inserted
--      together by approve_and_commit_cash_import_batch under the SAME
--      import_batch_id/import_row_id — see 20260720120000) -> ONE logical
--      transaction combining both physical rows; display_amount is taken
--      once (both physical rows always carry the identical v_row.debit
--      amount), never summed twice.
--   C. Reversal -> a reversal row is intrinsically its OWN logical
--      transaction (own pairing key), linked back to the original's logical
--      transaction via reversal_of_logical_id / reversed_by_logical_id — the
--      original is never mutated or hidden.
--   D. Import rollback -> no synthetic "rollback transaction" row is
--      created; every individual original entry and every individual
--      reversal entry (see 20260720130000's rollback_cash_import_batch)
--      appears in this view exactly as it exists in the base ledgers, with
--      import_batch_id/import_row_id carried through for provenance.
--
-- Both cash_pool_entries and project_cost_ledger_entries already copy the
-- ORIGINAL row's entry_type/entry_scope onto a 'reversal' row (only
-- entry_kind flips) — see 20260720130000 §9 — so this view only needs one
-- extra self-lookup (a scalar case on project_cost_ledger_entries) to learn
-- whether a cost-ledger reversal undoes an 'expense' or a 'refund'; the
-- cash-ledger side already carries that information directly on every row.
--
-- Security: the view itself is security_invoker (defensive-in-depth,
-- consistent with every other view in this schema) but is NOT granted to
-- `authenticated` — it is only ever queried from inside the three
-- SECURITY DEFINER functions below, which independently re-verify
-- tenant/role via private.current_user_has_tenant_role before returning any
-- row. This is Owner/Admin-only by task LOCK, a narrower read surface than
-- the underlying ledgers' own `_select_member` policy (which additionally
-- admits viewer/reviewer) — that existing policy is left untouched; Gate 1K
-- adds a stricter gate on TOP of it rather than loosening it.

-- =============================================================================
-- 1. Unified read-model view
-- =============================================================================

create view public.trusted_transaction_history
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
    -- cash_pool_entries types are all cash-in in nature (opening_cash,
    -- cash_top_up, other_cash_in, project_refund) — the paired refund's
    -- cost-ledger leg never touches cash, so no double posting here.
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
    -- Every 'expense' row (project or shared_overhead scope) is the cash-out
    -- posting for that spend — cash_pool_daily_summary.total_cash_out sums
    -- these rows directly, there is no separate cash_pool_entries row for a
    -- project/shared-overhead expense. A 'refund' row's cash effect lives
    -- entirely on its paired cash_pool_entries leg (above), so it is 0 here.
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
  -- A reversal row's OWN entry_kind is always 'reversal' — entry_scope is
  -- copied from the original (still tells project vs shared_overhead) but
  -- whether the original was 'expense' or 'refund' is lost on the row
  -- itself, so it is looked up once from the row it reverses.
  cross join lateral (
    select case
      when c.entry_kind = 'reversal' then (
        select o.entry_kind from public.project_cost_ledger_entries o where o.id = c.reverses_entry_id
      )
      else c.entry_kind
    end as entry_kind
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
      -- Paired project refund: cash-in leg (entry_type=project_refund) and
      -- cost-reduction leg (entry_kind=refund) always share the same
      -- import_row_id (see 20260720120000) — that shared id, plus whether
      -- this is the original posting or its reversal, is the pairing key.
      -- Every project_refund/refund row is import-provenanced by
      -- construction (there is no direct/manual path that creates one), so
      -- import_row_id is never actually null here — the null check is kept
      -- only as a defensive guard against future schema drift.
      when n.effective_category = 'project_refund' and n.import_row_id is not null then
        'refund:' || n.import_row_id::text || case when n.is_reversal then ':reversal' else ':original' end
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
    k2.pairing_key as reversal_of_logical_id
  from keyed k
  left join keyed k2 on k2.id = k.reverses_entry_id
),
grouped as (
  select
    pairing_key as logical_transaction_id,
    -- Postgres has no built-in MIN/MAX aggregate for uuid — every uuid
    -- column below is aggregated via a text cast (safe here because, within
    -- one pairing_key group, each such column is either identical across
    -- rows or null on exactly one side).
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
    max(reference_number) as reference_number
  from enriched
  group by pairing_key
),
final as (
  select
    g.*,
    case when g.is_reversal then 'reversal' when rb.logical_transaction_id is not null then 'reversed' else 'active' end as status,
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

-- Not granted to `authenticated` — only the SECURITY DEFINER functions below
-- (owned by the migration role, which is not subject to RLS) read this view;
-- every authenticated access path is gated by current_user_has_tenant_role.
grant select on public.trusted_transaction_history to service_role;

-- =============================================================================
-- 2. list_trusted_transactions — filtered, keyset-paginated list
-- =============================================================================
-- Ordering is always business_date desc, created_at desc,
-- logical_transaction_id desc — logical_transaction_id is synthetic but
-- unique per logical transaction, so it is a safe final tie-breaker (no
-- duplicate/skip across pages even when many rows share one business_date +
-- created_at, e.g. every posting from the same import commit).
-- p_cursor_* are either all null (first page) or all supplied (the
-- logical_transaction_id/business_date/created_at of the last row on the
-- previous page) — the service layer derives this from an opaque cursor
-- token, never from client-editable individual fields.

create function public.list_trusted_transactions(
  p_tenant_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_project_id uuid default null,
  p_transaction_type text default null,
  p_transaction_direction text default null,
  p_source text default null,
  p_status text default null,
  p_import_batch_id uuid default null,
  p_search text default null,
  p_cursor_business_date date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_logical_id text default null,
  p_limit integer default 50
)
returns setof public.trusted_transaction_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view trusted transaction history';
  end if;

  return query
  select t.*
  from public.trusted_transaction_history t
  where t.tenant_id = p_tenant_id
    and (p_date_from is null or t.business_date >= p_date_from)
    and (p_date_to is null or t.business_date <= p_date_to)
    and (p_project_id is null or t.project_id = p_project_id)
    and (p_transaction_type is null or t.transaction_type = p_transaction_type)
    and (p_transaction_direction is null or t.transaction_direction = p_transaction_direction)
    and (p_source is null or t.source = p_source)
    and (p_status is null or t.status = p_status)
    and (p_import_batch_id is null or t.import_batch_id = p_import_batch_id)
    and (
      p_search is null or btrim(p_search) = '' or (
        t.description ilike '%' || p_search || '%'
        or t.reference_number ilike '%' || p_search || '%'
        or t.project_code ilike '%' || p_search || '%'
        or t.vessel_name ilike '%' || p_search || '%'
      )
    )
    and (
      p_cursor_business_date is null
      or (t.business_date, t.created_at, t.logical_transaction_id)
        < (p_cursor_business_date, p_cursor_created_at, p_cursor_logical_id)
    )
  order by t.business_date desc, t.created_at desc, t.logical_transaction_id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.list_trusted_transactions(
  uuid, date, date, uuid, text, text, text, text, uuid, text, date, timestamptz, text, integer
) from public;
grant execute on function public.list_trusted_transactions(
  uuid, date, date, uuid, text, text, text, text, uuid, text, date, timestamptz, text, integer
) to authenticated;

-- =============================================================================
-- 3. get_trusted_transaction_detail — single logical transaction
-- =============================================================================
-- Returns no row both when the id does not exist and when it belongs to a
-- different tenant — the caller cannot distinguish the two, so cross-tenant
-- existence is never leaked (task LOCK: "Jangan membocorkan keberadaan
-- cross-tenant transaction").

create function public.get_trusted_transaction_detail(
  p_tenant_id uuid,
  p_logical_transaction_id text
)
returns public.trusted_transaction_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.trusted_transaction_history;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view trusted transaction history';
  end if;

  select * into v_result
  from public.trusted_transaction_history
  where tenant_id = p_tenant_id and logical_transaction_id = p_logical_transaction_id;

  return v_result;
end;
$$;

revoke execute on function public.get_trusted_transaction_detail(uuid, text) from public;
grant execute on function public.get_trusted_transaction_detail(uuid, text) to authenticated;

-- =============================================================================
-- 4. summarize_trusted_transactions — filtered summary (whole filtered set)
-- =============================================================================
-- Same filter predicates as list_trusted_transactions (minus pagination),
-- aggregated over the ALREADY per-logical-transaction view — a paired
-- project refund is one row in trusted_transaction_history, so summing its
-- signed_cash_effect/signed_project_cost_effect here can never double-count
-- it (task LOCK: "Refund tidak double-count dalam summary").

create function public.summarize_trusted_transactions(
  p_tenant_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_project_id uuid default null,
  p_transaction_type text default null,
  p_transaction_direction text default null,
  p_source text default null,
  p_status text default null,
  p_import_batch_id uuid default null,
  p_search text default null
)
returns table (
  total_cash_in numeric(16, 2),
  total_cash_out numeric(16, 2),
  net_cash_effect numeric(16, 2),
  total_project_cost_increase numeric(16, 2),
  total_project_cost_reduction numeric(16, 2),
  net_project_cost_effect numeric(16, 2),
  total_shared_overhead numeric(16, 2),
  transaction_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view trusted transaction history';
  end if;

  return query
  select
    coalesce(sum(t.signed_cash_effect) filter (where t.signed_cash_effect > 0), 0)::numeric(16, 2),
    coalesce(-sum(t.signed_cash_effect) filter (where t.signed_cash_effect < 0), 0)::numeric(16, 2),
    coalesce(sum(t.signed_cash_effect), 0)::numeric(16, 2),
    coalesce(sum(t.signed_project_cost_effect) filter (where t.signed_project_cost_effect > 0), 0)::numeric(16, 2),
    coalesce(-sum(t.signed_project_cost_effect) filter (where t.signed_project_cost_effect < 0), 0)::numeric(16, 2),
    coalesce(sum(t.signed_project_cost_effect), 0)::numeric(16, 2),
    coalesce(sum(t.signed_shared_overhead_effect), 0)::numeric(16, 2),
    count(*)::bigint
  from public.trusted_transaction_history t
  where t.tenant_id = p_tenant_id
    and (p_date_from is null or t.business_date >= p_date_from)
    and (p_date_to is null or t.business_date <= p_date_to)
    and (p_project_id is null or t.project_id = p_project_id)
    and (p_transaction_type is null or t.transaction_type = p_transaction_type)
    and (p_transaction_direction is null or t.transaction_direction = p_transaction_direction)
    and (p_source is null or t.source = p_source)
    and (p_status is null or t.status = p_status)
    and (p_import_batch_id is null or t.import_batch_id = p_import_batch_id)
    and (
      p_search is null or btrim(p_search) = '' or (
        t.description ilike '%' || p_search || '%'
        or t.reference_number ilike '%' || p_search || '%'
        or t.project_code ilike '%' || p_search || '%'
        or t.vessel_name ilike '%' || p_search || '%'
      )
    );
end;
$$;

revoke execute on function public.summarize_trusted_transactions(
  uuid, date, date, uuid, text, text, text, text, uuid, text
) from public;
grant execute on function public.summarize_trusted_transactions(
  uuid, date, date, uuid, text, text, text, text, uuid, text
) to authenticated;
