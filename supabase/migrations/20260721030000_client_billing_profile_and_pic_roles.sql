-- ADOP — Client Billing Profile & PIC Roles (Locked UI & Operational Safety
-- Revision, Gate 3)
--
-- Additive only. clients.legal_name/address/tax_identifier already cover
-- "legal name", "billing address", and "tax/registration information" (see
-- 20260719080000_master_data.sql) — this migration adds only what does not
-- already exist: a payment-term default and an invoice-delivery preference
-- on the client, plus a PIC role and per-channel invoice/reminder recipient
-- flags on client_contacts (which already models name/jabatan/email/
-- WhatsApp/active-inactive/primary).

create type public.invoice_delivery_channel as enum ('whatsapp', 'email', 'both');
create type public.client_contact_role as enum ('operational', 'billing', 'finance', 'approver', 'other');

alter table public.clients
  add column default_payment_term_days integer check (default_payment_term_days is null or default_payment_term_days > 0),
  add column invoice_delivery_preference public.invoice_delivery_channel;

comment on column public.clients.default_payment_term_days is
  'Default payment term in days for new invoices. Null is valid — not every client has a term locked in yet.';
comment on column public.clients.invoice_delivery_preference is
  'Default channel preference for invoice delivery. Null is valid — actual delivery still targets each client_contacts row flagged as a recipient, this is only a default hint.';

-- position_department (free text) is kept as-is, additive alongside role —
-- this never reinterprets historical data, it only adds a new structured
-- field going forward.
alter table public.client_contacts
  add column role public.client_contact_role,
  add column receives_invoice_whatsapp boolean not null default false,
  add column receives_invoice_email boolean not null default false,
  add column receives_collection_reminder boolean not null default false;

comment on column public.client_contacts.role is
  'Structured PIC role (operational/billing/finance/approver/other), additive alongside the existing free-text position_department.';
comment on column public.client_contacts.receives_invoice_whatsapp is
  'True if this PIC should receive invoices via WhatsApp. Default false — no contact becomes a recipient without explicit opt-in.';
comment on column public.client_contacts.receives_invoice_email is
  'True if this PIC should receive invoices via email. Default false — no contact becomes a recipient without explicit opt-in.';
comment on column public.client_contacts.receives_collection_reminder is
  'True if this PIC should receive collection/payment reminders. Default false — no contact becomes a recipient without explicit opt-in.';

-- 20260719080000_master_data.sql grants column-level INSERT/UPDATE to
-- `authenticated` (never table-wide) — every new mutable column must be
-- added to that grant here, or an owner/admin write to it silently fails
-- with "permission denied for table clients"/client_contacts (Postgres
-- column-level GRANT is additive/cumulative, so this only adds to the
-- existing grant, it does not replace it).
grant insert (default_payment_term_days, invoice_delivery_preference) on public.clients to authenticated;
grant update (default_payment_term_days, invoice_delivery_preference) on public.clients to authenticated;

grant insert (role, receives_invoice_whatsapp, receives_invoice_email, receives_collection_reminder)
  on public.client_contacts to authenticated;
grant update (role, receives_invoice_whatsapp, receives_invoice_email, receives_collection_reminder)
  on public.client_contacts to authenticated;
