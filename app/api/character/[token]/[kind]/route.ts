import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Serves a character image by its unguessable token. Tokens change on every regeneration. */
export async function GET(_req: Request, { params }: { params: { token: string; kind: string } }) {
  const kind = params.kind === 'gif' ? 'gif' : params.kind === 'png' ? 'png' : null;
  if (!kind || !/^[A-Za-z0-9]{16,32}$/.test(params.token)) return new NextResponse('Not found', { status: 404 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await db.rpc('get_character_asset', { p_token: params.token, p_kind: kind });
  if (!data) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(Buffer.from(data as string, 'base64'), {
    headers: {
      'Content-Type': kind === 'gif' ? 'image/gif' : 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
