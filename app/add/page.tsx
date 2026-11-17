import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { url?: string; name?: string; price?: string; image?: string; desc?: string };
const httpUrl = (v: string | undefined) => {
  try { const u = new URL((v ?? '').trim()); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 2000) : ''; } catch { return ''; }
};

/**
 * Where the "🎁 Add to Our Christmas" bookmark button sends what it read from a product page.
 * Cleans it up and opens Add item on My list, already filled in. Nothing is saved until you tap Add.
 */
export default async function AddFromBookmark({ searchParams }: { searchParams: Params }) {
  const clean = new URLSearchParams({ bm: '1' });
  const url = httpUrl(searchParams.url);
  const image = httpUrl(searchParams.image);
  const name = (searchParams.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const price = /^\d{1,7}(\.\d{1,2})?$/.test(searchParams.price ?? '') ? searchParams.price! : '';
  const desc = (searchParams.desc ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (url) clean.set('url', url);
  if (name) clean.set('name', name);
  if (price) clean.set('price', price);
  if (image) clean.set('image', image);
  if (desc) clean.set('desc', desc);
  const target = `/my-list?${clean}`;
  const { user } = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  redirect(target);
}
