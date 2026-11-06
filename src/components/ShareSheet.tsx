'use client';
import { useState } from 'react';
import { CopyIcon } from './Icons';

/** Copy / Messages / Email / WhatsApp (and the phone's own share sheet when available). */
export function ShareSheet({ url, title, text, idPrefix }: { url: string; title: string; text: string; idPrefix: string }) {
  const [copied, setCopied] = useState(false);
  const msg = `${text} ${url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      (document.getElementById(`${idPrefix}-link`) as HTMLInputElement | null)?.select();
    }
  };
  const canNative = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <div className="sharesheet">
      <div className="copy-row">
        <input id={`${idPrefix}-link`} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
        <button type="button" className="btn btn-primary btn-sm" onClick={copy}><CopyIcon size={15} /> {copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      <div className="share-apps">
        <a className="share-app sa-sms" href={`sms:?&body=${encodeURIComponent(msg)}`}><span aria-hidden="true">💬</span> Messages</a>
        <a className="share-app sa-mail" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(msg)}`}><span aria-hidden="true">✉️</span> Email</a>
        <a className="share-app sa-wa" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">🟢</span> WhatsApp</a>
        {canNative && (
          <button type="button" className="share-app" onClick={() => navigator.share({ title, text, url }).catch(() => {})}><span aria-hidden="true">📤</span> More…</button>
        )}
      </div>
    </div>
  );
}
