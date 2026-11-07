import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/server';
import { AVATARS } from '@/lib/items';
import { Avatar, ChristmasLights } from '../festive/Decorations';
import { NavLinks, TabBar } from './NavLinks';
import { BackButton } from './BackButton';

export async function SiteHeader() {
  const { db, user } = await getSessionUser();
  const profile = user
    ? (await db.from('profiles').select('display_name, avatar, avatar_color').eq('id', user.id).single()).data
    : null;
  const avatar = <Avatar emoji={AVATARS[profile?.avatar ?? 'santa'] ?? '🎅'} color={profile?.avatar_color ?? 'red'} size={30} />;
  return (
    <>
      <header className="sitebar">
        <div className="sitebar-inner">
          <div className="sitebar-left">
            <BackButton />
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">🎄</span><span className="brand-text">Our Christmas</span></Link>
          </div>
          <nav className="nav" aria-label="Account">
            {user ? (
              <>
                <NavLinks />
                <Link href="/profile" className="avatar-link navlink-top" title="Your profile and PIN">
                  {avatar}<span className="avatar-link-name">{profile?.display_name ?? 'Me'}</span>
                </Link>
              </>
            ) : (
              <Link href="/signup" className="nav-cta">Get started</Link>
            )}
          </nav>
        </div>
        <ChristmasLights />
      </header>
      {user && <TabBar me={<Avatar emoji={AVATARS[profile?.avatar ?? 'santa'] ?? '🎅'} color={profile?.avatar_color ?? 'red'} size={26} />} />}
    </>
  );
}
