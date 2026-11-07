import * as cheerio from 'cheerio';
import { knownStore } from '../stores';

export interface PageFacts {
  title?: string;
  metaDescription?: string;
  productName?: string;
  productDescription?: string;
  brand?: string;
  imageUrl?: string;
  priceCents?: number;
  /** Store / site name ("Best Buy"). */
  store?: string;
  /** Best guess at the product's name, cleaned of store suffixes. */
  name?: string;
  /** Best description we found (product data first, then page summary). */
  description?: string;
  /** Page looks like a bot check or "access denied" page rather than the product. */
  looksBlocked?: boolean;
  bodyText: string;
}

type Cheerio = cheerio.CheerioAPI;

const clean = (s: unknown) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() || undefined : undefined;

/** Strip any HTML that some shops put inside JSON-LD descriptions. */
const textOnly = (s: unknown) => {
  const c = clean(s);
  if (!c) return undefined;
  return /<[a-z][\s\S]*>/i.test(c) ? clean(cheerio.load(`<div>${c}</div>`)('div').text()) : c;
};

const BLOCK_MARKERS = [
  /robot check/i, /captcha/i, /are you a (human|robot)/i, /access denied/i, /pardon our interruption/i,
  /request blocked/i, /verify you are human/i, /unusual traffic/i, /attention required/i, /just a moment\.\.\./i,
  /enable (javascript|cookies) to continue/i, /px-captcha/i,
];

/**
 * Pull the facts we're allowed to use from a product page. Nothing here is invented:
 * every field comes from the page's own metadata, structured data or visible price.
 * Sources, in order: Schema.org Product JSON-LD, microdata, Open Graph, Twitter Card,
 * standard HTML tags, then a few well-known store layouts.
 */
export function extractFacts(html: string, pageUrl: URL): PageFacts {
  const $ = cheerio.load(html);
  const meta = (...sels: string[]) => {
    for (const sel of sels) {
      const v = clean($(sel).first().attr('content'));
      if (v) return v;
    }
    return undefined;
  };

  const facts: PageFacts = {
    title: meta('meta[property="og:title"]', 'meta[name="og:title"]', 'meta[name="twitter:title"]', 'meta[property="twitter:title"]') ?? clean($('title').first().text()),
    metaDescription: meta('meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]', 'meta[property="twitter:description"]'),
    bodyText: '',
  };

  // 1. Schema.org Product JSON-LD: the most reliable source when present.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text().trim().replace(/^<!--|-->$/g, '');
      const product = findProduct(JSON.parse(raw));
      if (!product) return;
      facts.productName ??= textOnly(product.name);
      facts.productDescription ??= textOnly(product.description);
      const brand = typeof product.brand === 'string' ? product.brand : product.brand?.name;
      facts.brand ??= clean(brand);
      facts.imageUrl ??= imageFromLd(product.image);
      facts.priceCents ??= usdPriceFromOffers(product.offers);
      if (facts.priceCents == null && Array.isArray(product.hasVariant)) {
        for (const v of product.hasVariant) { facts.priceCents ??= usdPriceFromOffers(v?.offers); facts.imageUrl ??= imageFromLd(v?.image); }
      }
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  // 2. Microdata (itemprop) on the page.
  const scope = $('[itemtype*="schema.org/Product"]').first();
  if (scope.length) {
    const prop = (name: string) => {
      const n = scope.find(`[itemprop="${name}"]`).first();
      return clean(n.attr('content') ?? n.attr('src') ?? n.attr('href') ?? n.text());
    };
    facts.productName ??= prop('name');
    facts.productDescription ??= prop('description');
    facts.imageUrl ??= prop('image');
    const cur = prop('priceCurrency');
    facts.priceCents ??= toCents(prop('price'), cur ?? 'USD');
  }

  // 3. Open Graph / Twitter / product meta tags.
  facts.imageUrl ??= meta(
    'meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="og:image"]', 'meta[property="og:image:url"]',
    'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'meta[property="twitter:image"]', 'meta[itemprop="image"]',
  ) ?? clean($('link[rel="image_src"]').attr('href'));
  facts.priceCents ??= toCents(
    meta('meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]'),
    meta('meta[property="product:price:currency"]', 'meta[property="og:price:currency"]', 'meta[itemprop="priceCurrency"]'),
  );
  // Twitter "product" cards: label "Price", data "$19.99"
  for (const i of [1, 2]) {
    if (facts.priceCents != null) break;
    if (/price/i.test(meta(`meta[name="twitter:label${i}"]`) ?? '')) facts.priceCents = dollarText(meta(`meta[name="twitter:data${i}"]`));
  }

  // 4. Well-known store layouts (only used when nothing above found the field).
  storeSpecific($, facts);

  // Resolve and sanity-check the image.
  facts.imageUrl = safeImageUrl(facts.imageUrl, pageUrl);

  facts.store = meta('meta[property="og:site_name"]', 'meta[name="og:site_name"]', 'meta[name="application-name"]') ?? knownStore(pageUrl.hostname);
  if (facts.store && knownStore(pageUrl.hostname) && facts.store.length > 30) facts.store = knownStore(pageUrl.hostname);
  facts.store ??= prettyHost(pageUrl.hostname);

  facts.name = cleanName(facts.productName ?? facts.title ?? clean($('h1').first().text()), facts.store, pageUrl);
  // A title that's just the shop's name ("Tiny Shop") isn't a product name.
  const bare = (x?: string) => (x ?? '').toLowerCase().replace(/^www\./, '').replace(/\.(com|net|org|co|shop|store)$/, '').trim();
  if (facts.name && [bare(facts.store), bare(pageUrl.hostname), bare(knownStore(pageUrl.hostname))].includes(bare(facts.name))) facts.name = undefined;
  facts.description = facts.productDescription ?? facts.metaDescription;

  const titleText = `${clean($('title').first().text()) ?? ''} ${clean($('h1').first().text()) ?? ''}`;
  const hasProduct = Boolean(facts.productName || facts.priceCents != null);
  facts.looksBlocked = !hasProduct && (BLOCK_MARKERS.some((re) => re.test(titleText)) || /id="px-captcha"|captcha-delivery|cf-challenge|g-recaptcha|validateCaptcha/i.test(html));
  if (facts.looksBlocked) { facts.name = undefined; facts.description = undefined; facts.imageUrl = undefined; }

  $('script, style, noscript, svg, nav, footer, header, iframe, form').remove();
  facts.bodyText = (clean($('main').text()) ?? clean($('body').text()) ?? '').slice(0, 4000);
  return facts;
}

