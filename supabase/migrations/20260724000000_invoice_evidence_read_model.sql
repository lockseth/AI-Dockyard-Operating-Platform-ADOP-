-- ADOP Gate 4C — Invoice & Evidence Read Model
--
-- Additive read-model layer on top of Gate 4B's schema/storage foundation
-- (20260723000000_invoice_evidence_documents.sql). Does not edit that
-- migration or any of its RLS/RPCs/triggers — every table underneath these
-- views/functions keeps exactly the write path and role posture Gate 4B
-- already froze; this only adds read surface Gate 4C's UI/service layer
-- needs so business rules (which transactions are billable, which
-- evidence version is the final signed document) are computed once in the
-- database, never reimplemented in the client (task instruction: "Jangan
-- duplikasi business rule di client").
--
-- Same shape as 20260720140000_trusted_transaction_history.sql: each view
-- is `security_invoker = true` (no elevated privilege of its own) and NOT
-- granted to `authenticated` directly — every authenticated access path
-- goes through a SECURITY DEFINER function below that independently
-- re-verifies owner/admin tenant role via private.current_user_has_tenant_
-- role, matching Gate 4A Contract §7's decision that invoice/evidence reads
-- follow the trusted_transaction_history precedent (owner+admin only, not
-- the reviewer/viewer-readable master-data pattern).
--
-- 1. invoice_billing_summary — one row per invoice with its binding/evidence
--    aggregate (line_count, total_amount, current evidence version status,
--    reissue successor) — backs both the invoice list and the invoice
--    detail header.
-- 2. invoice_eligible_transactions — closed-project, non-reversed expense
--    rows not currently bound to any *active* (draft/issued) invoice — the
--    Gate 4A Contract §3/F1/F3 "which transactions can be picked for a new
--    draft" rule, computed once here.
-- 3. transaction_invoice_bindings — every invoice_transaction_lines row for
--    a transaction, including ones whose invoice is now void — the Riwayat
--    Transaksi "which invoice(s) has this transaction ever been part of"
--    lookup (Gate 4A Contract §6 step 6 / task instruction H: a void
--    invoice must never erase history).
--
-- Also adds record_invoice_evidence_access: the server-authorized control
-- point Gate 4C's signed-URL path calls before minting a URL, giving
-- `evidence.accessed` (Gate 4A Contract §8, conditional per §11 decision 5)
-- a real insertion point instead of being an untracked signed-URL-only path.

-- =============================================================================
-- 1. invoice_billing_summary
-- =============================================================================

create view public.invoice_billing_summary
with (security_invoker = true) as
select
  i.id,
  i.tenant_id,
  i.status,
  i.predecessor_invoice_id,
  succ.id as successor_invoice_id,
  i.issued_at,
  i.issued_by,
  i.void_at,
  i.void_by,
  i.void_reason,
  i.created_by,
  i.created_at,
  i.updated_at,
  coalesce(lines.line_count, 0)::bigint as line_count,
  coalesce(lines.total_amount, 0)::numeric(16, 2) as total_amount,
  ev.id as evidence_id,
  ev.current_version_id,
  cv.version_number as current_version_number,
  cv.status as current_version_status,
  coalesce(cv.status = 'verified', false) as is_final_document
from public.invoices i
left join public.invoices succ on succ.predecessor_invoice_id = i.id
left join lateral (
  select count(*)::bigint as line_count, sum(l.amount)::numeric(16, 2) as total_amount
  from public.invoice_transaction_lines l
  where l.invoice_id = i.id
) lines on true
left join public.invoice_evidence ev on ev.invoice_id = i.id
left join public.invoice_evidence_versions cv on cv.id = ev.current_version_id;

grant select on public.invoice_billing_summary to service_role;

-- --- list_invoices -------------------------------------------------------

create function public.list_invoices(
  p_tenant_id uuid,
  p_status public.invoice_status default null,
  p_limit integer default 200
)
returns setof public.invoice_billing_summary
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view invoices';
  end if;

  return query
  select b.*
  from public.invoice_billing_summary b
  where b.tenant_id = p_tenant_id
    and (p_status is null or b.status = p_status)
  order by b.created_at desc, b.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke execute on function public.list_invoices(uuid, public.invoice_status, integer) from public;
grant execute on function public.list_invoices(uuid, public.invoice_status, integer) to authenticated;

-- --- get_invoice_summary ---------------------------------------------------
-- Existence is not hidden from an unauthorized-but-correct-tenant-guess
-- caller any more than issue_invoice/void_invoice already do (both raise a
-- distinct "not authorized" message after finding the row) — this matches
-- that existing Gate 4B precedent rather than introducing a new leak.

create function public.get_invoice_summary(p_invoice_id uuid)
returns public.invoice_billing_summary
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.invoice_billing_summary;
begin
  select tenant_id into v_tenant_id from public.invoices where id = p_invoice_id;
  if v_tenant_id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view invoices';
  end if;

  select * into v_result from public.invoice_billing_summary where id = p_invoice_id;
  return v_result;
end;
$$;

revoke execute on function public.get_invoice_summary(uuid) from public;
grant execute on function public.get_invoice_summary(uuid) to authenticated;

-- =============================================================================
-- 2. invoice_eligible_transactions
-- =============================================================================

create view public.invoice_eligible_transactions
with (security_invoker = true) as
select
  c.id as transaction_entry_id,
  c.tenant_id,
  c.project_id,
  vp.project_code,
  v.vessel_name,
  c.amount,
  c.description,
  c.created_at
from public.project_cost_ledger_entries c
join public.vessel_projects vp on vp.id = c.project_id and vp.tenant_id = c.tenant_id
left join public.vessels v on v.id = vp.vessel_id and v.tenant_id = vp.tenant_id
where c.entry_kind = 'expense'
  and vp.lifecycle_status = 'closed'
  and not exists (
    select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id
  )
  and not exists (
    select 1
    from public.invoice_transaction_lines l
    join public.invoices i on i.id = l.invoice_id
    where l.transaction_entry_id = c.id
      and i.status in ('draft', 'issued')
  );

grant select on public.invoice_eligible_transactions to service_role;

create function public.list_invoice_eligible_transactions(
  p_tenant_id uuid,
  p_project_id uuid default null
)
returns setof public.invoice_eligible_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view eligible transactions';
  end if;

  return query
  select t.*
  from public.invoice_eligible_transactions t
  where t.tenant_id = p_tenant_id
    and (p_project_id is null or t.project_id = p_project_id)
  order by t.created_at desc;
end;
$$;

revoke execute on function public.list_invoice_eligible_transactions(uuid, uuid) from public;
grant execute on function public.list_invoice_eligible_transactions(uuid, uuid) to authenticated;

-- =============================================================================
-- 3. transaction_invoice_bindings
-- =============================================================================
-- Deliberately NOT filtered to active invoices — a transaction bound to a
-- now-void invoice keeps its row here (invoice_transaction_lines is only
-- ever deleted while the parent is draft; Gate 4B never deletes a bind on
-- issued->void), so the full history/chain survives exactly as task
-- instruction H requires.

create view public.transaction_invoice_bindings
with (security_invoker = true) as
select
  l.id as binding_id,
  l.tenant_id,
  l.transaction_entry_id,
  l.invoice_id,
  i.status as invoice_status,
  i.predecessor_invoice_id,
  i.void_reason,
  l.amount,
  l.description,
  l.created_at as bound_at,
  ev.current_version_id,
  cv.status as current_version_status,
  coalesce(cv.status = 'verified', false) as is_final_document
from public.invoice_transaction_lines l
join public.invoices i on i.id = l.invoice_id
left join public.invoice_evidence ev on ev.invoice_id = i.id
left join public.invoice_evidence_versions cv on cv.id = ev.current_version_id;

grant select on public.transaction_invoice_bindings to service_role;

create function public.list_transaction_invoice_bindings(
  p_tenant_id uuid,
  p_transaction_entry_id uuid
)
returns setof public.transaction_invoice_bindings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view invoice bindings';
  end if;

  return query
  select b.*
  from public.transaction_invoice_bindings b
  where b.tenant_id = p_tenant_id
    and b.transaction_entry_id = p_transaction_entry_id
  order by b.bound_at desc;
end;
$$;

revoke execute on function public.list_transaction_invoice_bindings(uuid, uuid) from public;
grant execute on function public.list_transaction_invoice_bindings(uuid, uuid) to authenticated;

-- =============================================================================
-- 4. record_invoice_evidence_access — server-authorized signed-URL control
--    point (Gate 4A Contract §8 `evidence.accessed`, §11 decision 5)
-- =============================================================================
-- Called by the service layer immediately before it asks Supabase Storage
-- for a signed URL. Re-verifies tenant+role independently of the storage
-- SELECT RLS policy (belt-and-suspenders — the storage policy is still the
-- final gate on the actual bytes) and returns the version row so the
-- caller can read storage_path from a trusted, already-authorized source
-- rather than trusting a client-supplied path.

create function public.record_invoice_evidence_access(p_version_id uuid)
returns public.invoice_evidence_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.invoice_evidence_versions;
begin
  select * into v_version from public.invoice_evidence_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'invoice evidence version not found';
  end if;

  if not private.current_user_has_tenant_role(v_version.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to access invoice evidence';
  end if;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_version.tenant_id, auth.uid(), 'invoice_evidence_version', v_version.id, 'evidence.accessed',
    null, jsonb_build_object('storage_path', v_version.storage_path)
  );

  return v_version;
end;
$$;

revoke execute on function public.record_invoice_evidence_access(uuid) from public;
grant execute on function public.record_invoice_evidence_access(uuid) to authenticated;
