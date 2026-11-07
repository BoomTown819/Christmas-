import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; reset?: string; email?: string } }) {
  return (
    <AuthShell title="Welcome back" sub={searchParams.reset ? 'Your password was updated. Log in with the new one.' : 'Type your name and PIN to open your list on this device.'}>
      <LoginForm next={searchParams.next} startWithEmail={Boolean(searchParams.reset || searchParams.email)} />
    </AuthShell>
  );
}
