'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <AuthShell title="Forgot your password?" sub="We’ll email you a link to choose a new one.">
      {sent ? (
        <p className="authcard-done">If <strong>{email}</strong> has an account, a reset link is on its way. Open it on this device. <Link href="/login">Back to log in</Link></p>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="fp-email">Email</label>
            <input id="fp-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <p className="authcard-alt"><Link href="/login">Back to log in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
