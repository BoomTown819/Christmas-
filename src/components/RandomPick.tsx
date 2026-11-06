'use client';
import { useEffect, useRef, useState } from 'react';
import { formatUSD } from '../lib/money';
import type { WishlistItem } from '../types';
import { DiceIcon } from './Icons';
import { Modal } from './Modal';
import { StarRating } from './StarRating';

function pick(items: WishlistItem[], weighted: boolean): WishlistItem {
  if (!weighted) return items[Math.floor(Math.random() * items.length)];
  const total = items.reduce((s, i) => s + i.rating, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.rating; if (r <= 0) return i; }
  return items[items.length - 1];
}

export function RandomPick({ open, items, onClose, onShow }: { open: boolean; items: WishlistItem[]; onClose: () => void; onShow: (id: string) => void }) {
  const [current, setCurrent] = useState<WishlistItem | null>(null);
  const [rolling, setRolling] = useState(false);
  const [weighted, setWeighted] = useState(true);
  const timer = useRef<number>();

  const roll = () => {
    if (!items.length) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const final = pick(items, weighted);
    if (reduce || items.length === 1) { setCurrent(final); return; }
    setRolling(true);
    let n = 0;
    const step = () => {
      n++;
      setCurrent(items[Math.floor(Math.random() * items.length)]);
      if (n < 12) timer.current = window.setTimeout(step, 50 + n * 12);
      else { setCurrent(final); setRolling(false); }
    };
    step();
  };

  useEffect(() => {
    if (open) roll();
    else { setCurrent(null); setRolling(false); }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Surprise pick" size="sm"
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={() => current && onShow(current.id)} disabled={!current || rolling}>Show on list</button>
        <button type="button" className="btn btn-primary" data-autofocus onClick={roll} disabled={rolling}><DiceIcon size={16} /> Pick again</button>
      </>}>
      <div className={`pick ${rolling ? 'is-rolling' : 'is-landed'}`} aria-live="polite">
        {current && <>
          <p className="pick-name">{current.name}</p>
          <div className="pick-meta">
            <StarRating value={current.rating} size="sm" />
            <span>{formatUSD(current.priceCents)}</span>
          </div>
        </>}
      </div>
      <label className="check">
        <input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} />
        Favor items I want more
      </label>
    </Modal>
  );
}
