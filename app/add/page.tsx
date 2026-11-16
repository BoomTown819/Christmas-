import { redirect } from 'next/navigation';
import { firstLink } from '@/lib/itemDraft';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Where a phone's Share button sends a product ("Share → Our Christmas").
 * Picks the link out of whatever was shared and opens Add item with it.
 */
export default async function AddFromShare({ searchParams }: { searchParams: { url?: string; text?: string; title?: string } }) {
  const link = firstLink(searchParams.url, searchParams.text, searchParams.title);
  const target = link ? `/my-list?add=${encodeURIComponent(link.slice(0, 2000))}` : '/my-list';
  const { user } = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  redirect(target);
}
