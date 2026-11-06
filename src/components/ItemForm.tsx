'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DescribeResponse } from '../lib/server/types';
import { describeProduct } from '../lib/describeClient';
import { centsToInput, formatUSD, parsePrice } from '../lib/money';
import { parseUrl } from '../lib/url';
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
  | { state: 'loading' }
  | { state: 'done'; result: DescribeResponse; forUrl: string };

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
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const descTouchedRef = useRef(false);

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
    setLookup({ state: 'idle' });
    setTouched({});
    setSubmitted(false);
    descTouchedRef.current = Boolean(editing?.description);
    return () => abortRef.current?.abort();
  }, [open, editing]);

  const urlCheck = parseUrl(url);
  const priceCheck = parsePrice(price);
  const nameError = !name.trim() ? 'Give the item a name.' : name.length > 200 ? 'Keep the name under 200 characters.' : null;
  const show = (f: string) => submitted || touched[f];

  async function runLookup(force: boolean) {
    const u = parseUrl(url);
    if (!u.ok) return;
    if (!force && lookup.state === 'done' && lookup.forUrl === u.url) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLookup({ state: 'loading' });
    try {
      const result = await describeProduct(u.url, name, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setLookup({ state: 'done', result, forUrl: u.url });
      if (result.status === 'ok' && (force || !descTouchedRef.current)) {
        setDescription(result.description);
        setDescSource(result.source);
        descTouchedRef.current = false;
      }
      if ((result.status === 'ok' || result.status === 'no_content')) {
        if (result.imageUrl && (force || !imageUrl)) { setImageUrl(result.imageUrl); setImgBroken(false); }
        if (!name.trim() && result.title) setName(result.title.slice(0, 120));
      }
    } catch {
      /* aborted */
    }
  }

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
  const detected = result && 'detectedPriceCents' in result ? result.detectedPriceCents : undefined;
  const priceDiffers = detected != null && (!priceCheck.ok || priceCheck.cents !== detected);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit item' : 'Add to your wishlist'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="item-form" className="btn btn-primary">{editing ? 'Save changes' : 'Add to wishlist'}</button>
        </>
      }
    >
      <form id="item-form" className="form" onSubmit={submit} noValidate>
        <div className={`field ${show('name') && nameError ? 'has-error' : ''}`}>
          <label htmlFor="f-name">Item name</label>
          <input id="f-name" data-autofocus value={name} maxLength={200} placeholder="e.g. AirPods Pro" autoComplete="off"
            onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
          {show('name') && nameError && <p className="field-error">{nameError}</p>}
        </div>

        <div className={`field ${show('url') && !urlCheck.ok ? 'has-error' : ''}`}>
          <label htmlFor="f-url">Website link</label>
          <input id="f-url" type="url" inputMode="url" value={url} placeholder="Paste a link from any store" autoComplete="off"
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (parseUrl(pasted).ok) setTimeout(() => document.getElementById('f-url')?.blur(), 0);
            }}
            onBlur={() => { setTouched((t) => ({ ...t, url: true })); runLookup(false); }} />
          {show('url') && !urlCheck.ok && <p className="field-error">{urlCheck.error}</p>}
        </div>

        <div className="field-row">
          <div className={`field field-price ${(submitted || (touched.price && price.trim() !== '')) && !priceCheck.ok ? 'has-error' : ''}`}>
            <label htmlFor="f-price">Price</label>
            <div className="input-affix">
              <span aria-hidden="true">$</span>
              <input id="f-price" inputMode="decimal" value={price} placeholder="0.00" autoComplete="off"
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, price: true }));
                  const p = parsePrice(price);
                  if (p.ok) setPrice(centsToInput(p.cents));
                }} />
            </div>
            {(submitted || (touched.price && price.trim() !== '')) && !priceCheck.ok && <p className="field-error">{priceCheck.error}</p>}
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

        <div className="field">
          <div className="label-row">
            <label htmlFor="f-desc">Description</label>
            <DescStatus lookup={lookup} source={descSource} />
          </div>
          <div className={`ai-box ${lookup.state === 'loading' ? 'is-loading' : ''}`}>
            <textarea id="f-desc" rows={2} maxLength={400} value={description}
              placeholder={lookup.state === 'loading' ? 'Reading the product page…' : 'One sentence about what it is. Paste a link above to generate one.'}
              onChange={(e) => { setDescription(e.target.value); setDescSource('manual'); descTouchedRef.current = true; }} />
            <div className="ai-actions">
              <button type="button" className="btn btn-soft btn-sm" disabled={!urlCheck.ok || lookup.state === 'loading'} onClick={() => runLookup(true)}>
                {lookup.state === 'done' || description ? <RefreshIcon size={15} /> : <SparkIcon size={15} />}
                {lookup.state === 'loading' ? 'Reading page…' : lookup.state === 'done' || description ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>
          {result && result.status !== 'ok' && <p className="field-note">{result.message}</p>}
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

        <div className="field field-image">
          <label htmlFor="f-image">Image link <span className="optional">optional · filled from the page when possible</span></label>
          <div className="image-row">
            <div className="image-thumb">
              {imageUrl && !imgBroken
                ? <img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgBroken(true)} />
                : <span>No image</span>}
            </div>
            <input id="f-image" value={imageUrl} placeholder="https://…/photo.jpg" autoComplete="off"
              onChange={(e) => { setImageUrl(e.target.value); setImgBroken(false); }} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

function DescStatus({ lookup, source }: { lookup: Lookup; source: DescriptionSource }) {
  if (lookup.state === 'loading') return <span className="desc-status is-loading"><span className="dot-pulse" /> Reading page</span>;
  if (lookup.state === 'done' && lookup.result.status !== 'ok') return <span className="desc-status is-warn">Write it yourself</span>;
  if (source === 'ai') return <span className="desc-status is-ai"><SparkIcon size={13} /> AI summary of the page</span>;
  if (source === 'page') return <span className="desc-status">From the product page</span>;
  if (source === 'manual') return <span className="desc-status">Written by you</span>;
  return null;
}
