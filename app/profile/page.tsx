import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { db, user } = await getSessionUser();
  if (!user) redirect('/login?next=/profile');
  const { data: profile } = await db.from('profiles').select('id, display_name, avatar, avatar_color').eq('id', user.id).single();
  if (!profile) redirect('/login');
  return (
    <main className="main main-narrow">
      <section className="panel">
        <h1 className="panel-title">Your profile</h1>
        <ProfileForm profile={profile} email={user.email ?? ''} />
      </section>
      <form action="/auth/signout" method="post" className="panel panel-row">
        <div><h2>Log out</h2><p className="muted">Your wishlist stays saved in your account.</p></div>
        <button type="submit" className="btn btn-ghost">Log out</button>
      </form>
    </main>
  );
}
