'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CharacterSprite } from '@/components/character/CharacterSprite';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHead } from '@/components/site/Village';
import { ACTIVITIES, type Activity, type CharacterCard } from '@/lib/activities';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Props {
  userId: string;
  name: string;
  initial: CharacterCard | null;
  animNote: string;
  showPublicly: boolean;
  hasPhoto: boolean;
  isNew: boolean;
}

type Busy = null | 'drawing' | 'animating';

/** Shrinks a photo in the browser before upload (max 768px JPEG). */
async function shrinkPhoto(file: File): Promise<{ mime: string; data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const preview = c.toDataURL('image/jpeg', 0.86);
    return { mime: 'image/jpeg', data: preview.split(',')[1], preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CreatorApp({ userId, name: initialName, initial, animNote, showPublicly: initialShow, hasPhoto: initialHasPhoto, isNew }: Props) {
  const db = supabaseBrowser();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [character, setCharacter] = useState<CharacterCard | null>(initial);
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? 'waving');
  const [photo, setPhoto] = useState<{ mime: string; data: string; preview: string } | null>(null);
  const [hasPhoto, setHasPhoto] = useState(initialHasPhoto);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(animNote);
  const [showPublicly, setShowPublicly] = useState(initialShow);
  const [confirm, setConfirm] = useState<null | 'photo' | 'character'>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3000); };

  const saveName = async () => {
    const n = name.trim();
    if (!n || n === savedName) return;
    const { error } = await db.from('profiles').update({ display_name: n }).eq('id', userId);
    if (!error) { setSavedName(n); flash('Nickname saved'); router.refresh(); }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith('image/')) return setError('Pick a photo (JPG, PNG or HEIC from your camera roll).');
    try { setPhoto(await shrinkPhoto(f)); } catch { setError('That photo couldn’t be opened. Try a different one.'); }
  };

  const animate = async (act: Activity) => {
    setBusy('animating'); setError(null);
    const res = await fetch('/api/character/animate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activity: act }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (body.character) setCharacter(body.character);
    if (body.animationError) setNote(body.animationError);
    else if (res.ok) setNote('');
    else { setError(body.error ?? 'The animation didn’t work.'); setNote(body.error ?? ''); }
    router.refresh();
  };

  const generate = async () => {
    setError(null);
    await saveName();
    if (!photo && !hasPhoto) return setError('Add a photo of yourself first.');
    setBusy('drawing');
    const res = await fetch('/api/character/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activity, photo: photo ? { mime: photo.mime, data: photo.data } : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); return setError(body.error ?? 'Your character couldn’t be drawn. Try again.'); }
    setCharacter(body.character); setHasPhoto(true); setPhoto(null);
    await animate(activity);
  };

  const removePhoto = async () => {
    setConfirm(null);
    await db.from('character_photos').delete().eq('user_id', userId);
    setHasPhoto(false); setPhoto(null); flash('Photo deleted');
  };
  const deleteCharacter = async () => {
    setConfirm(null);
    await db.from('characters').delete().eq('user_id', userId);
    setCharacter(null); setNote(''); flash('Character deleted'); router.refresh();
  };
  const toggleShow = async (v: boolean) => {
    setShowPublicly(v);
    await db.from('characters').update({ show_publicly: v }).eq('user_id', userId);
  };

  const previewActivity = character && activity !== character.activity ? activity : undefined;

  return (
    <>
      <PageHead>
        <h1 className="pagehead-title">My Christmas character</h1>
        <p className="pagehead-sub">{isNew ? `Welcome, ${savedName}! Make the little 8-bit you that shows up all over the site.` : 'Your 8-bit self, for the dashboard, your list, and next to the gifts you claim.'}</p>
      </PageHead>
      <main className="main">
        <div className="creator">
          <section className="creator-stage" aria-live="polite">
            {busy ? (
              <p className="stage-busy">{busy === 'drawing' ? 'Drawing your character…' : 'Animating…'}<br /><small>This can take up to a minute</small></p>
            ) : character ? (
              <CharacterSprite character={character} name={savedName} size={192} activityOverride={previewActivity} />
            ) : photo ? (
              <img src={photo.preview} alt="Your photo" style={{ maxWidth: 200, borderRadius: 12 }} />
            ) : (
              <CharacterSprite size={128} name="Santa" />
            )}
            {character && !busy && (
              <p className="stage-caption">
                {previewActivity ? <span className="anim-label">Preview · tap “Animate” to make it</span>
                  : character.anim ? <span className="anim-label is-ai">✨ AI animation</span>
                  : <span className="anim-label">Animated in your browser</span>}
              </p>
            )}
          </section>

          <section className="panel">
            <div className="field"><label htmlFor="ch-name">Name or nickname</label>
              <input id="ch-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveName} /></div>

            <div className="field">
              <span className="label">Your photo <span className="optional">only you can see it</span></span>
              <label className="photo-drop">
                <input ref={fileRef} id="ch-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                {photo ? <img src={photo.preview} alt="Selected photo" /> : <span aria-hidden="true" style={{ fontSize: 30 }}>📸</span>}
                <span>{photo ? 'Tap to pick a different photo' : hasPhoto ? 'Photo saved. Tap to use a different one' : 'Tap to add a clear photo of yourself'}</span>
              </label>
              <p className="field-note">Your photo is sent to OpenAI only to draw your character, and stored privately so you can regenerate later. Delete it any time.</p>
            </div>

            <div className="field">
              <span className="label">Christmas activity</span>
              <div className="activity-grid" role="radiogroup" aria-label="Christmas activity">
                {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={activity === a} className={`activity-opt${activity === a ? ' is-on' : ''}`} onClick={() => setActivity(a)}>
                    <span aria-hidden="true">{ACTIVITIES[a].emoji}</span>{ACTIVITIES[a].label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="field-error" role="alert">{error}</p>}
            {note && !error && character && !character.anim && (
              <p className="field-note">The AI animation didn’t work ({note.replace(/\.$/, '')}), so your character is animated in your browser instead.</p>
            )}

            {!character ? (
              <button type="button" className="btn btn-8bit" disabled={Boolean(busy)} onClick={generate}>Generate my Christmas character 🎅</button>
            ) : (
              <div className="creator-actions">
                {(previewActivity || !character.anim) && (
                  <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => animate(activity)}>
                    {previewActivity ? `Animate: ${ACTIVITIES[activity].label}` : 'Try the AI animation again'}
                  </button>
                )}
                <button type="button" className="btn btn-soft" disabled={Boolean(busy) || (!photo && !hasPhoto)} onClick={generate}>
                  {photo ? 'Use this photo' : 'Regenerate character'}
                </button>
                <button type="button" className="btn btn-soft" onClick={() => fileRef.current?.click()}>Upload a different photo</button>
                <Link className="btn btn-gold" href="/">Save &amp; see it on the dashboard</Link>
              </div>
            )}

            {character && (
              <label className="switch-row">
                <input type="checkbox" checked={showPublicly} onChange={(e) => toggleShow(e.target.checked)} />
                <span><strong>Show my character outside my family</strong><br /><span className="muted">On my shared wishlist, and next to gifts I claim for anyone with that list’s link. Family always sees it.</span></span>
              </label>
            )}

            <div className="creator-actions">
              {hasPhoto && <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirm('photo')}>Delete my photo</button>}
              {character && <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirm('character')}>Delete my character</button>}
              {isNew && !character && <Link className="btn btn-ghost btn-sm" href="/my-list">Skip for now</Link>}
            </div>
          </section>
        </div>
        {toast && <div className="toasts" role="status"><div className="toast"><span>{toast}</span></div></div>}
      </main>
      <ConfirmDialog open={confirm === 'photo'} title="Delete your photo?" confirmLabel="Delete photo"
        message="Your character stays. You’ll need to upload a photo again to regenerate it." onCancel={() => setConfirm(null)} onConfirm={removePhoto} />
      <ConfirmDialog open={confirm === 'character'} title="Delete your character?" confirmLabel="Delete character"
        message="It disappears from the dashboard, your list and your claims. Your photo stays unless you delete it too." onCancel={() => setConfirm(null)} onConfirm={deleteCharacter} />
    </>
  );
}
