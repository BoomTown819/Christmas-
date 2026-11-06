import type { WishlistItem } from '../types';
import { sumCents } from './money';

const cell = (v: string | number) => {
  let s = String(v);
  // Stop spreadsheet apps from executing a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(items: WishlistItem[]): string {
  const header = ['Item', 'Price (USD)', 'Want rating (out of 5)', 'Description', 'Why I want it', 'Link', 'Added'];
  const rows = items.map((i) => [
    i.name,
    (i.priceCents / 100).toFixed(2),
    i.rating,
    i.description,
    i.reason,
    i.url,
    i.createdAt.slice(0, 10),
  ]);
  rows.push(['TOTAL', (sumCents(items) / 100).toFixed(2), '', `${items.length} items`, '', '', '']);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCSV(items: WishlistItem[]) {
  const blob = new Blob(['﻿' + toCSV(items)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `christmas-wishlist-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
