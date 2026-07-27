-- ADOP Phase 2A — Billing Completeness & Unbilled Vessel Alert Read Model
--
-- Additive read-model layer on top of
-- 20260725000000_billing_metadata_cardinality.sql, implementing Contract
-- §11 (Billing Completeness) and §13 (Unbilled Vessel Alert) from
-- ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md.
--
-- invoice_billing_summary (Gate 4C) is extended via CREATE OR REPLACE VIEW,
-- appending columns only — the view's row type oid is preserved, so
-- list_invoices/get_invoice_summary (which return `setof
-- public.invoice_billing_summary`) keep working unmodified (Contract §21
-- RG-03). unbilled_vessel_projects is new, built directly on
-- invoice_eligible_transactions (Gate 4C) — a project is unbilled exactly
-- when it is `closed` and has at least one row there; a transaction bound
-- only to a now-void invoice already reappears in
-- invoice_eligible_transactions (that view only excludes bindings to
-- draft/issued), so this single condition covers both Contract §13.1 #2 and
-- #3 without duplicating the eligibility logic.
--
-- Same posture as Gate 4C: views are `security_invoker = true` and not
-- granted to `authenticated` directly; every read path goes through a
-- SECURITY DEFINER wrapper that re-verifies owner/admin tenant role.

-- =============================================================================
-- 1. invoice_billing_summary — additive columns (metadata + completeness)
-- =============================================================================

create type public.invoice_billing_completeness_status as enum (
  'DRAFT_INCOMPLETE',
  'DRAFT_READY_TO_ISSUE',
  'ISSUED_EVIDENCE_PENDING',
  'READY_TO_SEND',
  'VOID',
  'LEGACY_RECORDED'
);

create or replace view public.invoice_billing_summary
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
  coalesce(cv.status = 'verified', false) as is_final_document,
  i.legal_entity_id,
  i.client_id,
  i.project_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.origin,
  i.legacy_coverage_status,
  i.imported_by,
  i.imported_at,
  (case
    when i.status = 'void' then 'VOID'
    when i.origin = 'legacy_import' then 'LEGACY_RECORDED'
    when i.status = 'draft' and (
      coalesce(lines.line_count, 0) = 0
      or i.legal_entity_id is null
      or i.client_id is null
      or i.project_id is null
      or i.invoice_number is null
      or i.invoice_date is null
      or i.due_date is null
    ) then 'DRAFT_INCOMPLETE'
    when i.status = 'draft' then 'DRAFT_READY_TO_ISSUE'
    when i.status = 'issued' and coalesce(cv.status = 'verified', false) then 'READY_TO_SEND'
    when i.status = 'issued' then 'ISSUED_EVIDENCE_PENDING'
    else null
  end)::public.invoice_billing_completeness_status as billing_completeness_status
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

-- =============================================================================
-- 2. unbilled_vessel_projects (Contract §13.3)
-- =============================================================================

create view public.unbilled_vessel_projects
with (security_invoker = true) as
select
  vp.id as project_id,
  vp.tenant_id,
  vp.vessel_id,
  v.vessel_name,
  vp.client_id,
  vp.closed_at,
  count(t.transaction_entry_id)::bigint as unbilled_transaction_count,
  coalesce(sum(t.amount), 0)::numeric(16, 2) as unbilled_amount_total,
  lv.id as last_voided_invoice_id,
  lv.void_reason as last_void_reason
from public.vessel_projects vp
left join public.vessels v on v.id = vp.vessel_id and v.tenant_id = vp.tenant_id
join public.invoice_eligible_transactions t on t.project_id = vp.id and t.tenant_id = vp.tenant_id
left join lateral (
  select i.id, i.void_reason
  from public.invoices i
  where i.project_id = vp.id and i.tenant_id = vp.tenant_id and i.status = 'void'
  order by i.void_at desc nulls last
  limit 1
) lv on true
where vp.lifecycle_status = 'closed'
group by vp.id, vp.tenant_id, vp.vessel_id, v.vessel_name, vp.client_id, vp.closed_at, lv.id, lv.void_reason;

grant select on public.unbilled_vessel_projects to service_role;

create function public.list_unbilled_vessel_projects(p_tenant_id uuid)
returns setof public.unbilled_vessel_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to view unbilled vessel projects';
  end if;

  return query
  select u.*
  from public.unbilled_vessel_projects u
  where u.tenant_id = p_tenant_id
  order by u.closed_at asc nulls last;
end;
$$;

revoke execute on function public.list_unbilled_vessel_projects(uuid) from public;
grant execute on function public.list_unbilled_vessel_projects(uuid) to authenticated;
