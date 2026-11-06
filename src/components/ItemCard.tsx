'use client';
import { memo, useState, type DragEvent, type ReactNode } from 'react';
import { formatUSD } from '../lib/money';
import { tierOf, TIER_LABELS, wantLabel } from '../lib/organize';
import { hostOf } from '../lib/url';
import type { WishlistItem } from '../types';
import { EditIcon, ExternalIcon, GiftPlaceholder, SparkIcon, TrashIcon } from './Icons';
import { StarRating } from './StarRating';

export interface ReorderControls {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  drag: {
    draggable: true;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  dragging: boolean;
}

interface Props {
  item: WishlistItem;
  index: number;
  readOnly?: boolean;
  highlighted?: boolean;
  /** Replaces the owner's edit/delete footer (used for gift buyers). */
  actions?: ReactNode;
  /** Overlay on the image, e.g. "Claimed by Mom". Only ever passed in buyer views. */
  status?: ReactNode;
  statusTone?: 'claimed' | 'purchased' | 'mine';
  showPrivateNote?: boolean;
  reorder?: ReorderControls;
  onEdit?: (item: WishlistItem) => void;
  onDelete?: (item: WishlistItem) => void;
  onRate?: (id: string, rating: number) => void;
}

export const ItemCard = memo(function ItemCard({ item, index, readOnly, highlighted, actions, status, statusTone, showPrivateNote, reorder, onEdit, onDelete, onRate }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const tier = tierOf(item.rating);
  const host = hostOf(item.url);

  return (
    <article
      className={`card tier-${tier}${highlighted ? ' is-highlighted' : ''}${statusTone ? ` is-${statusTone}` : ''}${reorder?.dragging ? ' is-dragging' : ''}`}
      id={`item-${item.id}`}
      data-testid="item-card"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      {...(reorder?.drag ?? {})}
    >
      <div className="card-media">
        {item.imageUrl && imgOk ? (
          <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          <GiftPlaceholder seed={item.name.length} />
        )}
        <span className="tag">{TIER_LABELS[tier]}</span>
        {status && <span className="claim-ribbon" data-testid="claim-status">{status}</span>}
        {reorder && (
          <span className="reorder" aria-label="Reorder">
            <span className="drag-grip" title="Drag to rearrange" aria-hidden="true">⋮⋮</span>
            <button type="button" className="icon-btn icon-btn-sm" onClick={reorder.onUp} disabled={!reorder.canUp} aria-label={`Move ${item.name} earlier`}>↑</button>
            <button type="button" className="icon-btn icon-btn-sm" onClick={reorder.onDown} disabled={!reorder.canDown} aria-label={`Move ${item.name} later`}>↓</button>
          </span>
        )}
      </div>

      <div className="card-body">
        <div className="card-title-row">
          <h3 className="card-title">{item.name}</h3>
          <p className="card-price">{formatUSD(item.priceCents)}</p>
        </div>
        {host && <p className="card-host">{host}</p>}

        <div className="card-rating">
          {readOnly || !onRate ? (
            <StarRating value={item.rating} size="sm" />
          ) : (
            <StarRating value={item.rating} size="sm" onChange={(v) => onRate(item.id, v)} label={`How badly I want ${item.name}`} />
          )}
          <span className="card-want">{item.rating.toFixed(1)} · {wantLabel(item.rating)}</span>
        </div>

        {item.description ? (
          <p className="card-desc">
            {item.descriptionSource === 'ai' && <span className="ai-badge" title="Written by AI from the product page"><SparkIcon size={11} /> AI</span>}
            {item.description}
          </p>
        ) : (
          <p className="card-desc is-empty">No description yet.</p>
        )}

        {item.reason && (
          <blockquote className="card-reason">
            <span className="card-reason-label">Why I want it</span>
            {item.reason}
          </blockquote>
        )}
        {showPrivateNote && item.privateNote && (
          <p className="card-private"><span aria-hidden="true">🔒</span> <span><strong>Private note:</strong> {item.privateNote}</span></p>
        )}
      </div>

      <footer className="card-actions">
        {actions ?? (confirming ? (
          <div className="confirm-inline" role="group" aria-label={`Delete ${item.name}?`}>
            <span>Remove this item?</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>Keep</button>
            <button type="button" className="btn btn-sm btn-danger" autoFocus onClick={() => onDelete?.(item)}>Delete</button>
          </div>
        ) : (
          <>
            <a className="btn btn-sm btn-visit" href={item.url} target="_blank" rel="noopener noreferrer">
              Visit site <ExternalIcon size={14} />
            </a>
            {!readOnly && (
              <div className="card-tools">
                <button type="button" className="icon-btn" onClick={() => onEdit?.(item)} aria-label={`Edit ${item.name}`} title="Edit"><EditIcon /></button>
                <button type="button" className="icon-btn icon-btn-danger" onClick={() => setConfirming(true)} aria-label={`Delete ${item.name}`} title="Delete"><TrashIcon /></button>
              </div>
            )}
          </>
        ))}
      </footer>
    </article>
  );
});
