-- ADOP Phase 2A Closeout Audit — Structural Cardinality Guards
--
-- Closes two gaps found during the Billing Metadata gate closeout audit:
-- Contract §5.1/§8.2 (ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_
-- CONTRACT_v1.0.md) were only enforced by application logic in
-- create_draft_invoice/reissue_invoice/register_legacy_invoice (client_id
-- always derived from the project, never accepted as a parameter) and in
-- bind_invoice_transaction (project match check) — 20260725000000_billing_
-- metadata_cardinality.sql never added the role-independent, trigger-level
-- backstop these invariants need, unlike every other structural guard in
-- Gate 4A/4B (e.g. enforce_invoice_predecessor_integrity, enforce_invoice_
-- transaction_line_source_integrity). Verified empirically: a raw INSERT
-- bypassing the RPCs could set invoices.client_id to a client that does not
-- belong to the invoice's own project_id, and could bind an invoice_
-- transaction_lines row whose project_id differs from its parent invoice's
-- locked project_id.
--
-- Purely additive — two new BEFORE INSERT triggers, no existing column,
-- constraint, or RPC signature changes.

-- --- invoices: client_id must match project_id's own client -------------
-- Runs only on INSERT — project_id/client_id are already immutable after
-- insert via private.enforce_invoice_metadata_locked (before update),
-- so no UPDATE-side check is needed here.

create function private.enforce_invoice_client_matches_project()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_project_client_id uuid;
begin
  if new.project_id is null then
    if new.client_id is not null then
      raise exception 'invoice client_id must be null when project_id is not set';
    end if;
    return new;
  end if;

  select client_id into v_project_client_id from public.vessel_projects where id = new.project_id;

  if new.client_id is distinct from v_project_client_id then
    raise exception 'invoice client_id must match its project''s client_id';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_client_matches_project() from public;

create trigger invoices_enforce_client_matches_project
  before insert on public.invoices
  for each row execute function private.enforce_invoice_client_matches_project();

-- --- invoice_transaction_lines: project_id must match the invoice's -----
-- locked project_id (Contract §8.2 point 2). Applies to every INSERT,
-- including the direct register_legacy_invoice path (origin = 'legacy_
-- import'), which is exactly where the previous RPC-only check was weakest
-- since that path never went through bind_invoice_transaction at all.

create function private.enforce_invoice_transaction_line_project_matches_invoice()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_invoice_project_id uuid;
begin
  select project_id into v_invoice_project_id from public.invoices where id = new.invoice_id;

  if v_invoice_project_id is not null and new.project_id <> v_invoice_project_id then
    raise exception 'invoice_transaction_lines.project_id must match its invoice''s locked project_id';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_invoice_transaction_line_project_matches_invoice() from public;

create trigger invoice_transaction_lines_enforce_project_matches_invoice
  before insert on public.invoice_transaction_lines
  for each row execute function private.enforce_invoice_transaction_line_project_matches_invoice();
