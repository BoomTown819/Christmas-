-- =====================================================================
-- Sign in with your name + a 4-6 digit PIN, on any device.
--
-- * account_pins : one row per person who has set a PIN. Holds their name
--                  (normalised, so "mom" and " Mom " are the same) and a
--                  bcrypt hash of the PIN. Names with a PIN are unique, so a
--                  name always leads back to the same account.
--                  Nobody can read this table; only the functions below use it.
-- * pin_login()  : checks name + PIN with a lockout after repeated wrong PINs,
--                  then gives the browser a fresh one-time password for that
--                  account so it can sign in normally. The password changes on
--                  every PIN login and is never stored in plain text.
-- =====================================================================

create or replace function public.name_key(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;

create table public.account_pins (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  name_key     text not null unique check (char_length(name_key) between 1 and 40),
  pin_hash     text not null,
  failed       int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.account_pins enable row level security;
revoke all on public.account_pins from anon, authenticated;

-- Internal address used only so the sign-in service can find the account. No email is ever sent to it.
create or replace function public._pin_login_email(uid uuid)
returns text language sql immutable as $$
  select 'pin-' || replace(uid::text, '-', '') || '@pin.our-christmas.app';
$$;

-- Is this name free, or does it already belong to someone with a PIN?
create or replace function public.name_status(p_name text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.name_key(p_name) = '' then 'empty'
    when exists (select 1 from account_pins where name_key = public.name_key(p_name)) then 'taken'
    else 'available' end;
$$;

-- Do I have a PIN yet?
create or replace function public.my_pin_status()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_pins where user_id = auth.uid());
$$;

-- Set or change my PIN. My current name becomes my sign-in name.
create or replace function public.set_account_pin(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  nm text;
  key text;
  login_email text;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'signed_out'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;
  select display_name into nm from profiles where id = me;
  key := public.name_key(nm);
  if key = '' then return jsonb_build_object('ok', false, 'reason', 'no_name'); end if;
  if exists (select 1 from account_pins where name_key = key and user_id <> me) then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end if;

  insert into account_pins (user_id, name_key, pin_hash)
  values (me, key, crypt(p_pin, gen_salt('bf', 10)))
  on conflict (user_id) do update
    set name_key = excluded.name_key, pin_hash = excluded.pin_hash, failed = 0, locked_until = null, updated_at = now();

  -- Give a name-only account a private sign-in address so it can be opened on other devices.
  login_email := public._pin_login_email(me);
  update auth.users
     set email = login_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         is_anonymous = false,
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'pin_login', true),
         updated_at = now()
   where id = me and (email is null or email = '');
  if not exists (select 1 from auth.identities where user_id = me and provider = 'email') then
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), me::text, me,
           jsonb_build_object('sub', me::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
           'email', now(), now(), now()
    from auth.users u where u.id = me and u.email is not null;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Name + PIN -> a one-time password for that account (or a reason it didn't work).
-- 5 wrong PINs lock the name for 15 minutes; each further 5 doubles it, up to a day.
create or replace function public.pin_login(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r account_pins%rowtype;
  secret text;
  login_email text;
  lock_minutes int;
begin
  select * into r from account_pins where name_key = public.name_key(p_name) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_account'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'minutes', ceil(extract(epoch from (r.locked_until - now())) / 60));
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' or crypt(p_pin, r.pin_hash) <> r.pin_hash then
    r.failed := r.failed + 1;
    if r.failed % 5 = 0 then
      lock_minutes := least(1440, 15 * power(2, (r.failed / 5) - 1)::int);
      update account_pins set failed = r.failed, locked_until = now() + make_interval(mins => lock_minutes) where user_id = r.user_id;
      return jsonb_build_object('ok', false, 'reason', 'locked', 'minutes', lock_minutes);
    end if;
    update account_pins set failed = r.failed where user_id = r.user_id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'tries_left', 5 - (r.failed % 5));
  end if;

  update account_pins set failed = 0, locked_until = null where user_id = r.user_id;
  secret := encode(gen_random_bytes(32), 'base64');
  select email into login_email from auth.users where id = r.user_id;
  if login_email is null then return jsonb_build_object('ok', false, 'reason', 'no_account'); end if;
  -- Accounts saved with a real email keep their own password; they log in with email.
  if login_email <> public._pin_login_email(r.user_id) then return jsonb_build_object('ok', false, 'reason', 'use_email'); end if;
  update auth.users set encrypted_password = crypt(secret, gen_salt('bf', 10)), updated_at = now() where id = r.user_id;
  return jsonb_build_object('ok', true, 'email', login_email, 'password', secret);
end $$;

-- Keep the sign-in name in step with the profile name (and stop two PIN accounts sharing a name).
create or replace function public.sync_pin_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.display_name is distinct from old.display_name then
    if exists (select 1 from account_pins where name_key = public.name_key(new.display_name) and user_id <> new.id)
       and exists (select 1 from account_pins where user_id = new.id) then
      raise exception 'name_taken: someone else already signs in with that name';
    end if;
    update account_pins set name_key = public.name_key(new.display_name), updated_at = now() where user_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_sync_pin_name after update of display_name on public.profiles
  for each row execute function public.sync_pin_name();

revoke execute on function public.set_account_pin(text), public.my_pin_status(), public.pin_login(text, text),
  public.name_status(text), public._pin_login_email(uuid), public.sync_pin_name(), public.name_key(text) from public, anon, authenticated;
grant execute on function public.name_status(text), public.pin_login(text, text) to anon, authenticated;
grant execute on function public.set_account_pin(text), public.my_pin_status() to authenticated;
grant execute on function public.name_key(text) to anon, authenticated;
