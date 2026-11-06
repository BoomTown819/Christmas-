'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/festive/Decorations';
import { ExternalIcon } from '@/components/Icons';
import { ItemCard } from '@/components/ItemCard';
import { Modal } from '@/components/Modal';
import { PageHead } from '@/components/site/Village';
import { Toasts, useToasts } from '@/components/Toasts';
import { TotalPanel } from '@/components/TotalPanel';
import { AVATARS, fromPublic, possessive } from '@/lib/items';
import { formatUSD, sumCents } from '@/lib/money';
import { SORT_LABELS, sortItems } from '@/lib/organize';
import { forgetOwnedList, isOwnedHere } from '@/lib/ownedLists';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Claim, PublicWishlist, SortKey, WishlistItem } from '@/types';

const TOKENS_KEY = 'our-christmas:guest-claims';
const NAME_KEY = 'our-christmas:buyer-name';
const readTokens = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}'); } catch { return {}; } };
const writeTokens = (t: Record<string, string>) => { try { localStorage.setItem(TOKENS_KEY, JSON.stringify(t)); } catch { /* */ } };
const newToken = () => { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!); };

interface Props { list: PublicWishlist; viewerName: string | null; signedIn: boolean }

export function PublicListApp({ list, viewerName, signedIn }: Props) {
  const items = useMemo(() => list.items.map(fromPublic), [list.items]);
  const owner = list.owner.display_name;
  const title = `${possessive(owner)} Christmas Wishlist`;
  // Signed-out visitors: check (in the browser, before anything is fetched) whether this device
  // belongs to the list's owner. The buyer view, which loads claims, only mounts after that check.
  const [guard, setGuard] = useState<'checking' | 'owner' | 'buyer'>(list.viewer_is_owner ? 'owner' : signedIn ? 'buyer' : 'checking');
  useEffect(() => {
    if (guard === 'checking') setGuard(isOwnedHere(list.slug) ? 'owner' : 'buyer');
  }, [guard, list.slug]);
  const ownerView = guard === 'owner';

  return (
    <>
      <PageHead>
        <div className="pagehead-who">
          <Avatar emoji={AVATARS[list.owner.avatar] ?? '🎅'} color={list.owner.avatar_color} size={46} />
          <span className="hero-pill"><span className="hero-pill-num">{items.length}</span> {items.length === 1 ? 'gift' : 'gifts'} on the list</span>
        </div>
        <h1 className="pagehead-title">{title}</h1>
        <p className="pagehead-sub">{ownerView ? 'This is how your family sees your list.' : `Everything ${owner} is hoping to find under the tree.`}</p>
      </PageHead>
      {guard === 'checking' ? <main className="main"><p className="loading">Unwrapping the list…</p></main>
        : ownerView
          ? <OwnerPreview items={items} isSignedInOwner={list.viewer_is_owner} onNotMe={() => { forgetOwnedList(list.slug); setGuard('buyer'); }} />
          : <BuyerView list={list} items={items} viewerName={viewerName} signedIn={signedIn} />}
    </>
  );
}

/** What the owner sees on their own link: the list, and nothing about gifts. */
function OwnerPreview({ items, isSignedInOwner, onNotMe }: { items: WishlistItem[]; isSignedInOwner: boolean; onNotMe: () => void }) {
  const sorted = sortItems(items, 'custom');
  return (
    <main className="main">
      <div className="notice notice-owner" data-testid="owner-preview">
        <span><strong>🤫 No peeking.</strong> This is your own list, so gift claims stay hidden from you. Family members see “I’m getting this!” buttons here.</span>
        {isSignedInOwner
          ? <Link className="btn btn-sm btn-ghost" href="/my-list">Edit my list</Link>
          : <button type="button" className="btn btn-sm btn-ghost" onClick={onNotMe}>This isn’t my list, I’m a gift buyer</button>}
      </div>
      <div className="grid">{sorted.map((it, i) => <ItemCard key={it.id} item={it} index={i} readOnly />)}</div>
      {items.length > 0 && <TotalPanel items={sorted} totalCents={sumCents(items)} visibleCount={items.length} visibleCents={sumCents(items)} />}
    </main>
  );
}

