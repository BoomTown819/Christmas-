'use client';
import { PlusIcon } from './Icons';

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="empty">
      <svg className="empty-art" viewBox="0 0 200 160" aria-hidden="true">
        <path d="M100 14l44 62h-20l32 44H44l32-44H56z" className="ea-tree" />
        <rect x="92" y="120" width="16" height="16" rx="2" className="ea-trunk" />
        <path d="M100 4l3.5 7 7.7 1.1-5.6 5.4 1.3 7.7-6.9-3.6-6.9 3.6 1.3-7.7-5.6-5.4 7.7-1.1z" className="ea-star" />
        <rect x="30" y="118" width="40" height="30" rx="3" className="ea-gift-a" />
        <rect x="47" y="118" width="6" height="30" className="ea-ribbon" />
        <rect x="132" y="126" width="34" height="22" rx="3" className="ea-gift-b" />
        <rect x="146" y="126" width="6" height="22" className="ea-ribbon" />
        <circle cx="86" cy="68" r="3.5" className="ea-bauble" /><circle cx="114" cy="92" r="3.5" className="ea-bauble" /><circle cx="94" cy="104" r="3" className="ea-bauble-g" />
      </svg>
      <h2>Nothing under the tree yet</h2>
      <p>Paste a link from any store, give it a price, and rate how badly you want it. Your list saves automatically as you go.</p>
      <div className="empty-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={onAdd}><PlusIcon size={20} /> Add your first item</button>
      </div>
    </section>
  );
}
