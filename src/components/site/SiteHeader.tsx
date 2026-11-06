import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/server';
import { AVATARS } from '@/lib/items';
import { Avatar, ChristmasLights } from '../festive/Decorations';
import { NavLinks } from './NavLinks';

export async function SiteHeader() {
  const { db, user } = await getSessionUser();
  const profile = user
    ? (await db.from('profiles').select('display_name, avatar, avatar_color').eq('id', user.id).single()).data
    : null;
  return (
    <header className="sitebar">
      <div className="sitebar-inner">
        <Link href="/" className="brand"><span className="brand-mark">🎄</span><span className="brand-text">Our Christmas</span></Link>
        <nav className="nav" aria-label="Main">
          {user ? (
            <>
              <NavLinks />
              <Link href="/profile" className="avatar-link" aria-label={`Profile: ${profile?.display_name ?? ''}`} title={profile?.display_name}>
                <Avatar emoji={AVATARS[profile?.avatar ?? 'santa'] ?? '🎅'} color={profile?.avatar_color ?? 'red'} size={34} />
              </Link>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="nav-cta">Sign up</Link>
            </>
          )}
        </nav>
      </div>
      <ChristmasLights />
    </header>
  );
}
