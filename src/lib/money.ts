const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatUSD = (cents: number) => usd.format(cents / 100);

/** Whole-dollar format for big display numbers when there are no cents. */
export const formatUSDCompact = (cents: number) =>
  cents % 100 === 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
    : formatUSD(cents);

export type PriceParse = { ok: true; cents: number } | { ok: false; error: string };

/** Accepts "$1,299.99", "1299.9", "  45 ". Rejects negatives, letters, >2 decimals, absurd sums. */
export function parsePrice(input: string): PriceParse {
  const raw = input.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (!raw) return { ok: false, error: 'Enter a price.' };
  if (raw.startsWith('-')) return { ok: false, error: "Price can't be negative." };
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(raw)) return { ok: false, error: 'Use a number like 49.99.' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, error: 'Use a number like 49.99.' };
  if (value > 1_000_000) return { ok: false, error: 'That price is over $1,000,000. Check for a typo.' };
  return { ok: true, cents: Math.round(value * 100) };
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export const sumCents = (items: { priceCents: number }[]) => items.reduce((t, i) => t + i.priceCents, 0);
