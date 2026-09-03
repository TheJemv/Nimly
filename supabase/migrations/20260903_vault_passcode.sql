-- Vault recovery passcode (6-digit PIN).
--
-- Used as the second factor for taking over the E2EE identity on a new device:
-- instead of re-entering the account password, the user enters this passcode.
-- The hash lives in its own table with RLS locked down — only the SECURITY
-- DEFINER functions below can read/write it, so a friend selecting your profile
-- never gets the hash, and attempt-limiting can't be tampered with by the client.

create extension if not exists pgcrypto;

create table if not exists public.vault_security (
    user_id         uuid primary key references auth.users (id) on delete cascade,
    passcode_hash   text not null,
    failed_attempts int  not null default 0,
    locked_until    timestamptz,
    updated_at      timestamptz not null default now()
);

alter table public.vault_security enable row level security;
-- No policies on purpose: the table is only reachable through the functions below.

-- Does the current user have a passcode set?
create or replace function public.has_vault_passcode()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (select 1 from public.vault_security where user_id = auth.uid());
$$;

-- Set / change the passcode. Must be logged in as self.
create or replace function public.set_vault_passcode(p_passcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if p_passcode !~ '^\d{6}$' then
        raise exception 'passcode must be exactly 6 digits';
    end if;

    insert into public.vault_security (user_id, passcode_hash, failed_attempts, locked_until, updated_at)
    values (auth.uid(), crypt(p_passcode, gen_salt('bf', 12)), 0, null, now())
    on conflict (user_id) do update
        set passcode_hash   = excluded.passcode_hash,
            failed_attempts = 0,
            locked_until    = null,
            updated_at      = now();
end;
$$;

-- Verify the passcode with attempt-limiting. Returns jsonb:
--   { ok: true }
--   { ok: false, reason: 'no_passcode' }
--   { ok: false, reason: 'locked', until: <ts> }
--   { ok: false, reason: 'wrong', attempts_left: <int> }
create or replace function public.verify_vault_passcode(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.vault_security%rowtype;
    v_ok  boolean;
    v_new_attempts int;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    select * into v_row from public.vault_security where user_id = auth.uid();

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'no_passcode');
    end if;

    if v_row.locked_until is not null and v_row.locked_until > now() then
        return jsonb_build_object('ok', false, 'reason', 'locked', 'until', v_row.locked_until);
    end if;

    v_ok := (v_row.passcode_hash = crypt(p_passcode, v_row.passcode_hash));

    if v_ok then
        update public.vault_security
            set failed_attempts = 0, locked_until = null, updated_at = now()
            where user_id = auth.uid();
        return jsonb_build_object('ok', true);
    end if;

    v_new_attempts := v_row.failed_attempts + 1;
    update public.vault_security
        set failed_attempts = v_new_attempts,
            locked_until = case when v_new_attempts >= 5 then now() + interval '15 minutes' else null end,
            updated_at = now()
        where user_id = auth.uid();

    return jsonb_build_object('ok', false, 'reason', 'wrong',
        'attempts_left', greatest(0, 5 - v_new_attempts));
end;
$$;

revoke all on function public.has_vault_passcode() from public, anon;
revoke all on function public.set_vault_passcode(text) from public, anon;
revoke all on function public.verify_vault_passcode(text) from public, anon;
grant execute on function public.has_vault_passcode() to authenticated;
grant execute on function public.set_vault_passcode(text) to authenticated;
grant execute on function public.verify_vault_passcode(text) to authenticated;
