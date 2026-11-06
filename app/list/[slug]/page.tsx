import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { possessive } from '@/lib/items';
import { getSessionUser } from '@/lib/supabase/server';
import type { PublicWishlist } from '@/types';
import { PublicListApp } from './PublicListApp';

export const dynamic = 'force-dynamic';

const load = cache(async (slug: string) => {
  const { db, user } = await getSessionUser();
  const { data } = await db.rpc('get_public_wishlist', { p_slug: slug });
  const viewer = user ? (await db.from('profiles').select('display_name').eq('id', user.id).single()).data : null;
  return { list: data as PublicWishlist | null, viewerName: viewer?.display_name ?? null, signedIn: Boolean(user) };
});

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { list } = await load(params.slug);
  if (!list) return { title: 'Wishlist not found' };
  const title = `${possessive(list.owner.display_name)} Christmas Wishlist`;
  const n = list.items.length;
  const description = `${n} ${n === 1 ? 'gift' : 'gifts'} on the list. Open it to see what ${list.owner.display_name} is hoping for, and secretly claim one so nobody doubles up.`;
  return {
    title: { absolute: `${title} 🎄` },
    description,
    openGraph: { title: `${title} 🎄`, description, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${title} 🎄`, description },
    robots: { index: false, follow: false },
  };
}

export default async function PublicListPage({ params }: { params: { slug: string } }) {
  const { list, viewerName, signedIn } = await load(params.slug);
  if (!list) notFound();
  // The server never sends claim data here. Claims are fetched separately by gift buyers,
  // and the database returns nothing at all to the list's owner.
  return <PublicListApp list={list} viewerName={viewerName} signedIn={signedIn} />;
}
