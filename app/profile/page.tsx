import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';
import { LogoutPanel, SaveAccount } from './SaveAccount';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { db, user } = await getSessionUser();
  if (!user) redirect('/login?next=/profile');
  const { data: profile } = await db.from('profiles').select('id, display_name, avatar, avatar_color').eq('id', user.id).single();
  if (!profile) redirect('/login');
  const anonymous = Boolean(user.is_anonymous) && !user.email;
  return (
    <main className="main main-narrow">
      <section className="panel">
        <h1 className="panel-title">Your profile</h1>
        <ProfileForm profile={profile} email={user.email ?? ''} />
      </section>
      <SaveAccount anonymous={anonymous} pendingEmail={user.new_email ?? null} />
      <LogoutPanel anonymous={anonymous} />
    </main>
  );
}
