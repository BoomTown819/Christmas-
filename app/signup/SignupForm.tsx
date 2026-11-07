'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarPicker } from '@/components/auth/AvatarPicker';
import { PIN_HINT, PinField } from '@/components/auth/PinField';
import { nameStatus, pinError, setPin, signInWithNamePin } from '@/lib/pin';
import { safeNext } from '@/lib/safeNext';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Sign up with a name and a PIN. If that name already has an account, the same PIN
 * signs you back into it instead of making a second account.
 */
export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pin, setPinValue] = useState('');
  const [avatar, setAvatar] = useState('santa');
  const [color, setColor] = useState('red');
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next, '/character?new=1');

  const go = (to: string) => { router.replace(to); router.refresh(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const nm = name.trim();
    if (!nm) return setError('Add your name so family knows whose list this is.');
    const pe = pinError(pin);
    if (pe) return setError(pe);
    setBusy(true);

    const status = await nameStatus(nm);
    if (status === 'taken') {
      // This name already has a list: the PIN takes them back into it.
      const r = await signInWithNamePin(nm, pin);
      if (r.ok) return go(safeNext(next, '/?welcome=back'));
      setBusy(false);
      setTaken(nm);
      return setError(r.message);
    }
    if (status === 'error') { setBusy(false); return setError('Couldn’t reach the server. Try again in a moment.'); }

    const db = supabaseBrowser();
    const { error: e1 } = await db.auth.signInAnonymously({
      options: { data: { display_name: nm, avatar, avatar_color: color } },
    });
    if (e1) {
      setBusy(false);
      return setError(/anonymous/i.test(e1.message)
        ? 'Sign-up is switched off in Supabase. Turn on “Allow anonymous sign-ins” (see the README).'
        : e1.message);
    }
    const pinProblem = await setPin(pin);
    setBusy(false);
    if (pinProblem) {
      // Very rare: someone took this name a moment ago. The list is made; they can set a PIN on their profile.
      return go('/profile?pin=retry#pin');
    }
    go(dest);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="su-name">Your name</label>
        <input id="su-name" value={name} maxLength={40} autoComplete="given-name" placeholder="e.g. Sonny"
          onChange={(e) => { setName(e.target.value); setTaken(null); setError(null); }} /></div>
      <PinField id="su-pin" label="Choose a PIN" value={pin} onChange={(v) => { setPinValue(v); setError(null); }} autoComplete="new-password" hint={PIN_HINT} />
      {taken && (
        <div className="pin-welcome" role="status" data-testid="name-taken">
          <strong>“{taken}” already has a list.</strong>
          <span className="muted">If it’s you, type your PIN above to get back into it. If it’s someone else, add your last name or a nickname, like “{taken} G.”</span>
        </div>
      )}
      {!taken && <div className="field"><span className="label">Pick an avatar</span>
        <AvatarPicker avatar={avatar} color={color} onChange={(a, c) => { setAvatar(a); setColor(c); }} /></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'One moment…' : taken ? 'Get back into my list' : 'Start my wishlist'}</button>
      <p className="field-note">No email needed. On a new phone or computer, just type the same name and PIN to get back into your list.</p>
      <p className="authcard-alt">Already have a list? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in with your name and PIN</Link></p>
    </form>
  );
}
