import { NextResponse, type NextRequest } from 'next/server';
import { isActivity } from '@/lib/activities';
import { CharacterError, drawAnimation, openAIConfigured } from '@/lib/server/character';
import { fail, requireUser, useQuota } from '@/lib/server/characterRoute';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Makes an AI animated GIF of the person's saved character doing an activity. No photo needed.
 * If OpenAI can't animate it, the character is marked 'failed' and the site animates the
 * still sprite in the browser instead, and says so.
 */
export async function POST(req: NextRequest) {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isActivity(body.activity)) return NextResponse.json({ error: 'Pick an activity.' }, { status: 400 });
  const activity = body.activity;
  const { data: ch } = await db.from('characters').select('sprite_png').eq('user_id', user.id).maybeSingle();
  if (!ch?.sprite_png) return NextResponse.json({ error: 'Make your character first.' }, { status: 400 });

  if (!openAIConfigured()) {
    const { data: saved } = await db.from('characters')
      .update({ activity, anim_gif: null, anim_status: 'none', anim_note: '' })
      .eq('user_id', user.id).select('token, activity').single();
    return NextResponse.json({ character: saved ? { token: saved.token, activity: saved.activity, anim: false } : null, mode: 'free' });
  }

  try {
    await useQuota(db, user.id, 'animation');
  } catch (err) {
    // Out of animations today: still switch the activity, animated in the browser.
    await db.from('characters').update({ activity, anim_gif: null, anim_status: 'failed', anim_note: (err as Error).message }).eq('user_id', user.id);
    return fail(err);
  }

  try {
    const { gif } = await drawAnimation(Buffer.from(ch.sprite_png, 'base64'), activity);
    const { data: saved, error } = await db.from('characters')
      .update({ activity, anim_gif: gif.toString('base64'), anim_status: 'ai', anim_note: '' })
      .eq('user_id', user.id).select('token, activity').single();
    if (error) throw new CharacterError('The animation was made but couldn’t be saved.', 500);
    return NextResponse.json({ character: { token: saved.token, activity: saved.activity, anim: true } });
  } catch (err) {
    const note = err instanceof CharacterError ? err.message : 'The AI animation didn’t work this time.';
    const { data: saved } = await db.from('characters')
      .update({ activity, anim_gif: null, anim_status: 'failed', anim_note: note.slice(0, 300) })
      .eq('user_id', user.id).select('token, activity').single();
    return NextResponse.json({
      character: saved ? { token: saved.token, activity: saved.activity, anim: false } : null,
      animationError: note,
    }, { status: 200 });
  }
}
