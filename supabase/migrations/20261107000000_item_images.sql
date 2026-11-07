-- =====================================================================
-- Photos people upload for wishlist items (when a store page has no usable image).
--
-- * item_images : the uploaded picture, owned by whoever uploaded it.
--                 Nobody reads the table directly. Pictures are served only by an
--                 unguessable token through get_item_image(), the same way list
--                 items are visible to anyone with the list link.
-- * wishlist_items.image_url may now also be "/api/item-image/<token>".
-- =====================================================================

create table public.item_images (
  token      text primary key default public.random_token(24),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data       text not null check (char_length(data) < 1500000 and data ~ '^[A-Za-z0-9+/=]+$'),
  created_at timestamptz not null default now()
);
create index item_images_owner_idx on public.item_images (owner_id, created_at);

alter table public.item_images enable row level security;
revoke all on public.item_images from anon, authenticated;

-- Save a picture: signed-in people only, at most 300 pictures each.
create or replace function public.save_item_image(p_mime text, p_data text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text;
begin
  if me is null then raise exception 'sign in to upload pictures'; end if;
  if (select count(*) from item_images where owner_id = me) >= 300 then
    raise exception 'too many uploaded pictures';
  end if;
  insert into item_images (owner_id, mime, data) values (me, p_mime, p_data) returning token into t;
  return t;
end $$;

-- Serve a picture by its token.
create or replace function public.get_item_image(p_token text)
returns table (mime text, data text) language sql stable security definer set search_path = public as $$
  select i.mime, i.data from item_images i where i.token = p_token and char_length(p_token) >= 24;
$$;

revoke execute on function public.save_item_image(text, text) from public, anon;
grant execute on function public.save_item_image(text, text) to authenticated;
grant execute on function public.get_item_image(text) to anon, authenticated;

alter table public.wishlist_items drop constraint wishlist_items_image_url_check;
alter table public.wishlist_items add constraint wishlist_items_image_url_check check (
  image_url = ''
  or (image_url ~* '^https?://' and char_length(image_url) <= 2000)
  or image_url ~ '^/api/item-image/[A-Za-z0-9_-]{24,64}$'
);
