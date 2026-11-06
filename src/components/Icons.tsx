type P = { size?: number };
const s = (size = 18) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const PlusIcon = ({ size }: P) => <svg {...s(size)}><path d="M12 5v14M5 12h14" /></svg>;
export const EditIcon = ({ size }: P) => <svg {...s(size)}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>;
export const TrashIcon = ({ size }: P) => <svg {...s(size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const ExternalIcon = ({ size }: P) => <svg {...s(size)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>;
export const SparkIcon = ({ size }: P) => <svg {...s(size)}><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8z" /><path d="M19 15l.7 1.9 1.8.6-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.6z" /></svg>;
export const RefreshIcon = ({ size }: P) => <svg {...s(size)}><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>;
export const DiceIcon = ({ size }: P) => <svg {...s(size)}><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></svg>;
export const DownloadIcon = ({ size }: P) => <svg {...s(size)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const ShareIcon = ({ size }: P) => <svg {...s(size)}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></svg>;
export const BroomIcon = ({ size }: P) => <svg {...s(size)}><path d="M14 4l6 6M17 7l-6 6M4 20c0-4 2-7 7-7l0 0c0 5-3 7-7 7z" /></svg>;
export const LinkIcon = ({ size }: P) => <svg {...s(size)}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>;
export const CopyIcon = ({ size }: P) => <svg {...s(size)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></svg>;

/** Wrapped-gift placeholder used when a product image isn't available. */
export function GiftPlaceholder({ seed = 0 }: { seed?: number }) {
  const variants = ['ph-green', 'ph-red', 'ph-gold'];
  return (
    <div className={`placeholder ${variants[seed % 3]}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" width="76" height="76">
        <rect x="22" y="52" width="76" height="50" rx="5" className="ph-box" />
        <rect x="16" y="38" width="88" height="18" rx="4" className="ph-lid" />
        <rect x="54" y="38" width="12" height="64" className="ph-ribbon" />
        <path d="M60 38c-8-14-26-16-26-6 0 6 12 7 26 6zM60 38c8-14 26-16 26-6 0 6-12 7-26 6z" className="ph-bow" />
      </svg>
    </div>
  );
}
