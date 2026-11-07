import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFacts, cleanName } from '@/lib/server/extract';
import { knownStore, storeLabel } from '@/lib/stores';

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe('extractFacts: store-shaped pages', () => {
  it('Amazon-style page with no structured data', () => {
    const html = page(
      '<title>Amazon.com: LEGO Icons Christmas Village 10325 : Toys &amp; Games</title><meta name="description" content="Build a festive village.">',
      `<span id="productTitle">  LEGO Icons Christmas Village 10325  </span>
       <img id="landingImage" src="https://m.media-amazon.com/images/I/small.jpg"
         data-a-dynamic-image='{"https://m.media-amazon.com/images/I/small.jpg":[200,200],"https://m.media-amazon.com/images/I/big.jpg":[1500,1500]}'>
       <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$1,099.99</span></span></div>`,
    );
    const f = extractFacts(html, new URL('https://www.amazon.com/dp/B0ABCDEFGH'));
    expect(f.name).toBe('LEGO Icons Christmas Village 10325');
    expect(f.imageUrl).toBe('https://m.media-amazon.com/images/I/big.jpg');
    expect(f.priceCents).toBe(109999);
    expect(f.store).toBe('Amazon');
    expect(f.looksBlocked).toBe(false);
  });

  it('Best Buy-style: og tags, "- Best Buy" suffix, visible price', () => {
    const html = page(
      `<meta property="og:title" content="Sony WH-1000XM6 Wireless Headphones - Black - Best Buy">
       <meta property="og:image" content="https://pisces.bbystatic.com/image2/sony.jpg">
       <meta property="og:site_name" content="Best Buy">`,
      '<div class="priceView-hero-price priceView-customer-price"><span aria-hidden="true">$449.99</span></div>',
    );
    const f = extractFacts(html, new URL('https://www.bestbuy.com/site/sony/123.p'));
    expect(f.name).toBe('Sony WH-1000XM6 Wireless Headphones - Black');
    expect(f.priceCents).toBe(44999);
    expect(f.store).toBe('Best Buy');
  });

  it('Target-style: "Name : Target" title and data-test price', () => {
    const html = page('<title>Barbie Dreamhouse : Target</title><meta name="twitter:image" content="//target.scene7.com/is/image/Target/dream">',
      '<span data-test="product-price">$199.99</span>');
    const f = extractFacts(html, new URL('https://www.target.com/p/barbie/-/A-1'));
    expect(f.name).toBe('Barbie Dreamhouse');
    expect(f.imageUrl).toBe('https://target.scene7.com/is/image/Target/dream');
    expect(f.priceCents).toBe(19999);
    expect(f.store).toBe('Target');
  });

  it('Walmart-style microdata', () => {
    const html = page('<title>Nintendo Switch 2 - Walmart.com</title>',
      `<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Nintendo Switch 2</h1>
        <img itemprop="image" src="/images/switch.jpg"><span itemprop="price" content="449.00">$449.00</span>
        <meta itemprop="priceCurrency" content="USD"></div>`);
    const f = extractFacts(html, new URL('https://www.walmart.com/ip/123'));
    expect(f.name).toBe('Nintendo Switch 2');
    expect(f.imageUrl).toBe('https://www.walmart.com/images/switch.jpg');
    expect(f.priceCents).toBe(44900);
    expect(f.store).toBe('Walmart');
  });

  it('Nike-style ProductGroup JSON-LD inside @graph, price on a variant', () => {
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
      '@type': 'ProductGroup', name: 'Nike Air Max 90', description: '<p>The <b>classic</b> returns.</p>',
      image: [{ '@type': 'ImageObject', contentUrl: 'https://static.nike.com/am90.png' }],
      hasVariant: [{ '@type': 'Product', offers: { '@type': 'AggregateOffer', lowPrice: 130, priceCurrency: 'USD' } }],
    }] };
    const html = page(`<title>Nike Air Max 90 Men's Shoes. Nike.com</title><script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    const f = extractFacts(html, new URL('https://www.nike.com/t/air-max-90'));
    expect(f.name).toBe('Nike Air Max 90');
    expect(f.description).toBe('The classic returns.');
    expect(f.imageUrl).toBe('https://static.nike.com/am90.png');
    expect(f.priceCents).toBe(13000);
    expect(f.store).toBe('Nike');
  });

  it('Apple-style offers with a price specification list', () => {
    const ld = { '@type': 'Product', name: 'AirPods Pro 3', image: 'https://store.storeimages.cdn-apple.com/airpods.png',
      offers: [{ '@type': 'Offer', priceSpecification: [{ price: '249.00', priceCurrency: 'USD' }] }] };
    const f = extractFacts(page(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`), new URL('https://www.apple.com/shop/product/x'));
    expect(f.name).toBe('AirPods Pro 3');
    expect(f.priceCents).toBe(24900);
    expect(f.store).toBe('Apple');
  });

  it('never invents a price: non-USD, missing dollar sign and junk are ignored', () => {
    const eur = { '@type': 'Product', name: 'Teddy', offers: { price: '20.00', priceCurrency: 'EUR' } };
    expect(extractFacts(page(`<script type="application/ld+json">${JSON.stringify(eur)}</script>`), new URL('https://shop.de/x')).priceCents).toBeUndefined();
    expect(extractFacts(page('<title>Thing</title>', '<span class="product-price">Call for price 2025</span>'), new URL('https://x.com')).priceCents).toBeUndefined();
    expect(extractFacts(page('<title>Thing</title>'), new URL('https://x.com')).priceCents).toBeUndefined();
  });

  it('Twitter product card price', () => {
    const f = extractFacts(page('<meta name="twitter:title" content="Mug"><meta name="twitter:label1" content="Price"><meta name="twitter:data1" content="$18.50">'), new URL('https://shop.example.com/mug'));
    expect(f.name).toBe('Mug');
    expect(f.priceCents).toBe(1850);
  });

  it('spots a bot-check page and returns nothing from it', () => {
    const f = extractFacts(page('<title>Robot Check</title><meta property="og:image" content="https://x.com/a.jpg">', '<form action="/errors/validateCaptcha"></form>'), new URL('https://www.amazon.com/dp/B0ABCDEFGH'));
    expect(f.looksBlocked).toBe(true);
    expect(f.name).toBeUndefined();
    expect(f.imageUrl).toBeUndefined();
  });

  it('drops logo/placeholder images and non-web image links', () => {
    expect(extractFacts(page('<meta property="og:image" content="/static/logo.png">'), new URL('https://x.com')).imageUrl).toBeUndefined();
    expect(extractFacts(page('<meta property="og:image" content="javascript:alert(1)">'), new URL('https://x.com')).imageUrl).toBeUndefined();
  });

  it('survives broken JSON-LD', () => {
    const f = extractFacts(page('<script type="application/ld+json">{nope</script><meta property="og:title" content="Sled">'), new URL('https://x.com'));
    expect(f.name).toBe('Sled');
  });
});

