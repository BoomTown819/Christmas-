'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fromRow, type ItemRow } from '@/lib/items';
import { sumCents } from '@/lib/money';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { ItemDraft, WishlistItem } from '@/types';

const SELECT = '*, item_private_notes(note)';

const toRow = (d: ItemDraft) => ({
  name: d.name, url: d.url, price_cents: d.priceCents, rating: d.rating, description: d.description,
  description_source: d.descriptionSource, reason: d.reason, image_url: d.imageUrl,
});

/** The signed-in owner's wishlist, read and written through row level security. */
export function useMyWishlist(wishlistId: string, ownerId: string, initial: WishlistItem[]) {
  const db = supabaseBrowser();
  const [items, setItems] = useState<WishlistItem[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const fail = (msg: string) => (e: unknown) => {
    console.error(e);
    setError(msg);
  };

  const reload = useCallback(async () => {
    const { data, error } = await db.from('wishlist_items').select(SELECT).eq('wishlist_id', wishlistId).order('position');
    if (error) return setError('Couldn’t load your wishlist. Check your connection and refresh.');
    setItems((data as ItemRow[]).map(fromRow));
  }, [db, wishlistId]);

  // Other devices/tabs: refresh when the page comes back into view.
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const saveNote = async (itemId: string, note: string) => {
    if (note) {
      const { error } = await db.from('item_private_notes').upsert({ item_id: itemId, owner_id: ownerId, note, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      await db.from('item_private_notes').delete().eq('item_id', itemId);
    }
  };

  const add = async (draft: ItemDraft): Promise<WishlistItem | null> => {
    setError(null);
    const { data, error } = await db.from('wishlist_items').insert({ ...toRow(draft), wishlist_id: wishlistId }).select(SELECT).single();
    if (error) { fail('Couldn’t save that item. Try again.')(error); return null; }
    let item = fromRow(data as ItemRow);
    if (draft.privateNote) {
      await saveNote(item.id, draft.privateNote).catch(fail('Saved the item, but not its private note.'));
      item = { ...item, privateNote: draft.privateNote };
    }
    setItems((l) => [...l, item]);
    return item;
  };

  const update = async (id: string, draft: ItemDraft) => {
    setError(null);
    const prev = items;
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...draft } : i)));
    const { error } = await db.from('wishlist_items').update(toRow(draft)).eq('id', id);
    if (error) { setItems(prev); return fail('Couldn’t save your changes. Try again.')(error); }
    await saveNote(id, draft.privateNote).catch(fail('Saved the item, but not its private note.'));
  };

  const setRating = async (id: string, rating: number) => {
    setItems((l) => l.map((i) => (i.id === id ? { ...i, rating } : i)));
    const { error } = await db.from('wishlist_items').update({ rating }).eq('id', id);
    if (error) { fail('Couldn’t save that rating.')(error); reload(); }
  };

  const remove = async (item: WishlistItem) => {
    setItems((l) => l.filter((i) => i.id !== item.id));
    const { error } = await db.from('wishlist_items').delete().eq('id', item.id);
    if (error) { fail('Couldn’t delete that item.')(error); reload(); }
  };

  /** Undo a delete by adding the item back (it gets a new id). */
  const restore = async (item: WishlistItem) => {
    const { data, error } = await db.from('wishlist_items').insert({ ...toRow(item), wishlist_id: wishlistId, position: item.position }).select(SELECT).single();
    if (error) return fail('Couldn’t restore that item.')(error);
    if (item.privateNote) await saveNote((data as ItemRow).id, item.privateNote).catch(() => {});
    reload();
  };

  const clear = async () => {
    setItems([]);
    const { error } = await db.from('wishlist_items').delete().eq('wishlist_id', wishlistId);
    if (error) { fail('Couldn’t clear the list.')(error); reload(); }
  };

  const reorder = async (ids: string[]) => {
    const pos = new Map(ids.map((id, i) => [id, i + 1]));
    setItems((l) => l.map((i) => ({ ...i, position: pos.get(i.id) ?? i.position })));
    const { error } = await db.rpc('reorder_items', { p_ids: ids });
    if (error) { fail('Couldn’t save the new order.')(error); reload(); }
  };

  const totalCents = useMemo(() => sumCents(items), [items]);
  return { items, error, setError, add, update, setRating, remove, restore, clear, reorder, totalCents, reload };
}
