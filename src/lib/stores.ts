/** Friendly store names for common shops. Used on the server (extraction) and in the browser (cards). */
const STORES: Record<string, string> = {
  amazon: 'Amazon', apple: 'Apple', bestbuy: 'Best Buy', target: 'Target', walmart: 'Walmart', nike: 'Nike',
  etsy: 'Etsy', ebay: 'eBay', costco: 'Costco', homedepot: 'The Home Depot', lowes: "Lowe's", kohls: "Kohl's",
  macys: "Macy's", nordstrom: 'Nordstrom', lego: 'LEGO', gamestop: 'GameStop', newegg: 'Newegg', adidas: 'adidas',
  sephora: 'Sephora', ulta: 'Ulta Beauty', wayfair: 'Wayfair', ikea: 'IKEA', rei: 'REI', dickssportinggoods: "Dick's Sporting Goods",
  barnesandnoble: 'Barnes & Noble', crateandbarrel: 'Crate & Barrel', potterybarn: 'Pottery Barn', williamssonoma: 'Williams Sonoma',
  zara: 'Zara', hm: 'H&M', uniqlo: 'Uniqlo', gap: 'Gap', oldnavy: 'Old Navy', lululemon: 'lululemon', nintendo: 'Nintendo',
  playstation: 'PlayStation', microsoft: 'Microsoft', xbox: 'Xbox', samsung: 'Samsung', dell: 'Dell', hp: 'HP', sony: 'Sony',
  bose: 'Bose', patagonia: 'Patagonia', northface: 'The North Face', thenorthface: 'The North Face', underarmour: 'Under Armour',
  footlocker: 'Foot Locker', jcrew: 'J.Crew', urbanoutfitters: 'Urban Outfitters', anthropologie: 'Anthropologie',
  michaels: 'Michaels', hobbylobby: 'Hobby Lobby', petsmart: 'PetSmart', chewy: 'Chewy', cvs: 'CVS', walgreens: 'Walgreens',
  bhphotovideo: 'B&H Photo', adorama: 'Adorama', microcenter: 'Micro Center', staples: 'Staples', samsclub: "Sam's Club",
  bjs: "BJ's", kroger: 'Kroger', aliexpress: 'AliExpress', temu: 'Temu', shein: 'SHEIN', shopify: 'Shopify', steampowered: 'Steam',
  converse: 'Converse', vans: 'Vans', newbalance: 'New Balance', puma: 'PUMA', reebok: 'Reebok', asos: 'ASOS', hottopic: 'Hot Topic',
  boxlunch: 'BoxLunch', disney: 'Disney Store', shopdisney: 'Disney Store', funko: 'Funko', mattel: 'Mattel', hasbro: 'Hasbro',
};

/** Second-level part of a host: "www.bestbuy.com" -> "bestbuy", "amazon.co.uk" -> "amazon". */
function hostKey(host: string): string {
  const parts = host.toLowerCase().replace(/^www\d?\./, '').split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const twoPartTld = parts.length >= 3 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]);
  return parts[parts.length - (twoPartTld ? 3 : 2)].replace(/-/g, '');
}

/** Known shop name for a URL or host, or undefined if we don't recognise it. */
export function knownStore(urlOrHost: string): string | undefined {
  let host = urlOrHost;
  try { host = new URL(urlOrHost).hostname; } catch { /* already a host */ }
  if (/(^|\.)a\.co$/i.test(host) || /(^|\.)amzn\.(to|com)$/i.test(host)) return 'Amazon';
  if (/(^|\.)bit\.ly$|(^|\.)tinyurl\.com$/i.test(host)) return undefined;
  return STORES[hostKey(host)];
}

/** What to call the shop: its known name, else the bare host ("example.com"). */
export function storeLabel(url: string): string {
  const known = knownStore(url);
  if (known) return known;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
