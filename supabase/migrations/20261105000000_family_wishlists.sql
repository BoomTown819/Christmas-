-- =====================================================================
-- Family Christmas Wishlists: schema, row level security, secure RPCs
--
-- THE ONE RULE: a wishlist owner can never learn whether anything on their
-- own list has been claimed or bought. Claims live in gift_claims, which has
-- RLS on with NO policies and no table grants for anon/authenticated, so the
-- only way to read or change it is through the security-definer functions
-- below, each of which refuses (or returns nothing) when the caller owns the list.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- helpers ----------------------------------------------------

-- Random URL-safe token (default 12 chars ≈ 71 bits).
create or replace function public.random_token(len int default 12)
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
         (get_byte(gen_random_bytes(1), 0) % 56) + 1, 1), '')
  from generate_series(1, len);
$$;

-- Human-friendly invitation code, e.g. "K7QM-3XPA".
create or replace function public.random_invite_code()
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(gen_random_bytes(1), 0) % 32) + 1, 1), '')
  from generate_series(1, 8);
$$;

-- ---------- tables -----------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar       text not null default 'santa',
  avatar_color text not null default 'red',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.wishlists (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references public.profiles (id) on delete cascade,
  title             text not null default 'My Christmas Wishlist' check (char_length(title) between 1 and 80),
  -- Secret, unguessable public link id: /list/<share_slug>. Never derived from a name.
  share_slug        text not null unique default public.random_token(12),
  share_with_family boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.wishlist_items (
  id                 uuid primary key default gen_random_uuid(),
  wishlist_id        uuid not null references public.wishlists (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 200),
  url                text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  price_cents        integer not null check (price_cents between 0 and 100000000),
  rating             numeric(2, 1) not null check (rating between 0.5 and 5 and (rating * 2) = trunc(rating * 2)),
  description        text not null default '' check (char_length(description) <= 600),
  description_source text not null default '' check (description_source in ('', 'ai', 'page', 'manual')),
  reason             text not null default '' check (char_length(reason) <= 1000),  -- "why I want it": visible to gift buyers
  image_url          text not null default '' check (image_url = '' or (image_url ~* '^https?://' and char_length(image_url) <= 2000)),
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index wishlist_items_wishlist_idx on public.wishlist_items (wishlist_id, position);

-- Private notes are a separate table so row level security keeps them owner-only.
create table public.item_private_notes (
  item_id    uuid primary key references public.wishlist_items (id) on delete cascade,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  note       text not null default '' check (char_length(note) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('organizer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id);

create table public.family_invitations (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  code       text not null unique default public.random_invite_code(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  revoked_at timestamptz
);

-- One active claim per item. The unique constraint is what stops two buyers
-- claiming the same gift at the same moment.
create table public.gift_claims (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null unique references public.wishlist_items (id) on delete cascade,
  wishlist_id      uuid not null references public.wishlists (id) on delete cascade,
  claimer_id       uuid references auth.users (id) on delete cascade,  -- null for guests without an account
  claimer_name     text not null check (char_length(claimer_name) between 1 and 40),
  claimer_email    text check (claimer_email is null or char_length(claimer_email) <= 200), -- never returned to anyone
  guest_token_hash text,           -- sha256 of a secret kept in the guest's browser, lets them cancel
  status           text not null default 'claimed' check (status in ('claimed', 'purchased')),
  purchased_at     timestamptz,    -- gift purchase status: set when the buyer marks it bought
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (claimer_id is not null or guest_token_hash is not null)
);

-- ---------- access helpers (security definer so policies don't recurse) ----

create or replace function public.is_family_member(fid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = uid);
$$;

create or replace function public.is_family_organizer(fid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = uid and role = 'organizer');
$$;

create or replace function public.shares_family(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from family_members m1 join family_members m2 on m1.family_id = m2.family_id
    where m1.user_id = a and m2.user_id = b);
$$;

create or replace function public.owns_wishlist(wid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from wishlists where id = wid and owner_id = uid);
$$;

create or replace function public.can_view_wishlist(wid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wishlists w
    where w.id = wid and (w.owner_id = uid or (w.share_with_family and public.shares_family(w.owner_id, uid))));
$$;

-- ---------- row level security ----------------------------------------

alter table public.profiles           enable row level security;
alter table public.wishlists          enable row level security;
alter table public.wishlist_items     enable row level security;
alter table public.item_private_notes enable row level security;
alter table public.families           enable row level security;
alter table public.family_members     enable row level security;
alter table public.family_invitations enable row level security;
alter table public.gift_claims        enable row level security;

-- Anonymous visitors get nothing from tables directly; public lists are served by RPC.
revoke all on all tables in schema public from anon;
-- Nobody but the server-side functions touches gift claims.
revoke all on public.gift_claims from anon, authenticated;

create policy "profiles: read self or family" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_family(id, auth.uid()));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "wishlists: read own or family-shared" on public.wishlists for select to authenticated
  using (public.can_view_wishlist(id));
create policy "wishlists: owner updates" on public.wishlists for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "items: read if wishlist visible" on public.wishlist_items for select to authenticated
  using (public.can_view_wishlist(wishlist_id));
create policy "items: owner inserts" on public.wishlist_items for insert to authenticated
  with check (public.owns_wishlist(wishlist_id));
create policy "items: owner updates" on public.wishlist_items for update to authenticated
  using (public.owns_wishlist(wishlist_id)) with check (public.owns_wishlist(wishlist_id));
create policy "items: owner deletes" on public.wishlist_items for delete to authenticated
  using (public.owns_wishlist(wishlist_id));

create policy "notes: owner only" on public.item_private_notes for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (
    select 1 from wishlist_items i join wishlists w on w.id = i.wishlist_id
    where i.id = item_id and w.owner_id = auth.uid()));

create policy "families: members read" on public.families for select to authenticated
  using (public.is_family_member(id));
create policy "families: organizer renames" on public.families for update to authenticated
  using (public.is_family_organizer(id))
  with check (true);

create policy "members: members read" on public.family_members for select to authenticated
  using (public.is_family_member(family_id));
create policy "members: leave or organizer removes" on public.family_members for delete to authenticated
  using (user_id = auth.uid() or public.is_family_organizer(family_id));

create policy "invites: members read" on public.family_invitations for select to authenticated
  using (public.is_family_member(family_id));
create policy "invites: members revoke" on public.family_invitations for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

-- Column-level hardening: clients may only change these columns.
revoke update on public.wishlists from authenticated;
grant update (title, share_with_family) on public.wishlists to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar, avatar_color, updated_at) on public.profiles to authenticated;
revoke update on public.families from authenticated;
grant update (name) on public.families to authenticated;
revoke update on public.family_invitations from authenticated;
grant update (revoked_at) on public.family_invitations to authenticated;
revoke insert, delete on public.profiles, public.wishlists, public.families, public.family_invitations from authenticated;
revoke insert, update on public.family_members from authenticated;

-- ---------- new account: profile + wishlist ---------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nm text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  insert into profiles (id, display_name, avatar, avatar_color)
  values (new.id,
          left(coalesce(nm, split_part(new.email, '@', 1), 'Friend'), 40),
          coalesce(new.raw_user_meta_data ->> 'avatar', 'santa'),
          coalesce(new.raw_user_meta_data ->> 'avatar_color', 'red'));
  insert into wishlists (owner_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger items_touch before update on public.wishlist_items for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- New items go to the end of the owner's custom order.
create or replace function public.item_default_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position from wishlist_items where wishlist_id = new.wishlist_id;
  end if;
  return new;
end $$;
create trigger items_position before insert on public.wishlist_items for each row execute function public.item_default_position();

-- ---------- owner RPCs -------------------------------------------------

-- Save a custom order (drag to rearrange).
create or replace function public.reorder_items(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare wid uuid;
begin
  select id into wid from wishlists where owner_id = auth.uid();
  if wid is null then raise exception 'not signed in'; end if;
  update wishlist_items i set position = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where i.id = o.id and i.wishlist_id = wid;
end $$;

-- Make a new secret link (old link stops working).
create or replace function public.regenerate_share_slug()
returns text language plpgsql security definer set search_path = public as $$
declare s text;
begin
  update wishlists set share_slug = random_token(12) where owner_id = auth.uid() returning share_slug into s;
  if s is null then raise exception 'not signed in'; end if;
  return s;
end $$;

-- ---------- families ---------------------------------------------------

create or replace function public.create_family(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the family a name.'; end if;
  insert into families (name, created_by) values (left(trim(p_name), 60), auth.uid()) returning id into fid;
  insert into family_members (family_id, user_id, role) values (fid, auth.uid(), 'organizer');
  insert into family_invitations (family_id, created_by) values (fid, auth.uid());
  return fid;
end $$;

create or replace function public.create_invitation(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_family_member(p_family_id) then raise exception 'not a member of this family'; end if;
  insert into family_invitations (family_id, created_by) values (p_family_id, auth.uid()) returning code into c;
  return c;
end $$;

-- What an invitation link shows before you join (works signed out).
create or replace function public.get_invitation(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'family_name', f.name,
    'invited_by', p.display_name,
    'member_count', (select count(*) from family_members m where m.family_id = f.id),
    'already_member', coalesce(is_family_member(f.id), false))
  from family_invitations i join families f on f.id = i.family_id join profiles p on p.id = i.created_by
  where i.code = upper(replace(trim(p_code), '-', '')) and i.revoked_at is null and i.expires_at > now();
$$;

create or replace function public.join_family(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join a family.'; end if;
  select family_id into fid from family_invitations
  where code = upper(replace(trim(p_code), '-', '')) and revoked_at is null and expires_at > now();
  if fid is null then raise exception 'That invitation code is not valid or has expired.'; end if;
  insert into family_members (family_id, user_id) values (fid, auth.uid()) on conflict do nothing;
  return fid;
end $$;

-- Leaving: if the last organizer leaves, the longest-standing member takes over.
create or replace function public.leave_family(p_family_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from family_members where family_id = p_family_id and user_id = auth.uid();
  if not exists (select 1 from family_members where family_id = p_family_id) then
    delete from families where id = p_family_id;
  elsif not exists (select 1 from family_members where family_id = p_family_id and role = 'organizer') then
    update family_members set role = 'organizer'
    where (family_id, user_id) = (select family_id, user_id from family_members where family_id = p_family_id order by joined_at limit 1);
  end if;
end $$;

-- "OUR CHRISTMAS" dashboard. Availability counts are only included for OTHER people's lists.
create or replace function public.get_family_dashboard(p_family_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not is_family_member(p_family_id, me) then raise exception 'not a member of this family'; end if;
  return jsonb_build_object(
    'family', (select jsonb_build_object('id', f.id, 'name', f.name,
                 'my_role', (select role from family_members where family_id = f.id and user_id = me))
               from families f where f.id = p_family_id),
    'members', coalesce((
      select jsonb_agg(card order by (card ->> 'is_me')::boolean desc, card ->> 'display_name')
      from (
        select jsonb_strip_nulls(jsonb_build_object(
          'user_id', p.id,
          'display_name', p.display_name,
          'avatar', p.avatar,
          'avatar_color', p.avatar_color,
          'role', m.role,
          'is_me', p.id = me,
          'shared', w.share_with_family,
          'share_slug', case when w.share_with_family or p.id = me then w.share_slug end,
          'item_count', case when w.share_with_family or p.id = me then (select count(*) from wishlist_items i where i.wishlist_id = w.id) end,
          'preview', case when w.share_with_family or p.id = me then (
              select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'image_url', x.image_url, 'rating', x.rating)), '[]'::jsonb)
              from (select name, image_url, rating from wishlist_items i where i.wishlist_id = w.id
                    order by rating desc, position limit 3) x) end,
          -- secret: never computed for the viewer's own list
          'available_count', case when p.id <> me and w.share_with_family then (
              select count(*) from wishlist_items i where i.wishlist_id = w.id
              and not exists (select 1 from gift_claims c where c.item_id = i.id)) end
        )) as card
        from family_members m join profiles p on p.id = m.user_id join wishlists w on w.owner_id = p.id
        where m.family_id = p_family_id
      ) cards), '[]'::jsonb),
    'invite_code', (select code from family_invitations where family_id = p_family_id and revoked_at is null
                    and expires_at > now() order by created_at desc limit 1));
end $$;

-- ---------- public wishlist (anyone with the link) ----------------------

-- Items and owner info only. Contains no claim information for anyone.
create or replace function public.get_public_wishlist(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', w.id,
    'title', w.title,
    'slug', w.share_slug,
    'viewer_is_owner', coalesce(w.owner_id = auth.uid(), false),
    'owner', jsonb_build_object('display_name', p.display_name, 'avatar', p.avatar, 'avatar_color', p.avatar_color),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'url', i.url, 'price_cents', i.price_cents, 'rating', i.rating,
        'description', i.description, 'description_source', i.description_source, 'reason', i.reason,
        'image_url', i.image_url, 'position', i.position, 'created_at', i.created_at) order by i.position)
      from wishlist_items i where i.wishlist_id = w.id), '[]'::jsonb))
  from wishlists w join profiles p on p.id = w.owner_id
  where w.share_slug = p_slug;
$$;

-- Claim status for gift buyers. Returns NO ROWS when the caller owns the list,
-- which looks exactly like a list with no claims.
create or replace function public.get_claims(p_slug text, p_guest_tokens text[] default '{}')
returns table (item_id uuid, status text, claimer_name text, is_mine boolean, claimed_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select c.item_id, c.status, c.claimer_name,
         (c.claimer_id is not null and c.claimer_id = auth.uid())
           or (c.guest_token_hash is not null and c.guest_token_hash = any (
                select encode(digest(t, 'sha256'), 'hex') from unnest(p_guest_tokens) t)),
         c.created_at
  from gift_claims c join wishlists w on w.id = c.wishlist_id
  where w.share_slug = p_slug
    and w.owner_id is distinct from auth.uid();
$$;

-- Internal: resolve an item on a list reached by its link, refusing the owner.
-- The owner check comes FIRST so an owner can never learn "already claimed".
create or replace function public._claimable_item(p_slug text, p_item_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare w record;
begin
  select wl.* into w from wishlists wl join wishlist_items i on i.wishlist_id = wl.id
  where wl.share_slug = p_slug and i.id = p_item_id;
  if w.id is null then raise exception 'That item is no longer on this wishlist.' using errcode = 'P0002'; end if;
  if w.owner_id = auth.uid() then raise exception 'You can’t claim gifts on your own wishlist.' using errcode = '42501'; end if;
  return w.id;
end $$;

create or replace function public.claim_item(p_slug text, p_item_id uuid, p_name text, p_email text default null, p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare wid uuid; nm text := left(trim(coalesce(p_name, '')), 40);
begin
  wid := _claimable_item(p_slug, p_item_id);
  if nm = '' then raise exception 'Add your name so other gift buyers know who has this.' using errcode = '22023'; end if;
  if auth.uid() is null and coalesce(length(p_guest_token), 0) < 20 then
    raise exception 'Missing guest token.' using errcode = '22023';
  end if;
  begin
    insert into gift_claims (item_id, wishlist_id, claimer_id, claimer_name, claimer_email, guest_token_hash)
    values (p_item_id, wid, auth.uid(), nm, nullif(left(trim(coalesce(p_email, '')), 200), ''),
            case when p_guest_token is not null then encode(digest(p_guest_token, 'sha256'), 'hex') end);
  exception when unique_violation then
    raise exception 'Someone else just claimed this gift.' using errcode = '23505';
  end;
  return jsonb_build_object('item_id', p_item_id, 'status', 'claimed');
end $$;

create or replace function public._my_claim(p_slug text, p_item_id uuid, p_guest_token text)
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare cid uuid;
begin
  perform _claimable_item(p_slug, p_item_id);
  select c.id into cid from gift_claims c where c.item_id = p_item_id and (
    (c.claimer_id is not null and c.claimer_id = auth.uid()) or
    (p_guest_token is not null and c.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex')));
  if cid is null then raise exception 'Only the person who claimed this gift can change it.' using errcode = '42501'; end if;
  return cid;
end $$;

create or replace function public.cancel_claim(p_slug text, p_item_id uuid, p_guest_token text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from gift_claims where id = _my_claim(p_slug, p_item_id, p_guest_token);
end $$;

create or replace function public.set_purchased(p_slug text, p_item_id uuid, p_purchased boolean, p_guest_token text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update gift_claims set status = case when p_purchased then 'purchased' else 'claimed' end,
         purchased_at = case when p_purchased then now() end, updated_at = now()
  where id = _my_claim(p_slug, p_item_id, p_guest_token);
end $$;

-- ---------- function privileges ---------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.get_public_wishlist(text), public.get_claims(text, text[]), public.claim_item(text, uuid, text, text, text),
  public.cancel_claim(text, uuid, text), public.set_purchased(text, uuid, boolean, text), public.get_invitation(text)
  to anon, authenticated;
grant execute on function
  public.reorder_items(uuid[]), public.regenerate_share_slug(), public.create_family(text), public.create_invitation(uuid),
  public.join_family(text), public.leave_family(uuid), public.get_family_dashboard(uuid),
  public.is_family_member(uuid, uuid), public.is_family_organizer(uuid, uuid), public.shares_family(uuid, uuid), public.owns_wishlist(uuid, uuid),
  public.can_view_wishlist(uuid, uuid)
  to authenticated;
-- Internal helpers stay private to definer functions.
revoke execute on function public._claimable_item(text, uuid), public._my_claim(text, uuid, text) from public, anon, authenticated;
grant execute on function public.random_token(int), public.random_invite_code() to authenticated, service_role;
grant execute on function public.touch_updated_at(), public.item_default_position(), public.handle_new_user() to authenticated;
