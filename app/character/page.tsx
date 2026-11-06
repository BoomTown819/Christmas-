import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isActivity, type CharacterCard } from '@/lib/activities';
import { openAIConfigured } from '@/lib/server/character';
import { getSessionUser } from '@/lib/supabase/server';
import { CreatorApp } from './CreatorApp';

export const metadata: Metadata = { title: 'My Christmas character' };
export const dynamic = 'force-dynamic';

export default async function CharacterPage({ searchParams }: { searchParams: { new?: string } }) {
  const { db, user } = await getSessionUser();
  if (!user) redirect('/login?next=/character');
  const [{ data: profile }, { data: ch }, { data: photo }] = await Promise.all([
    db.from('profiles').select('id, display_name').eq('id', user.id).single(),
    db.from('characters').select('token, activity, anim_status, anim_note, show_publicly, sprite_png, face_png').eq('user_id', user.id).maybeSingle(),
    db.from('character_photos').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);
  if (!profile) redirect('/login');
  const character: CharacterCard | null = ch?.sprite_png
    ? { token: ch.token, activity: isActivity(ch.activity) ? ch.activity : 'waving', anim: ch.anim_status === 'ai' || ch.anim_status === 'pixel' }
    : null;
  return (
    <CreatorApp
      userId={user.id}
      name={profile.display_name}
      initial={character}
      animNote={ch?.anim_status === 'failed' ? ch.anim_note : ''}
      showPublicly={ch?.show_publicly ?? true}
      hasPhoto={Boolean(photo)}
      isNew={searchParams.new === '1'}
      aiEnabled={openAIConfigured()}
    />
  );
}
