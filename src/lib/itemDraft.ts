/**
 * Keeps a half-filled "Add item" form safe while someone pops over to a store app
 * to find a link. Stored only in this browser, for up to 2 hours.
 */
export interface ItemDraftState {
  name: string; url: string; price: string; rating: number; description: string; reason: string; privateNote: string; imageUrl: string;
}
const KEY = 'oc:add-item-draft';
const MAX_AGE = 2 * 60 * 60 * 1000;

export function saveDraft(d: ItemDraftState) {
  try {
    const empty = !d.name.trim() && !d.url.trim() && !d.price.trim() && !d.description.trim() && !d.reason.trim() && !d.privateNote.trim();
    if (empty) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d }));
  } catch { /* storage unavailable */ }
}

export function loadDraft(): ItemDraftState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { at, d } = JSON.parse(raw) as { at: number; d: ItemDraftState };
    if (Date.now() - at > MAX_AGE) { localStorage.removeItem(KEY); return null; }
    return d;
  } catch { return null; }
}

export const hasDraft = () => loadDraft() !== null;

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** First web link in some shared text ("Check this out! https://a.co/d/abc"). */
export function firstLink(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    const m = (t ?? '').match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[).,!?]+$/, '');
  }
  return null;
}
