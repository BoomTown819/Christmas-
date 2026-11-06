import { describe, expect, it } from 'vitest';
import { formatUSD, parsePrice, sumCents } from '@/lib/money';

describe('parsePrice', () => {
  it.each([
    ['100', 10000], ['$1,299.99', 129999], [' 45 ', 4500], ['.5', 50], ['0.1', 10], ['19.9', 1990], ['0', 0],
  ])('accepts %s', (input, cents) => expect(parsePrice(input)).toEqual({ ok: true, cents }));
  it.each(['', '-5', 'abc', '12.345', '1.2.3', '9999999', '$', '1e5'])('rejects %s', (input) => {
    expect(parsePrice(input).ok).toBe(false);
  });
});

describe('totals', () => {
  it('adds the example from the brief exactly', () => {
    expect(formatUSD(sumCents([{ priceCents: 10000 }, { priceCents: 25000 }, { priceCents: 5000 }]))).toBe('$400.00');
  });
  it('has no floating point drift', () => {
    expect(sumCents([{ priceCents: 10 }, { priceCents: 20 }])).toBe(30);
    expect(formatUSD(sumCents(Array.from({ length: 3 }, () => ({ priceCents: 1999 }))))).toBe('$59.97');
  });
});
