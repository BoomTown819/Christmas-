-- =====================================================================
-- 8-bit Christmas characters
--
-- * characters        : one per person. The pixel sprite and optional AI GIF.
--                       Readable by the person and their family (RLS). Anyone else
--                       only ever sees one through an unguessable token handed out
--                       by the functions below.
-- * character_photos  : the original photo. Owner-only, never served to anyone.
-- * character_generations : log used to cap AI usage per person per day.
--
-- Secret gifts stay secret: claimer characters are only returned by get_claims,
-- which returns nothing at all to the wishlist owner.
-- =====================================================================

create table public.characters (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- Public, unguessable image id. Rotated on every regeneration.
  token         text not null unique default public.random_token(16),
  sprite_png    text check (sprite_png is null or (char_length(sprite_png) < 200000 and sprite_png ~ '^[A-Za-z0-9+/=]+$')),
  anim_gif      text check (anim_gif is null or (char_length(anim_gif) < 2000000 and anim_gif ~ '^[A-Za-z0-9+/=]+$')),
  -- 'ai' = an AI-made GIF exists; 'none' = not attempted; 'failed' = tried, fell back to in-browser animation
  anim_status   text not null default 'none' check (anim_status in ('none', 'ai', 'failed')),
  anim_note     text not null default '' check (char_length(anim_note) <= 300),
  activity      text not null default 'waving' check (activity in (
                  'waving', 'dancing', 'decorating', 'presents', 'snowman',
                  'cocoa', 'wrapping', 'sleigh', 'candycane', 'lights')),
  show_publicly boolean not null default true,  -- on my shared wishlist and next to my claims for anyone with a list link
  updated_at    timestamptz not null default now()
);

create table public.character_photos (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data       text not null check (char_length(data) < 4000000),
  updated_at timestamptz not null default now()
);

create table public.character_generations (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('still', 'animation')),
  created_at timestamptz not null default now()
);
create index character_generations_user_idx on public.character_generations (user_id, created_at);

alter table public.characters            enable row level security;
alter table public.character_photos      enable row level security;
alter table public.character_generations enable row level security;
revoke all on public.characters, public.character_photos, public.character_generations from anon;

create policy "characters: read self or family" on public.characters for select to authenticated
  using (user_id = auth.uid() or public.shares_family(user_id, auth.uid()));
create policy "characters: owner writes" on public.characters for insert to authenticated with check (user_id = auth.uid());
create policy "characters: owner updates" on public.characters for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "characters: owner deletes" on public.characters for delete to authenticated using (user_id = auth.uid());

create policy "photos: owner only" on public.character_photos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "generations: owner reads" on public.character_generations for select to authenticated using (user_id = auth.uid());
create policy "generations: owner logs" on public.character_generations for insert to authenticated with check (user_id = auth.uid());
revoke update, delete on public.character_generations from authenticated;

create trigger characters_touch before update on public.characters for each row execute function public.touch_updated_at();

-- Rotate the image token (busts caches) whenever a new sprite is saved.
create or replace function public.rotate_character_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.sprite_png is distinct from old.sprite_png then
    new.token := random_token(16);
  elsif tg_op = 'UPDATE' and new.anim_gif is distinct from old.anim_gif then
    new.token := random_token(16);
  end if;
  return new;
end $$;
create trigger characters_rotate before update on public.characters for each row execute function public.rotate_character_token();

-- Small JSON describing a character for display. Never includes the photo.
create or replace function public._character_card(uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.sprite_png is null then null else jsonb_build_object(
    'token', c.token, 'activity', c.activity, 'anim', c.anim_status = 'ai') end
  from characters c where c.user_id = uid;
$$;

-- Serves an image by token. Tokens are only ever handed out by the functions below.
create or replace function public.get_character_asset(p_token text, p_kind text)
returns text language sql stable security definer set search_path = public as $$
  select case when p_kind = 'gif' then anim_gif else sprite_png end
  from characters where token = p_token and char_length(p_token) >= 16;
$$;

-- Characters to sprinkle around the site for a signed-in person: theirs + family who share.
create or replace function public.get_decor_characters()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name) || public._character_card(p.id)), '[]'::jsonb)
  from profiles p
  where (p.id = auth.uid() or public.shares_family(p.id, auth.uid()))
    and public._character_card(p.id) is not null;
$$;

-- ---------- updated functions: add characters ------------------------

-- Public list: owner's character only if they chose to show it.
create or replace function public.get_public_wishlist(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', w.id,
    'title', w.title,
    'slug', w.share_slug,
    'viewer_is_owner', coalesce(w.owner_id = auth.uid(), false),
    'owner', jsonb_build_object('display_name', p.display_name, 'avatar', p.avatar, 'avatar_color', p.avatar_color,
               'character', (select public._character_card(c.user_id) from characters c
                             where c.user_id = p.id and (c.show_publicly or c.user_id = auth.uid() or public.shares_family(c.user_id, auth.uid())))),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'url', i.url, 'price_cents', i.price_cents, 'rating', i.rating,
        'description', i.description, 'description_source', i.description_source, 'reason', i.reason,
        'image_url', i.image_url, 'position', i.position, 'created_at', i.created_at) order by i.position)
      from wishlist_items i where i.wishlist_id = w.id), '[]'::jsonb))
  from wishlists w join profiles p on p.id = w.owner_id
  where w.share_slug = p_slug;
$$;

-- Claims for gift buyers, now with the claimer's character. STILL returns no rows to the owner.
drop function public.get_claims(text, text[]);
create function public.get_claims(p_slug text, p_guest_tokens text[] default '{}')
returns table (item_id uuid, status text, claimer_name text, is_mine boolean, claimed_at timestamptz, claimer_character jsonb)
language sql stable security definer set search_path = public, extensions as $$
  select c.item_id, c.status, c.claimer_name,
         (c.claimer_id is not null and c.claimer_id = auth.uid())
           or (c.guest_token_hash is not null and c.guest_token_hash = any (
                select encode(digest(t, 'sha256'), 'hex') from unnest(p_guest_tokens) t)),
         c.created_at,
         case when c.claimer_id is not null then (
           select public._character_card(ch.user_id) from characters ch
           where ch.user_id = c.claimer_id
             and (ch.show_publicly or ch.user_id = auth.uid() or public.shares_family(ch.user_id, auth.uid()))) end
  from gift_claims c join wishlists w on w.id = c.wishlist_id
  where w.share_slug = p_slug
    and w.owner_id is distinct from auth.uid();
$$;

-- Dashboard cards now carry each member's character.
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
          'character', public._character_card(p.id),
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

-- ---------- privileges -------------------------------------------------
revoke execute on function public._character_card(uuid), public.rotate_character_token() from public, anon, authenticated;
grant execute on function public.get_claims(text, text[]), public.get_public_wishlist(text), public.get_character_asset(text, text) to anon, authenticated;
grant execute on function public.get_decor_characters(), public.get_family_dashboard(uuid) to authenticated;
revoke execute on function public.get_decor_characters() from public, anon;
grant execute on function public.get_decor_characters() to authenticated;
grant usage, select on sequence public.character_generations_id_seq to authenticated;