function storeSpecific($: Cheerio, facts: PageFacts) {
  // Amazon
  if (!facts.imageUrl) {
    const land = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront').first();
    facts.imageUrl = clean(land.attr('data-old-hires')) ?? largestDynamicImage(land.attr('data-a-dynamic-image')) ?? clean(land.attr('src'));
  }
  facts.productName ??= clean($('#productTitle').first().text());
  facts.productDescription ??= clean($('#feature-bullets li').first().text());
  // Visible price elements on Amazon, Best Buy, Target, Walmart and common platforms.
  const priceSelectors = [
    '#corePrice_feature_div .a-offscreen', '#corePriceDisplay_desktop_feature_div .a-offscreen', '#priceblock_ourprice',
    '#priceblock_dealprice', '#price_inside_buybox', '.priceView-customer-price span[aria-hidden="true"]',
    '.priceView-hero-price span[aria-hidden="true"]', '[data-test="product-price"]', '[itemprop="price"]',
    '[data-automation-id="product-price"] [itemprop="price"]', '.product-price', '.price-current', '.price .money',
  ];
  for (const sel of priceSelectors) {
    if (facts.priceCents != null) break;
    const n = $(sel).first();
    if (!n.length) continue;
    facts.priceCents = dollarText(n.attr('content') ? `$${n.attr('content')}` : n.text());
  }
}

function largestDynamicImage(attr?: string): string | undefined {
  if (!attr) return undefined;
  try {
    const map = JSON.parse(attr) as Record<string, [number, number]>;
    return Object.entries(map).sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1])[0]?.[0];
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function imageFromLd(img: any): string | undefined {
  const first = Array.isArray(img) ? img[0] : img;
  if (!first) return undefined;
  return clean(typeof first === 'string' ? first : first.contentUrl ?? first.url);
}

