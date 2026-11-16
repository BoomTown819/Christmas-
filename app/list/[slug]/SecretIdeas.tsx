'use client';
import '@/additions.css';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalIcon } from '@/components/Icons';
import { centsToInput, formatUSD, parsePrice } from '@/lib/money';
import { lookupProduct } from '@/lib/productClient';
import { possessive } from '@/lib/items';
import { storeLabel } from '@/lib/stores';
import { supabaseBrowser } from '@/lib/supabase/client';
import { parseUrl } from '@/lib/url';

interface Idea {
  id: string; title: string; url: string; image_url: string; price_cents: number | null; note: string;
  author_name: string; is_mine: boolean; claimed_by_name: string | null; claimed_by_me: boolean; bought: boolean;
}

/**
 * Gift ideas family members suggest for someone. The database never returns these to the
 * list's owner, so this whole section simply doesn't exist for them.
 */
export function SecretIdeas({ slug, owner, onToast }: { slug: string; owner: string; onToast: (msg: string) => void }) {
  const db = supabaseBrowser();
  const [allowed, setAllowed] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await db.rpc('get_gift_ideas', { p_slug: slug });
    setIdeas((data as Idea[]) ?? []);
  }, [db, slug]);

  useEffect(() => {
    let live = true;
    db.rpc('can_add_ideas', { p_slug: slug }).then(({ data }: { data: boolean | null }) => {
      if (!live) return;
      setAllowed(Boolean(data));
      if (data) load();
    });
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 8000);
    return () => { live = false; clearInterval(t); };
  }, [db, slug, load]);

  if (!allowed) return null;

  const act = async (id: string, fn: string, args: Record<string, unknown>, msg: string) => {
    setBusy(id);
    const { error } = await db.rpc(fn, args);
    setBusy(null);
    if (error) onToast(error.message);
    else { onToast(msg); load(); }
  };

  return (
    <section className="ideas" aria-labelledby="ideas-title" data-testid="secret-ideas">
      <div className="ideas-head">
        <div>
          <h2 id="ideas-title">🤫 Secret gift ideas for {owner}</h2>
          <p className="muted">Ideas from family that {owner} can’t see. Know something {owner} would love? Add it here.</p>
        </div>
        {!adding && <button type="button" className="btn btn-festive" onClick={() => setAdding(true)}>＋ Add a secret idea</button>}
      </div>

      {adding && <IdeaForm slug={slug} owner={owner} onCancel={() => setAdding(false)}
        onAdded={() => { setAdding(false); onToast('Secret idea added 🤫'); load(); }} />}

      {ideas.length === 0 && !adding && <p className="ideas-empty">No secret ideas yet. Be the first elf to add one!</p>}

      <ul className="idea-list">
        {ideas.map((i) => {
          const store = i.url ? storeLabel(i.url) : '';
          return (
            <li key={i.id} className={`idea${i.claimed_by_name ? ' is-claimed' : ''}`} data-testid="idea">
              <div className="idea-thumb">{i.image_url ? <img src={i.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span aria-hidden="true">💡</span>}</div>
              <div className="idea-body">
                <h3 className="idea-title">{i.title}</h3>
                <p className="idea-meta">
                  {i.price_cents != null && <span className="card-price">{formatUSD(i.price_cents)}</span>}
                  {store && <span>{store}</span>}
                  <span>Idea from {i.is_mine ? 'you' : i.author_name}</span>
                </p>
                {i.note && <p className="idea-note">“{i.note}”</p>}
                {i.claimed_by_name && (
                  <p className="idea-status">{i.claimed_by_me ? (i.bought ? 'You bought this ✓' : 'You’re getting this') : `${i.bought ? 'Bought' : 'Being bought'} by ${i.claimed_by_name}`}</p>
                )}
                <div className="idea-actions">
                  {i.url && <a className="btn btn-sm btn-ghost" href={i.url} target="_blank" rel="noopener noreferrer">Visit site <ExternalIcon size={14} /></a>}
                  {!i.claimed_by_name && <button type="button" className="btn btn-sm btn-festive" disabled={busy === i.id}
                    onClick={() => act(i.id, 'claim_gift_idea', { p_id: i.id, p_claim: true }, `You’re getting “${i.title}” 🎁`)}>I’ll get this! 🎁</button>}
                  {i.claimed_by_me && (i.bought
                    ? <button type="button" className="btn btn-sm btn-ghost" disabled={busy === i.id} onClick={() => act(i.id, 'set_idea_bought', { p_id: i.id, p_bought: false }, 'Marked not bought yet')}>Not bought yet</button>
                    : <button type="button" className="btn btn-sm btn-primary" disabled={busy === i.id} onClick={() => act(i.id, 'set_idea_bought', { p_id: i.id, p_bought: true }, 'Marked as bought ✓')}>Mark as bought</button>)}
                  {i.claimed_by_me && <button type="button" className="btn btn-sm btn-quiet-danger" disabled={busy === i.id} onClick={() => act(i.id, 'claim_gift_idea', { p_id: i.id, p_claim: false }, 'Let it go. Someone else can get it now.')}>Let someone else get it</button>}
                  {i.is_mine && <button type="button" className="btn btn-sm btn-quiet-danger" disabled={busy === i.id} aria-label={`Delete idea ${i.title}`}
                    onClick={() => act(i.id, 'delete_gift_idea', { p_id: i.id }, 'Idea deleted')}>Delete idea</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IdeaForm({ slug, owner, onCancel, onAdded }: { slug: string; owner: string; onCancel: () => void; onAdded: () => void }) {
  const db = supabaseBrowser();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [image, setImage] = useState('');
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typed = useRef({ title: false, price: false });
  const lastLooked = useRef('');

  const find = async (raw: string) => {
    const u = parseUrl(raw);
    if (!u.ok || lastLooked.current === u.url) return;
    lastLooked.current = u.url;
    setFinding(true);
    const r = await lookupProduct(u.url, '');
    setFinding(false);
    const p = r.product;
    if (p.name && !typed.current.title) setTitle(p.name.slice(0, 200));
    if (p.priceCents != null && !typed.current.price) setPrice(centsToInput(p.priceCents));
    if (p.imageUrl) setImage(p.imageUrl);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('What’s the idea? Give it a name.');
    const u = url.trim() ? parseUrl(url) : null;
    if (u && !u.ok) return setError(u.error);
    const p = price.trim() ? parsePrice(price) : null;
    if (p && !p.ok) return setError(p.error);
    setBusy(true);
    const { error: err } = await db.rpc('add_gift_idea', {
      p_slug: slug, p_title: title.trim(), p_url: u && u.ok ? u.url : '', p_price_cents: p && p.ok ? p.cents : null,
      p_note: note.trim(), p_image_url: image,
    });
    setBusy(false);
    if (err) return setError(err.message);
    onAdded();
  };

  return (
    <form className="idea-form form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="idea-url">Link <span className="optional">optional</span></label>
        <input id="idea-url" type="url" inputMode="url" value={url} placeholder="Paste a link and we’ll fill in the rest" autoComplete="off"
          onChange={(e) => { setUrl(e.target.value); if (parseUrl(e.target.value).ok && e.target.value.length > 10) find(e.target.value); }} />
        {finding && <p className="field-note" role="status">Finding the gift… 🎁</p>}
      </div>
      <div className="field">
        <label htmlFor="idea-title">Gift idea</label>
        <input id="idea-title" value={title} maxLength={200} placeholder="e.g. Golf gloves" autoComplete="off"
          onChange={(e) => { setTitle(e.target.value); typed.current.title = true; }} />
      </div>
      <div className="field-row">
        <div className="field field-price">
          <label htmlFor="idea-price">Price <span className="optional">optional</span></label>
          <div className="input-affix"><span aria-hidden="true">$</span>
            <input id="idea-price" inputMode="decimal" value={price} placeholder="0.00" autoComplete="off"
              onChange={(e) => { setPrice(e.target.value); typed.current.price = true; }} /></div>
        </div>
        <div className="field">
          <label htmlFor="idea-note">Why it’s a good idea <span className="optional">optional</span></label>
          <input id="idea-note" value={note} maxLength={500} placeholder={`${possessive(owner)} been talking about it`} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <p className="field-note">🤫 Only family gift buyers see this. {owner} never will.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="panel-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add secret idea'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
