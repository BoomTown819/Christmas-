import * as cheerio from 'cheerio';

export interface PageFacts {
  title?: string;
  metaDescription?: string;
  productName?: string;
  productDescription?: string;
  brand?: string;
  imageUrl?: string;
  priceCents?: number;
  bodyText: string;
}

const clean = (s: unknown) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() || undefined : undefined;

/** Pull the facts we're allowed to use from a product page. Nothing here is invented. */
export function extractFacts(html: string, pageUrl: URL): PageFacts {
  const $ = cheerio.load(html);
  const meta = (sel: string) => clean($(sel).attr('content'));

  const facts: PageFacts = {
    title: meta('meta[property="og:title"]') ?? clean($('title').first().text()),
    metaDescription:
      meta('meta[property="og:description"]') ?? meta('meta[name="description"]') ?? meta('meta[name="twitter:description"]'),
    imageUrl: meta('meta[property="og:image"]') ?? meta('meta[property="og:image:url"]') ?? meta('meta[name="twitter:image"]'),
    bodyText: '',
  };

  // JSON-LD Product data is the most reliable source when present.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const product = findProduct(data);
      if (!product) return;
      facts.productName ??= clean(product.name);
      facts.productDescription ??= clean(product.description);
      const brand = typeof product.brand === 'string' ? product.brand : product.brand?.name;
      facts.brand ??= clean(brand);
      const img = Array.isArray(product.image) ? product.image[0] : product.image;
      facts.imageUrl ??= clean(typeof img === 'string' ? img : img?.url);
      facts.priceCents ??= usdPriceFromOffers(product.offers);
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  facts.priceCents ??= metaPrice(
    meta('meta[property="product:price:amount"]') ?? meta('meta[property="og:price:amount"]'),
    meta('meta[property="product:price:currency"]') ?? meta('meta[property="og:price:currency"]'),
  );

  if (facts.imageUrl) {
    try {
      const abs = new URL(facts.imageUrl, pageUrl);
      facts.imageUrl = abs.protocol === 'https:' || abs.protocol === 'http:' ? abs.toString() : undefined;
    } catch {
      facts.imageUrl = undefined;
    }
  }

  $('script, style, noscript, svg, nav, footer, header, iframe, form').remove();
  facts.bodyText = (clean($('main').text()) ?? clean($('body').text()) ?? '').slice(0, 4000);
  return facts;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProduct(node: any, depth = 0): any {
  if (!node || depth > 5) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => t === 'Product' || t === 'ProductGroup')) return node;
  return findProduct(node['@graph'], depth + 1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usdPriceFromOffers(offers: any): number | undefined {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    const currency = o.priceCurrency ?? o.priceSpecification?.priceCurrency;
    const price = o.price ?? o.lowPrice ?? o.priceSpecification?.price;
    const cents = metaPrice(price != null ? String(price) : undefined, currency);
    if (cents != null) return cents;
  }
  return undefined;
}

function metaPrice(amount?: string, currency?: string): number | undefined {
  if (!amount || (currency && currency.toUpperCase() !== 'USD')) return undefined;
  const n = Number(amount.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) : undefined;
}

/** First sentence of a page's own summary, used when no AI is configured. */
export function firstSentence(text: string, maxLen = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^.{20,}?[.!?](?=\s|$)/);
  let s = (m ? m[0] : t).trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  return s;
}
