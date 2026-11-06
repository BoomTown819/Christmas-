import { NextResponse, type NextRequest } from 'next/server';
import { isActivity } from '@/lib/activities';
import { CharacterError, drawPixelPortrait, drawStill, openAIConfigured } from '@/lib/server/character';
import { fail, requireUser, useQuota } from '@/lib/server/characterRoute';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Draws a new still character from a photo. Body: { photo?: { mime, data(base64) }, activity }.
 * With no photo, the person's saved photo is reused (regenerate).
 */
export async function POST(req: NextRequest) {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Log in to make your character.' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const activity = isActivity(body.activity) ? body.activity : 'waving';
    let photo: { mime: string; data: string } | null = null;

    if (body.photo) {
      const { mime, data } = body.photo as { mime?: string; data?: string };
      if (!mime || !MIMES.has(mime) || typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        throw new CharacterError('That file isn’t a photo we can use. Try a JPG or PNG.', 400);
      }
      if (data.length > 3_900_000) throw new CharacterError('That photo is too large. Try a smaller one.', 413);
      // Saved privately: only this person can ever read it (row level security).
      const { error } = await db.from('character_photos').upsert({ user_id: user.id, mime, data, updated_at: new Date().toISOString() });
      if (error) throw new CharacterError('Couldn’t save your photo. Try again.', 500);
      photo = { mime, data };
    } else {
      const { data } = await db.from('character_photos').select('mime, data').eq('user_id', user.id).maybeSingle();
      if (!data) throw new CharacterError('Upload a photo first.', 400);
      photo = data;
    }

    // With an OpenAI key the AI draws the character; without one the site makes a free pixel portrait itself.
    const ai = openAIConfigured();
    if (ai) await useQuota(db, user.id, 'still');
    const bytes = Buffer.from(photo.data, 'base64');
    const sprite = ai ? await drawStill(bytes, photo.mime) : await drawPixelPortrait(bytes);
    const { data: saved, error } = await db.from('characters').upsert({
      user_id: user.id, sprite_png: sprite.toString('base64'), anim_gif: null, anim_status: 'none', anim_note: '', activity,
    }).select('token, activity, anim_status').single();
    if (error) throw new CharacterError('Your character was drawn but couldn’t be saved. Try again.', 500);
    return NextResponse.json({ character: { token: saved.token, activity: saved.activity, anim: false } });
  } catch (err) {
    return fail(err);
  }
}
