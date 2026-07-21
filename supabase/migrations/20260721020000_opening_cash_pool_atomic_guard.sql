-- ADOP — Opening Cash Atomic Duplicate Guard (Locked UI & Operational Safety
-- Revision, Gate 1)
--
-- 20260719110000_shared_daily_cash_pool.sql intentionally allows more than
-- one cash_top_up/other_cash_in entry per pool (legitimate — top-ups happen
-- throughout the day) but never added a matching guard for opening_cash,
-- which should be posted at most once per pool. The UI layer already
-- prevents an accidental double-post (confirmation step, disabled state),
-- but per LOCK rule "Jangan mengandalkan validasi UI saja. Pertahankan atau
-- tambahkan proteksi atomic server/database terhadap duplicate/concurrent
-- posting", the database must be the final, race-safe enforcement.
--
-- Design: cash_pools.opening_cash_posted is flipped from false to true by
-- the SAME statement/transaction that inserts the opening_cash entry, using
-- an `UPDATE ... WHERE opening_cash_posted = false` conditional update. Two
-- concurrent record_cash_pool_entry(..., 'opening_cash', ...) calls for the
-- same pool serialize on this row: whichever commits first flips the flag,
-- the second's UPDATE affects zero rows and the function raises — this is
-- the same "conflict target as concurrency guard" technique
-- get_or_create_daily_cash_pool already uses, just via UPDATE instead of
-- INSERT ON CONFLICT. If the posted opening_cash entry is later reversed,
-- reverse_cash_pool_entry resets the flag so a corrected entry can be
-- posted — the guard blocks a duplicate ACTIVE opening balance, not a
-- legitimate redo after reversal.

alter table public.cash_pools
  add column opening_cash_posted boolean not null default false;

comment on column public.cash_pools.opening_cash_posted is
  'Flips true atomically when an opening_cash entry is recorded, false again if that entry is reversed. Guards against duplicate/concurrent opening-balance posting for the same pool.';

create or replace function public.record_cash_pool_entry(
  p_pool_id uuid,
  p_entry_type public.cash_pool_entry_type,
  p_amount numeric,
  p_description text default null
)
returns public.cash_pool_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.cash_pool_entries;
  v_updated_rows int;
begin
  select tenant_id into v_tenant_id
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record daily cash pool entry';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_entry_type = 'opening_cash' then
    update public.cash_pools
    set opening_cash_posted = true
    where id = p_pool_id
      and opening_cash_posted = false;

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      raise exception 'opening cash already posted for this pool';
    end if;
  end if;

  insert into public.cash_pool_entries (
    tenant_id, pool_id, entry_type, entry_kind, amount, description, created_by
  ) values (
    v_tenant_id, p_pool_id, p_entry_type, 'entry', p_amount, p_description, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- Based on 20260720150000_atomic_paired_refund_reversal.sql's version (the
-- most recent prior definition — NOT the original Gate 1C one) so the
-- project_refund/PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL guard it added is
-- preserved; only the opening_cash_posted reset at the end is new here.
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

  -- Reversing the pool's opening_cash entry re-opens the guard so a
  -- corrected entry can be posted — this is a legitimate redo, not the
  -- duplicate-posting case the guard exists to prevent.
  if v_original.entry_type = 'opening_cash' then
    update public.cash_pools
    set opening_cash_posted = false
    where id = v_original.pool_id;
  end if;

  return v_result;
end;
$$;