type Show = 'all' | 'available';

function BuyerView({ list, items, viewerName, signedIn }: { list: PublicWishlist; items: WishlistItem[]; viewerName: string | null; signedIn: boolean }) {
  const db = supabaseBrowser();
  const owner = list.owner.display_name;
  const [claims, setClaims] = useState<Map<string, Claim>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<SortKey>('custom');
  const [show, setShow] = useState<Show>('all');
  const [claiming, setClaiming] = useState<WishlistItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const refresh = useCallback(async () => {
    const { data, error } = await db.rpc('get_claims', { p_slug: list.slug, p_guest_tokens: Object.values(readTokens()) });
    if (!error) setClaims(new Map((data as Claim[]).map((c) => [c.item_id, c])));
    setLoaded(true);
  }, [db, list.slug]);

  // Everyone viewing sees claims update within a few seconds.
  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 5000);
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const tokenFor = (itemId: string) => (signedIn ? null : readTokens()[itemId] ?? null);

  const act = async (item: WishlistItem, fn: 'cancel_claim' | 'set_purchased', purchased?: boolean) => {
    setBusyId(item.id);
    const args: Record<string, unknown> = { p_slug: list.slug, p_item_id: item.id, p_guest_token: tokenFor(item.id) };
    if (fn === 'set_purchased') args.p_purchased = purchased;
    const { error } = await db.rpc(fn, args);
    setBusyId(null);
    if (error) push(error.message);
    else {
      if (fn === 'cancel_claim') {
        const t = readTokens(); delete t[item.id]; writeTokens(t);
        push(`${item.name} is available again`);
      } else push(purchased ? `Marked ${item.name} as bought` : `${item.name} marked as not bought yet`);
    }
    refresh();
  };

  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
  const visible = show === 'available' ? sorted.filter((i) => !claims.has(i.id)) : sorted;
  const available = items.filter((i) => !claims.has(i.id));
  const mine = items.filter((i) => claims.get(i.id)?.is_mine);

  return (
    <main className="main">
      <section className="buyer-summary" aria-label="Gift status">
        <div className="stat"><span className="stat-label">Still available</span><span className="stat-value" data-testid="available-count">{loaded ? available.length : '–'}<small> of {items.length}</small></span></div>
        <div className="stat"><span className="stat-label">You’re getting</span><span className="stat-value">{mine.length}</span></div>
        <div className="stat"><span className="stat-label">Available value</span><span className="stat-value">{formatUSD(sumCents(available))}</span></div>
        <p className="buyer-secret">🤫 {owner} can’t see any of this. Claims are only visible to gift buyers.</p>
      </section>

      <div className="toolbar">
        <div className="toolbar-organize">
          <label className="select"><span className="select-label">Sort</span>
            <select id="buyer-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {(['custom', 'rating-desc', 'price-asc', 'price-desc', 'alpha'] as SortKey[]).map((k) => (
                <option key={k} value={k}>{k === 'custom' ? `${possessive(owner)} order` : SORT_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <div className="filter-chips" role="radiogroup" aria-label="Show">
            {(['all', 'available'] as Show[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={show === s} className={`fchip${show === s ? ' is-on' : ''}`} onClick={() => setShow(s)}>
                {s === 'all' ? 'All gifts' : 'Still available'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="no-match"><p>{items.length === 0 ? `${owner} hasn’t added anything yet. Check back soon!` : 'Every gift has been claimed. Nice work, elves!'}</p></div>
      ) : (
        <div className="grid">
          {visible.map((item, i) => {
            const c = claims.get(item.id);
            const status = c ? (c.is_mine ? (c.status === 'purchased' ? 'You bought this ✓' : 'You’re getting this') : `${c.status === 'purchased' ? 'Bought' : 'Claimed'} by ${c.claimer_name}`) : undefined;
            return (
              <ItemCard key={item.id} item={item} index={i} readOnly status={status}
                statusTone={c ? (c.is_mine ? 'mine' : c.status) : undefined}
                actions={
                  <div className="buyer-actions">
                    <a className="btn btn-sm btn-ghost" href={item.url} target="_blank" rel="noopener noreferrer">Visit site <ExternalIcon size={14} /></a>
                    {!c && <button type="button" className="btn btn-sm btn-festive" disabled={!loaded} onClick={() => setClaiming(item)}>I’m getting this! 🎁</button>}
                    {c && !c.is_mine && <span className="claimed-note">{c.status === 'purchased' ? 'Already bought' : 'Already claimed'}</span>}
                    {c?.is_mine && (
                      <span className="mine-actions">
                        {c.status === 'claimed'
                          ? <button type="button" className="btn btn-sm btn-primary" disabled={busyId === item.id} onClick={() => act(item, 'set_purchased', true)}>Mark as bought</button>
                          : <button type="button" className="btn btn-sm btn-ghost" disabled={busyId === item.id} onClick={() => act(item, 'set_purchased', false)}>Not bought yet</button>}
                        <button type="button" className="btn btn-sm btn-quiet-danger" disabled={busyId === item.id} onClick={() => act(item, 'cancel_claim')}>Cancel claim</button>
                      </span>
                    )}
                  </div>
                } />
            );
          })}
        </div>
      )}

      {items.length > 0 && <TotalPanel items={sortItems(items, sort)} totalCents={sumCents(items)} visibleCount={items.length} visibleCents={sumCents(items)} />}

      {!signedIn && (
        <aside className="cta-band">
          <div><h2>Make your own wishlist</h2><p>Free, takes a minute, and your family can claim gifts for you in secret.</p></div>
          <Link href="/signup" className="btn btn-gold btn-lg">Make my list</Link>
        </aside>
      )}

      <ClaimDialog key={claiming?.id ?? 'closed'} item={claiming} owner={owner} slug={list.slug} defaultName={viewerName} signedIn={signedIn}
        onClose={() => setClaiming(null)}
        onDone={(msg) => { setClaiming(null); push(msg); refresh(); }} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </main>
  );
}

function ClaimDialog({ item, owner, slug, defaultName, signedIn, onClose, onDone }: {
  item: WishlistItem | null; owner: string; slug: string; defaultName: string | null; signedIn: boolean;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const db = supabaseBrowser();
  // The dialog is keyed by item, so this state starts fresh each time it opens.
  const [name, setName] = useState(() => {
    if (defaultName) return defaultName;
    try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
  });
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!name.trim()) return setError('Add your name so other gift buyers know who has this.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return setError('That email doesn’t look right. Leave it blank if you like.');
    if (!agree) return setError('Tick the box to confirm.');
    setBusy(true); setError(null);
    const token = signedIn ? null : newToken();
    const { error } = await db.rpc('claim_item', { p_slug: slug, p_item_id: item.id, p_name: name.trim(), p_email: email.trim() || null, p_guest_token: token });
    setBusy(false);
    if (error) {
      if (error.code === '23505') return onDone(`Someone else just claimed ${item.name}. Pick another gift!`);
      return setError(error.message);
    }
    if (token) writeTokens({ ...readTokens(), [item.id]: token });
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* */ }
    onDone(`You’re getting ${item.name}! 🎁 It’s hidden from ${owner}.`);
  };

  return (
    <Modal open={Boolean(item)} onClose={onClose} title="I’m getting this! 🎁" size="sm"
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="claim-form" className="btn btn-festive" disabled={busy}>{busy ? 'Claiming…' : 'Claim this gift'}</button>
      </>}>
      {item && (
        <form id="claim-form" className="form" onSubmit={submit} noValidate>
          <div className="claim-item"><strong>{item.name}</strong><span>{formatUSD(item.priceCents)}</span></div>
          <p className="confirm-msg">Claiming tells other gift buyers you plan to get this, so nobody doubles up. It doesn’t mean it’s bought: mark it as bought once you have it. {owner} will never see any of this.</p>
          <div className="field"><label htmlFor="claim-name">Your name</label>
            <input id="claim-name" value={name} maxLength={40} placeholder="e.g. Grandma" onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="claim-email">Email <span className="optional">optional, never shown to anyone</span></label>
            <input id="claim-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {!signedIn && <p className="field-note">You can cancel this claim later from this same device and browser.</p>}
          <label className="check"><input type="checkbox" id="claim-agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I plan to buy this for {owner}</label>
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
