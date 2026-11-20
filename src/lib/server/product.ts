import { aiConfigured, describeWithAI } from './ai';
import { extractFacts, firstSentence, cleanName, type PageFacts } from './extract';
import { FetchBlockedError, InvalidUrlError, fetchPage, parseProductUrl } from './safeFetch';
import type { ProductInfo, ProductResponse } from './types';
import { knownStore } from '../stores';

/* ------------------------------------------------------------------ cache */
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; value: Extract<ProductResponse, { status: 'found' }> }>();

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key: string, value: Extract<ProductResponse, { status: 'found' }>) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}
export const _clearProductCache = () => cache.clear();

/* ------------------------------------------------------------------ links */
const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_[ce]id|igshid|_ga|ref|ref_|pf_rd_\w+|pd_rd_\w+|psc|smid|spIA|content-id|th|linkCode|tag|ascsubtag)$/i;

/** Clean a product link before fetching: drop tracking parameters, shorten Amazon links to /dp/ASIN. */
export function canonicalProductUrl(url: URL): URL {
  const u = new URL(url.toString());
  u.hash = '';
  if (/(^|\.)amazon\.[a-z.]+$/i.test(u.hostname)) {
    const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
    if (asin) return new URL(`https://${u.hostname}/dp/${asin.toUpperCase()}`);
  }
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u;
}

/* ---------------------------------------------- JavaScript-capable fallback */
/**
 * When a store's page needs JavaScript, or turns away our plain request, ask a link-preview
 * service that renders pages in a real browser (Microlink by default; free tier, no key needed).
 * Set METADATA_SERVICE=off to never use it. MICROLINK_API_KEY switches to the paid endpoint.
 * It returns name / image / description only; prices still come only from the store's own page.
 */
export async function fetchViaService(url: URL): Promise<PageFacts | null> {
  const mode = (process.env.METADATA_SERVICE ?? 'microlink').toLowerCase();
  if (mode === 'off' || mode === 'none' || mode === '0') return null;
  const key = process.env.MICROLINK_API_KEY;
  const base = process.env.METADATA_SERVICE_URL || (key ? 'https://pro.microlink.io' : 'https://api.microlink.io');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/?url=${encodeURIComponent(url.toString())}&meta=true`, {
      signal: ctrl.signal,
      headers: key ? { 'x-api-key': key } : {},
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string; data?: Record<string, unknown> };
    if (body.status !== 'success' || !body.data) return null;
    const d = body.data;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined);
    const title = str(d.title);
    if (title && /robot check|captcha|access denied|are you a human|pardon our interruption|just a moment/i.test(title)) return null;
    const image = d.image as { url?: unknown } | undefined;
    let imageUrl = str(image?.url);
    if (imageUrl) {
      try { const iu = new URL(imageUrl); imageUrl = /^https?:$/.test(iu.protocol) && imageUrl.length <= 2000 ? iu.toString() : undefined; } catch { imageUrl = undefined; }
    }
    const store = str(d.publisher) ?? knownStore(url.hostname) ?? url.hostname.replace(/^www\./, '');
    return {
      title,
      name: cleanName(title, store, url),
      metaDescription: str(d.description),
      description: str(d.description),
      imageUrl,
      store,
      bodyText: '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------- Jina Reader (no sign-up needed) */
/**
 * Jina Reader (r.jina.ai) opens a page in its own browser and hands back the page's HTML.
 * Free with no account or key (about 20 lookups a minute). We read the returned HTML with
 * the same extractor as everything else, so only what's really on the page is used.
 * Set JINA_READER=off to stop using it; JINA_API_KEY (optional) raises its limits.
 */
async function jinaOnce(url: URL, fresh: boolean, ms: number): Promise<PageFacts | 'blocked' | 'empty' | 'error'> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const base = process.env.JINA_READER_URL || 'https://r.jina.ai';
    const headers: Record<string, string> = { 'x-respond-with': 'html', 'x-timeout': String(Math.max(5, Math.floor(ms / 1000) - 3)) };
    if (fresh) headers['x-no-cache'] = 'true';   // don't hand back a saved copy of a "prove you're human" page
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    const res = await fetch(`${base.replace(/\/$/, '')}/${url.toString()}`, { signal: ctrl.signal, headers });
    if (!res.ok) { console.warn('[product] jina http', res.status); return 'error'; }
    const html = (await res.text()).slice(0, 3_000_000);
    if (html.length < 200) return 'empty';
    const facts = extractFacts(html, url);
    if (facts.looksBlocked) return 'blocked';
    return facts.name || facts.imageUrl || facts.priceCents != null ? facts : 'empty';
  } catch (e) {
    console.warn('[product] jina failed', (e as Error).name);
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** Amazon's phone-style address for the same product (Amazon checks it less often). */
function amazonMobileUrl(url: URL): URL | null {
  if (!/(^|\.)amazon\.[a-z.]+$/i.test(url.hostname)) return null;
  const asin = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
  return asin ? new URL(`https://${url.hostname}/gp/aw/d/${asin}`) : null;
}

