'use client';
import { useState } from 'react';
import { possessive } from '@/lib/items';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Modal } from './Modal';
import { ShareSheet } from './ShareSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
  ownerName: string;
  shareWithFamily: boolean;
  onSlug: (slug: string) => void;
  onShareWithFamily: (v: boolean) => void;
}

export function ShareListDialog({ open, onClose, slug, ownerName, shareWithFamily, onSlug, onShareWithFamily }: Props) {
  const db = supabaseBrowser();
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const url = `${origin}/list/${slug}`;

  const toggleFamily = async (v: boolean) => {
    onShareWithFamily(v);
    await db.from('wishlists').update({ share_with_family: v }).eq('share_slug', slug);
  };
  const regenerate = async () => {
    setBusy(true);
    const { data } = await db.rpc('regenerate_share_slug');
    setBusy(false);
    setConfirmNew(false);
    if (data) onSlug(data as string);
  };

  return (
    <Modal open={open} onClose={onClose} title="Share my Christmas list" size="sm">
      <div className="form">
        <p className="confirm-msg">Anyone with this link can see your list and secretly claim gifts. They don’t need an account, and they can forward the same link to anyone else.</p>
        <ShareSheet idPrefix="share" url={url} title={`${possessive(ownerName)} Christmas Wishlist`} text={`Here’s my Christmas wishlist 🎄`} />
        <label className="switch-row">
          <input type="checkbox" checked={shareWithFamily} onChange={(e) => toggleFamily(e.target.checked)} />
          <span><strong>Show my list on family dashboards</strong><br /><span className="muted">Family members see your card on “Our Christmas”.</span></span>
        </label>
        <div className="share-invite">
          <p><strong>Want them to make their own list?</strong> Send them the app instead:</p>
          <ShareSheet idPrefix="app" url={`${origin}/signup`} title="Make your Christmas wishlist" text="Make your own Christmas wishlist here so we can all share ours:" />
        </div>
        {confirmNew ? (
          <div className="confirm-inline">
            <span>The old link will stop working for everyone.</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmNew(false)}>Keep it</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={regenerate} disabled={busy}>Make new link</button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm reset-link" onClick={() => setConfirmNew(true)}>Make a new link</button>
        )}
      </div>
    </Modal>
  );
}
