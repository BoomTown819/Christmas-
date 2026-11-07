import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';
import { LogoutPanel, SaveAccount } from './SaveAccount';
import { PinPanel } from './PinPanel';
import { isPinEmail } from '@/lib/pin';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: { pin?: string } }) {
  const { db, user } = await getSessionUser();
  if (!user) redirect('/login?next=/profile');
  const { data: profile } = await db.from('profiles').select('id, display_name, avatar, avatar_color').eq('id', user.id).single();
  if (!profile) redirect('/login');
  const anonymous = Boolean(user.is_anonymous) && !user.email;
  const realEmail = Boolean(user.email) && !isPinEmail(user.email);
  const hasPin = Boolean((await db.rpc('my_pin_status')).data);
  return (
    <main className="main main-narrow">
      <section className="panel">
        <h1 className="panel-title">Your profile</h1>
        <ProfileForm profile={profile} email={user.email ?? ''} />
      </section>
      {!realEmail && <PinPanel hasPin={hasPin} name={profile.display_name} retry={searchParams.pin === 'retry'} />}
      <SaveAccount anonymous={anonymous} pendingEmail={user.new_email ?? null} />
      <LogoutPanel anonymous={anonymous} />
    </main>
  );
}
