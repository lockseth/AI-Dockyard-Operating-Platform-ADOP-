-- ADOP Gate 4F — pgTAP proof for Invoice Delivery & Acknowledgment Closure
-- (20260727000000_invoice_delivery_acknowledgment.sql).
--
-- Builds invoice state through the existing Gate 4B/4E RPCs
-- (create_draft_invoice, bind_invoice_transaction, update_invoice_billing_
-- metadata, register_invoice_number, issue_invoice — already proven correct
-- by invoice_evidence_binding.test.sql / invoice_billing_metadata_
-- cardinality.test.sql) rather than raw inserts, then exercises only the
-- NEW Gate 4F surface: record_invoice_delivery_event's issued-only gate,
-- valid-transition/precondition checks, idempotent-repeat behavior,
-- append-only enforcement, and tenant/role isolation.
--
-- Self-contained: distinct tenant/user ids from every other pgTAP file in
-- this directory; rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('55555555-5555-4555-8555-555555555555', 'pgtap-invoice-delivery-tenant-p', 'PgTAP Invoice Delivery Tenant P', 'active'),
  ('66666666-6666-4666-8666-666666666666', 'pgtap-invoice-delivery-tenant-q', 'PgTAP Invoice Delivery Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-5555-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-invdel.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-5555-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-invdel.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-5555-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-p@pgtap-invdel.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-5555-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-p@pgtap-invdel.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-6666-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-invdel.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('50000000-4444-0000-0000-000000000001', '55555555-5555-4555-8555-555555555555', '00000000-5555-4444-0000-000000000001', 'active'),
  ('50000000-4444-0000-0000-000000000002', '55555555-5555-4555-8555-555555555555', '00000000-5555-4444-0000-000000000002', 'active'),
  ('50000000-4444-0000-0000-000000000003', '55555555-5555-4555-8555-555555555555', '00000000-5555-4444-0000-000000000003', 'active'),
  ('50000000-4444-0000-0000-000000000004', '55555555-5555-4555-8555-555555555555', '00000000-5555-4444-0000-000000000004', 'active'),
  ('60000000-4444-0000-0000-000000000001', '66666666-6666-4666-8666-666666666666', '00000000-6666-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('50000000-4444-0000-0000-000000000001', 'owner'),
  ('50000000-4444-0000-0000-000000000002', 'admin'),
  ('50000000-4444-0000-0000-000000000003', 'reviewer'),
  ('50000000-4444-0000-0000-000000000004', 'viewer'),
  ('60000000-4444-0000-0000-000000000001', 'owner');

insert into public.legal_entities (id, tenant_id, display_name, status) values
  ('50000000-0000-0000-0000-0000000000a9', '55555555-5555-4555-8555-555555555555', 'Anchor Legal Entity P', 'active'),
  ('60000000-0000-0000-0000-0000000000a9', '66666666-6666-4666-8666-666666666666', 'Anchor Legal Entity Q', 'active');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('50000000-0000-0000-0000-0000000000c1', '55555555-5555-4555-8555-555555555555', 'CL-P-ANCHOR', 'Anchor Client P', '00000000-5555-4444-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000c1', '66666666-6666-4666-8666-666666666666', 'CL-Q-ANCHOR', 'Anchor Client Q', '00000000-6666-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('50000000-0000-0000-0000-0000000000a1', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000c1', 'VS-P-ANCHOR', 'KM Anchor P', '00000000-5555-4444-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000a1', '66666666-6666-4666-8666-666666666666', '60000000-0000-0000-0000-0000000000c1', 'VS-Q-ANCHOR', 'KM Anchor Q', '00000000-6666-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('50000000-0000-0000-0000-0000000000b1', '55555555-5555-4555-8555-555555555555', 'anchor-service', 'Anchor Service P'),
  ('60000000-0000-0000-0000-0000000000b1', '66666666-6666-4666-8666-666666666666', 'anchor-service', 'Anchor Service Q');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('50000000-0000-0000-0000-0000000000f1', '55555555-5555-4555-8555-555555555555', 'FL-P-ANCHOR', 'Anchor Facility P'),
  ('60000000-0000-0000-0000-0000000000f1', '66666666-6666-4666-8666-666666666666', 'FL-Q-ANCHOR', 'Anchor Facility Q');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('50000000-0000-0000-0000-0000000000e1', '55555555-5555-4555-8555-555555555555', 'anchor-category', 'Anchor Category P'),
  ('60000000-0000-0000-0000-0000000000e1', '66666666-6666-4666-8666-666666666666', 'anchor-category', 'Anchor Category Q');

-- Five closed projects in tenant P (one per invoice this file needs), one
-- closed project in tenant Q.
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('50000000-0000-0000-0000-0000000000a2', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000f1', 'ID-PROJECT-A', 'active', '2033-01-01', '00000000-5555-4444-0000-000000000001'),
  ('50000000-0000-0000-0000-0000000000a3', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000f1', 'ID-PROJECT-B', 'active', '2033-01-01', '00000000-5555-4444-0000-000000000001'),
  ('50000000-0000-0000-0000-0000000000a4', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000f1', 'ID-PROJECT-C', 'active', '2033-01-01', '00000000-5555-4444-0000-000000000001'),
  ('50000000-0000-0000-0000-0000000000a5', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000f1', 'ID-PROJECT-D', 'active', '2033-01-01', '00000000-5555-4444-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('60000000-0000-0000-0000-0000000000a2', '66666666-6666-4666-8666-666666666666', '60000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000f1', 'ID-PROJECT-Q', 'active', '2033-01-01', '00000000-6666-4444-0000-000000000001');

insert into public.cash_pools (id, tenant_id, business_date, created_by) values
  ('50000000-0000-0000-0000-0000000000d1', '55555555-5555-4555-8555-555555555555', '2033-01-01', '00000000-5555-4444-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000d1', '66666666-6666-4666-8666-666666666666', '2033-01-01', '00000000-6666-4444-0000-000000000001');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('51000000-0000-0000-0000-000000000001', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000a2', '50000000-0000-0000-0000-0000000000e1', 'expense', 500000.00, 'id bindable expense A'),
  ('51000000-0000-0000-0000-000000000002', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000a3', '50000000-0000-0000-0000-0000000000e1', 'expense', 300000.00, 'id bindable expense B'),
  ('51000000-0000-0000-0000-000000000003', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000a4', '50000000-0000-0000-0000-0000000000e1', 'expense', 200000.00, 'id bindable expense C'),
  ('51000000-0000-0000-0000-000000000004', '55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000a5', '50000000-0000-0000-0000-0000000000e1', 'expense', 100000.00, 'id bindable expense D (kept draft)');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('61000000-0000-0000-0000-000000000001', '66666666-6666-4666-8666-666666666666', '60000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000e1', 'expense', 400000.00, 'id bindable expense Q');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a2', 'closed', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a3', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a3', 'closed', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a4', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a4', 'closed', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a5', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('50000000-0000-0000-0000-0000000000a5', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-6666-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('60000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('60000000-0000-0000-0000-0000000000a2', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

-- Helper: build an ISSUED invoice bound to the given tenant/legal-entity/
-- project/entry, with a distinct invoice number per call. Parametrized by
-- tenant so it is reusable for both tenant P and tenant Q fixtures below.
create or replace function pgtap_issue_invoice(p_tenant_id uuid, p_legal_entity_id uuid, p_project_id uuid, p_entry_id uuid, p_number text)
returns uuid
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  select (public.create_draft_invoice(p_tenant_id, p_project_id)).id into v_invoice_id;
  perform public.bind_invoice_transaction(v_invoice_id, p_entry_id);
  perform public.update_invoice_billing_metadata(v_invoice_id, p_legal_entity_id, '2033-01-05', '2033-02-05');
  perform public.register_invoice_number(v_invoice_id, p_number);
  perform public.issue_invoice(v_invoice_id);
  return v_invoice_id;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

create temporary table pgtap_id_invoice_a as select pgtap_issue_invoice('55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a9', '50000000-0000-0000-0000-0000000000a2', '51000000-0000-0000-0000-000000000001', 'ID-INV-A') as id;
create temporary table pgtap_id_invoice_b as select pgtap_issue_invoice('55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a9', '50000000-0000-0000-0000-0000000000a3', '51000000-0000-0000-0000-000000000002', 'ID-INV-B') as id;
create temporary table pgtap_id_invoice_c as select pgtap_issue_invoice('55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a9', '50000000-0000-0000-0000-0000000000a4', '51000000-0000-0000-0000-000000000003', 'ID-INV-C') as id;
grant select on pgtap_id_invoice_a, pgtap_id_invoice_b, pgtap_id_invoice_c to authenticated;

-- Invoice D stays draft (never issued) — used for the "draft rejected" test.
create temporary table pgtap_id_invoice_d as
  select (public.create_draft_invoice('55555555-5555-4555-8555-555555555555', '50000000-0000-0000-0000-0000000000a5')).id as id;
grant select on pgtap_id_invoice_d to authenticated;

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-6666-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
create temporary table pgtap_id_invoice_q as select pgtap_issue_invoice('66666666-6666-4666-8666-666666666666', '60000000-0000-0000-0000-0000000000a9', '60000000-0000-0000-0000-0000000000a2', '61000000-0000-0000-0000-000000000001', 'ID-INV-Q') as id;
grant select on pgtap_id_invoice_q to authenticated;
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'invoice_delivery_events', 'public.invoice_delivery_events exists');
select has_type('public', 'invoice_delivery_event_channel', 'invoice_delivery_event_channel enum exists');
select has_type('public', 'invoice_delivery_event_type', 'invoice_delivery_event_type enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.invoice_delivery_event_channel'::regtype)
    = array['email', 'whatsapp', 'manual'],
  'invoice_delivery_event_channel is exactly email/whatsapp/manual'
);
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.invoice_delivery_event_type'::regtype)
    = array['sent', 'delivered', 'acknowledged', 'failed'],
  'invoice_delivery_event_type is exactly sent/delivered/acknowledged/failed'
);

-- =============================================================================
-- DRAFT INVOICE REJECTED
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_d)
  ),
  'invoice must be issued before recording a delivery event',
  'a draft invoice is rejected for delivery recording'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- ROLE ENFORCEMENT — reviewer/viewer rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'not authorized to record invoice delivery event',
  'reviewer cannot record a delivery event'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'not authorized to record invoice delivery event',
  'viewer cannot record a delivery event'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- HAPPY PATH — sent -> delivered -> acknowledged, with actor/timestamp
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'owner P records a sent event on issued invoice A'
);

select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a)),
  1,
  'exactly one event row exists after the first sent'
);

select ok(
  (select recorded_by from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a) order by event_seq desc limit 1)
    = '00000000-5555-4444-0000-000000000001',
  'recorded_by is stamped server-side with the actual caller'
);
select ok(
  (select created_at from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a) order by event_seq desc limit 1) is not null,
  'created_at (event timestamp) is stamped server-side'
);

-- Idempotent repeat: identical channel+event_type+recipient does not insert
-- a second row.
select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'an identical repeat of the sent event is accepted (idempotent), not rejected'
);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a)),
  1,
  'duplicate/idempotency safe: the identical repeat did not create a second row'
);