function safeImageUrl(raw: string | undefined, pageUrl: URL): string | undefined {
  if (!raw) return undefined;
  try {
    const abs = new URL(raw.startsWith('//') ? `https:${raw}` : raw, pageUrl);
    if (abs.protocol !== 'https:' && abs.protocol !== 'http:') return undefined;
    if (/(^|[/_-])(logo|sprite|placeholder|spacer|blank|1x1|pixel)([._/-]|$)/i.test(abs.pathname)) return undefined;
    const s = abs.toString();
    return s.length <= 2000 ? s : undefined;
  } catch {
    return undefined;
  }
}

function prettyHost(host: string): string {
  return host.replace(/^www\d?\./, '');
}

/** "Amazon.com: Apple AirPods Pro : Electronics" -> "Apple AirPods Pro"; "Lego Castle | Target" -> "Lego Castle". */
export function cleanName(raw: string | undefined, store: string | undefined, pageUrl: URL): string | undefined {
  const first = clean(raw);
  if (!first) return undefined;
  let n: string = first;
  const host = pageUrl.hostname.replace(/^www\./, '');
  const storeWords = [store, knownStore(host), host, host.split('.')[0]].filter((w): w is string => Boolean(w)).map((w) => w.toLowerCase().replace(/\.com$/, ''));
  // "Amazon.com: Apple AirPods Pro : Electronics" -> "Apple AirPods Pro"
  if (/^amazon\.[a-z.]+\s*:/i.test(n)) n = n.replace(/^amazon\.[a-z.]+\s*:\s*/i, '').replace(/\s+:\s+[^:]{2,40}$/, '');
  for (let i = 0; i < 2; i++) {
    const m: RegExpMatchArray | null = n.match(/^(.*\S)\s+[|\-–—:·]\s+([^|\-–—:·]{2,60})$/);
    if (!m) break;
    const tail = m[2].toLowerCase().replace(/\.com$/, '').trim();
    if (storeWords.some((w) => tail.includes(w) || w.includes(tail)) || /^(buy|shop|official site|free shipping)/i.test(tail)) n = m[1];
    else break;
  }
  return n.slice(0, 200) || undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProduct(node: any, depth = 0): any {
  if (!node || depth > 6) return undefined;
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
  if (types.some((t) => typeof t === 'string' && /(^|\/)(Product|ProductGroup|IndividualProduct|ProductModel|Book|Vehicle)$/.test(t))) return node;
  return findProduct(node['@graph'], depth + 1) ?? findProduct(node.mainEntity, depth + 1) ?? findProduct(node.itemOffered, depth + 1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usdPriceFromOffers(offers: any, depth = 0): number | undefined {
  if (!offers || depth > 3) return undefined;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const specs = Array.isArray(o.priceSpecification) ? o.priceSpecification : o.priceSpecification ? [o.priceSpecification] : [];
    const candidates: Array<[unknown, unknown]> = [
      [o.price, o.priceCurrency],
      [o.lowPrice, o.priceCurrency],
      ...specs.map((s: { price?: unknown; priceCurrency?: unknown }) => [s?.price, s?.priceCurrency ?? o.priceCurrency] as [unknown, unknown]),
    ];
    for (const [price, currency] of candidates) {
      const cents = toCents(price != null ? String(price) : undefined, typeof currency === 'string' ? currency : undefined);
      if (cents != null) return cents;
    }
    const nested = usdPriceFromOffers(o.offers, depth + 1);
    if (nested != null) return nested;
  }
  return undefined;
}

/** Structured price -> cents. Only US dollars (or no currency stated), since the app's prices are in dollars. */
function toCents(amount?: string, currency?: string): number | undefined {
  if (!amount || (currency && currency.trim().toUpperCase() !== 'USD')) return undefined;
  const s = amount.replace(/[^0-9.,]/g, '');
  const normal = /,\d{2}$/.test(s) && !s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) : undefined;
}

/** Visible price text like "$1,299.99". Requires a dollar sign so we never guess at a random number. */
function dollarText(text?: string): number | undefined {
  const m = (text ?? '').replace(/\s+/g, ' ').match(/(?:US\s?)?\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/);
  return m ? toCents(m[1], 'USD') : undefined;
}

/** First sentence of a page's own summary, used when no AI is configured. */
export function firstSentence(text: string, maxLen = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^.{20,}?[.!?](?=\s|$)/);
  let s = (m ? m[0] : t).trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  return s;
}