describe('cleanName', () => {
  const u = new URL('https://www.example.com/p');
  it('keeps names that only look like they have a suffix', () => {
    expect(cleanName('Spider-Man: Across the Spider-Verse', 'Example', u)).toBe('Spider-Man: Across the Spider-Verse');
  });
  it('removes the store name and "official site" tails', () => {
    expect(cleanName('Cozy Blanket | Example', 'Example', u)).toBe('Cozy Blanket');
    expect(cleanName('Cozy Blanket – Official Site', undefined, u)).toBe('Cozy Blanket');
  });
});

describe('store names', () => {
  it('knows common shops and falls back to the host', () => {
    expect(knownStore('https://www.bestbuy.com/x')).toBe('Best Buy');
    expect(knownStore('https://www.amazon.co.uk/dp/1')).toBe('Amazon');
    expect(knownStore('https://a.co/d/xyz')).toBe('Amazon');
    expect(storeLabel('https://shop.tinybakery.net/p/1')).toBe('shop.tinybakery.net');
  });
});

/* ---------------------------------------------------------------- lookup */
const fetchPage = vi.fn();
vi.mock('@/lib/server/safeFetch', async (orig) => {
  const real = await orig<typeof import('@/lib/server/safeFetch')>();
  return { ...real, fetchPage: (...a: unknown[]) => fetchPage(...a) };
});

