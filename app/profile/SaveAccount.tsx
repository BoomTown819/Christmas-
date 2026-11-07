'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabaseBrowser } from '@/lib/supabase/client';

/** Lets a name-only account add an email + password so it can be used on other devices. */
export function SaveAccount({ anonymous, pendingEmail }: { anonymous: boolean; pendingEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(
    pendingEmail ? { tone: 'ok', text: `Check ${pendingEmail} for a confirmation link to finish saving your account.` } : null,
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Keep showing the confirmation after the page refreshes and the account is no longer name-only.
  if (!anonymous && !saved) return null;
  if (saved) {
    return (
      <section className="panel panel-save" data-testid="save-account-done">
        <p className="authcard-done" role="status">Saved. You can now log in with this email on any device.</p>
      </section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg({ tone: 'err', text: 'Enter an email address like name@example.com.' });
    if (password.length < 8) return setMsg({ tone: 'err', text: 'Use at least 8 characters for your password.' });
    setBusy(true);
    const db = supabaseBrowser();
    const { data, error } = await db.auth.updateUser(
      { email: email.trim(), password },
      { emailRedirectTo: `${location.origin}/auth/callback?next=/profile` },
    );
    setBusy(false);
    if (error) {
      return setMsg({ tone: 'err', text: /registered|exists/i.test(error.message) ? 'That email already belongs to another account.' : error.message });
    }
    if (data.user?.new_email && !data.user.email) {
      setMsg({ tone: 'ok', text: `Almost done. Open the link we sent to ${data.user.new_email} to finish saving your account.` });
    } else {
      setSaved(true);
      router.refresh();
    }
  };

  return (
    <section className="panel panel-save" data-testid="save-account">
      <div>
        <h2>Or save it with an email</h2>
        <p className="muted">Prefer an email and password instead of a PIN? Add them here and log in with email on any device. It’s optional.</p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="sa-email">Email</label>
          <input id="sa-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="sa-pass">Password</label>
          <input id="sa-pass" type="password" value={password} autoComplete="new-password" placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className={msg.tone === 'err' ? 'field-error' : 'authcard-done'} role="status">{msg.text}</p>}
        <div className="panel-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save my account'}</button></div>
      </form>
    </section>
  );
}

/** Logging out of a name-only account would lose it, so that gets a clear warning first. */
export function LogoutPanel({ anonymous }: { anonymous: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const logout = () => (document.getElementById('logout-form') as HTMLFormElement | null)?.submit();
  return (
    <form id="logout-form" action="/auth/signout" method="post" className="panel panel-row">
      <div>
        <h2>Log out</h2>
        <p className="muted">{anonymous ? 'Set a PIN first, or you won’t be able to get back into this list.' : 'Your wishlist stays saved. Log back in any time with your name and PIN.'}</p>
      </div>
      <button type={anonymous ? 'button' : 'submit'} className="btn btn-ghost" onClick={anonymous ? () => setConfirming(true) : undefined}>Log out</button>
      <ConfirmDialog open={confirming} title="Log out without a PIN?" confirmLabel="Log out anyway"
        message="You haven’t set a PIN, so once you log out there’s no way back into this wishlist from any device."
        onCancel={() => setConfirming(false)} onConfirm={logout} />
    </form>
  );
}
