'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true); setError(null);
    const db = supabaseBrowser();
    const { error } = await db.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message.includes('session') ? 'This reset link has expired. Request a new one.' : error.message);
    await db.auth.signOut();
    router.replace('/login?reset=1');
    router.refresh();
  };

  return (
    <AuthShell title="Choose a new password">
      <form className="form" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="rp-pass">New password</label>
          <input id="rp-pass" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="field"><label htmlFor="rp-confirm">Type it again</label>
          <input id="rp-confirm" type="password" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} /></div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthShell>
  );
}
