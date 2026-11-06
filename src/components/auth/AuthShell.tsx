import type { ReactNode } from 'react';
import { Present, Santa, SnowHills, Tree } from '../festive/Decorations';
import { Snowfall } from '../Snowfall';

export function AuthShell({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <main className="authpage">
      <div className="authpage-sky">
        <Snowfall density={30} />
        <div className="authpage-scene" aria-hidden="true">
          <Tree size={88} /><Present color="red" size={40} /><Santa size={120} /><Present color="gold" size={34} /><Tree size={70} delay={1} />
        </div>
        <SnowHills />
      </div>
      <section className="authcard">
        <h1>{title}</h1>
        {sub && <p className="authcard-sub">{sub}</p>}
        {children}
      </section>
    </main>
  );
}
