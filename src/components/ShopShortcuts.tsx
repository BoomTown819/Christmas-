'use client';
import '@/additions.css';
import { useEffect, useRef, useState } from 'react';

interface Store { name: string; color: string; home: string; search: (q: string) => string; cart: string; cartLabel?: string; cartViaHome?: boolean }

/** Popular stores. Links are ordinary web addresses, so on a phone they open the store's own app if it's installed. */
export const STORES: Store[] = [
  { name: 'Amazon', color: '#ff9900', home: 'https://www.amazon.com/', search: (q) => `https://www.amazon.com/s?k=${q}`, cart: 'https://www.amazon.com/gp/cart/view.html', cartViaHome: true },
  { name: 'Target', color: '#cc0000', home: 'https://www.target.com/', search: (q) => `https://www.target.com/s?searchTerm=${q}`, cart: 'https://www.target.com/cart' },
  { name: 'Walmart', color: '#0071ce', home: 'https://www.walmart.com/', search: (q) => `https://www.walmart.com/search?q=${q}`, cart: 'https://www.walmart.com/cart' },
  { name: 'Best Buy', color: '#0046be', home: 'https://www.bestbuy.com/', search: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`, cart: 'https://www.bestbuy.com/cart' },
  { name: 'Etsy', color: '#f1641e', home: 'https://www.etsy.com/', search: (q) => `https://www.etsy.com/search?q=${q}`, cart: 'https://www.etsy.com/cart' },
  { name: 'eBay', color: '#3665f3', home: 'https://www.ebay.com/', search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}`, cart: 'https://cart.ebay.com/' },
  { name: 'Apple', color: '#1d1d1f', home: 'https://www.apple.com/shop', search: (q) => `https://www.apple.com/us/search/${q}?src=globalnav`, cart: 'https://www.apple.com/shop/bag', cartLabel: 'Bag' },
  { name: 'Nike', color: '#111111', home: 'https://www.nike.com/', search: (q) => `https://www.nike.com/w?q=${q}`, cart: 'https://www.nike.com/cart', cartLabel: 'Bag' },
];

/**
 * "Find it in a store" / "Go to my cart" buttons inside Add item.
 * Websites can't see what's inside your store cart (stores keep that private), but these take you straight there.
 */
export function ShopShortcuts({ query, onLeave }: { query: string; onLeave: () => void }) {
  const [mode, setMode] = useState<'find' | 'cart'>('find');
  const q = encodeURIComponent(query.trim());
  return (
    <div className="shop" data-testid="shop-shortcuts">
      <div className="shop-head">
        <span className="shop-title">Don’t have a link yet?</span>
        <div className="shop-toggle" role="radiogroup" aria-label="Store shortcuts">
          <button type="button" role="radio" aria-checked={mode === 'find'} className={mode === 'find' ? 'is-on' : ''} onClick={() => setMode('find')}>🔎 Find it in a store</button>
          <button type="button" role="radio" aria-checked={mode === 'cart'} className={mode === 'cart' ? 'is-on' : ''} onClick={() => setMode('cart')}>🛒 Go to my cart</button>
        </div>
      </div>
      <div className="shop-grid">
        {STORES.map((s) => {
          // Amazon: open the main site (the Amazon app on phones); you tap your cart from there.
          const href = mode === 'cart' ? (s.cartViaHome ? s.home : s.cart) : q ? s.search(q) : s.home;
          const label = mode === 'cart' ? `${s.name} ${s.cartLabel ?? 'cart'}` : s.name;
          return (
            <a key={s.name} className="shop-btn" href={href} target="_blank" rel="noopener noreferrer" onClick={onLeave}
              aria-label={mode === 'cart' ? (s.cartViaHome ? `Open ${s.name}, then tap your cart` : `Open my ${s.name} ${(s.cartLabel ?? 'cart').toLowerCase()}`) : q ? `Search ${s.name} for ${query.trim()}` : `Open ${s.name}`}>
              <span className="shop-dot" style={{ background: s.color }} aria-hidden="true" />{label}
            </a>
          );
        })}
      </div>
      <p className="shop-steps">
        {mode === 'cart'
          ? 'Opens the store (in its app if you have it). Go to your cart and tap the item itself, then Share → Copy link. Come back here and tap 📋 Paste link.'
          : query.trim()
            ? <>Searches for “{query.trim()}”. Found it? Tap Share → Copy link, then come back and tap 📋 Paste link. What you’ve typed here is kept.</>
            : 'Tip: type the item name above first and we’ll search for it. Found it? Tap Share → Copy link, then come back and tap 📋 Paste link.'}
      </p>
    </div>
  );
}

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