select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'delivered'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'owner P records a delivered event after sent'
);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a)),
  2,
  'a genuinely new event_type (delivered) does append a new row'
);

select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'manual'::public.invoice_delivery_event_channel, 'acknowledged'::public.invoice_delivery_event_type, 'Pak Budi (PIC Finance)', null, null, 'Dikonfirmasi lewat telepon') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'owner P records a manual acknowledgment after delivered — the full sent -> delivered -> acknowledged chain'
);
select is(
  (select event_type from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a) order by event_seq desc limit 1)::text,
  'acknowledged',
  'the latest event for invoice A is now acknowledged'
);
select is(
  (select acknowledgment_note from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a) order by event_seq desc limit 1),
  'Dikonfirmasi lewat telepon',
  'the acknowledgment note is stored'
);

-- =============================================================================
-- TERMINAL STATE — acknowledged blocks any further event
-- =============================================================================

select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'someone-else@client.co') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'invoice delivery is already acknowledged; no further events allowed',
  'invalid transition: a new event after acknowledged is rejected'
);

-- An exact repeat of the acknowledged event is still idempotent even though
-- the invoice is in the terminal state.
select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'manual'::public.invoice_delivery_event_channel, 'acknowledged'::public.invoice_delivery_event_type, 'Pak Budi (PIC Finance)', null, null, 'Dikonfirmasi lewat telepon') $$,
    (select id from pgtap_id_invoice_a)
  ),
  'an identical repeat of the acknowledged event is idempotent even in the terminal state'
);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a)),
  3,
  'the terminal-state idempotent repeat did not append a new row'
);

