import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; reset?: string } }) {
  return (
    <AuthShell title="Welcome back" sub={searchParams.reset ? 'Your password was updated. Log in with the new one.' : 'For accounts you’ve saved with an email. New here? Start with just your name.'}>
      <LoginForm next={searchParams.next} />
    </AuthShell>
  );
}
