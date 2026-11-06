/**
 * Remembers on this device which wishlist links belong to the signed-in owner.
 * If the owner later opens their own link while signed out, the page hides gift
 * claims instead of showing them. The server never sends claims to a signed-in
 * owner; this covers the signed-out case on the owner's own devices.
 */
const KEY = 'our-christmas:owned-lists';

export function rememberOwnedList(slug: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!list.includes(slug)) localStorage.setItem(KEY, JSON.stringify([...list, slug].slice(-10)));
  } catch { /* storage unavailable */ }
}

export function isOwnedHere(slug: string) {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).includes(slug);
  } catch {
    return false;
  }
}

export function forgetOwnedList(slug: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    localStorage.setItem(KEY, JSON.stringify(list.filter((s) => s !== slug)));
  } catch { /* storage unavailable */ }
}
