import { describe, expect, it } from 'vitest';
import { filterByRating, sortItems } from '@/lib/organize';
import { parseUrl } from '@/lib/url';
import { toCSV } from '@/lib/csv';
import type { WishlistItem } from '@/types';

const mk = (name: string, priceCents: number, rating: number, day: number): WishlistItem => ({
  id: name, name, url: 'https://example.com', priceCents, rating, description: '', descriptionSource: '', reason: '', imageUrl: '',
  createdAt: `2026-11-0${day}T10:00:00.000Z`, updatedAt: '', privateNote: '', position: 5 - day,
});
const items = [mk('Bike', 50000, 3.5, 1), mk('apple watch', 39900, 5, 2), mk('Socks', 1200, 1.5, 3), mk('Camera', 89900, 4.5, 4)];
const names = (l: WishlistItem[]) => l.map((i) => i.name);

describe('sortItems', () => {
  it('sorts by want rating', () => {
    expect(names(sortItems(items, 'rating-desc'))).toEqual(['apple watch', 'Camera', 'Bike', 'Socks']);
    expect(names(sortItems(items, 'rating-asc'))).toEqual(['Socks', 'Bike', 'Camera', 'apple watch']);
  });
  it('sorts by price', () => {
    expect(names(sortItems(items, 'price-desc'))).toEqual(['Camera', 'Bike', 'apple watch', 'Socks']);
    expect(names(sortItems(items, 'price-asc'))).toEqual(['Socks', 'apple watch', 'Bike', 'Camera']);
  });
  it('sorts by recency and case-insensitive name', () => {
    expect(names(sortItems(items, 'recent'))).toEqual(['Camera', 'Socks', 'apple watch', 'Bike']);
    expect(names(sortItems(items, 'alpha'))).toEqual(['apple watch', 'Bike', 'Camera', 'Socks']);
  });
  it('does not mutate the input', () => {
    const before = names(items);
    sortItems(items, 'alpha');
    expect(names(items)).toEqual(before);
  });
});

describe('filterByRating', () => {
  it('filters', () => {
    expect(names(filterByRating(items, '5'))).toEqual(['apple watch']);
    expect(names(filterByRating(items, '4+'))).toEqual(['apple watch', 'Camera']);
    expect(names(filterByRating(items, 'under2'))).toEqual(['Socks']);
    expect(filterByRating(items, 'all')).toHaveLength(4);
  });
});

describe('parseUrl', () => {
  it('accepts links from any site and adds https', () => {
    expect(parseUrl('amazon.com/dp/B0D1XD1ZV3')).toMatchObject({ ok: true, url: 'https://amazon.com/dp/B0D1XD1ZV3' });
    expect(parseUrl('https://www.etsy.com/listing/123?ref=x')).toMatchObject({ ok: true, host: 'etsy.com' });
  });
  it.each(['', 'not a url', 'javascript:alert(1)', 'ftp://x.com/a', 'hello'])('rejects %s', (u) => expect(parseUrl(u).ok).toBe(false));
});

describe('toCSV', () => {
  it('escapes and neutralises formulas, includes a total row', () => {
    const csv = toCSV([{ ...mk('Lego "Titanic", big', 67999, 4, 1), reason: '=HYPERLINK("x")' }]);
    expect(csv).toContain('"Lego ""Titanic"", big",679.99,4');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv.split('\r\n').at(-1)).toBe('TOTAL,679.99,,1 items,,,');
  });
});
