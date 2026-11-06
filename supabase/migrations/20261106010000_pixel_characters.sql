-- Free (no-AI) characters: frame-by-frame pixel animations made by the site itself.
alter table public.characters drop constraint characters_anim_status_check;
alter table public.characters add constraint characters_anim_status_check check (anim_status in ('none', 'ai', 'pixel', 'failed'));
-- The pixel face cut from the photo (34×38), kept so activities can change without the photo.
alter table public.characters add column face_png text check (face_png is null or (char_length(face_png) < 40000 and face_png ~ '^[A-Za-z0-9+/=]+$'));

create or replace function public._character_card(uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.sprite_png is null then null else jsonb_build_object(
    'token', c.token, 'activity', c.activity, 'anim', c.anim_status in ('ai', 'pixel')) end
  from characters c where c.user_id = uid;
$$;
revoke execute on function public._character_card(uuid) from public, anon, authenticated;
