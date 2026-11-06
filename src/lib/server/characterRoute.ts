import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { CharacterError } from './character';

export const LIMITS = { still: 5, animation: 10 } as const; // per person per 24 hours, to protect the OpenAI bill

export async function requireUser() {
  const db = supabaseServer();
  const { data } = await db.auth.getUser();
  return { db, user: data.user };
}

/** Counts this person's AI calls in the last day and logs a new one, or refuses. */
export async function useQuota(db: ReturnType<typeof supabaseServer>, userId: string, kind: keyof typeof LIMITS) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from('character_generations').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', kind).gte('created_at', since);
  if ((count ?? 0) >= LIMITS[kind]) {
    throw new CharacterError(`You’ve made ${LIMITS[kind]} ${kind === 'still' ? 'characters' : 'animations'} today. Try again tomorrow.`, 429);
  }
  const { error } = await db.from('character_generations').insert({ user_id: userId, kind });
  if (error) throw new CharacterError('Couldn’t start. Try again.', 500);
}

export function fail(err: unknown) {
  if (err instanceof CharacterError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('[character]', err);
  return NextResponse.json({ error: 'Something went wrong making your character. Try again.' }, { status: 500 });
}
