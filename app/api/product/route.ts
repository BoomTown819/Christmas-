import { NextResponse, type NextRequest } from 'next/server';
import { lookupProduct } from '@/lib/server/product';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Per-person limit so nobody can use the server to hammer other websites.
const hits = new Map<string, number[]>();
const limited = (key: string, perMinute = 20) => {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > perMinute;
};

export async function POST(req: NextRequest) {
  const { data } = await supabaseServer().auth.getUser();
  if (!data.user) return NextResponse.json({ status: 'failed', product: {}, message: 'Log in again to look up products.' }, { status: 401 });
  if (limited(data.user.id)) {
    return NextResponse.json({ status: 'failed', product: {}, message: 'That was a lot of links in a minute. Wait a moment and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? '').slice(0, 2000);
  try {
    return NextResponse.json(await lookupProduct(url, String(body.name ?? '').slice(0, 200)));
  } catch (err) {
    console.error('[product]', err);
    return NextResponse.json({ status: 'failed', product: {}, message: "Something went wrong reading that page. No problem: fill in the details below." });
  }
}
