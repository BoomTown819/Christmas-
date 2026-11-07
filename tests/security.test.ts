/**
 * Permission tests against a real Supabase-compatible stack (Postgres + Supabase Auth + PostgREST).
 * Run `stack/start.sh` (see README) then `npm run test:security`.
 * The core promise tested here: a wishlist owner can never learn what's been claimed on their list.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const run = Date.now().toString(36);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

interface User { db: SupabaseClient; id: string; wishlistId: string; slug: string; name: string }

async function signUp(name: string): Promise<User> {
  const db = createClient(URL, ANON, opts);
  const { data, error } = await db.auth.signUp({ email: `${name.toLowerCase()}-${run}@test.local`, password: 'correct-horse-9', options: { data: { display_name: name } } });
  if (error) throw error;
  const { data: wl, error: e2 } = await db.from('wishlists').select('id, share_slug').eq('owner_id', data.user!.id).single();
  if (e2) throw e2;
  return { db, id: data.user!.id, wishlistId: wl.id, slug: wl.share_slug, name };
}

const guest = () => createClient(URL, ANON, opts);
const token = () => randomBytes(24).toString('base64url');

let sonny: User, mom: User, dad: User, grandma: User, outsider: User;
let airpods: string, lego: string, socks: string, familyId: string;

beforeAll(async () => {
  [sonny, mom, dad, grandma, outsider] = await Promise.all(['Sonny', 'Mom', 'Dad', 'Grandma', 'Stranger'].map(signUp));
  const add = async (name: string, price: number) => {
    const { data, error } = await sonny.db.from('wishlist_items')
      .insert({ wishlist_id: sonny.wishlistId, name, url: 'https://example.com/' + name, price_cents: price, rating: 4.5, reason: 'Because!' })
      .select('id').single();
    if (error) throw error;
    return data.id as string;
  };
  airpods = await add('AirPods', 24900);
  lego = await add('Lego', 9999);
  socks = await add('Socks', 1500);
  await sonny.db.from('item_private_notes').insert({ item_id: airpods, owner_id: sonny.id, note: 'Hint to mom subtly' });

  const { data: fid, error } = await mom.db.rpc('create_family', { p_name: 'The Christmas Crew' });
  if (error) throw error;
  familyId = fid;
  const { data: code } = await mom.db.rpc('create_invitation', { p_family_id: familyId });
  for (const u of [sonny, dad, grandma]) {
    const { error: je } = await u.db.rpc('join_family', { p_code: code });
    if (je) throw je;
  }
}, 30_000);

describe('accounts', () => {
  it('each account gets its own profile and wishlist with an unguessable link', () => {
    expect(new Set([sonny, mom, dad, grandma].map((u) => u.wishlistId)).size).toBe(4);
    for (const u of [sonny, mom, dad]) expect(u.slug).toMatch(/^[A-Za-z0-9]{12}$/);
  });
  it('family members can see each other\'s names but not emails', async () => {
    const { data } = await dad.db.from('profiles').select('*').eq('id', sonny.id).single();
    expect(data.display_name).toBe('Sonny');
    expect(JSON.stringify(data)).not.toContain('@');
  });
  it('strangers cannot read your profile', async () => {
    const { data } = await outsider.db.from('profiles').select('*').eq('id', sonny.id);
    expect(data).toEqual([]);
  });
});

describe('editing permissions', () => {
  it('nobody can edit, add to or delete from someone else\'s wishlist', async () => {
    const upd = await mom.db.from('wishlist_items').update({ price_cents: 1 }).eq('id', airpods).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await mom.db.from('wishlist_items').delete().eq('id', lego).select();
    expect(del.data ?? []).toEqual([]);
    const ins = await mom.db.from('wishlist_items').insert({ wishlist_id: sonny.wishlistId, name: 'x', url: 'https://x.com', price_cents: 1, rating: 1 });
    expect(ins.error).not.toBeNull();
    const { data } = await sonny.db.from('wishlist_items').select('price_cents').eq('id', airpods).single();
    expect(data!.price_cents).toBe(24900);
  });
  it('cannot change someone else\'s wishlist settings or move items into your list', async () => {
    const r = await mom.db.from('wishlists').update({ title: 'hacked' }).eq('id', sonny.wishlistId).select();
    expect(r.data ?? []).toEqual([]);
    const r2 = await sonny.db.from('wishlists').update({ share_slug: 'mine' } as never).eq('id', sonny.wishlistId);
    expect(r2.error).not.toBeNull(); // slug is not a client-writable column
    await mom.db.rpc('reorder_items', { p_ids: [socks, lego, airpods] });
    const { data } = await sonny.db.from('wishlist_items').select('id').eq('wishlist_id', sonny.wishlistId).order('position');
    expect(data!.map((d) => d.id)).toEqual([airpods, lego, socks]);
  });
  it('rejects bad data at the database', async () => {
    const bad = [
      { rating: 4.3 }, { rating: 0 }, { price_cents: -1 }, { url: 'javascript:alert(1)' }, { name: '' },
    ];
    for (const b of bad) {
      const r = await sonny.db.from('wishlist_items').insert({ wishlist_id: sonny.wishlistId, name: 'ok', url: 'https://ok.com', price_cents: 1, rating: 1, ...b });
      expect(r.error, JSON.stringify(b)).not.toBeNull();
    }
  });
});

describe('private notes', () => {
  it('only the owner can read private notes', async () => {
    const own = await sonny.db.from('item_private_notes').select('note');
    expect(own.data).toEqual([{ note: 'Hint to mom subtly' }]);
    for (const u of [mom, dad, outsider]) expect((await u.db.from('item_private_notes').select('*')).data).toEqual([]);
  });
  it('the public wishlist never includes private notes', async () => {
    const { data } = await guest().rpc('get_public_wishlist', { p_slug: sonny.slug });
    expect(JSON.stringify(data)).not.toContain('Hint to mom');
    expect(data.items).toHaveLength(3);
  });
});

describe('sharing links', () => {
  it('anyone with the link sees the same list, no account needed', async () => {
    const a = await guest().rpc('get_public_wishlist', { p_slug: sonny.slug });
    const b = await grandma.db.rpc('get_public_wishlist', { p_slug: sonny.slug });
    expect(a.data.items.map((i: { id: string }) => i.id)).toEqual(b.data.items.map((i: { id: string }) => i.id));
    expect(a.data.owner.display_name).toBe('Sonny');
  });
  it('guests cannot list or enumerate wishlists directly', async () => {
    const g = guest();
    for (const t of ['wishlists', 'wishlist_items', 'profiles', 'families', 'family_members', 'family_invitations', 'gift_claims']) {
      const r = await g.from(t).select('*');
      expect(r.data ?? [], t).toEqual([]);
    }
    const r = await g.rpc('get_public_wishlist', { p_slug: 'guessing1234' });
    expect(r.data).toBeNull();
  });
  it('strangers cannot browse a family list without its link', async () => {
    const r = await outsider.db.from('wishlist_items').select('*').eq('wishlist_id', sonny.wishlistId);
    expect(r.data).toEqual([]);
  });
});

describe('secret gift claims', () => {
  const momToken = token();
  const grandmaToken = token();

  it('a guest without an account can claim an item', async () => {
    const r = await guest().rpc('claim_item', { p_slug: sonny.slug, p_item_id: airpods, p_name: 'Mom', p_email: 'mom@example.com', p_guest_token: momToken });
    expect(r.error).toBeNull();
  });

  it('a signed-in family member can claim another item', async () => {
    const r = await dad.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: lego, p_name: 'Dad' });
    expect(r.error).toBeNull();
  });

  it('other gift buyers see who claimed what (but never emails)', async () => {
    const { data } = await grandma.db.rpc('get_claims', { p_slug: sonny.slug });
    expect(data).toHaveLength(2);
    expect(data.find((c: { item_id: string }) => c.item_id === airpods)).toMatchObject({ claimer_name: 'Mom', status: 'claimed', is_mine: false });
    expect(JSON.stringify(data)).not.toContain('mom@example.com');
    const asMom = await guest().rpc('get_claims', { p_slug: sonny.slug, p_guest_tokens: [momToken] });
    expect(asMom.data.find((c: { item_id: string }) => c.item_id === airpods).is_mine).toBe(true);
  });

  it('prevents duplicate claims, even when buyers click at the same moment', async () => {
    const tries = await Promise.all([
      grandma.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: socks, p_name: 'Grandma' }),
      ...Array.from({ length: 6 }, (_, i) => guest().rpc('claim_item', { p_slug: sonny.slug, p_item_id: socks, p_name: `Cousin ${i}`, p_guest_token: token() })),
    ]);
    expect(tries.filter((t) => !t.error)).toHaveLength(1);
    expect(tries.filter((t) => t.error?.code === '23505')).toHaveLength(6);
    const again = await dad.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: airpods, p_name: 'Dad' });
    expect(again.error?.message).toMatch(/just claimed/);
  });

  it('only the claimer can mark purchased or cancel', async () => {
    const byDad = await dad.db.rpc('cancel_claim', { p_slug: sonny.slug, p_item_id: airpods });
    expect(byDad.error).not.toBeNull();
    const wrongToken = await guest().rpc('set_purchased', { p_slug: sonny.slug, p_item_id: airpods, p_purchased: true, p_guest_token: grandmaToken });
    expect(wrongToken.error).not.toBeNull();
    const ok = await guest().rpc('set_purchased', { p_slug: sonny.slug, p_item_id: airpods, p_purchased: true, p_guest_token: momToken });
    expect(ok.error).toBeNull();
    const { data } = await grandma.db.rpc('get_claims', { p_slug: sonny.slug });
    expect(data.find((c: { item_id: string }) => c.item_id === airpods).status).toBe('purchased');
  });

  it('cancelling makes the item available again', async () => {
    const socksClaim = (await dad.db.rpc('get_claims', { p_slug: sonny.slug })).data.find((c: { item_id: string }) => c.item_id === socks);
    expect(socksClaim).toBeTruthy();
    const r = await dad.db.rpc('cancel_claim', { p_slug: sonny.slug, p_item_id: lego });
    expect(r.error).toBeNull();
    const { data } = await grandma.db.rpc('get_claims', { p_slug: sonny.slug });
    expect(data.some((c: { item_id: string }) => c.item_id === lego)).toBe(false);
    expect((await dad.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: lego, p_name: 'Dad' })).error).toBeNull();
  });

  // ------- the owner must never find out -------
  it('OWNER: cannot read the claims table in any way', async () => {
    const r = await sonny.db.from('gift_claims').select('*');
    expect(r.data ?? []).toEqual([]);
    expect(r.error?.code).toBe('42501'); // permission denied, same for every user
    const r2 = await sonny.db.from('gift_claims').select('count');
    expect(r2.data ?? []).toEqual([]);
    const r3 = await sonny.db.from('wishlist_items').select('*, gift_claims(*)');
    expect(r3.data ?? []).toEqual([]);
    expect(r3.error).not.toBeNull();
  });

  it('OWNER: get_claims on their own list returns nothing, identical to an unclaimed list', async () => {
    const own = await sonny.db.rpc('get_claims', { p_slug: sonny.slug, p_guest_tokens: [momToken] });
    const unclaimed = await sonny.db.rpc('get_claims', { p_slug: dad.slug });
    expect(own.error).toBeNull();
    expect(own.data).toEqual([]);
    expect(JSON.stringify(own)).toBe(JSON.stringify(unclaimed));
  });

  it('OWNER: trying to claim, cancel or mark items gives the same answer whether claimed or not', async () => {
    const claimed = await sonny.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: airpods, p_name: 'Sonny' });
    const { data: free } = await sonny.db.from('wishlist_items')
      .insert({ wishlist_id: sonny.wishlistId, name: 'Unclaimed thing', url: 'https://example.com/u', price_cents: 100, rating: 2 }).select('id').single();
    const unclaimed = await sonny.db.rpc('claim_item', { p_slug: sonny.slug, p_item_id: free!.id, p_name: 'Sonny' });
    expect(claimed.error?.message).toBe(unclaimed.error?.message);
    expect(claimed.error?.code).toBe(unclaimed.error?.code);
    for (const fn of ['cancel_claim', 'set_purchased'] as const) {
      const args = fn === 'set_purchased' ? { p_purchased: false } : {};
      const a = await sonny.db.rpc(fn, { p_slug: sonny.slug, p_item_id: airpods, p_guest_token: momToken, ...args });
      const b = await sonny.db.rpc(fn, { p_slug: sonny.slug, p_item_id: free!.id, p_guest_token: momToken, ...args });
      expect(a.error?.message).toBe(b.error?.message);
    }
    // and the owner's attempts changed nothing
    const { data } = await grandma.db.rpc('get_claims', { p_slug: sonny.slug });
    expect(data.find((c: { item_id: string }) => c.item_id === airpods).status).toBe('purchased');
    await sonny.db.from('wishlist_items').delete().eq('id', free!.id);
  });

  it('OWNER: the public list and family dashboard contain no claim data for their own list', async () => {
    const pub = await sonny.db.rpc('get_public_wishlist', { p_slug: sonny.slug });
    const text = JSON.stringify(pub.data);
    for (const leak of ['claim', 'purchas', 'Mom', 'Dad', 'Grandma', 'available']) expect(text).not.toContain(leak);
    expect(pub.data.viewer_is_owner).toBe(true);

    const dash = await sonny.db.rpc('get_family_dashboard', { p_family_id: familyId });
    const mine = dash.data.members.find((m: { is_me: boolean }) => m.is_me);
    expect(mine).not.toHaveProperty('available_count');
    expect(mine.item_count).toBe(3);
    // while a gift buyer looking at the same dashboard does see availability for Sonny
    const momDash = await mom.db.rpc('get_family_dashboard', { p_family_id: familyId });
    const sonnyCard = momDash.data.members.find((m: { display_name: string }) => m.display_name === 'Sonny');
    expect(sonnyCard.available_count).toBe(0);
  });

  it('OWNER: cannot call the internal helper functions', async () => {
    const r = await sonny.db.rpc('_my_claim', { p_slug: sonny.slug, p_item_id: airpods, p_guest_token: momToken });
    expect(r.error).not.toBeNull();
  });

  it('works independently for every wishlist owner', async () => {
    const { data: momItem } = await mom.db.from('wishlist_items')
      .insert({ wishlist_id: mom.wishlistId, name: 'Scarf', url: 'https://example.com/scarf', price_cents: 3000, rating: 3 }).select('id').single();
    expect((await dad.db.rpc('claim_item', { p_slug: mom.slug, p_item_id: momItem!.id, p_name: 'Dad' })).error).toBeNull();
    expect((await sonny.db.rpc('get_claims', { p_slug: mom.slug })).data).toHaveLength(1); // Sonny is a buyer here
    expect((await mom.db.rpc('get_claims', { p_slug: mom.slug })).data).toEqual([]);       // Mom never sees it
    expect((await mom.db.rpc('get_claims', { p_slug: sonny.slug })).data.length).toBeGreaterThan(0);
  });

  it('deleting an item quietly removes its claim', async () => {
    await sonny.db.from('wishlist_items').delete().eq('id', socks);
    const { data } = await mom.db.rpc('get_claims', { p_slug: sonny.slug });
    expect(data.some((c: { item_id: string }) => c.item_id === socks)).toBe(false);
  });
});

describe('families', () => {
  it('invitation preview works signed out and joining is idempotent', async () => {
    const dash = await mom.db.rpc('get_family_dashboard', { p_family_id: familyId });
    const code = dash.data.invite_code as string;
    const peek = await guest().rpc('get_invitation', { p_code: code.slice(0, 4) + '-' + code.slice(4).toLowerCase() });
    expect(peek.data).toMatchObject({ family_name: 'The Christmas Crew', invited_by: 'Mom', member_count: 4 });
    expect((await dad.db.rpc('join_family', { p_code: code })).error).toBeNull();
    expect((await mom.db.rpc('get_family_dashboard', { p_family_id: familyId })).data.members).toHaveLength(4);
    expect((await guest().rpc('join_family', { p_code: code })).error).not.toBeNull();
    expect((await outsider.db.rpc('join_family', { p_code: 'NOPE1234' })).error?.message).toMatch(/not valid/);
  });
  it('outsiders cannot see the dashboard or invite codes', async () => {
    expect((await outsider.db.rpc('get_family_dashboard', { p_family_id: familyId })).error).not.toBeNull();
    expect((await outsider.db.from('family_invitations').select('*')).data).toEqual([]);
    expect((await outsider.db.rpc('create_invitation', { p_family_id: familyId })).error).not.toBeNull();
  });
  it('a member who stops sharing disappears from family previews but keeps their link', async () => {
    await dad.db.from('wishlists').update({ share_with_family: false }).eq('id', dad.wishlistId);
    const card = (await grandma.db.rpc('get_family_dashboard', { p_family_id: familyId })).data.members.find((m: { display_name: string }) => m.display_name === 'Dad');
    expect(card.shared).toBe(false);
    expect(card).not.toHaveProperty('share_slug');
    expect((await grandma.db.from('wishlist_items').select('*').eq('wishlist_id', dad.wishlistId)).data).toEqual([]);
    expect((await guest().rpc('get_public_wishlist', { p_slug: dad.slug })).data).not.toBeNull();
    await dad.db.from('wishlists').update({ share_with_family: true }).eq('id', dad.wishlistId);
  });
  it('members can leave; a regular member cannot remove others', async () => {
    const kick = await dad.db.from('family_members').delete().eq('family_id', familyId).eq('user_id', grandma.id).select();
    expect(kick.data ?? []).toEqual([]);
    expect((await grandma.db.rpc('leave_family', { p_family_id: familyId })).error).toBeNull();
    const members = (await mom.db.rpc('get_family_dashboard', { p_family_id: familyId })).data.members;
    expect(members.map((m: { display_name: string }) => m.display_name).sort()).toEqual(['Dad', 'Mom', 'Sonny']);
    expect((await grandma.db.rpc('get_family_dashboard', { p_family_id: familyId })).error).not.toBeNull();
  });
  it('the organizer role passes on when the organizer leaves', async () => {
    await mom.db.rpc('leave_family', { p_family_id: familyId });
    const d = (await sonny.db.rpc('get_family_dashboard', { p_family_id: familyId })).data;
    expect(d.members.filter((m: { role: string }) => m.role === 'organizer')).toHaveLength(1);
  });
});

describe('8-bit characters and photos', () => {
  let sprite: string;
  let dadToken: string;
  beforeAll(async () => {
    const { readFileSync } = await import('node:fs');
    const sharp = (await import('sharp')).default;
    sprite = (await sharp(readFileSync('e2e/fixtures/still.png')).resize(64, 64).png().toBuffer()).toString('base64');
    for (const u of [sonny, dad, grandma, outsider]) {
      const { error } = await u.db.from('characters').upsert({ user_id: u.id, sprite_png: sprite, activity: 'dancing' });
      if (error) throw error;
    }
    await dad.db.from('character_photos').upsert({ user_id: dad.id, mime: 'image/jpeg', data: 'aGVsbG8=' });
    dadToken = (await dad.db.from('characters').select('token').eq('user_id', dad.id).single()).data!.token;
  });

  it('photos are owner-only: family, strangers and guests can never read them', async () => {
    expect((await dad.db.from('character_photos').select('user_id')).data).toHaveLength(1);
    for (const u of [sonny, mom, outsider]) expect((await u.db.from('character_photos').select('*')).data).toEqual([]);
    expect((await guest().from('character_photos').select('*')).data ?? []).toEqual([]);
  });

  it('nobody can write someone else’s character or photo', async () => {
    const r1 = await sonny.db.from('characters').update({ activity: 'sleigh' }).eq('user_id', dad.id).select();
    expect(r1.data ?? []).toEqual([]);
    const r2 = await sonny.db.from('character_photos').upsert({ user_id: dad.id, mime: 'image/jpeg', data: 'eA==' });
    expect(r2.error).not.toBeNull();
    const r3 = await sonny.db.from('characters').insert({ user_id: outsider.id, sprite_png: sprite });
    expect(r3.error).not.toBeNull();
  });

  it('family can see each other’s characters; strangers cannot list them', async () => {
    const fam = await sonny.db.from('characters').select('user_id');
    expect(fam.data!.map((r) => r.user_id)).toContain(dad.id);
    const out = await outsider.db.from('characters').select('user_id');
    expect(out.data!.map((r) => r.user_id)).toEqual([outsider.id]);
    expect((await guest().from('characters').select('*')).data ?? []).toEqual([]);
  });

  it('images are served by unguessable token only', async () => {
    expect((await guest().rpc('get_character_asset', { p_token: dadToken, p_kind: 'png' })).data).toBe(sprite);
    expect((await guest().rpc('get_character_asset', { p_token: 'x'.repeat(16), p_kind: 'png' })).data).toBeNull();
    expect((await guest().rpc('get_character_asset', { p_token: '', p_kind: 'png' })).data).toBeNull();
  });

  it('regenerating rotates the token so old image links stop working', async () => {
    await dad.db.from('characters').update({ sprite_png: sprite.slice(0, -4) + 'AAA=' }).eq('user_id', dad.id);
    const fresh = (await dad.db.from('characters').select('token').eq('user_id', dad.id).single()).data!.token;
    expect(fresh).not.toBe(dadToken);
    expect((await guest().rpc('get_character_asset', { p_token: dadToken, p_kind: 'png' })).data).toBeNull();
    dadToken = fresh;
  });

  it('gift buyers see the claimer’s character next to the claim', async () => {
    // Dad claimed Lego on Sonny's list earlier
    const { data } = await mom.db.rpc('get_claims', { p_slug: sonny.slug });
    const lego_ = data.find((c: { claimer_name: string }) => c.claimer_name === 'Dad');
    expect(lego_.claimer_character).toMatchObject({ token: dadToken, activity: 'dancing', anim: false });
    // guests (no account) have no character
    const g = data.find((c: { claimer_name: string }) => c.claimer_name === 'Mom');
    expect(g.claimer_character).toBeNull();
  });

  it('OWNER: never receives the claimer’s character, by any route', async () => {
    expect((await sonny.db.rpc('get_claims', { p_slug: sonny.slug })).data).toEqual([]);
    const pub = JSON.stringify((await sonny.db.rpc('get_public_wishlist', { p_slug: sonny.slug })).data);
    expect(pub).not.toContain(dadToken);
    const own = (await sonny.db.rpc('get_public_wishlist', { p_slug: sonny.slug })).data;
    expect(own.owner.character).toMatchObject({ activity: 'dancing' });
  });

  it('“show outside my family” off: guests stop seeing it, family still does', async () => {
    await dad.db.from('characters').update({ show_publicly: false }).eq('user_id', dad.id);
    const asGuest = (await guest().rpc('get_claims', { p_slug: sonny.slug })).data;
    expect(asGuest.find((c: { claimer_name: string }) => c.claimer_name === 'Dad').claimer_character).toBeNull();
    // Mom left the family in an earlier test, so she now counts as outside it
    const asMom = (await mom.db.rpc('get_claims', { p_slug: sonny.slug })).data;
    expect(asMom.find((c: { claimer_name: string }) => c.claimer_name === 'Dad').claimer_character).toBeNull();
    // Dad's character on his own list, as seen by family member Sonny
    expect((await sonny.db.rpc('get_public_wishlist', { p_slug: dad.slug })).data.owner.character).not.toBeNull();
    expect((await guest().rpc('get_public_wishlist', { p_slug: dad.slug })).data.owner.character).toBeNull();
    await dad.db.from('characters').update({ show_publicly: true }).eq('user_id', dad.id);
  });

  it('dashboard and decorations show family characters only', async () => {
    const dash = (await sonny.db.rpc('get_family_dashboard', { p_family_id: familyId })).data;
    expect(dash.members.find((m: { display_name: string }) => m.display_name === 'Dad').character.token).toBe(dadToken);
    const decor = (await outsider.db.rpc('get_decor_characters')).data;
    expect(decor.map((d: { name: string }) => d.name)).toEqual(['Stranger']);
    expect((await guest().rpc('get_decor_characters')).error).not.toBeNull();
  });

  it('cannot read or skip the AI usage log for someone else', async () => {
    await dad.db.from('character_generations').insert({ user_id: dad.id, kind: 'still' });
    expect((await sonny.db.from('character_generations').select('*').eq('user_id', dad.id)).data).toEqual([]);
    const del = await dad.db.from('character_generations').delete().eq('user_id', dad.id).select();
    expect(del.data ?? []).toEqual([]);
    const forge = await sonny.db.from('character_generations').insert({ user_id: dad.id, kind: 'still' });
    expect(forge.error).not.toBeNull();
  });
});

describe('uploaded item pictures', () => {
  const tiny = Buffer.from('ffd8ffe000104a46494600', 'hex').toString('base64');
  it('only signed-in people can save pictures, and nobody can list or read the table', async () => {
    expect((await guest().rpc('save_item_image', { p_mime: 'image/jpeg', p_data: tiny })).error).not.toBeNull();
    const { data: tok, error } = await sonny.db.rpc('save_item_image', { p_mime: 'image/jpeg', p_data: tiny });
    expect(error).toBeNull();
    expect(tok).toMatch(/^[A-Za-z0-9]{24}$/);
    for (const db of [sonny.db, mom.db, guest()]) {
      const r = await db.from('item_images').select('*');
      expect(r.data ?? []).toEqual([]);
    }
    expect((await mom.db.from('item_images').delete().eq('token', tok).select()).data ?? []).toEqual([]);
    // Anyone with the token (like anyone with the list link) can see the picture; a guessed short token can't.
    expect((await guest().rpc('get_item_image', { p_token: tok })).data).toEqual([{ mime: 'image/jpeg', data: tiny }]);
    expect((await guest().rpc('get_item_image', { p_token: 'abc' })).data).toEqual([]);
    // Bad types and non-image text are refused.
    expect((await sonny.db.rpc('save_item_image', { p_mime: 'text/html', p_data: tiny })).error).not.toBeNull();
    expect((await sonny.db.rpc('save_item_image', { p_mime: 'image/png', p_data: '<script>' })).error).not.toBeNull();
  });

  it('item picture addresses must be web links or our own uploaded pictures', async () => {
    const add = (image_url: string) => sonny.db.from('wishlist_items').insert({ wishlist_id: sonny.wishlistId, name: 'Pic test', url: 'https://example.com', price_cents: 100, rating: 1, image_url });
    expect((await add('javascript:alert(1)')).error).not.toBeNull();
    expect((await add('/api/describe')).error).not.toBeNull();
    expect((await add('/api/item-image/AAAAAAAAAAAAAAAAAAAAAAAA')).error).toBeNull();
    await sonny.db.from('wishlist_items').delete().eq('name', 'Pic test');
  });
});
