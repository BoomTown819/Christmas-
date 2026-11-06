'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarPicker } from '@/components/auth/AvatarPicker';
import { safeNext } from '@/lib/safeNext';
import { supabaseBrowser } from '@/lib/supabase/client';

/** Name-only sign-up: no email or password. The account lives in this browser
 *  until the person chooses to save it with an email on their profile. */
export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('santa');
  const [color, setColor] = useState('red');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next, '/character?new=1');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name so family knows whose list this is.');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInAnonymously({
      options: { data: { display_name: name.trim(), avatar, avatar_color: color } },
    });
    setBusy(false);
    if (error) {
      return setError(/anonymous/i.test(error.message)
        ? 'Name-only sign-up is switched off in Supabase. Turn on “Allow anonymous sign-ins” (see the README).'
        : error.message);
    }
    router.replace(dest);
    router.refresh();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="su-name">Your name</label>
        <input id="su-name" value={name} maxLength={40} autoComplete="given-name" placeholder="e.g. Sonny" onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><span className="label">Pick an avatar</span>
        <AvatarPicker avatar={avatar} color={color} onChange={(a, c) => { setAvatar(a); setColor(c); }} /></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Making your list…' : 'Start my wishlist'}</button>
      <p className="field-note">No email or password needed. Your list is saved to this device. Want it on another phone or computer too? Add an email later on your profile.</p>
      <p className="authcard-alt">Saved your account with an email before? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></p>
    </form>
  );
}
