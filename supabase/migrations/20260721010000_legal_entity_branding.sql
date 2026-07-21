-- ADOP — Legal Entity Branding (Locked UI & Operational Safety Revision, Gate A)
--
-- legal_entities.legal_name has been nullable since Gate 0A with a comment
-- that the founder's legal entity name was not locked yet. It is now locked
-- (application seed data sets it, this migration only adds storage for the
-- accompanying logo asset path). No RLS/grant changes: logo_path is exposed
-- through the exact same SELECT policies legal_entities already has.
alter table public.legal_entities
  add column logo_path text;

comment on column public.legal_entities.logo_path is
  'Optional public/ path to this legal entity''s logo asset. Null is a valid, expected state for any tenant that has not been branded yet — application code must render a safe text-only fallback, never a fabricated logo.';
