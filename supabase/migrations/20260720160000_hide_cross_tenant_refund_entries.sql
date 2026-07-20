-- ADOP Phase 1 Gate 1K.1A — Cross-Tenant Confidentiality Hardening
--
-- reverse_paired_project_refund (20260720150000) checked existence and
-- tenant-match BEFORE authorization: it located the cash entry by bare id
-- (no tenant filter), then the cost entry by bare id, THEN compared their
-- tenant_ids, THEN checked the caller's role. A caller could tell apart
-- "this id doesn't exist" (raises "cash/cost pool entry not found") from
-- "this id exists but I'm not Owner of its tenant" (raises "not authorized
-- ...") from "the two ids belong to different tenants" (raises
-- INVALID_PAIRED_REFUND) — three distinct, learnable outcomes for probing
-- whether an id exists at all, and if so, roughly which tenant it belongs
-- to. It also placed a `for update` row lock on both entries before any of
-- that was known, meaning a bare id belonging to a completely unrelated
-- tenant still got locked and read in full before being rejected.
--
-- This migration reorders the SAME function (CREATE OR REPLACE, identical
-- signature/return type/grants — nothing else in 20260720150000 is
-- touched) so authorization is inseparable from lookup:
--
--   1. The cash leg is fetched with a single query whose WHERE clause
--      combines `id = p_cash_entry_id` AND
--      `private.current_user_has_tenant_role(tenant_id, ['owner'])` — a
--      missing id, a cross-tenant id, and an id in the caller's own tenant
--      but without Owner role are all filtered out by the same predicate,
--      before any row is locked or read. All three raise the identical
--      'NOT_FOUND' exception.
--   2. Only once that row is confirmed authorized is the cost leg looked
--      up — and only via `id = p_cost_entry_id AND tenant_id =
--      <the already-authorized cash entry's tenant_id>`, never a bare
--      `where id = ...`. A cost id that doesn't exist and a cost id that
--      belongs to a different tenant are therefore indistinguishable —
--      both are simply absent from this tenant-scoped query, both raise
--      the same 'NOT_FOUND'.
--   3. Entry-shape validation (entry_kind/entry_type, import_row_id
--      pairing) runs only after both legs are confirmed to belong to one
--      authorized tenant — unchanged logic, just later in the sequence,
--      so INVALID_PAIRED_REFUND is now only ever reachable for a caller
--      who is already Owner of the tenant both ids actually belong to.
--   4. Idempotency, the two-leg insert, and the deferred-constraint
--      atomicity guarantee (private.enforce_paired_refund_reversal_
--      atomicity, unmodified) are byte-identical to 20260720150000.
--
-- Grants audited, unchanged: private.enforce_paired_refund_reversal_
-- atomicity still has no EXECUTE grant to authenticated/public (only
-- `revoke ... from public`, no matching `grant ... to authenticated` was
-- ever added); reverse_cash_pool_entry, reverse_project_expense, and
-- reverse_paired_project_refund itself remain the only three functions
-- with EXECUTE granted to `authenticated`, none to `public`.

create or replace function public.reverse_paired_project_refund(
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
  -- Authorize the cash leg FIRST, in one query: only a row that both
  -- exists AND belongs to a tenant the caller is Owner of is ever
  -- selected — and only that row is ever locked. Missing id, wrong-role,
  -- and cross-tenant id are all structurally indistinguishable here on.
  select e.* into v_cash_original
  from public.cash_pool_entries e
  where e.id = p_cash_entry_id
    and private.current_user_has_tenant_role(e.tenant_id, array['owner']::public.tenant_role[])
  for update of e;

  if v_cash_original.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- The cost leg is looked up ONLY within the already-authorized tenant
  -- scope — never a bare `where id = ...` — so a cost id from another
  -- tenant is indistinguishable from one that does not exist at all.
  select c.* into v_cost_original
  from public.project_cost_ledger_entries c
  where c.id = p_cost_entry_id and c.tenant_id = v_cash_original.tenant_id
  for update of c;

  if v_cost_original.id is null then
    raise exception 'NOT_FOUND';
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
    -- (structurally prevented going forward by 20260720150000's deferred
    -- constraint, but reachable from legacy data). Never attempt to
    -- "complete" it automatically.
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

-- Grants unchanged from 20260720150000 — CREATE OR REPLACE preserves
-- existing grants automatically, but they are restated here for
-- auditability (identical to the original: authenticated only, never
-- public).
revoke execute on function public.reverse_paired_project_refund(uuid, uuid, text) from public;
grant execute on function public.reverse_paired_project_refund(uuid, uuid, text) to authenticated;
