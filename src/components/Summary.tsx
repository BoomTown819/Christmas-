'use client';
import { formatUSDCompact } from '../lib/money';
import { tierOf, TIER_LABELS, type Tier } from '../lib/organize';
import type { WishlistItem } from '../types';
import { useCountUp } from './useCountUp';

/** Progress-style overview: item count, spend so far, and how the list splits by want level. */
export function Summary({ items, totalCents }: { items: WishlistItem[]; totalCents: number }) {
  const tiers: Tier[] = ['must', 'really', 'nice'];
  const counts = Object.fromEntries(tiers.map((t) => [t, items.filter((i) => tierOf(i.rating) === t).length])) as Record<Tier, number>;
  const avg = items.length ? items.reduce((s, i) => s + i.rating, 0) / items.length : 0;
  const animated = useCountUp(totalCents);
  const n = items.length;

  return (
    <section className="summary" aria-label="Wishlist summary">
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-label">Items</span>
          <span className="stat-value" data-testid="summary-count">{n}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Wishlist value</span>
          <span className="stat-value">{formatUSDCompact(animated)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Average want</span>
          <span className="stat-value">{n ? avg.toFixed(1) : '–'}<small> / 5</small></span>
        </div>
      </div>
      <div className="tierbar-wrap">
        <div className="tierbar" role="img" aria-label={tiers.map((t) => `${counts[t]} ${TIER_LABELS[t]}`).join(', ')}>
          {n === 0 ? <span className="tierbar-empty" /> : tiers.map((t) => counts[t] > 0 && (
            <span key={t} className={`tierbar-seg seg-${t}`} style={{ flexGrow: counts[t] }} />
          ))}
        </div>
        <ul className="tier-legend">
          {tiers.map((t) => (
            <li key={t}><span className={`dot seg-${t}`} />{TIER_LABELS[t]} <strong>{counts[t]}</strong></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
