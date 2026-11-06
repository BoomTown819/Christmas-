import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractFacts, firstSentence } from '@/lib/server/extract';
import { describeWithAI } from '@/lib/server/ai';
import { parseProductUrl } from '@/lib/server/safeFetch';

const PAGE = `<!doctype html><html><head><title>Shop | Thing</title>
<meta property="og:title" content="Sony WH-1000XM5">
<meta name="description" content="Industry-leading noise canceling headphones with up to 30 hours of battery. Free shipping.">
<meta property="og:image" content="/img/xm5.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"WH-1000XM5","brand":{"name":"Sony"},
"offers":{"@type":"Offer","price":"399.99","priceCurrency":"USD"}}]}</script></head><body><nav>menu</nav><main>Great headphones.</main></body></html>`;

describe('extractFacts', () => {
  it('reads metadata, JSON-LD product, price and resolves the image URL', () => {
    const f = extractFacts(PAGE, new URL('https://shop.example.com/p/1'));
    expect(f.title).toBe('Sony WH-1000XM5');
    expect(f.productName).toBe('WH-1000XM5');
    expect(f.brand).toBe('Sony');
    expect(f.priceCents).toBe(39999);
    expect(f.imageUrl).toBe('https://shop.example.com/img/xm5.jpg');
    expect(f.bodyText).toBe('Great headphones.');
  });
  it('ignores non-USD prices', () => {
    const f = extractFacts(PAGE.replace('"USD"', '"EUR"'), new URL('https://x.com'));
    expect(f.priceCents).toBeUndefined();
  });
});

describe('firstSentence', () => {
  it('keeps only the first sentence', () => {
    expect(firstSentence('Industry-leading noise canceling headphones. Free shipping.')).toBe('Industry-leading noise canceling headphones.');
  });
});

describe('parseProductUrl', () => {
  it('rejects non-web schemes', () => {
    expect(() => parseProductUrl('file:///etc/passwd')).toThrow();
    expect(() => parseProductUrl('')).toThrow();
  });
});

describe('describeWithAI', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; });
  const facts = extractFacts(PAGE, new URL('https://x.com'));

  it('sends page facts to the API server-side and returns the sentence', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '"Wireless over-ear headphones with noise canceling."' }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(describeWithAI(facts, 'Headphones')).resolves.toBe('Wireless over-ear headphones with noise canceling.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body).messages[0].content).toContain('Sony');
  });

  it('returns null when the model says the page is insufficient', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: 'INSUFFICIENT' }] }))));
    await expect(describeWithAI(facts, '')).resolves.toBeNull();
  });
});

