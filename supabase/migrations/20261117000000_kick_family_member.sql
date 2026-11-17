-- =====================================================================
-- Kick someone out of a family (the hidden 🐒 "monkey mode" on the dashboard).
-- Any member of a family can remove any other member of that same family.
-- It only removes them from the family: their account, wishlist, link and
-- any gifts they've claimed are untouched, and they can rejoin with an invite.
-- =====================================================================
create or replace function public.kick_family_member(p_family_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_family_member(p_family_id, auth.uid()) then
    raise exception 'You can only remove people from your own family.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'To remove yourself, use Leave family.' using errcode = '22023';
  end if;
  delete from family_members where family_id = p_family_id and user_id = p_user_id;
  if not found then raise exception 'That person isn’t in this family.' using errcode = '22023'; end if;
  -- If the organizer was removed, the longest-standing member becomes organizer (same as leaving).
  if not exists (select 1 from family_members where family_id = p_family_id and role = 'organizer') then
    update family_members set role = 'organizer'
    where (family_id, user_id) = (select family_id, user_id from family_members where family_id = p_family_id order by joined_at limit 1);
  end if;
end $$;

revoke execute on function public.kick_family_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kick_family_member(uuid, uuid) to authenticated;
