'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const LINKS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/my-list', label: 'My list', icon: '🎁' },
  { href: '/character', label: 'Character', icon: '👾' },
] as const;

const isActive = (path: string | null, href: string) => (href === '/' ? path === '/' : Boolean(path?.startsWith(href)));

/** Top-bar links on larger screens. (Home has its own button next to Back.) */
export function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.filter((l) => l.href !== '/').map((l) => (
        <Link key={l.href} href={l.href} className={`navlink-top${isActive(path, l.href) ? ' is-active' : ''}`} aria-current={isActive(path, l.href) ? 'page' : undefined}>
          <span aria-hidden="true">{l.icon}</span> {l.label}
        </Link>
      ))}
    </>
  );
}

/** Big labeled tab bar along the bottom of the screen on phones. */
export function TabBar({ me }: { me: ReactNode }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`tab${isActive(path, l.href) ? ' is-active' : ''}`} aria-current={isActive(path, l.href) ? 'page' : undefined}>
          <span className="tab-icon" aria-hidden="true">{l.icon}</span><span className="tab-label">{l.label}</span>
        </Link>
      ))}
      <Link href="/profile" className={`tab${isActive(path, '/profile') ? ' is-active' : ''}`} aria-current={isActive(path, '/profile') ? 'page' : undefined}>
        <span className="tab-icon" aria-hidden="true">{me}</span><span className="tab-label">Me</span>
      </Link>
    </nav>
  );
}
