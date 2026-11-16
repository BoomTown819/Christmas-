'use client';
import '@/additions.css';
import { useEffect, useRef, useState } from 'react';

/** Big "Paste link" button. Glows when you come back from another app (like a store app). */
export function PasteLinkButton({ onLink, show }: { onLink: (url: string) => void; show: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const left = useRef(false);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') left.current = true;
      else if (left.current) { left.current = false; setCalling(true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  if (!show) return null;
  const paste = async () => {
    setMsg(null);
    setCalling(false);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const m = text.match(/https?:\/\/[^\s<>"']+/i);
      if (m) { onLink(m[0].replace(/[).,!?]+$/, '')); return; }
      setMsg('There’s no link on your clipboard yet. In the store, tap Share → Copy link, then try again.');
    } catch {
      setMsg('Your browser didn’t allow pasting here. Press and hold in the link box above, then choose Paste.');
      document.getElementById('f-url')?.focus();
    }
  };
  return (
    <div className="paste-wrap">
      <button type="button" className={`btn btn-gold paste-btn${calling ? ' is-calling' : ''}`} onClick={paste}>📋 Paste link</button>
      {calling && <p className="field-note" role="status">Back from the store? Tap 📋 Paste link to add the link you copied.</p>}
      {msg && <p className="field-note" role="status">{msg}</p>}
    </div>
  );
}
