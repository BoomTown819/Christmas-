import type { RatingFilter, SortKey, WishlistItem } from '../types';

export const SORT_LABELS: Record<SortKey, string> = {
  custom: 'My order',
  'rating-desc': 'Want most',
  'rating-asc': 'Want least',
  'price-desc': 'Price: high to low',
  'price-asc': 'Price: low to high',
  recent: 'Recently added',
  alpha: 'A to Z',
};

export const FILTER_LABELS: Record<RatingFilter, string> = {
  all: 'All ratings',
  '5': '5 stars only',
  '4+': '4 stars & up',
  '3+': '3 stars & up',
  '2+': '2 stars & up',
  under2: 'Under 2 stars',
};

const byNewest = (a: WishlistItem, b: WishlistItem) => b.createdAt.localeCompare(a.createdAt);
const byName = (a: WishlistItem, b: WishlistItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

export function sortItems(items: WishlistItem[], key: SortKey): WishlistItem[] {
  const list = [...items];
  const cmp: Record<SortKey, (a: WishlistItem, b: WishlistItem) => number> = {
    custom: (a, b) => (a.position ?? 0) - (b.position ?? 0) || byNewest(b, a),
    'rating-desc': (a, b) => b.rating - a.rating || byNewest(a, b),
    'rating-asc': (a, b) => a.rating - b.rating || byNewest(a, b),
    'price-desc': (a, b) => b.priceCents - a.priceCents || byName(a, b),
    'price-asc': (a, b) => a.priceCents - b.priceCents || byName(a, b),
    recent: byNewest,
    alpha: (a, b) => byName(a, b) || byNewest(a, b),
  };
  return list.sort(cmp[key]);
}

export function filterByRating(items: WishlistItem[], f: RatingFilter): WishlistItem[] {
  switch (f) {
    case 'all': return items;
    case '5': return items.filter((i) => i.rating === 5);
    case '4+': return items.filter((i) => i.rating >= 4);
    case '3+': return items.filter((i) => i.rating >= 3);
    case '2+': return items.filter((i) => i.rating >= 2);
    case 'under2': return items.filter((i) => i.rating < 2);
  }
}

export type Tier = 'must' | 'really' | 'nice';
export const tierOf = (rating: number): Tier => (rating >= 4.5 ? 'must' : rating >= 3 ? 'really' : 'nice');
export const TIER_LABELS: Record<Tier, string> = { must: 'Must have', really: 'Really want', nice: 'Nice to have' };

export function wantLabel(rating: number): string {
  if (rating >= 5) return 'Dreaming of it';
  if (rating >= 4.5) return 'Must have';
  if (rating >= 3.5) return 'Really want';
  if (rating >= 2.5) return 'Would love it';
  if (rating >= 1.5) return 'Nice to have';
  return 'If there’s room';
}
