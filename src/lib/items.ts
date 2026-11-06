import type { PublicWishlist, WishlistItem } from '@/types';

export interface ItemRow {
  id: string; wishlist_id: string; name: string; url: string; price_cents: number; rating: number | string;
  description: string; description_source: WishlistItem['descriptionSource']; reason: string; image_url: string;
  position: number; created_at: string; updated_at: string;
  item_private_notes?: { note: string } | { note: string }[] | null;
}

export function fromRow(r: ItemRow): WishlistItem {
  const notes = Array.isArray(r.item_private_notes) ? r.item_private_notes[0] : r.item_private_notes;
  return {
    id: r.id, name: r.name, url: r.url, priceCents: r.price_cents, rating: Number(r.rating),
    description: r.description, descriptionSource: r.description_source, reason: r.reason,
    privateNote: notes?.note ?? '', imageUrl: r.image_url, position: r.position,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function fromPublic(i: PublicWishlist['items'][number]): WishlistItem {
  return {
    id: i.id, name: i.name, url: i.url, priceCents: i.price_cents, rating: Number(i.rating), description: i.description,
    descriptionSource: i.description_source, reason: i.reason, privateNote: '', imageUrl: i.image_url,
    position: i.position, createdAt: i.created_at, updatedAt: i.created_at,
  };
}

export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

export const AVATARS: Record<string, string> = {
  santa: '🎅', mrsclaus: '🤶', elf: '🧝', snowman: '⛄', reindeer: '🦌', penguin: '🐧',
  polarbear: '🐻‍❄️', gingerbread: '🍪', tree: '🎄', star: '🌟', gift: '🎁', teddy: '🧸',
};
export const AVATAR_COLORS = ['red', 'green', 'gold', 'cream', 'berry', 'pine'] as const;

export const fmtInviteCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
