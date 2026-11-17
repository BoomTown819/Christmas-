/**
 * The "🎁 Add to Our Christmas" bookmark button.
 *
 * It runs in your own browser, on the product page you're already looking at, and reads
 * what's on that page: name, main picture, price and description. Then it opens Add item
 * on Our Christmas with those filled in. Nothing is fetched by a server, so stores that
 * block automated visitors (Amazon, Louis Vuitton…) still work, because it's just you.
 */
function grab(ORIGIN: string) {
  const d = document;
  const q = (s: string) => d.querySelector(s) as HTMLElement | null;
  const t = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim();
  const meta = (n: string) => {
    const e = d.querySelector(`meta[property="${n}"],meta[name="${n}"],meta[itemprop="${n}"]`) as HTMLMetaElement | null;
    return t(e && e.content);
  };
  // Schema.org Product data, if the page has it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let P: any = null;
  d.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const find = (x: any, k: number): void => {
        if (!x || P || k > 6) return;
        if (Array.isArray(x)) { x.forEach((y) => find(y, k + 1)); return; }
        if (typeof x !== 'object') return;
        if (/Product/.test([].concat(x['@type'] || []).join(' '))) { P = x; return; }
        find(x['@graph'], k + 1); find(x.mainEntity, k + 1);
      };
      find(JSON.parse(s.textContent || ''), 0);
    } catch { /* ignore */ }
  });

  const name = t(q('#productTitle')?.textContent) || t(P?.name) || meta('og:title') || meta('twitter:title') || t(d.title);

  let img = '';
  const land = q('#landingImage, #imgBlkFront, #ebooksImgBlkFront') as HTMLImageElement | null;
  if (land) {
    img = land.getAttribute('data-old-hires') || '';
    if (!img) {
      try {
        const dyn = JSON.parse(land.getAttribute('data-a-dynamic-image') || '{}') as Record<string, [number, number]>;
        let best = 0;
        for (const u in dyn) { const a = dyn[u][0] * dyn[u][1]; if (a > best) { best = a; img = u; } }
      } catch { /* ignore */ }
    }
    if (!img) img = land.src;
  }
  if (!img && P?.image) { const pi = [].concat(P.image)[0] as unknown as string | { contentUrl?: string; url?: string }; img = typeof pi === 'string' ? pi : pi?.contentUrl || pi?.url || ''; }
  if (!img) img = meta('og:image:secure_url') || meta('og:image') || meta('twitter:image');
  if (!img) {
    // Biggest picture on the screen
    let best = 0;
    Array.from(d.images).forEach((i) => { const a = i.naturalWidth * i.naturalHeight; if (i.naturalWidth >= 200 && a > best && i.getBoundingClientRect().top < innerHeight * 1.5) { best = a; img = i.currentSrc || i.src; } });
  }

  let price = '';
  const ap = q('#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen, #priceblock_dealprice, #priceblock_ourprice, #price_inside_buybox');
  if (ap) price = t(ap.textContent);
  if (!price && P?.offers) {
    const o = [].concat(P.offers)[0] as unknown as { price?: unknown; lowPrice?: unknown; priceCurrency?: string; priceSpecification?: unknown };
    const spec = o && o.priceSpecification ? ([].concat(o.priceSpecification as never)[0] as { price?: unknown }) : null;
    const pr = o && (o.price ?? o.lowPrice ?? spec?.price);
    if (pr != null && (!o.priceCurrency || o.priceCurrency === 'USD')) price = String(pr);
  }
  if (!price) price = meta('product:price:amount') || meta('og:price:amount');
  if (!price) { const ip = q('[itemprop="price"]'); if (ip) price = ip.getAttribute('content') || t(ip.textContent); }
  if (!price) {
    const els = d.querySelectorAll('[class*="price" i], [data-test*="price" i], [data-testid*="price" i]');
    for (let i = 0; i < els.length && !price; i++) {
      const el = els[i] as HTMLElement;
      const m = t(el.textContent).match(/\$\s?\d[\d,]*(\.\d{2})?/);
      if (m && el.offsetParent) price = m[0];
    }
  }
  const num = ((price.match(/\d[\d,]*(\.\d{1,2})?/) || [''])[0] || '').replace(/,/g, '');

  const bullet = t(q('#feature-bullets li')?.textContent);
  const desc = t(P?.description).replace(/<[^>]+>/g, ' ') || bullet || meta('og:description') || meta('description');
  const canon = (q('link[rel="canonical"]') as HTMLLinkElement | null)?.href;
  const link = canon && /^https?:/.test(canon) ? canon : location.href;

  const p = new URLSearchParams({
    url: link.slice(0, 1900), name: name.slice(0, 200), price: num,
    image: /^https?:/.test(img) ? img.slice(0, 1900) : '', desc: t(desc).slice(0, 400),
  });
  const to = `${ORIGIN}/add?${p}`;
  const w = window.open(to, '_blank');
  if (!w) location.href = to;
}

/** The bookmark's address: a tiny program that runs grab() on the current page. */
export function bookmarkletHref(origin: string): string {
  const src = `(${grab.toString()})(${JSON.stringify(origin)})`;
  return `javascript:${encodeURIComponent(`void ${src};`)}`;
}
