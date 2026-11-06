'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks() {
  const path = usePathname();
  const links = [['/', 'Our Christmas'], ['/my-list', 'My list']] as const;
  return (
    <>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? 'is-active' : undefined}>{label}</Link>
      ))}
    </>
  );
}