export async function fetchViaJina(url: URL, info: { result?: string } = {}): Promise<PageFacts | null> {
  const mode = (process.env.JINA_READER ?? 'on').toLowerCase();
  if (mode === 'off' || mode === '0' || mode === 'none') { info.result = 'off'; return null; }
  const started = Date.now();
  const first = await jinaOnce(url, false, 20_000);
  if (typeof first === 'object') { info.result = 'read'; return first; }
  // One more try when the store showed a robot check or an empty page: a fresh copy, and Amazon's phone address.
  if ((first === 'blocked' || first === 'empty') && Date.now() - started < 15_000) {
    const second = await jinaOnce(amazonMobileUrl(url) ?? url, true, 18_000);
    if (typeof second === 'object') { info.result = 'read on 2nd try'; return second; }
    info.result = `${first}, then ${second}`;
    return null;
  }
  info.result = first;
  return null;
}

/* ------------------------------------------------- Diffbot (product reader) */
/**
 * Diffbot reads a product page and returns its name, price, pictures and description.
 * Free plan: 10,000 lookups a month. Only used when the store's own page didn't give us
 * those (for example Amazon or Louis Vuitton turning the app away). Needs DIFFBOT_TOKEN.
 */
export async function fetchViaDiffbot(url: URL): Promise<PageFacts | null> {
  const token = process.env.DIFFBOT_TOKEN;
  if (!token) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const api = process.env.DIFFBOT_API_URL || 'https://api.diffbot.com';
    const res = await fetch(`${api.replace(/\/$/, '')}/v3/product?token=${encodeURIComponent(token)}&url=${encodeURIComponent(url.toString())}&timeout=18000`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' },
    });
    if (!res.ok) { console.warn('[product] diffbot http', res.status); return null; }
    const body = (await res.json()) as { objects?: Array<Record<string, unknown>>; error?: string };
    const o = body.objects?.[0];
    if (!o) { if (body.error) console.warn('[product] diffbot error', String(body.error).slice(0, 120)); return null; }
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined);
    const title = str(o.title);
    if (title && /robot check|captcha|access denied|are you a human|pardon our interruption|just a moment/i.test(title)) return null;
    // Picture: the one Diffbot marks as the main picture, else the first.
    const images = Array.isArray(o.images) ? (o.images as Array<{ url?: unknown; primary?: unknown }>) : [];
    let imageUrl = str((images.find((i) => i.primary) ?? images[0])?.url);
    if (imageUrl) {
      try { const iu = new URL(imageUrl); imageUrl = /^https?:$/.test(iu.protocol) && imageUrl.length <= 2000 ? iu.toString() : undefined; } catch { imageUrl = undefined; }
    }
    // Price: only US dollars, only what Diffbot actually read from the page.
    let priceCents: number | undefined;
    const det = o.offerPriceDetails as { amount?: unknown; currencyCode?: unknown; symbol?: unknown } | undefined;
    const usd = (code: unknown, symbol: unknown) => (code ? String(code).toUpperCase() === 'USD' : symbol === '$');
    if (det && typeof det.amount === 'number' && det.amount > 0 && usd(det.currencyCode, det.symbol)) priceCents = Math.round(det.amount * 100);
    if (priceCents == null) {
      const m = str(o.offerPrice)?.match(/^\s*\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*$/);
      if (m) priceCents = Math.round(Number(m[1].replace(/,/g, '')) * 100);
    }
    if (priceCents != null && !(priceCents > 0 && priceCents < 1_000_000_000)) priceCents = undefined;
    const store = str(o.siteName) ?? knownStore(url.hostname) ?? url.hostname.replace(/^www\./, '');
    const text = str(o.text)?.slice(0, 2000);
    return {
      title,
      productName: title ? cleanName(title, store, url) : undefined,
      name: title ? cleanName(title, store, url) : undefined,
      productDescription: text,
      description: text,
      imageUrl,
      priceCents,
      store,
      bodyText: '',
    };
  } catch (e) {
    console.warn('[product] diffbot failed', (e as Error).name);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ lookup */
const FRIENDLY_FAIL = "We couldn't read that store's page automatically. No problem: fill in the details below.";

async function describe(facts: PageFacts, itemName: string): Promise<Pick<ProductInfo, 'description' | 'descriptionSource'>> {
  const hasText = Boolean(facts.productDescription || facts.metaDescription || facts.bodyText.length > 200);
  if (hasText && aiConfigured()) {
    try {
      const sentence = await describeWithAI(facts, itemName || facts.name || '');
      if (sentence) return { description: sentence, descriptionSource: 'ai' };
    } catch (err) {
      console.error('[product] AI error:', (err as Error).message);
    }
  }
  const own = facts.description ?? facts.productDescription ?? facts.metaDescription;
  return own ? { description: firstSentence(own, 300), descriptionSource: 'page' } : {};
}

function toProduct(facts: PageFacts): ProductInfo {
  return { name: facts.name, imageUrl: facts.imageUrl, priceCents: facts.priceCents, store: facts.store };
}

/** Read a product link and return whatever real product information we can find. */
export async function lookupProduct(rawUrl: string, itemName = ''): Promise<ProductResponse> {
  let url: URL;
  try {
    url = parseProductUrl(rawUrl);
  } catch (e) {
    if (e instanceof InvalidUrlError) return { status: 'invalid_url', product: {}, message: e.message };
    throw e;
  }
  const target = canonicalProductUrl(url);
  const key = target.toString();
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  let facts: PageFacts | null = null;
  let failure = FRIENDLY_FAIL;
  try {
    const { html, finalUrl } = await fetchPage(target);
    facts = extractFacts(html, finalUrl);
    if (facts.looksBlocked) {
      failure = "That store asked for a “prove you're human” check, so its page couldn't be read automatically. Fill in the details below.";
      facts = null;
    }
  } catch (e) {
    if (!(e instanceof FetchBlockedError)) throw e;
    if (/private network/.test(e.message)) return { status: 'failed', product: {}, message: e.message };
    failure = `${e.message} No problem: fill in the details below.`;
  }

  let via: 'page' | 'service' = 'page';
  const pageResult = facts ? 'read' : 'blocked';
  let diffbotResult = 'not needed';
  let jinaResult = 'not needed';
  // The store's page was blocked or is missing the name, picture or price: ask Jina Reader (no sign-up needed).
  if (!facts || !facts.name || !facts.imageUrl || facts.priceCents == null) {
    const ji: { result?: string } = {};
    const jr = await fetchViaJina(target, ji);
    jinaResult = ji.result ?? (jr ? 'read' : 'failed');
    if (jr) {
      if (!facts) { facts = jr; via = 'service'; }
      else {
        if (!facts.name && jr.name) { facts.name = jr.name; facts.productName ??= jr.productName; }
        facts.imageUrl ??= jr.imageUrl;
        facts.priceCents ??= jr.priceCents;
        facts.productDescription ??= jr.productDescription;
        facts.description ??= jr.description;
        facts.metaDescription ??= jr.metaDescription;
        if (!facts.bodyText) facts.bodyText = jr.bodyText;
      }
    }
  }
  // The store's page was blocked or is missing the name, picture or price: ask Diffbot.
  if (!facts || !facts.name || !facts.imageUrl || facts.priceCents == null) {
    const db = await fetchViaDiffbot(target);
    diffbotResult = !process.env.DIFFBOT_TOKEN ? 'no token' : db ? 'read' : 'failed';
    if (db) {
      if (!facts) { facts = db; via = 'service'; }
      else {
        // Keep what the store's own page gave us; fill the gaps from Diffbot.
        if (!facts.name && db.name) { facts.name = db.name; facts.productName ??= db.productName; }
        facts.imageUrl ??= db.imageUrl;
        facts.priceCents ??= db.priceCents;
        facts.productDescription ??= db.productDescription;
        facts.description ??= db.description;
      }
    }
  }
  // Page needed JavaScript, blocked us, or had almost nothing: try the browser-based preview service.
  if (!facts || (!facts.name && !facts.imageUrl) || !facts.imageUrl) {
    const service = await fetchViaService(target);
    if (service) {
      if (!facts) { facts = service; via = 'service'; }
      else {
        // Keep everything the store's own page gave us; only fill gaps from the service.
        // The service renders JavaScript, so its title beats a plain page title (but not real product data).
        if (!facts.productName && service.name) facts.name = service.name;
        facts.imageUrl ??= service.imageUrl;
        facts.description ??= service.description;
        facts.metaDescription ??= service.metaDescription;
      }
    }
  }

  // A simple record of how lookups go (store name only, nothing about the person), to see what works.
  console.info(JSON.stringify({ lookup: target.hostname.replace(/^www\./, ''), page: pageResult, jina: jinaResult, diffbot: diffbotResult,
    got: facts ? { name: Boolean(facts.name), picture: Boolean(facts.imageUrl), price: facts.priceCents != null } : null }));

  if (!facts || (!facts.name && !facts.imageUrl && facts.priceCents == null)) {
    return { status: 'failed', product: facts ? { store: facts.store } : { store: knownStore(target.hostname) }, message: failure };
  }

  const product: ProductInfo = { ...toProduct(facts), ...(await describe(facts, itemName)) };
  const result = { status: 'found' as const, product, via };
  cacheSet(key, result);
  return result;
}
