import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DecorProvider, FooterParade, type DecorCharacter } from '@/components/character/Decor';
import { SiteHeader } from '@/components/site/SiteHeader';
import { getSessionUser } from '@/lib/supabase/server';
import '@/styles.css';
import '@/festive.css';
import '@/app.css';
import '@/character.css';
import '@/sizing.css';

// Public address for link previews. On Vercel this is filled in automatically.
const site =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'Our Christmas', template: '%s · Our Christmas' },
  description: 'Family Christmas wishlists with secret gift claiming, so nobody buys the same present and nobody spoils the surprise.',
  openGraph: { siteName: 'Our Christmas', type: 'website' },
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M16 3l9 13h-4l6 9H5l6-9H7z' fill='%230f4d32'/%3E%3Crect x='14' y='25' width='4' height='4' fill='%23b8913f'/%3E%3C/svg%3E" },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0d3b27' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { db, user } = await getSessionUser();
  const decor: DecorCharacter[] = user ? (((await db.rpc('get_decor_characters')).data as DecorCharacter[] | null) ?? []) : [];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gloock&family=Figtree:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <DecorProvider characters={decor}>
          <SiteHeader />
          {children}
          <FooterParade />
          <footer className="site-foot">Our Christmas · made for families who’d rather be surprised</footer>
        </DecorProvider>
      </body>
    </html>
  );
}
