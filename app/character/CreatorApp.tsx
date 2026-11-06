'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CameraCapture } from '@/components/character/CameraCapture';
import { FaceCropper } from '@/components/character/FaceCropper';
import { CharacterSprite } from '@/components/character/CharacterSprite';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHead } from '@/components/site/Village';
import { ACTIVITIES, type Activity, type CharacterCard } from '@/lib/activities';
import { OUTFIT_OPTIONS, OUTFIT_PARTS, PART_LABELS, randomOutfit, type Outfit, type OutfitPart } from '@/lib/outfit';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Props {
  userId: string;
  name: string;
  initial: CharacterCard | null;
  animNote: string;
  showPublicly: boolean;
  hasPhoto: boolean;
  isNew: boolean;
  aiEnabled: boolean;
  outfit: Outfit;
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

export function CreatorApp({ userId, name: initialName, initial, animNote, showPublicly: initialShow, hasPhoto: initialHasPhoto, isNew, aiEnabled, outfit: initialOutfit }: Props) {
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<Outfit>(initialOutfit);
  const outfitTimer = useRef<ReturnType<typeof setTimeout>>();

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
    try { setCropSrc((await shrinkPhoto(f)).preview); } catch { setError('That photo couldn’t be opened. Try a different one.'); }
  };

  const animate = async (act: Activity, withOutfit: Outfit = outfit) => {
    setBusy('animating'); setError(null);
    const res = await fetch('/api/character/animate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activity: act, outfit: withOutfit }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (body.character) setCharacter(body.character);
    if (body.mode === 'free') setNote('');
    else if (body.animationError) setNote(body.animationError);
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
      body: JSON.stringify({ activity, outfit, photo: photo ? { mime: photo.mime, data: photo.data } : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); return setError(body.error ?? 'Your character couldn’t be drawn. Try again.'); }
    setCharacter(body.character); setHasPhoto(true); setPhoto(null);
    if (body.mode === 'free') { setBusy(null); setNote(''); router.refresh(); return; }
    await animate(activity);
  };

  /** Changing clothes re-dresses an existing free character right away (no photo needed). */
  const changeOutfit = (next: Outfit) => {
    setOutfit(next);
    if (!character || aiEnabled) return;
    clearTimeout(outfitTimer.current);
    outfitTimer.current = setTimeout(() => animate(character.activity, next), 250);
  };

  const removePhoto = async () => {
    setConfirm(null);
    await db.from('character_photos').delete().eq('user_id', userId);
    setHasPhoto(false); setPhoto(null); flash('Photo deleted');
  };
  const deleteCharacter = async () => {
    setConfirm(null);
    await db.from('characters').delete().eq('user_id', userId);
    setCharacter(null); setNote(''); flash('Character deleted. Make a new one any time.'); router.refresh();
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
              <p className="stage-busy">{busy === 'drawing' ? 'Drawing your character…' : 'Animating…'}<br /><small>{aiEnabled ? 'This can take up to a minute' : 'Just a moment'}</small></p>
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
                  : character.anim ? <span className={`anim-label${aiEnabled ? ' is-ai' : ''}`}>{aiEnabled ? '✨ AI animation' : '🎮 8-bit animation'}</span>
                  : <span className="anim-label">{aiEnabled ? 'Animated in your browser' : '8-bit you · animated in your browser'}</span>}
              </p>
            )}
          </section>

          <section className="panel">
            <div className="field"><label htmlFor="ch-name">Name or nickname</label>
              <input id="ch-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveName} /></div>

            <div className="field">
              <span className="label">Your photo <span className="optional">only you can see it</span></span>
              <div className="photo-drop">
                {photo ? <img src={photo.preview} alt="Selected photo" /> : <span aria-hidden="true" style={{ fontSize: 30 }}>📸</span>}
                <span>{photo ? 'Looking good! Retake or pick another below' : hasPhoto ? 'Photo saved. Take or choose a new one to change it' : 'Add a clear photo of just yourself'}</span>
                <div className="photo-buttons">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setCameraOpen(true)}>📷 Take a photo</button>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>🖼️ Choose from files</button>
                </div>
                <input ref={fileRef} id="ch-photo" type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Choose a photo from files" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </div>
              <p className="field-note">{aiEnabled
                ? 'Your photo is sent to OpenAI only to draw your character, and stored privately so you can regenerate later. Delete it any time.'
                : 'This website turns your face into a little 8-bit player itself: nothing is sent anywhere else. Your photo is stored privately so you can redo it later. Delete it any time.'}</p>
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

            <div className="field">
              <div className="label-row">
                <span className="label">What you’re wearing</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeOutfit(randomOutfit())}>🎲 Shuffle outfit</button>
              </div>
              <div className="outfit-grid">
                {OUTFIT_PARTS.map((part: OutfitPart) => (
                  <div key={part} className="outfit-row" role="radiogroup" aria-label={PART_LABELS[part]}>
                    <span className="outfit-part">{PART_LABELS[part]}</span>
                    <div className="outfit-chips">
                      {Object.entries(OUTFIT_OPTIONS[part]).map(([value, label]) => (
                        <button key={value} type="button" role="radio" aria-checked={outfit[part] === value}
                          className={`fchip${outfit[part] === value ? ' is-on' : ''}`}
                          onClick={() => changeOutfit({ ...outfit, [part]: value } as Outfit)}>{label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {aiEnabled && character && <p className="field-note">Outfit changes apply the next time you regenerate your character.</p>}
            </div>

            {error && <p className="field-error" role="alert">{error}</p>}
            {note && !error && character && !character.anim && (
              <p className="field-note">The AI animation didn’t work ({note.replace(/\.$/, '')}), so your character is animated in your browser instead.</p>
            )}

            {!character ? (
              <button type="button" className="btn btn-8bit" disabled={Boolean(busy)} onClick={generate}>Generate my Christmas character 🎅</button>
            ) : (
              <div className="creator-actions">
                {(previewActivity || (aiEnabled && !character.anim)) && (
                  <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => animate(activity)}>
                    {previewActivity ? `Animate: ${ACTIVITIES[activity].label}` : 'Try the AI animation again'}
                  </button>
                )}
                <button type="button" className="btn btn-soft" disabled={Boolean(busy) || (!photo && !hasPhoto)} onClick={generate}>
                  {photo ? 'Use this photo' : 'Regenerate character'}
                </button>
                <button type="button" className="btn btn-soft" onClick={() => setCameraOpen(true)}>Take a new photo</button>
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

            {character && (
              <div className="danger-zone">
                <div><strong>Don’t want a character?</strong><p className="muted">Delete it and it disappears everywhere: the dashboard, your list and your gift claims. You can always make a new one.</p></div>
                <div className="creator-actions">
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirm('character')}>Delete my character</button>
                  {hasPhoto && <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirm('photo')}>Delete my photo</button>}
                </div>
              </div>
            )}
            {!character && (
              <div className="creator-actions">
                {hasPhoto && <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirm('photo')}>Delete my photo</button>}
                <Link className="btn btn-ghost btn-sm" href="/my-list">{isNew ? 'Skip for now' : 'I don’t want a character'}</Link>
              </div>
            )}
          </section>
        </div>
        {toast && <div className="toasts" role="status"><div className="toast"><span>{toast}</span></div></div>}
      </main>
      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)}
        onPhoto={(dataUrl) => { setError(null); setCropSrc(dataUrl); }} />
      <FaceCropper src={cropSrc} onCancel={() => setCropSrc(null)}
        onDone={(dataUrl) => { setCropSrc(null); if (fileRef.current) fileRef.current.value = ''; setPhoto({ mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl }); }} />
      <ConfirmDialog open={confirm === 'photo'} title="Delete your photo?" confirmLabel="Delete photo"
        message="Your character stays. You’ll need to upload a photo again to regenerate it." onCancel={() => setConfirm(null)} onConfirm={removePhoto} />
      <ConfirmDialog open={confirm === 'character'} title="Delete your character?" confirmLabel="Delete character"
        message="You won’t have a character anywhere on the site. Your photo stays (so you can make a new one quickly) unless you delete it too." onCancel={() => setConfirm(null)} onConfirm={deleteCharacter} />
    </>
  );
}
