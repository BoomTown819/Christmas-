import { type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Serve an uploaded item picture by its unguessable token. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token ?? '';
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return new Response('Not found', { status: 404 });
  const { data } = await supabaseServer().rpc('get_item_image', { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(row.data, 'base64'), {
    headers: {
      'content-type': row.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
