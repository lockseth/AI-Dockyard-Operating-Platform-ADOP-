-- ADOP — Gate 6J-C2: Client Verification RPC Lint Corrective
--
-- Root cause: 20260730000000's public.assistant_complete_client_verification_
-- by_address declares `v_matched_ids uuid[] := '{}';` — an untyped string
-- literal relying on implicit cast to uuid[], which `supabase db lint`
-- (plpgsql_check) flags. Fix: explicit `ARRAY[]::uuid[]` initializer.
--
-- CREATE OR REPLACE with an identical body except that one initializer line.
-- Signature, return contract, SECURITY DEFINER, search_path, authorization,
-- locking, ambiguity handling, and audit inserts are unchanged. Privileges
-- are re-stated (idempotent — matches 20260730000000 exactly) so this
-- migration is self-contained and does not depend on execution order beyond
-- following its parent. No table/RLS/policy/data/Auth/other-RPC change.

create or replace function public.assistant_complete_client_verification_by_address(
  p_channel text,
  p_whatsapp_number text,
  p_code text
)
returns table (outcome text, contact_id uuid, tenant_id uuid, verified_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.client_contacts%rowtype;
  v_matched_ids uuid[] := ARRAY[]::uuid[];
  v_matched_id uuid;
  v_digest text;
  v_now timestamptz := now();
  v_candidate_count int;
begin
  if p_channel is distinct from 'whatsapp' then
    raise exception 'Unsupported assistant channel: %', p_channel using errcode = '22023';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'code is required' using errcode = '22023';
  end if;
  v_digest := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  select count(*) into v_candidate_count
  from public.client_contacts cc
  where cc.whatsapp_number = p_whatsapp_number and cc.whatsapp_verification_status = 'pending';

  if v_candidate_count = 0 then
    return query select 'invalid_or_expired'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  -- Lock every still-pending candidate for this number across ALL tenants —
  -- a concurrent duplicate reply cannot double-complete the same row, and a
  -- single pass collects every digest match (there should never be more
  -- than one, since each row's code is independently random, but ambiguity
  -- must fail closed rather than pick one).
  for v_row in
    select * from public.client_contacts
    where whatsapp_number = p_whatsapp_number and whatsapp_verification_status = 'pending'
    order by created_at asc
    for update
  loop
    if v_row.whatsapp_verification_digest = v_digest then
      v_matched_ids := array_append(v_matched_ids, v_row.id);
    end if;
  end loop;

  if array_length(v_matched_ids, 1) is null then
    -- No candidate's digest matched: conservatively count the attempt
    -- against every still-pending candidate for this number, since we
    -- cannot tell which one the sender meant to target (mirrors
    -- assistant_complete_pairing's same conservative choice). No raise —
    -- this UPDATE must survive as part of a normal (non-erroring) return.
    update public.client_contacts
    set whatsapp_verification_attempt_count = whatsapp_verification_attempt_count + 1
    where whatsapp_number = p_whatsapp_number and whatsapp_verification_status = 'pending';

    return query select 'invalid_or_expired'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if array_length(v_matched_ids, 1) > 1 then
    -- Fail closed on cross-tenant ambiguity — never auto-merge/auto-pick.
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    )
    select cc.tenant_id, null, 'client_contact_verification', cc.id, 'client_verification_failed', null,
           jsonb_build_object('reason', 'ambiguous_cross_tenant_candidate')
    from public.client_contacts cc
    where cc.id = any (v_matched_ids);

    return query select 'ambiguous'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  v_matched_id := v_matched_ids[1];
  select * into v_row from public.client_contacts where id = v_matched_id for update;

  if v_row.whatsapp_verification_attempt_count >= 5 then
    return query select 'locked'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.whatsapp_verification_expires_at < v_now then
    return query select 'invalid_or_expired'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.status <> 'active' then
    return query select 'contact_inactive'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  -- Table alias `cc` required — same ambiguous-column reasoning as
  -- assistant_complete_client_verification (this function's own RETURNS
  -- TABLE also declares an OUT column named tenant_id).
  if exists (
    select 1 from public.client_contacts cc
    where cc.tenant_id = v_row.tenant_id and cc.whatsapp_number = p_whatsapp_number
      and cc.whatsapp_verification_status = 'verified' and cc.id <> v_row.id
  ) then
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_row.tenant_id, null, 'client_contact_verification', v_matched_id, 'client_verification_failed', null,
      jsonb_build_object('reason', 'number_already_verified_on_another_contact')
    );

    return query select 'duplicate_number'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  update public.client_contacts
  set whatsapp_verification_status = 'verified',
      whatsapp_verified_at = v_now,
      whatsapp_verification_digest = null,
      whatsapp_verification_expires_at = null
  where id = v_matched_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, null, 'client_contact_verification', v_matched_id, 'client_verification_completed', null,
    jsonb_build_object('whatsapp_number', p_whatsapp_number, 'resolved_cross_tenant', true)
  );

  return query select 'verified'::text, v_matched_id, v_row.tenant_id, v_now;
end;
$$;

revoke execute on function public.assistant_complete_client_verification_by_address(text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_complete_client_verification_by_address(text, text, text) to service_role;
