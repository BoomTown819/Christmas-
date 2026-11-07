'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PinField } from '@/components/auth/PinField';
import { pinError, signInWithNamePin } from '@/lib/pin';
import { safeNext } from '@/lib/safeNext';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm({ next, startWithEmail }: { next?: string; startWithEmail?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'pin' | 'email'>(startWithEmail ? 'email' : 'pin');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = () => { router.replace(safeNext(next, '/')); router.refresh(); };

  const submitPin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Type the name you used for your list.');
    const pe = pinError(pin);
    if (pe) return setError(pe === 'Choose a PIN.' ? 'Type your PIN.' : pe);
    setBusy(true);
    const r = await signInWithNamePin(name, pin);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    done();
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
    done();
  };

  if (mode === 'email') {
    return (
      <form className="form" onSubmit={submitEmail} noValidate>
        <div className="field"><label htmlFor="li-email">Email</label>
          <input id="li-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field">
          <div className="label-row"><label htmlFor="li-pass">Password</label><Link href="/forgot-password" className="small-link">Forgot password?</Link></div>
          <input id="li-pass" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="linkish-row"><button type="button" className="linkish" onClick={() => { setMode('pin'); setError(null); }}>Log in with your name and PIN instead</button></div>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={submitPin} noValidate>
      <div className="field"><label htmlFor="li-name">Your name</label>
        <input id="li-name" value={name} maxLength={40} autoComplete="username" placeholder="The name on your list" onChange={(e) => { setName(e.target.value); setError(null); }} /></div>
      <PinField id="li-pin" value={pin} onChange={(v) => { setPin(v); setError(null); }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="field-note">Forgot your PIN? Open the list on the phone or computer you used before and change it on your profile.</p>
      <div className="linkish-row"><button type="button" className="linkish" onClick={() => { setMode('email'); setError(null); }}>Saved your account with an email? Log in with email</button></div>
      <p className="authcard-alt">New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Make your wishlist</Link></p>
    </form>
  );
}
