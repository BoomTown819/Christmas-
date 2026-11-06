import { NextResponse, type NextRequest } from 'next/server';
import { describeProduct } from '@/lib/server/describe';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Simple per-user limit so the AI key can't be run up.
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
  if (!data.user) return NextResponse.json({ status: 'blocked', message: 'Log in to use AI descriptions.' }, { status: 401 });
  if (limited(data.user.id)) {
    return NextResponse.json({ status: 'blocked', message: 'Too many lookups in a minute. Wait a moment and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await describeProduct(String(body.url ?? ''), String(body.name ?? '').slice(0, 200)));
  } catch (err) {
    console.error('[describe]', err);
    return NextResponse.json({ status: 'blocked', message: 'Something went wrong reading that page. You can write the description yourself.' });
  }
}
