'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Avatar, Ornament, Present, Tree } from '@/components/festive/Decorations';
import { GiftPlaceholder } from '@/components/Icons';
import { Modal } from '@/components/Modal';
import { ShareSheet } from '@/components/ShareSheet';
import { AVATARS, fmtInviteCode } from '@/lib/items';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { FamilyDashboard, FamilyMemberCard } from '@/types';
import { JoinByCode } from './JoinByCode';

const PICK_KEY = 'our-christmas:family';

export function FamilyApp({ families }: { families: { id: string; name: string }[] }) {
  const db = supabaseBrowser();
  const router = useRouter();
  const [active, setActive] = useState<string | null>(families[0]?.id ?? null);
  const [dash, setDash] = useState<FamilyDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PICK_KEY);
      if (saved && families.some((f) => f.id === saved)) setActive(saved);
    } catch { /* */ }
  }, [families]);

  const load = useCallback(async () => {
    if (!active) return;
    const { data, error } = await db.rpc('get_family_dashboard', { p_family_id: active });
    if (error) setError('Couldn’t load this family. You may have left it.');
    else { setDash(data as FamilyDashboard); setError(null); }
  }, [db, active]);

  // New members and new items show up without a refresh.
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const pick = (id: string) => { setActive(id); setDash(null); try { localStorage.setItem(PICK_KEY, id); } catch { /* */ } };

  const leave = async () => {
    if (!active) return;
    await db.rpc('leave_family', { p_family_id: active });
    setLeaving(false);
    try { localStorage.removeItem(PICK_KEY); } catch { /* */ }
    router.refresh();
  };

  if (families.length === 0) {
    return (
      <main className="main">
        <section className="family-start">
          <div className="family-start-art" aria-hidden="true"><Tree size={90} /><Present color="red" size={44} /><Present color="gold" size={36} /></div>
          <h2>Bring the family together</h2>
          <p>Create a family group and invite everyone, or join one with the code someone sent you. Your wishlist stays your own either way.</p>
          <div className="family-start-actions">
            <button type="button" className="btn btn-festive btn-lg" onClick={() => setCreateOpen(true)}>Create a family</button>
            <JoinByCode compact />
          </div>
        </section>
        <CreateFamily open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { try { localStorage.setItem(PICK_KEY, id); } catch { /* */ } router.refresh(); }} />
      </main>
    );
  }

  const others = dash?.members.filter((m) => !m.is_me) ?? [];
  const me = dash?.members.find((m) => m.is_me);

  return (
    <main className="main">
      <div className="family-bar">
        <div className="family-tabs" role="tablist" aria-label="Your families">
          {families.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={f.id === active} className={`fchip${f.id === active ? ' is-on' : ''}`} onClick={() => pick(f.id)}>{f.name}</button>
          ))}
          <button type="button" className="fchip" onClick={() => setCreateOpen(true)}>+ New family</button>
        </div>
        <div className="family-bar-actions">
          <button type="button" className="btn btn-festive btn-sm" onClick={() => setInviteOpen(true)} disabled={!dash}>Invite family</button>
          <JoinByCode compact />
        </div>
      </div>

      <section className="family-head">
        <h2 className="family-title"><span className="family-eyebrow">Our Christmas 🎄</span>{dash?.family.name ?? '…'}</h2>
        <p className="muted">{dash ? `${dash.members.length} ${dash.members.length === 1 ? 'member' : 'members'}` : 'Loading…'}</p>
      </section>

      {error && <div className="notice notice-warn">{error}</div>}

      <div className="members" data-testid="members">
        {me && <MemberCard m={me} />}
        {others.map((m) => <MemberCard key={m.user_id} m={m} />)}
        {dash && others.length === 0 && (
          <article className="member member-invite">
            <Ornament color="gold" size={34} />
            <h3>It’s quiet in here</h3>
            <p>Invite your family so their lists show up here.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>Invite family</button>
          </article>
        )}
      </div>

      <div className="family-foot">
        <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setLeaving(true)} disabled={!dash}>Leave {dash?.family.name ?? 'family'}</button>
      </div>

      {dash && <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} dash={dash} onNewCode={load} />}
      <CreateFamily open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { pick(id); router.refresh(); }} />
      <ConfirmDialog open={leaving} title={`Leave ${dash?.family.name}?`} confirmLabel="Leave family"
        message="Your wishlist stays yours, and your link still works. You just won’t appear on this family’s dashboard. You can rejoin with an invitation."
        onCancel={() => setLeaving(false)} onConfirm={leave} />
    </main>
  );
}

