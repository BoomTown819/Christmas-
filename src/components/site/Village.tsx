import type { ReactNode } from 'react';
import { Ornament, Present, Santa, SnowHills, Tree } from '../festive/Decorations';
import { Snowfall } from '../Snowfall';

/** The homepage hero: night sky, snow, trees, presents and a waving Santa. */
export function Village({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub: ReactNode; actions?: ReactNode }) {
  return (
    <section className="village">
      <Snowfall density={40} />
      <div className="hero-ornaments" aria-hidden="true">
        <Ornament color="gold" className="o1" /><Ornament color="red" className="o2" size={24} /><Ornament color="green" className="o3" />
      </div>
      <div className="village-inner">
        <div className="village-copy">
          <p className="village-eyebrow">{eyebrow}</p>
          <h1 className="village-title">{title}</h1>
          <p className="village-sub">{sub}</p>
          {actions && <div className="village-actions">{actions}</div>}
        </div>
        <div className="village-scene" aria-hidden="true">
          <Tree className="tree-a" size={124} />
          <Tree className="tree-b" size={92} delay={1.3} />
          <Present color="red" className="present-a" />
          <Present color="gold" className="present-b" size={42} />
          <Present color="green" className="present-c" size={46} />
          <Santa size={190} />
        </div>
      </div>
      <SnowHills />
    </section>
  );
}

/** Shorter festive header used on inner pages. */
export function PageHead({ children, actions, deco = true }: { children: ReactNode; actions?: ReactNode; deco?: boolean }) {
  return (
    <section className="pagehead">
      <Snowfall density={30} />
      <div className="pagehead-inner">
        <div className="pagehead-copy">{children}</div>
        {actions && <div className="pagehead-actions">{actions}</div>}
      </div>
      {deco && (
        <div className="pagehead-deco" aria-hidden="true">
          <Tree size={70} /><Present color="gold" size={34} /><Tree size={96} delay={0.8} /><Present color="red" size={40} />
        </div>
      )}
      <SnowHills />
    </section>
  );
}
