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

  if (!facts || (!facts.name && !facts.imageUrl && facts.priceCents == null)) {
    return { status: 'failed', product: facts ? { store: facts.store } : { store: knownStore(target.hostname) }, message: failure };
  }

  const product: ProductInfo = { ...toProduct(facts), ...(await describe(facts, itemName)) };
  const result = { status: 'found' as const, product, via };
  cacheSet(key, result);
  return result;
}
