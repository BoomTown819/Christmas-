'use client';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ACTIVITIES, type Activity, type CharacterCard } from '@/lib/activities';
import { CharacterSprite } from './CharacterSprite';

export type DecorCharacter = CharacterCard & { name: string };

const Ctx = createContext<DecorCharacter[]>([]);

/** Characters (yours + family who share) available for decorative appearances on every page. */
export function DecorProvider({ characters, children }: { characters: DecorCharacter[]; children: ReactNode }) {
  return <Ctx.Provider value={characters}>{children}</Ctx.Provider>;
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const ACTS = Object.keys(ACTIVITIES) as Activity[];

/**
 * One character standing in a decorative spot (hero scene, page header corner).
 * Chosen at random after the page loads, so each visit is a little different.
 * Purely decorative: hidden from screen readers and can't be clicked or tapped.
 */
export function DecorGuest({ className = '', size = 64, chance = 1 }: { className?: string; size?: number; chance?: number }) {
  const chars = useContext(Ctx);
  const [guest, setGuest] = useState<{ c: DecorCharacter | null; act?: Activity } | null>(null);
  useEffect(() => {
    if (Math.random() > chance) return;
    const c = chars.length ? pick(chars) : null;
    setGuest({ c, act: c ? undefined : pick(ACTS) });
  }, [chars, chance]);
  if (!guest) return null;
  return (
    <span className={`decor-zone ${className}`} aria-hidden="true">
      <CharacterSprite character={guest.c} size={size} decorative activityOverride={guest.act} />
    </span>
  );
}

/** Little parade along a snowy strip above the footer: family characters and Santa walking by. */
export function FooterParade() {
  const chars = useContext(Ctx);
  const [walkers, setWalkers] = useState<{ c: DecorCharacter | null; dur: number; delay: number; rtl: boolean }[]>([]);
  useEffect(() => {
    const pool: (DecorCharacter | null)[] = [...chars].sort(() => Math.random() - 0.5).slice(0, 3);
    pool.push(null); // Santa always comes along
    setWalkers(pool.map((c, i) => ({ c, dur: 22 + Math.random() * 14, delay: -Math.random() * 20 - i * 6, rtl: Math.random() < 0.4 })));
  }, [chars]);
  return (
    <div className="footer-parade" aria-hidden="true">
      {walkers.map((w, i) => (
        <span key={i} className={`parade-walker${w.rtl ? ' rtl' : ''}`} style={{ '--dur': `${w.dur}s`, '--delay': `${w.delay}s` } as CSSProperties}>
          <CharacterSprite character={w.c} size={48} decorative compact={Boolean(w.c?.anim)} activityOverride={w.c ? (w.c.anim ? undefined : 'presents') : 'presents'} />
        </span>
      ))}
    </div>
  );
}
