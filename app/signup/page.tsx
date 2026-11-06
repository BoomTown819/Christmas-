import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Sign up' };

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <AuthShell title="Make your wishlist" sub="Just your name and an avatar. Your own list, your own link, and a family dashboard to see everyone’s.">
      <SignupForm next={searchParams.next} />
    </AuthShell>
  );
}
