import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { fmtInviteCode } from '@/lib/items';
import { getSessionUser } from '@/lib/supabase/server';
import { JoinButton } from './JoinButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const { db } = await getSessionUser();
  const { data } = await db.rpc('get_invitation', { p_code: params.code });
  return {
    title: data ? `Join ${data.family_name}` : 'Invitation',
    description: data ? `${data.invited_by} invited you to share Christmas wishlists with ${data.family_name}.` : undefined,
    robots: { index: false },
  };
}

export default async function JoinPage({ params }: { params: { code: string } }) {
  const { db, user } = await getSessionUser();
  const { data: inv } = await db.rpc('get_invitation', { p_code: params.code });
  const back = `/join/${params.code}`;
  if (!inv) {
    return (
      <AuthShell title="That invitation didn’t work" sub="The code may have a typo or it has expired. Ask whoever invited you for a fresh link.">
        <Link href="/" className="btn btn-primary btn-lg">Go to Our Christmas</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Join ${inv.family_name}`} sub={`${inv.invited_by} invited you. ${inv.member_count} ${inv.member_count === 1 ? 'person is' : 'people are'} already sharing wishlists here.`}>
      <p className="invite-code">{fmtInviteCode(params.code.toUpperCase().replace(/-/g, ''))}</p>
      {user ? (
        inv.already_member
          ? <Link href="/" className="btn btn-primary btn-lg">You’re already in. Open the dashboard</Link>
          : <JoinButton code={params.code} familyName={inv.family_name} />
      ) : (
        <div className="form">
          <Link href={`/signup?next=${encodeURIComponent(back)}`} className="btn btn-festive btn-lg">Join with just your name</Link>
          <p className="authcard-alt">Saved your account with an email? <Link href={`/login?next=${encodeURIComponent(back)}`}>Log in</Link></p>
        </div>
      )}
    </AuthShell>
  );
}