function MemberCard({ m }: { m: FamilyMemberCard }) {
  const shared = m.is_me || m.shared;
  return (
    <article className={`member${m.is_me ? ' is-me' : ''}`} data-testid="member-card">
      <header className="member-head">
        <Avatar emoji={AVATARS[m.avatar] ?? '🎅'} color={m.avatar_color} size={58} />
        <div className="member-id">
          <h3>{m.is_me ? `${m.display_name} (you)` : m.display_name}</h3>
          <p className="muted">{shared ? `${m.item_count ?? 0} ${m.item_count === 1 ? 'item' : 'items'}` : 'List not shared with the family'}{m.role === 'organizer' ? ' · organizer' : ''}</p>
        </div>
      </header>
      {shared && (
        <ul className="member-preview">
          {(m.preview ?? []).map((p, i) => (
            <li key={i}>
              <span className="mp-thumb">{p.image_url ? <img src={p.image_url} alt="" referrerPolicy="no-referrer" /> : <GiftPlaceholder seed={p.name.length} />}</span>
              <span className="mp-name">{p.name}</span>
              <span className="mp-stars" aria-label={`${p.rating} stars`}>★ {Number(p.rating).toFixed(1)}</span>
            </li>
          ))}
          {(m.preview ?? []).length === 0 && <li className="mp-empty">Nothing added yet</li>}
        </ul>
      )}
      {!m.is_me && shared && typeof m.available_count === 'number' && (m.item_count ?? 0) > 0 && (
        <p className="member-avail" data-testid="member-available">{m.available_count === 0 ? 'Every gift is claimed' : `${m.available_count} still available to claim`}</p>
      )}
      <footer className="member-foot">
        {m.is_me
          ? <Link className="btn btn-soft btn-sm" href="/my-list">Edit my list</Link>
          : shared && m.share_slug
            ? <Link className="btn btn-primary btn-sm" href={`/list/${m.share_slug}`}>View wishlist</Link>
            : <span className="muted small">Ask them for their link</span>}
      </footer>
    </article>
  );
}

function InviteDialog({ open, onClose, dash, onNewCode }: { open: boolean; onClose: () => void; dash: FamilyDashboard; onNewCode: () => void }) {
  const db = supabaseBrowser();
  const [busy, setBusy] = useState(false);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const code = dash.invite_code;
  const make = async () => { setBusy(true); await db.rpc('create_invitation', { p_family_id: dash.family.id }); setBusy(false); onNewCode(); };
  useEffect(() => { if (open && !code) make(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, code]);
  return (
    <Modal open={open} onClose={onClose} title={`Invite to ${dash.family.name}`} size="sm">
      <div className="form">
        <p className="confirm-msg">Anyone with this invitation can join {dash.family.name}. They’ll make their own account and their own wishlist.</p>
        {code ? (
          <>
            <div className="invite-code" data-testid="invite-code">{fmtInviteCode(code)}</div>
            <ShareSheet idPrefix="invite" url={`${origin}/join/${code}`} title={`Join ${dash.family.name} on Our Christmas`}
              text={`Join our family on Our Christmas so we can share wishlists 🎄 Code ${fmtInviteCode(code)}:`} />
          </>
        ) : <p className="muted">{busy ? 'Making an invitation…' : 'No invitation yet.'}</p>}
      </div>
    </Modal>
  );
}

function CreateFamily({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const db = supabaseBrowser();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(''); setError(null); } }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give your family a name.');
    setBusy(true);
    const { data, error } = await db.rpc('create_family', { p_name: name.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    onClose();
    onCreated(data as string);
  };
  return (
    <Modal open={open} onClose={onClose} title="Create a family" size="sm"
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="family-form" className="btn btn-primary" disabled={busy}>Create family</button></>}>
      <form id="family-form" className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="family-name">Family name</label>
          <input id="family-name" value={name} maxLength={60} placeholder="The Christmas Crew" onChange={(e) => setName(e.target.value)} /></div>
        {error && <p className="field-error">{error}</p>}
        <p className="field-note">You’ll get an invitation link to send to everyone next.</p>
      </form>
    </Modal>
  );
}

