'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarPicker } from '@/components/auth/AvatarPicker';
import { safeNext } from '@/lib/safeNext';
import { supabaseBrowser } from '@/lib/supabase/client';

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('santa');
  const [color, setColor] = useState('red');
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next, '/my-list');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name so family knows whose list this is.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim(), avatar, avatar_color: color },
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
      },
    });
    setBusy(false);
    if (error) return setError(error.message.includes('registered') ? 'That email already has an account. Log in instead.' : error.message);
    if (!data.session) return setCheckEmail(true);
    router.replace(dest);
    router.refresh();
  };

  if (checkEmail) {
    return <p className="authcard-done">Check <strong>{email}</strong> for a confirmation link. Open it on this device to finish signing up.</p>;
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="su-name">Your name</label>
        <input id="su-name" value={name} maxLength={40} autoComplete="given-name" placeholder="e.g. Sonny" onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><span className="label">Pick an avatar</span>
        <AvatarPicker avatar={avatar} color={color} onChange={(a, c) => { setAvatar(a); setColor(c); }} /></div>
      <div className="field"><label htmlFor="su-email">Email</label>
        <input id="su-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="su-pass">Password</label>
        <input id="su-pass" type="password" value={password} autoComplete="new-password" placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</button>
      <p className="authcard-alt">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></p>
    </form>
  );
}
