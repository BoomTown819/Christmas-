'use client';
import { formatUSD } from '../lib/money';
import type { WishlistItem } from '../types';
import { useCountUp } from './useCountUp';

interface Props {
  items: WishlistItem[];
  totalCents: number;
  visibleCount: number;
  visibleCents: number;
}

/** The gift-tag style total: an itemised ledger that adds up to the total wishlist value. */
export function TotalPanel({ items, totalCents, visibleCount, visibleCents }: Props) {
  const animated = useCountUp(totalCents, 700);
  const filtered = visibleCount !== items.length;
  return (
    <section className="total" aria-labelledby="total-heading">
      <div className="total-ledger">
        <h2 className="total-ledger-title">The tally</h2>
        <ol className="ledger">
          {items.map((i) => (
            <li key={i.id}>
              <span className="ledger-name">{i.name}</span>
              <span className="ledger-dots" aria-hidden="true" />
              <span className="ledger-price">{formatUSD(i.priceCents)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="total-figure">
        <p className="total-eyebrow" id="total-heading">Total wishlist value</p>
        <p className="total-amount" data-testid="total" data-cents={totalCents}>
          <span className="sr-only">{formatUSD(totalCents)}</span>
          <span aria-hidden="true">{formatUSD(animated)}</span>
        </p>
        <p className="total-count" data-testid="total-count">
          {items.length} {items.length === 1 ? 'item' : 'items'} on the list
        </p>
        {filtered && (
          <p className="total-filtered">Showing {visibleCount} with the current filter · {formatUSD(visibleCents)}</p>
        )}
      </div>
    </section>
  );
}
