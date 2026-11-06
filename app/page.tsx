import Link from 'next/link';
import { Village } from '@/components/site/Village';
import { getSessionUser } from '@/lib/supabase/server';
import { FamilyApp } from './FamilyApp';
import { JoinByCode } from './JoinByCode';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { db, user } = await getSessionUser();

  if (!user) {
    return (
      <>
        <Village
          eyebrow="Our Christmas 🎄"
          title="One wishlist each. One place for the whole family."
          sub="Make your list, share one link, and let everyone secretly claim the gifts they’re buying. You’ll never see what’s been claimed on yours."
          actions={<Link href="/signup" className="btn btn-festive btn-lg">Make my wishlist</Link>}
        />
        <main className="main">
          <section className="how">
            {[
              ['Add anything', 'Paste a link from any store, set the price, and rate how badly you want it in half stars. AI writes a one-line description.'],
              ['Share one link', 'Send it by text, email or WhatsApp. Anyone can open it and forward it. Everyone sees the same list.'],
              ['Gifts stay secret', 'Family taps “I’m getting this!” so nobody doubles up. Claims are hidden from you, all the way down to the database.'],
            ].map(([h, p], i) => (
              <article key={h} className="how-step">
                <span className="how-num" aria-hidden="true">{['🎁', '🔗', '🤫'][i]}</span>
                <h2>{h}</h2>
                <p>{p}</p>
              </article>
            ))}
          </section>
          <section className="join-panel">
            <div><h2>Joining your family?</h2><p>Whoever set up your family has a family code (like K7QM-3XPA). Everyone in the family uses that same code. Enter it here, and joining only takes your name.</p></div>
            <JoinByCode />
          </section>
        </main>
      </>
    );
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', user.id).single(),
    db.from('family_members').select('family_id, joined_at, families(name)').eq('user_id', user.id).order('joined_at'),
  ]);
  type M = { family_id: string; families: { name: string } | { name: string }[] | null };
  const families = ((memberships ?? []) as M[]).map((m) => ({
    id: m.family_id,
    name: (Array.isArray(m.families) ? m.families[0]?.name : m.families?.name) ?? 'Family',
  }));

  return (
    <>
      <Village
        eyebrow="Our Christmas 🎄"
        title={`Merry Christmas, ${profile?.display_name ?? 'friend'}!`}
        sub="Everyone’s wishlists in one place. Claim gifts in secret, and stay out of your own surprises."
        actions={<Link href="/my-list" className="btn btn-gold btn-lg">Open my wishlist</Link>}
      />
      <FamilyApp families={families} />
    </>
  );
}
