'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Counts page changes inside the app since this tab loaded.
let pagesSeen = 0;
let lastPath: string | null = null;

/** "← Back" on every page except the home dashboard. Goes to the previous page,
 *  or home if this page was opened straight from a link. */
export function BackButton() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (path && path !== lastPath) { pagesSeen += 1; lastPath = path; }
  }, [path]);
  if (!path || path === '/') return null;
  const goBack = () => {
    let canGoBack = pagesSeen > 1;
    if (!canGoBack) {
      try { canGoBack = document.referrer.startsWith(window.location.origin) && window.history.length > 1; } catch { /* ignore */ }
    }
    if (canGoBack) router.back(); else router.push('/');
  };
  return (
    <button type="button" className="back-btn" onClick={goBack}><span aria-hidden="true">←</span> Back</button>
  );
}
