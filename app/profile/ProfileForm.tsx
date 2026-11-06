'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarPicker } from '@/components/auth/AvatarPicker';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Profile } from '@/types';

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [color, setColor] = useState(profile.avatar_color);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setMsg('Your name can’t be empty.');
    setBusy(true);
    const { error } = await supabaseBrowser().from('profiles').update({ display_name: name.trim(), avatar, avatar_color: color }).eq('id', profile.id);
    setBusy(false);
    setMsg(error ? 'Couldn’t save. Try again.' : 'Saved');
    if (!error) router.refresh();
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="pf-name">Display name</label>
        <input id="pf-name" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setMsg(null); }} /></div>
      <div className="field"><span className="label">Avatar</span>
        <AvatarPicker avatar={avatar} color={color} onChange={(a, c) => { setAvatar(a); setColor(c); setMsg(null); }} /></div>
      {email && <div className="field"><span className="label">Email</span><p className="muted">{email} · only you can see this</p></div>}
      <div className="panel-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        {msg && <span className="muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}
