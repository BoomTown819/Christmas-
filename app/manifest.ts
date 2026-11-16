import type { MetadataRoute } from 'next';

/**
 * Lets the site install like an app, and puts "Our Christmas" in the phone's Share menu
 * (Android), so a product can be shared straight from a store app into your wishlist.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Our Christmas',
    short_name: 'Our Christmas',
    description: 'Your family’s Christmas wishlists, with secret gift claiming.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0d3b27',
    theme_color: '#0d3b27',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: { action: '/add', method: 'get', params: { title: 'title', text: 'text', url: 'url' } },
  } as unknown as MetadataRoute.Manifest; // Next's type for share_target params differs from the web standard used here
}
