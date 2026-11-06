'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { safeNext } from '@/lib/safeNext';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
    router.replace(safeNext(next, '/'));
    router.refresh();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="li-email">Email</label>
        <input id="li-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field">
        <div className="label-row"><label htmlFor="li-pass">Password</label><Link href="/forgot-password" className="small-link">Forgot password?</Link></div>
        <input id="li-pass" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="authcard-alt">New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Make your wishlist</Link></p>
    </form>
  );
}
