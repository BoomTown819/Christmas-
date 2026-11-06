import type { SupabaseClient } from '@supabase/supabase-js';
import { isActivity, type CharacterCard } from './activities';

/** The signed-in person's own character, if they've made one. */
export async function getMyCharacter(db: SupabaseClient, userId: string): Promise<CharacterCard | null> {
  const { data } = await db.from('characters').select('token, activity, anim_status, sprite_png').eq('user_id', userId).maybeSingle();
  if (!data?.sprite_png) return null;
  return { token: data.token, activity: isActivity(data.activity) ? data.activity : 'waving', anim: data.anim_status === 'ai' || data.anim_status === 'pixel' };
}
