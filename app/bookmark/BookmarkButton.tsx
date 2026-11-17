'use client';
import { useEffect, useRef, useState } from 'react';
import { bookmarkletHref } from '@/lib/bookmarklet';

export function BookmarkButton() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const href = bookmarkletHref(window.location.origin);
    setCode(href);
    // Set directly so React doesn't object to a "javascript:" address.
    linkRef.current?.setAttribute('href', href);
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { (document.getElementById('bm-code') as HTMLTextAreaElement | null)?.select(); }
  };
  return (
    <div className="bm-grid">
      <p className="bm-note bm-update">🔄 Already have the button? Set it up again from this page and delete the old one. The new one keeps everything in one Our Christmas tab instead of opening a new tab each time.</p>
      <section className="panel bm-step">
        <h2>💻 On a computer</h2>
        <ol>
          <li>Drag this button up to your bookmarks bar:</li>
        </ol>
        <div className="bm-drag-row">
          <a ref={linkRef} className="bm-drag" data-testid="bookmarklet" onClick={(e) => { e.preventDefault(); }} draggable>🎁 Add to Our Christmas</a>
        </div>
        <p className="muted bm-small">Don’t see a bookmarks bar? Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> on Windows, or <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> on a Mac.</p>
        <ol start={2}>
          <li>Open any product page: Amazon, Louis Vuitton, Target, anywhere.</li>
          <li>Click <strong>🎁 Add to Our Christmas</strong> in your bookmarks bar.</li>
          <li>Your wishlist opens with the item filled in. Pick your stars and tap <strong>Add to wishlist</strong>.</li>
        </ol>
      </section>

      <section className="panel bm-step">
        <h2>📱 On iPhone or iPad (Safari)</h2>
        <ol>
          <li>Tap <strong>Copy the button</strong> below.</li>
          <li>Tap the Share button <span aria-hidden="true">⬆️</span>, then <strong>Add Bookmark</strong>. Name it <strong>Add to Our Christmas</strong> and save.</li>
          <li>Open your bookmarks <span aria-hidden="true">📖</span>, tap <strong>Edit</strong>, tap the new bookmark, delete its address and paste the copied button there. Tap <strong>Done</strong>.</li>
          <li>On a product page in Safari, open your bookmarks <span aria-hidden="true">📖</span> (at the bottom, or behind <strong>•••</strong>) and tap <strong>Add to Our Christmas</strong>. Open it from the bookmarks list: typing it into the address bar is blocked by Safari.</li>
        </ol>
        <button type="button" className="btn btn-gold btn-lg bm-copy" onClick={copy} disabled={!code}>{copied ? '✓ Copied!' : '📋 Copy the button'}</button>
        <p className="muted bm-small">In the Amazon app, the button can’t run. Tap Share → Copy link, paste the link into Safari, then use the button there.</p>
        <p className="muted bm-small">Android (Chrome) works the same way: make a bookmark, paste the button as its address, then open it from your bookmarks on a product page.</p>
        <textarea id="bm-code" className="bm-code" readOnly value={code} aria-label="The button’s code" rows={2} />
      </section>
    </div>
  );
}
