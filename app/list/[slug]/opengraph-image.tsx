import { createClient } from '@supabase/supabase-js';
import { ImageResponse } from 'next/og';
import { possessive } from '@/lib/items';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Christmas wishlist';

const BULBS = ['#ff4a3d', '#ffd25a', '#4fe08a', '#6cc4ff', '#fff3c4'];

// The link preview shown in Messages, WhatsApp, email etc. Contains no gift-claim information.
export default async function Image({ params }: { params: { slug: string } }) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await db.rpc('get_public_wishlist', { p_slug: params.slug });
  const name: string = data?.owner?.display_name ?? 'A';
  const count: number = data?.items?.length ?? 0;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0d3b27, #061a11)', color: '#fbf5e6', position: 'relative', fontFamily: 'serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '26px 30px 0' }}>
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} style={{ width: 26, height: 38, borderRadius: '50% 50% 48% 48%', marginTop: i % 2 ? 22 : 6, background: BULBS[i % 5], boxShadow: `0 0 28px 10px ${BULBS[i % 5]}88` }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '60px 80px 0', gap: 18 }}>
          <div style={{ fontSize: 30, letterSpacing: 6, color: '#f0d48d', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>Our Christmas</div>
          <div style={{ fontSize: 92, lineHeight: 1.02, maxWidth: 900 }}>{`${possessive(name)} Christmas Wishlist`}</div>
          <div style={{ fontSize: 36, color: '#c9d6c6', fontFamily: 'sans-serif' }}>{`${count} ${count === 1 ? 'gift' : 'gifts'} on the list · claim one in secret`}</div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90, background: '#f8f4ea', borderTopLeftRadius: '50% 70%', borderTopRightRadius: '50% 70%' }} />
        <svg width="230" height="300" viewBox="0 0 136 176" style={{ position: 'absolute', right: 90, bottom: 40 }}>
          <rect x="58" y="150" width="20" height="22" rx="3" fill="#7a5530" />
          <path d="M68 20 112 76H90l32 40H98l30 38H8l30-38H14l32-40H24z" fill="#14603e" />
          <path d="M68 20 112 76H90l32 40H98l30 38H68z" fill="#0f4d32" />
          <circle cx="46" cy="60" r="5" fill="#ff4a3d" /><circle cx="74" cy="96" r="5" fill="#ffd25a" /><circle cx="40" cy="124" r="5" fill="#6cc4ff" /><circle cx="96" cy="128" r="5" fill="#ff4a3d" />
          <path d="M68 2l4.7 9.6 10.6 1.5-7.7 7.4 1.8 10.5L68 26l-9.4 5 1.8-10.5-7.7-7.4 10.6-1.5z" fill="#ffd25a" />
        </svg>
        <div style={{ position: 'absolute', right: 60, bottom: 52, width: 80, height: 64, background: '#b3262d', borderRadius: 8, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 14, height: 64, background: '#f1d58c' }} />
        </div>
      </div>
    ),
    size,
  );
}