describe('lookupProduct', () => {
  beforeEach(async () => {
    fetchPage.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    process.env.METADATA_SERVICE = 'microlink';
    (await import('@/lib/server/product'))._clearProductCache();
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.METADATA_SERVICE; });

  it('shortens Amazon links and drops tracking before fetching, and caches the result', async () => {
    const { lookupProduct, canonicalProductUrl } = await import('@/lib/server/product');
    expect(canonicalProductUrl(new URL('https://www.amazon.com/Some-Name/dp/b0abcdefgh/ref=sr_1_1?tag=x&th=1')).toString()).toBe('https://www.amazon.com/dp/B0ABCDEFGH');
    expect(canonicalProductUrl(new URL('https://shop.example.com/p?id=7&utm_source=x&fbclid=y')).toString()).toBe('https://shop.example.com/p?id=7');
    const ld = { '@type': 'Product', name: 'Sled', image: 'https://cdn.example.com/sled.jpg', offers: { price: '59.00', priceCurrency: 'USD' }, description: 'A fast wooden sled. Seats two.' };
    fetchPage.mockResolvedValue({ html: page(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`), finalUrl: new URL('https://shop.example.com/sled') });
    const r = await lookupProduct('shop.example.com/sled?utm_campaign=xmas');
    expect(r).toMatchObject({ status: 'found', via: 'page', product: { name: 'Sled', priceCents: 5900, imageUrl: 'https://cdn.example.com/sled.jpg', description: 'A fast wooden sled. Seats two.', descriptionSource: 'page', store: 'shop.example.com' } });
    expect(String(fetchPage.mock.calls[0][0])).toBe('https://shop.example.com/sled');
    const again = await lookupProduct('https://shop.example.com/sled');
    expect(again).toMatchObject({ status: 'found', cached: true });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('falls back to the browser-based service when the store blocks us, but never takes a price from it', async () => {
    const { lookupProduct } = await import('@/lib/server/product');
    const { FetchBlockedError } = await import('@/lib/server/safeFetch');
    fetchPage.mockRejectedValue(new FetchBlockedError('The website blocked automated access (HTTP 503).'));
    const svc = vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: {
      title: 'Amazon.com: Echo Dot (5th Gen) : Electronics', description: 'Our best sounding Echo Dot.', image: { url: 'https://m.media-amazon.com/dot.jpg' }, publisher: 'Amazon',
    } }), { status: 200 }));
    vi.stubGlobal('fetch', svc);
    const r = await lookupProduct('https://www.amazon.com/dp/B09B8V1LZ3');
    expect(r).toMatchObject({ status: 'found', via: 'service', product: { name: 'Echo Dot (5th Gen)', imageUrl: 'https://m.media-amazon.com/dot.jpg', store: 'Amazon' } });
    expect(r.product.priceCents).toBeUndefined();
    expect(String((svc.mock.calls as unknown[][])[0][0])).toContain(encodeURIComponent('https://www.amazon.com/dp/B09B8V1LZ3'));
  });

  it('gives a friendly failure when nothing can be read, and the service can be turned off', async () => {
    const { lookupProduct } = await import('@/lib/server/product');
    process.env.METADATA_SERVICE = 'off';
    const svc = vi.fn(); vi.stubGlobal('fetch', svc);
    fetchPage.mockResolvedValue({ html: page('<title>Robot Check</title>', '<form action="/errors/validateCaptcha">'), finalUrl: new URL('https://www.amazon.com/dp/B0ABCDEFGH') });
    const r = await lookupProduct('https://www.amazon.com/dp/B0ABCDEFGH');
    expect(r.status).toBe('failed');
    expect(r).toMatchObject({ product: { store: 'Amazon' } });
    expect((r as { message: string }).message).toMatch(/human/);
    expect(svc).not.toHaveBeenCalled();
  });

  it('rejects unsafe links before fetching anything', async () => {
    const { lookupProduct } = await import('@/lib/server/product');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pw@shop.example.com/x', 'https://shop.example.com:8443/x', 'http://localhost/admin']) {
      expect((await lookupProduct(bad)).status).toBe('invalid_url');
    }
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('fetchPage network safety (real fetcher)', () => {
  it('refuses private and loopback addresses, including by IP and via DNS', async () => {
    const real = await vi.importActual<typeof import('@/lib/server/safeFetch')>('@/lib/server/safeFetch');
    for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://[::1]/', 'http://localtest.me/']) {
      await expect(real.fetchPage(new URL(u))).rejects.toThrow(/private network|Couldn't find/);
    }
  });
});