-- =============================================================================
-- INVALID TRANSITIONS — delivered/acknowledged without a valid predecessor
-- =============================================================================

-- Invoice B: delivered as the very first event is rejected (no prior sent).
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'delivered'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_b)
  ),
  'delivered requires a prior sent event',
  'invalid transition: delivered with no prior sent is rejected'
);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_b)),
  0,
  'invoice B has no event rows after the rejected delivered attempt'
);

-- Invoice C: acknowledged as the very first event is rejected (no prior
-- sent/delivered) — "acknowledgment tanpa delivery ditolak".
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'manual'::public.invoice_delivery_event_channel, 'acknowledged'::public.invoice_delivery_event_type, 'Pak Budi') $$,
    (select id from pgtap_id_invoice_c)
  ),
  'acknowledgment requires a prior sent or delivered event',
  'acknowledgment without any prior delivery/sent event is rejected'
);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_c)),
  0,
  'invoice C has no event rows after the rejected acknowledgment attempt'
);

-- A failed attempt without a failure_reason is rejected; a failed attempt
-- with a failure_reason is accepted as the first event (no precondition on
-- `failed`), and then a subsequent `sent` retry is a valid transition.
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'whatsapp'::public.invoice_delivery_event_channel, 'failed'::public.invoice_delivery_event_type, '0812xxxx') $$,
    (select id from pgtap_id_invoice_c)
  ),
  'failure reason is required for a failed delivery event',
  'a failed event without a failure_reason is rejected'
);
select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'whatsapp'::public.invoice_delivery_event_channel, 'failed'::public.invoice_delivery_event_type, '0812xxxx', null, 'Nomor tidak aktif') $$,
    (select id from pgtap_id_invoice_c)
  ),
  'a failed event as the first-ever event for an invoice is allowed'
);
select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'whatsapp'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, '0812yyyy') $$,
    (select id from pgtap_id_invoice_c)
  ),
  'a sent retry after a failed event is a valid transition'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CROSS-TENANT ISOLATION
