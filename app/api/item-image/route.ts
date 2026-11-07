import sharp from 'sharp';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_UPLOAD = 4_000_000; // characters of base64 (the browser shrinks pictures first)

/** Upload a picture for a wishlist item. It's decoded and re-encoded here, so only a clean JPEG is ever stored. */
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Log in again to upload pictures.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const raw = String(body.data ?? '');
  if (!raw || raw.length > MAX_UPLOAD) return NextResponse.json({ error: 'That picture is too big. Try a smaller one.' }, { status: 413 });
  const b64 = raw.replace(/^data:[^,]*,/, '');
  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(b64, 'base64'), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'That file isn’t a picture we can use. Try a JPG or PNG.' }, { status: 400 });
  }
  const { data: token, error } = await db.rpc('save_item_image', { p_mime: 'image/jpeg', p_data: jpeg.toString('base64') });
  if (error || !token) {
    const msg = /too many/.test(error?.message ?? '') ? 'You’ve uploaded a lot of pictures. Delete some items first.' : 'Couldn’t save the picture. Try again.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ url: `/api/item-image/${token}` });
}
