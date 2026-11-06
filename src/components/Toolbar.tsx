'use client';
import { FILTER_LABELS, SORT_LABELS } from '../lib/organize';
import type { RatingFilter, SortKey } from '../types';
import { BroomIcon, DiceIcon, DownloadIcon, ShareIcon } from './Icons';

interface Props {
  sort: SortKey;
  filter: RatingFilter;
  onSort: (s: SortKey) => void;
  onFilter: (f: RatingFilter) => void;
  onRandom: () => void;
  onExport: () => void;
  onShare: () => void;
  onClear: () => void;
  disabled: boolean;
}

export function Toolbar({ sort, filter, onSort, onFilter, onRandom, onExport, onShare, onClear, disabled }: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-organize">
        <label className="select">
          <span className="select-label">Sort</span>
          <select id="sort" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
          </select>
        </label>
        <div className="filter-chips" role="radiogroup" aria-label="Filter by want rating">
          {(Object.keys(FILTER_LABELS) as RatingFilter[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={`fchip${filter === f ? ' is-on' : ''}`} onClick={() => onFilter(f)}>
              {f === 'all' ? 'All' : f === '5' ? '★ 5' : f === 'under2' ? '< ★ 2' : `★ ${f}`}
              <span className="sr-only"> {FILTER_LABELS[f]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="toolbar-actions">
        <button type="button" className="btn btn-soft btn-sm" onClick={onRandom} disabled={disabled}><DiceIcon size={16} /> Surprise me</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={onExport} disabled={disabled}><DownloadIcon size={16} /> CSV</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={onShare} disabled={disabled}><ShareIcon size={16} /> Share</button>
        <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={onClear} disabled={disabled}><BroomIcon size={16} /> Clear all</button>
      </div>
    </div>
  );
}
