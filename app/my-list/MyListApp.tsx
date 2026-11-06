'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Avatar } from '@/components/festive/Decorations';
import { PlusIcon } from '@/components/Icons';
import { ItemCard, type ReorderControls } from '@/components/ItemCard';
import { ItemForm } from '@/components/ItemForm';
import { RandomPick } from '@/components/RandomPick';
import { ShareListDialog } from '@/components/ShareListDialog';
import { PageHead } from '@/components/site/Village';
import { Summary } from '@/components/Summary';
import { Toasts, useToasts } from '@/components/Toasts';
import { Toolbar } from '@/components/Toolbar';
import { TotalPanel } from '@/components/TotalPanel';
import { useMyWishlist } from '@/hooks/useMyWishlist';
import { downloadCSV } from '@/lib/csv';
import { AVATARS, possessive } from '@/lib/items';
import { sumCents } from '@/lib/money';
import { filterByRating, FILTER_LABELS, sortItems } from '@/lib/organize';
import { rememberOwnedList } from '@/lib/ownedLists';
import type { ItemDraft, MyWishlist, Profile, RatingFilter, SortKey, WishlistItem } from '@/types';

interface Props { profile: Profile; wishlist: MyWishlist; initialItems: WishlistItem[]; anonymous?: boolean }

export function MyListApp({ profile, wishlist, initialItems, anonymous }: Props) {
  const list = useMyWishlist(wishlist.id, profile.id, initialItems);
  const { items } = list;
  const [sort, setSort] = useState<SortKey>('custom');
  const [filter, setFilter] = useState<RatingFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [slug, setSlug] = useState(wishlist.share_slug);
  const [shareWithFamily, setShareWithFamily] = useState(wishlist.share_with_family);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOver = useRef<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => rememberOwnedList(slug), [slug]);
  useEffect(() => { if (list.error) { push(list.error); list.setError(null); } }, [list, push]);

  const visible = useMemo(() => sortItems(filterByRating(items, filter), sort), [items, filter, sort]);
  const ordered = useMemo(() => sortItems(items, 'custom'), [items]);
  const canReorder = sort === 'custom' && filter === 'all';

  const flash = (id: string) => {
    setHighlight(id);
    setTimeout(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2000);
  };

  const save = async (draft: ItemDraft) => {
    setFormOpen(false);
    if (editing) {
      await list.update(editing.id, draft);
      push(`Saved changes to ${draft.name}`);
      flash(editing.id);
    } else {
      const item = await list.add(draft);
      if (item) {
        push(`Added ${draft.name}`);
        if (filter !== 'all' && filterByRating([item], filter).length === 0) setFilter('all');
        flash(item.id);
      }
    }
  };

  const remove = useCallback((item: WishlistItem) => {
    list.remove(item);
    push(`Deleted ${item.name}`, { label: 'Undo', run: () => list.restore(item) });
  }, [list, push]);

  const move = (id: string, to: number) => {
    const ids = ordered.map((i) => i.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    list.reorder(ids);
  };

  const reorderFor = (item: WishlistItem, idx: number): ReorderControls | undefined => {
    if (!canReorder) return undefined;
    return {
      canUp: idx > 0, canDown: idx < ordered.length - 1,
      onUp: () => move(item.id, idx - 1), onDown: () => move(item.id, idx + 1),
      dragging: dragId === item.id,
      drag: {
        draggable: true,
        onDragStart: (e) => { setDragId(item.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); },
        onDragOver: (e) => { e.preventDefault(); dragOver.current = item.id; },
        onDrop: (e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData('text/plain') || dragId;
          if (from && from !== item.id) move(from, ordered.findIndex((i) => i.id === item.id));
          setDragId(null);
        },
        onDragEnd: () => setDragId(null),
      },
    };
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const title = `${possessive(profile.display_name)} Christmas Wishlist`;

  return (
    <>
      <PageHead actions={<>
        <button type="button" className="btn btn-festive btn-lg" onClick={() => setShareOpen(true)}>Share my Christmas list 🎁</button>
        <button type="button" className="btn btn-gold btn-lg" onClick={openAdd}><PlusIcon size={20} /> Add item</button>
      </>}>
        <div className="pagehead-who">
          <Avatar emoji={AVATARS[profile.avatar] ?? '🎅'} color={profile.avatar_color} size={46} />
          <span className="hero-pill"><span className="hero-pill-num">{items.length}</span> {items.length === 1 ? 'item' : 'items'} on the list</span>
        </div>
        <h1 className="pagehead-title">{title}</h1>
        <p className="pagehead-sub">Everything I’m hoping to find under the tree.</p>
      </PageHead>

      <main className="main">

        {items.length === 0 ? (
          <>
            <EmptyState onAdd={openAdd} />
            <p className="secret-note"><span aria-hidden="true">🤫</span> Gift claims on your own list are kept secret from you, so Christmas morning is still a surprise. <Link href={`/list/${slug}`}>See what family sees</Link></p>
            {anonymous && <p className="secret-note" data-testid="device-note">Your list is saved on this device. <Link href="/profile">Add an email</Link> to open it on another phone or computer.</p>}
          </>
        ) : (
          <>
            <Summary items={items} totalCents={list.totalCents} />
            <p className="secret-note"><span aria-hidden="true">🤫</span> Gift claims on your own list are kept secret from you, so Christmas morning is still a surprise. <Link href={`/list/${slug}`}>See what family sees</Link></p>
            {anonymous && <p className="secret-note" data-testid="device-note">Your list is saved on this device. <Link href="/profile">Add an email</Link> to open it on another phone or computer.</p>}
            <Toolbar
              sort={sort} filter={filter} onSort={setSort} onFilter={setFilter}
              onRandom={() => setRandomOpen(true)}
              onExport={() => { downloadCSV(sortItems(items, sort)); push('Downloaded your wishlist as CSV'); }}
              onShare={() => setShareOpen(true)}
              onClear={() => setConfirmClear(true)}
              disabled={items.length === 0}
            />
            {sort === 'custom' && filter === 'all' && items.length > 1 && <p className="reorder-hint">Drag cards or use the arrows to put your list in order.</p>}

            {visible.length === 0 ? (
              <div className="no-match">
                <p>No items match “{FILTER_LABELS[filter]}”.</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>Show all items</button>
              </div>
            ) : (
              <div className="grid" data-testid="grid">
                {visible.map((item, i) => (
                  <ItemCard key={item.id} item={item} index={i} highlighted={highlight === item.id} showPrivateNote
                    reorder={reorderFor(item, ordered.findIndex((o) => o.id === item.id))}
                    onEdit={(it) => { setEditing(it); setFormOpen(true); }} onDelete={remove} onRate={list.setRating} />
                ))}
                <button type="button" className="card card-add" onClick={openAdd}>
                  <span className="card-add-icon"><PlusIcon size={26} /></span>
                  <span>Add another item</span>
                </button>
              </div>
            )}
            <TotalPanel items={sortItems(items, sort)} totalCents={list.totalCents} visibleCount={visible.length} visibleCents={sumCents(visible)} />
          </>
        )}
      </main>

      <button type="button" className="fab" onClick={openAdd} aria-label="Add item"><PlusIcon size={26} /></button>
      <ItemForm key={formOpen ? editing?.id ?? 'new' : 'closed'} open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSave={save} />
      <ConfirmDialog open={confirmClear} title="Clear your whole wishlist?" confirmLabel="Clear wishlist"
        message={`This deletes all ${items.length} items for everyone who has your link. It can’t be undone.`}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { list.clear(); setConfirmClear(false); setFilter('all'); push('Wishlist cleared'); }} />
      <RandomPick open={randomOpen} items={items} onClose={() => setRandomOpen(false)}
        onShow={(id) => { setRandomOpen(false); setFilter('all'); flash(id); }} />
      <ShareListDialog open={shareOpen} onClose={() => setShareOpen(false)} slug={slug} ownerName={profile.display_name}
        shareWithFamily={shareWithFamily} onSlug={(s) => { setSlug(s); push('New link made. The old one no longer works.'); }}
        onShareWithFamily={setShareWithFamily} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}
