-- =====================================================================
-- Secret gift ideas
--
-- Family members can suggest gifts for someone ("Dad keeps mentioning golf
-- gloves"). Ideas live beside that person's wishlist, but the person never
-- sees them, exactly like claims:
--
-- * gift_ideas has row level security on, no policies, and every table
--   permission revoked. Nobody reads it directly.
-- * Only signed-in people who share a family with the list's owner can
--   read, add or claim ideas, and never the owner. Everyone else, the owner
--   included, gets an empty list or the same refusal, so nothing leaks.
-- =====================================================================

create table public.gift_ideas (
  id           uuid primary key default gen_random_uuid(),
  wishlist_id  uuid not null references public.wishlists (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  url          text not null default '' check (url = '' or (url ~* '^https?://' and char_length(url) <= 2000)),
  image_url    text not null default '' check (image_url = '' or (image_url ~* '^https?://' and char_length(image_url) <= 2000)),
  price_cents  int check (price_cents is null or price_cents between 0 and 100000000),
  note         text not null default '' check (char_length(note) <= 500),
  claimed_by   uuid references public.profiles (id) on delete set null,
  bought       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index gift_ideas_wishlist_idx on public.gift_ideas (wishlist_id, created_at);

alter table public.gift_ideas enable row level security;
revoke all on public.gift_ideas from anon, authenticated;

-- The wishlist behind a link, if the caller may see its secret ideas (signed in, family, not the owner).
create or replace function public._idea_wishlist(p_slug text)
returns uuid language sql stable security definer set search_path = public as $$
  select w.id from wishlists w
  where w.share_slug = p_slug
    and auth.uid() is not null
    and w.owner_id <> auth.uid()
    and public.shares_family(w.owner_id, auth.uid());
$$;

-- The idea, if the caller may act on it.
create or replace function public._idea_row(p_id uuid)
returns public.gift_ideas language sql stable security definer set search_path = public as $$
  select i.* from gift_ideas i join wishlists w on w.id = i.wishlist_id
  where i.id = p_id
    and auth.uid() is not null
    and w.owner_id <> auth.uid()
    and public.shares_family(w.owner_id, auth.uid());
$$;

create or replace function public.get_gift_ideas(p_slug text)
returns table (id uuid, title text, url text, image_url text, price_cents int, note text,
               author_name text, is_mine boolean, claimed_by_name text, claimed_by_me boolean, bought boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.title, i.url, i.image_url, i.price_cents, i.note,
         a.display_name, i.author_id = auth.uid(),
         c.display_name, i.claimed_by = auth.uid(), i.bought, i.created_at
  from gift_ideas i
  join profiles a on a.id = i.author_id
  left join profiles c on c.id = i.claimed_by
  where i.wishlist_id = public._idea_wishlist(p_slug)
  order by i.created_at;
$$;

create or replace function public.add_gift_idea(p_slug text, p_title text, p_url text default '', p_price_cents int default null,
                                                p_note text default '', p_image_url text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare wid uuid := public._idea_wishlist(p_slug); new_id uuid;
begin
  if wid is null then raise exception 'Only family gift buyers can add secret ideas to this list.' using errcode = '42501'; end if;
  if (select count(*) from gift_ideas where wishlist_id = wid) >= 200 then
    raise exception 'This list already has a lot of ideas.' using errcode = '22023';
  end if;
  insert into gift_ideas (wishlist_id, author_id, title, url, image_url, price_cents, note)
  values (wid, auth.uid(), btrim(p_title), btrim(coalesce(p_url, '')), btrim(coalesce(p_image_url, '')), p_price_cents, btrim(coalesce(p_note, '')))
  returning id into new_id;
  return new_id;
end $$;

-- Only the person who added an idea can delete it.
create or replace function public.delete_gift_idea(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r gift_ideas;
begin
  r := public._idea_row(p_id);
  if r.id is null or r.author_id <> auth.uid() then raise exception 'You can only delete ideas you added.' using errcode = '42501'; end if;
  delete from gift_ideas where id = p_id;
end $$;

-- "I'll get this" on an idea, or let it go again. One buyer per idea.
create or replace function public.claim_gift_idea(p_id uuid, p_claim boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r gift_ideas;
begin
  r := public._idea_row(p_id);
  if r.id is null then raise exception 'That idea isn’t available.' using errcode = '42501'; end if;
  if p_claim then
    update gift_ideas set claimed_by = auth.uid(), bought = false where id = p_id and claimed_by is null;
    if not found then raise exception 'Someone else is already getting this one.' using errcode = '23505'; end if;
  else
    update gift_ideas set claimed_by = null, bought = false where id = p_id and claimed_by = auth.uid();
    if not found then raise exception 'Only the person getting this can let it go.' using errcode = '42501'; end if;
  end if;
end $$;

create or replace function public.set_idea_bought(p_id uuid, p_bought boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r gift_ideas;
begin
  r := public._idea_row(p_id);
  if r.id is null or r.claimed_by is distinct from auth.uid() then
    raise exception 'Only the person getting this can mark it bought.' using errcode = '42501';
  end if;
  update gift_ideas set bought = p_bought where id = p_id;
end $$;

-- Dashboard: how many secret ideas each other member has (never computed for your own card).
create or replace function public.get_idea_counts(p_family_id uuid)
returns table (user_id uuid, idea_count int) language sql stable security definer set search_path = public as $$
  select w.owner_id, count(i.id)::int
  from family_members m join wishlists w on w.owner_id = m.user_id
  left join gift_ideas i on i.wishlist_id = w.id
  where m.family_id = p_family_id
    and public.is_family_member(p_family_id, auth.uid())
    and w.owner_id <> auth.uid()
  group by w.owner_id;
$$;

-- Can I see and add secret ideas on this list? (Tells the owner nothing they don't already know.)
create or replace function public.can_add_ideas(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select public._idea_wishlist(p_slug) is not null;
$$;

revoke execute on function public.can_add_ideas(text), public._idea_wishlist(text), public._idea_row(uuid), public.get_gift_ideas(text),
  public.add_gift_idea(text, text, text, int, text, text), public.delete_gift_idea(uuid),
  public.claim_gift_idea(uuid, boolean), public.set_idea_bought(uuid, boolean), public.get_idea_counts(uuid)
  from public, anon, authenticated;
grant execute on function public.can_add_ideas(text), public.get_gift_ideas(text), public.add_gift_idea(text, text, text, int, text, text),
  public.delete_gift_idea(uuid), public.claim_gift_idea(uuid, boolean), public.set_idea_bought(uuid, boolean),
  public.get_idea_counts(uuid) to authenticated;
