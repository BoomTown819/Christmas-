import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fromRow, type ItemRow } from '@/lib/items';
import { getSessionUser } from '@/lib/supabase/server';
import { MyListApp } from './MyListApp';

export const metadata: Metadata = { title: 'My list' };
export const dynamic = 'force-dynamic';

export default async function MyListPage() {
  const { db, user } = await getSessionUser();
  if (!user) redirect('/login?next=/my-list');
  const [{ data: profile }, { data: wishlist }] = await Promise.all([
    db.from('profiles').select('id, display_name, avatar, avatar_color').eq('id', user.id).single(),
    db.from('wishlists').select('id, title, share_slug, share_with_family').eq('owner_id', user.id).single(),
  ]);
  if (!profile || !wishlist) redirect('/login');
  const { data: rows } = await db.from('wishlist_items').select('*, item_private_notes(note)').eq('wishlist_id', wishlist.id).order('position');
  return <MyListApp profile={profile} wishlist={wishlist} anonymous={Boolean(user.is_anonymous) && !user.email} initialItems={(rows as ItemRow[] | null ?? []).map(fromRow)} />;
}