-- =============================================================================

-- Owner P cannot record an event on tenant Q's invoice.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic@client.co') $$,
    (select id from pgtap_id_invoice_q)
  ),
  'not authorized to record invoice delivery event',
  'cross-tenant write is rejected: owner P cannot record a delivery event on tenant Q''s invoice'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Record one event for tenant Q's invoice (as owner Q), then verify owner P
-- cannot read it and owner Q can.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-6666-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  format(
    $$ select public.record_invoice_delivery_event(%L, 'email'::public.invoice_delivery_event_channel, 'sent'::public.invoice_delivery_event_type, 'pic-q@client.co') $$,
    (select id from pgtap_id_invoice_q)
  ),
  'owner Q records a sent event on their own issued invoice'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_q)),
  0,
  'cross-tenant read is rejected: owner P sees zero rows for tenant Q''s invoice event'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-6666-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_q)),
  1,
  'owner Q can read their own tenant''s delivery event'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer P cannot read invoice A's events either (RLS is owner+
-- admin only, same precedent as invoices/invoice_evidence).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-5555-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.invoice_delivery_events where invoice_id = (select id from pgtap_id_invoice_a)),
  0,
  'reviewer cannot read invoice A''s delivery events'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- APPEND-ONLY — no UPDATE, no DELETE, for any caller
-- =============================================================================

select throws_ok(
  format(
    $$ update public.invoice_delivery_events set recipient_snapshot = 'tampered' where invoice_id = %L $$,
    (select id from pgtap_id_invoice_a)
  ),
  'invoice_delivery_events is append-only: UPDATE not allowed',
  'a raw UPDATE on invoice_delivery_events is rejected regardless of caller'
);
select throws_ok(
  format(
    $$ delete from public.invoice_delivery_events where invoice_id = %L $$,
    (select id from pgtap_id_invoice_a)
  ),
  'invoice_delivery_events is append-only: DELETE not allowed',
  'a raw DELETE on invoice_delivery_events is rejected regardless of caller'
);

-- =============================================================================
-- STRUCTURAL SHAPE CONSTRAINTS — role-independent, fire on raw INSERT too
-- =============================================================================

select throws_ok(
  format(
    $$ insert into public.invoice_delivery_events (tenant_id, invoice_id, channel, event_type, recipient_snapshot, failure_reason)
       values ('55555555-5555-4555-8555-555555555555', %L, 'email', 'failed', 'pic@client.co', null) $$,
    (select id from pgtap_id_invoice_a)
  ),
  '23514',
  null,
  'a raw insert of a failed event without failure_reason violates the failure-shape check'
);
select throws_ok(
  format(
    $$ insert into public.invoice_delivery_events (tenant_id, invoice_id, channel, event_type, recipient_snapshot, acknowledgment_note)
       values ('55555555-5555-4555-8555-555555555555', %L, 'email', 'sent', 'pic@client.co', 'should not be allowed') $$,
    (select id from pgtap_id_invoice_a)
  ),
  '23514',
  null,
  'a raw insert of a non-acknowledged event with an acknowledgment_note violates the acknowledgment-shape check'
);
select throws_ok(
  format(
    $$ insert into public.invoice_delivery_events (tenant_id, invoice_id, channel, event_type, recipient_snapshot)
       values ('55555555-5555-4555-8555-555555555555', %L, 'email', 'sent', '   ') $$,
    (select id from pgtap_id_invoice_a)
  ),
  '23514',
  null,
  'a raw insert with a blank recipient_snapshot violates the non-blank check'
);

select * from finish();
rollback;
