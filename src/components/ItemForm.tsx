'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProductResponse } from '../lib/server/types';
import { lookupProduct, uploadItemImage } from '../lib/productClient';
import { centsToInput, formatUSD, parsePrice } from '../lib/money';
import { parseUrl } from '../lib/url';
import { storeLabel } from '../lib/stores';
import type { DescriptionSource, ItemDraft, WishlistItem } from '../types';
import { RefreshIcon, SparkIcon } from './Icons';
import { Modal } from './Modal';
import { StarRating } from './StarRating';

interface Props {
  open: boolean;
  editing: WishlistItem | null;
  onClose: () => void;
  onSave: (draft: ItemDraft) => void;
}

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; forUrl: string }
  | { state: 'done'; result: ProductResponse; forUrl: string };

type Field = 'name' | 'price' | 'image' | 'desc';

export function ItemForm({ open, editing, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [rating, setRating] = useState(3);
  const [description, setDescription] = useState('');
  const [descSource, setDescSource] = useState<DescriptionSource>('');
  const [reason, setReason] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [showImageLink, setShowImageLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [flash, setFlash] = useState<Partial<Record<Field, boolean>>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Fields the person typed into themselves. Autofill never overwrites these. */
  const mine = useRef<Partial<Record<Field, boolean>>>({});

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setUrl(editing?.url ?? '');
    setPrice(editing ? centsToInput(editing.priceCents) : '');
    setRating(editing?.rating ?? 3);
    setDescription(editing?.description ?? '');
    setDescSource(editing?.descriptionSource ?? '');
    setReason(editing?.reason ?? '');
    setPrivateNote(editing?.privateNote ?? '');
    setImageUrl(editing?.imageUrl ?? '');
    setImgBroken(false);
    setShowImageLink(false);
    setUploading(false);
    setUploadError(null);
    setLookup({ state: 'idle' });
    setFlash({});
    setTouched({});
    setSubmitted(false);
    mine.current = editing
      ? { name: true, price: true, image: Boolean(editing.imageUrl), desc: Boolean(editing.description) }
      : {};
    // An item without a picture: look its link up straight away to try to find one.
    const autoFind = editing && !editing.imageUrl && editing.url ? setTimeout(() => runLookup(editing.url), 60) : null;
    return () => { if (autoFind) clearTimeout(autoFind); abortRef.current?.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const urlCheck = parseUrl(url);
  const priceCheck = parsePrice(price);
  const nameError = !name.trim() ? 'Give the item a name.' : name.length > 200 ? 'Keep the name under 200 characters.' : null;
  const show = (f: string) => submitted || touched[f];
  const loading = lookup.state === 'loading';

  async function runLookup(rawUrl: string, force = false) {
    const u = parseUrl(rawUrl);
    if (!u.ok) return;
    if (!force && lookup.state !== 'idle' && lookup.forUrl === u.url) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLookup({ state: 'loading', forUrl: u.url });
    try {
      const result = await lookupProduct(u.url, mine.current.name ? name : '', ctrl.signal);
      if (ctrl.signal.aborted) return;
      setLookup({ state: 'done', result, forUrl: u.url });
      const p = result.product;
      const filled: Partial<Record<Field, boolean>> = {};
      if (p.name && (force || !mine.current.name)) { setName(p.name.slice(0, 200)); filled.name = true; }
      if (p.priceCents != null && (!mine.current.price)) { setPrice(centsToInput(p.priceCents)); filled.price = true; }
      if (p.imageUrl && (force || !mine.current.image)) { setImageUrl(p.imageUrl); setImgBroken(false); filled.image = true; }
      if (p.description && (force || !mine.current.desc)) {
        setDescription(p.description.slice(0, 400));
        setDescSource(p.descriptionSource ?? 'page');
        filled.desc = true;
      }
      setFlash(filled);
      setTimeout(() => setFlash({}), 1600);
      if (result.status !== 'found' && !name.trim()) setTimeout(() => document.getElementById('f-name')?.focus(), 50);
    } catch {
      /* aborted */
    }
  }

  const onUrlChange = (value: string) => {
    setUrl(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const u = parseUrl(value);
    // Typed or pasted a full-looking link: look it up after a short pause.
    if (u.ok && (/\.[a-z]{2,}$/i.test(u.host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(u.host)) && value.length > 10) {
      debounceRef.current = setTimeout(() => runLookup(value), 700);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const saved = await uploadItemImage(file);
      setImageUrl(saved);
      setImgBroken(false);
      mine.current.image = true;
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || !urlCheck.ok || !priceCheck.ok) {
      const firstBad = document.querySelector<HTMLElement>('.field.has-error input');
      firstBad?.focus();
      return;
    }
    onSave({
      name: name.trim(),
      url: urlCheck.url,
      priceCents: priceCheck.cents,
      rating,
      description: description.trim(),
      descriptionSource: description.trim() ? descSource || 'manual' : '',
      reason: reason.trim(),
      privateNote: privateNote.trim(),
      imageUrl: imgBroken ? '' : imageUrl.trim(),
    });
  };

  const result = lookup.state === 'done' ? lookup.result : null;
  const found = result?.status === 'found' ? result.product : null;
  const detected = found?.priceCents;
  const priceDiffers = detected != null && mine.current.price && (!priceCheck.ok || priceCheck.cents !== detected);
  const store = found?.store ?? (urlCheck.ok ? storeLabel(urlCheck.url) : '');
  const hasImage = Boolean(imageUrl) && !imgBroken;
  const glow = (f: Field) => (flash[f] ? ' just-filled' : '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit item' : 'Add to your wishlist'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={uploading}>{editing ? 'Save changes' : 'Add to wishlist'}</button>
        </>
      }
    >
      <form id="item-form" className="form" onSubmit={submit} noValidate>
        <div className={`field field-link ${show('url') && !urlCheck.ok ? 'has-error' : ''}`}>
          <label htmlFor="f-url">Product link</label>
          <input id="f-url" type="url" inputMode="url" value={url} autoComplete="off" {...(!editing ? { 'data-autofocus': true } : {})}
            placeholder="Paste a link from Amazon, Target, any store…"
            onChange={(e) => onUrlChange(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text').trim();
              if (parseUrl(pasted).ok) { e.preventDefault(); setUrl(pasted); runLookup(pasted); }
            }}
            onBlur={() => { setTouched((t) => ({ ...t, url: true })); if (url.trim() && url.trim() !== editing?.url) runLookup(url); }} />
          {show('url') && !urlCheck.ok && <p className="field-error">{urlCheck.error}</p>}
          {lookup.state === 'idle' && !editing && (
            <p className="field-hint">Paste a link and we’ll fill in the name, picture, description and price for you. ✨</p>
          )}
          <FinderStatus lookup={lookup} store={store} hasPrice={detected != null} hasImage={hasImage}
            onRetry={() => runLookup(url, true)} />
        </div>

        <div className={`field ${show('name') && nameError ? 'has-error' : ''}${glow('name')}`}>
          <label htmlFor="f-name">Item name</label>
          <input id="f-name" value={name} maxLength={200} placeholder={loading ? 'Looking for the name…' : 'e.g. AirPods Pro'} autoComplete="off"
            className={loading && !name ? 'is-shimmer' : ''}
            onChange={(e) => { setName(e.target.value); mine.current.name = true; }}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
          {show('name') && nameError && <p className="field-error">{nameError}</p>}
        </div>

        <div className={`field field-image${glow('image')}`}>
          <span className="label">Picture</span>
          <div className="image-row">
            <div className={`image-thumb image-thumb-lg${loading && !hasImage ? ' is-shimmer' : ''}`}>
              {hasImage
                ? <img src={imageUrl} alt={name ? `Picture of ${name}` : 'Item picture'} referrerPolicy="no-referrer" onError={() => setImgBroken(true)} />
                : <span>{loading ? '🎁' : uploading ? 'Uploading…' : 'No picture yet'}</span>}
            </div>
            <div className="image-actions">
              <button type="button" className="btn btn-soft btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Uploading…' : hasImage ? '📷 Use my own picture' : '📷 Upload a picture'}
              </button>
              {hasImage && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImageUrl(''); setImgBroken(false); mine.current.image = true; }}>Remove picture</button>
              )}
              <button type="button" className="linkish" aria-expanded={showImageLink} onClick={() => setShowImageLink((v) => !v)}>
                {showImageLink ? 'Hide picture link' : 'Or paste a picture link'}
              </button>
              <input ref={fileRef} id="f-image-file" type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
          </div>
          {imgBroken && imageUrl && <p className="field-note">That picture couldn’t be shown. Upload your own instead.</p>}
          {!hasImage && result && result.status !== 'found' && (
            <p className="field-note">Tip: on the store’s page, save the product photo (or take a screenshot) and upload it here. On a computer you can also right-click the photo, choose “Copy image address” and paste it under “Or paste a picture link”.</p>
          )}
          {uploadError && <p className="field-error">{uploadError}</p>}
          {showImageLink && (
            <input id="f-image" aria-label="Picture link" value={imageUrl.startsWith('/api/') ? '' : imageUrl} placeholder="https://…/photo.jpg" autoComplete="off"
              onChange={(e) => { setImageUrl(e.target.value); setImgBroken(false); mine.current.image = true; }} />
          )}
        </div>

        <div className="field-row">
          <div className={`field field-price ${(submitted || (touched.price && price.trim() !== '')) && !priceCheck.ok ? 'has-error' : ''}${glow('price')}`}>
            <label htmlFor="f-price">Price</label>
            <div className={`input-affix${loading && !price ? ' is-shimmer' : ''}`}>
              <span aria-hidden="true">$</span>
              <input id="f-price" inputMode="decimal" value={price} placeholder="0.00" autoComplete="off"
                onChange={(e) => { setPrice(e.target.value); mine.current.price = true; }}
                onBlur={() => {
                  setTouched((t) => ({ ...t, price: true }));
                  const p = parsePrice(price);
                  if (p.ok) setPrice(centsToInput(p.cents));
                }} />
            </div>
            {(submitted || (touched.price && price.trim() !== '')) && !priceCheck.ok && <p className="field-error">{priceCheck.error}</p>}
            {found && detected == null && !price && <p className="field-note">Couldn’t find a price on that page. Add it here.</p>}
            {priceDiffers && (
              <button type="button" className="chip chip-gold" onMouseDown={(e) => e.preventDefault()} onClick={() => setPrice(centsToInput(detected!))}>
                Use {formatUSD(detected!)} from the page
              </button>
            )}
          </div>
          <div className="field field-rating">
            <span className="label" id="f-rating-label">How badly do you want it?</span>
            <StarRating id="f-rating" value={rating} onChange={setRating} size="lg" showLabel label="How badly do you want it?" />
          </div>
        </div>

        <div className={`field${glow('desc')}`}>
          <div className="label-row">
            <label htmlFor="f-desc">Description</label>
            <DescStatus loading={loading} source={descSource} />
          </div>
          <div className={`ai-box ${loading ? 'is-loading' : ''}`}>
            <textarea id="f-desc" rows={2} maxLength={400} value={description}
              placeholder={loading ? 'Reading the product page…' : 'A sentence about what it is. Paste a link above to fill this in.'}
              onChange={(e) => { setDescription(e.target.value); setDescSource('manual'); mine.current.desc = true; }} />
            <div className="ai-actions">
              <button type="button" className="btn btn-soft btn-sm" disabled={!urlCheck.ok || loading} onClick={() => runLookup(url, true)}>
                {lookup.state === 'done' || description ? <RefreshIcon size={15} /> : <SparkIcon size={15} />}
                {loading ? 'Reading page…' : lookup.state === 'done' || description ? 'Fill in again from the link' : 'Fill in from the link'}
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-reason">Why I want it <span className="optional">optional · family can see this</span></label>
          <textarea id="f-reason" rows={2} maxLength={600} value={reason} placeholder="My old ones finally died on the train…"
            onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="f-note">Private note <span className="optional">optional · only you can see this</span></label>
          <textarea id="f-note" rows={2} maxLength={2000} value={privateNote} placeholder="Size, color, or a reminder to yourself"
            onChange={(e) => setPrivateNote(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

function FinderStatus({ lookup, store, hasPrice, hasImage, onRetry }: {
  lookup: Lookup; store: string; hasPrice: boolean; hasImage: boolean; onRetry: () => void;
}) {
  if (lookup.state === 'loading') {
    return (
      <div className="finder is-loading" role="status" aria-live="polite">
        <span className="finder-gift" aria-hidden="true">🎁</span>
        <span className="finder-text">
          <strong>Finding your Christmas present… 🎁</strong>
          <span className="finder-sub">{store ? `Peeking at ${store}` : 'Reading the page'}<span className="finder-dots" aria-hidden="true"><i /><i /><i /></span></span>
        </span>
      </div>
    );
  }
  if (lookup.state !== 'done') return null;
  const r = lookup.result;
  if (r.status === 'found') {
    const missing = [!r.product.name && 'name', !hasImage && 'picture', !hasPrice && 'price'].filter(Boolean) as string[];
    return (
      <div className="finder is-found" role="status" aria-live="polite">
        <span className="finder-gift" aria-hidden="true">✨</span>
        <span className="finder-text">
          <strong>Found it{store ? ` at ${store}` : ''}!</strong>
          <span className="finder-sub">
            {missing.length ? `Couldn’t find the ${joinWords(missing)}, so add ${missing.length > 1 ? 'those' : 'that'} below. ` : ''}
            Change anything you like, then pick your stars.
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="finder is-failed" role="status" aria-live="polite">
      <span className="finder-gift" aria-hidden="true">🧑‍🎄</span>
      <span className="finder-text">
        <strong>No luck reading that page</strong>
        <span className="finder-sub">{r.message}</span>
      </span>
      {r.status === 'failed' && <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

const joinWords = (w: string[]) => (w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`);

function DescStatus({ loading, source }: { loading: boolean; source: DescriptionSource }) {
  if (loading) return <span className="desc-status is-loading"><span className="dot-pulse" /> Reading page</span>;
  if (source === 'ai') return <span className="desc-status is-ai"><SparkIcon size={13} /> AI summary of the page</span>;
  if (source === 'page') return <span className="desc-status">From the product page</span>;
  if (source === 'manual') return <span className="desc-status">Written by you</span>;
  return null;
}
