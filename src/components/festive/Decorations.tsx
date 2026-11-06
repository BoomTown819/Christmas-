import type { CSSProperties } from 'react';

/* ---------------------------------------------------------------------
   String of 3D Christmas lights. The wire is an SVG of sagging scallops;
   each bulb is layered CSS (socket, glass with a radial core, specular
   highlight, halo) that twinkles and sways on its own rhythm.
   --------------------------------------------------------------------- */
const BULB_COLORS = ['red', 'gold', 'green', 'blue', 'warm'] as const;
const SEGMENTS = 14;
const SAG = 20;
const TOP = 6;

// Deterministic pseudo-random so server and client render the same markup.
const rand = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export function ChristmasLights() {
  const bulbs: { x: number; y: number; color: string; tilt: number; dur: number; delay: number; seg: number }[] = [];
  let k = 0;
  for (let s = 0; s < SEGMENTS; s++) {
    for (const t of [0.3, 0.72]) {
      const x = ((s + t) / SEGMENTS) * 100;
      const y = TOP + SAG * 4 * t * (1 - t);
      const slope = (1 - 2 * t) * SAG * 4; // tilt bulbs along the wire
      bulbs.push({
        x, y,
        color: BULB_COLORS[k % BULB_COLORS.length],
        tilt: Math.max(-18, Math.min(18, -slope * 0.35)),
        dur: 2.2 + rand(k) * 2.8,
        delay: -rand(k + 50) * 4,
        seg: s,
      });
      k++;
    }
  }
  const d = Array.from({ length: SEGMENTS }, (_, s) => {
    const x0 = (s / SEGMENTS) * 1200, x1 = ((s + 1) / SEGMENTS) * 1200, xm = (x0 + x1) / 2;
    return `${s === 0 ? `M${x0},${TOP}` : ''} Q${xm},${TOP + SAG * 2} ${x1},${TOP}`;
  }).join(' ');

  return (
    <div className="lights" aria-hidden="true">
      <svg className="lights-wire" viewBox="0 0 1200 48" preserveAspectRatio="none">
        <path d={d} />
        <path d={d} className="lights-wire-shine" />
      </svg>
      {bulbs.map((b, i) => (
        <span
          key={i}
          className={`bulb bulb-${b.color}${b.seg % 2 ? ' bulb-odd' : ''}`}
          style={{ left: `${b.x}%`, top: `${b.y}px`, '--tilt': `${b.tilt}deg`, '--dur': `${b.dur}s`, '--delay': `${b.delay}s` } as CSSProperties}
        >
          <span className="bulb-halo" />
          <span className="bulb-socket" />
          <span className="bulb-glass"><span className="bulb-shine" /></span>
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------
   Cartoon Santa (original drawing). Waves, blinks, and bobs gently.
   --------------------------------------------------------------------- */
export function Santa({ size = 200, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`santa ${className}`} width={size} height={size * 1.12} viewBox="0 0 220 246" role="img" aria-label="Santa waving hello">
      <defs>
        <radialGradient id="santa-suit" cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#e2433f" />
          <stop offset="1" stopColor="#9c1d22" />
        </radialGradient>
        <radialGradient id="santa-face" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#ffe0c7" />
          <stop offset="1" stopColor="#f2b996" />
        </radialGradient>
      </defs>
      <g className="santa-bob">
        {/* body */}
        <path d="M38 246c0-52 30-86 72-86s72 34 72 86z" fill="url(#santa-suit)" />
        <rect x="104" y="170" width="12" height="76" rx="4" fill="#fdf6e8" />
        <rect x="40" y="214" width="140" height="15" rx="4" fill="#1f2a22" />
        <rect x="97" y="211" width="26" height="21" rx="4" fill="none" stroke="#e7c06a" strokeWidth="5" />
        {/* resting arm */}
        <path d="M52 180c-14 14-18 34-14 52" stroke="#b72a2c" strokeWidth="22" strokeLinecap="round" fill="none" />
        <circle cx="39" cy="232" r="11" fill="#1d5c3b" />
        {/* waving arm */}
        <g className="santa-wave">
          <path d="M168 182c14-10 22-30 24-52" stroke="#c4302f" strokeWidth="22" strokeLinecap="round" fill="none" />
          <rect x="180" y="118" width="26" height="12" rx="6" fill="#fdf6e8" transform="rotate(-8 193 124)" />
          <ellipse cx="194" cy="106" rx="13" ry="15" fill="#1d5c3b" />
          <ellipse cx="183" cy="110" rx="5" ry="8" fill="#1d5c3b" transform="rotate(-30 183 110)" />
        </g>
        {/* beard */}
        <path d="M58 116c-6 40 16 78 52 80 36-2 58-40 52-80-10 14-30 20-52 20s-42-6-52-20z" fill="#fdf8ee" />
        <circle cx="70" cy="150" r="14" fill="#fdf8ee" /><circle cx="150" cy="150" r="14" fill="#fdf8ee" />
        <circle cx="88" cy="176" r="15" fill="#fdf8ee" /><circle cx="132" cy="176" r="15" fill="#fdf8ee" />
        <circle cx="110" cy="188" r="15" fill="#f4ecdc" />
        {/* face */}
        <ellipse cx="110" cy="112" rx="40" ry="38" fill="url(#santa-face)" />
        <circle cx="84" cy="124" r="9" fill="#f08d86" opacity="0.55" />
        <circle cx="136" cy="124" r="9" fill="#f08d86" opacity="0.55" />
        <g className="santa-eyes">
          <ellipse cx="96" cy="108" rx="5" ry="6.5" fill="#2a1d16" />
          <ellipse cx="124" cy="108" rx="5" ry="6.5" fill="#2a1d16" />
          <circle cx="97.6" cy="105.6" r="1.8" fill="#fff" />
          <circle cx="125.6" cy="105.6" r="1.8" fill="#fff" />
        </g>
        <path d="M86 96q10-7 18-1M116 95q8-6 18 1" stroke="#fdf8ee" strokeWidth="5" strokeLinecap="round" fill="none" />
        {/* mustache + nose + smile */}
        <path d="M110 128c-8-8-26-8-32 4 10 4 24 4 32-4zM110 128c8-8 26-8 32 4-10 4-24 4-32-4z" fill="#fff" />
        <path d="M100 140q10 8 20 0" stroke="#b5544a" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="110" cy="122" r="7.5" fill="#e8806e" />
        <circle cx="108" cy="119.5" r="2.2" fill="#fff" opacity="0.6" />
        {/* hat */}
        <path d="M66 88c4-40 34-62 64-58 26 4 42 24 52 44-12-6-24-6-30 2 2-12-4-22-14-26z" fill="url(#santa-suit)" />
        <path d="M66 88c8-36 40-56 64-54" stroke="#ff6b5e" strokeOpacity="0.35" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="58" y="78" width="104" height="22" rx="11" fill="#fdf6e8" />
        <circle cx="186" cy="80" r="14" fill="#fdf6e8" className="santa-pompom" />
      </g>
    </svg>
  );
}

/* Christmas tree with twinkling bulbs and a glowing star. */
export function Tree({ size = 120, className = '', delay = 0 }: { size?: number; className?: string; delay?: number }) {
  const lights = [[46, 60], [74, 72], [38, 92], [66, 100], [88, 96], [30, 124], [58, 130], [84, 128], [104, 122]];
  return (
    <svg className={`tree ${className}`} width={size} height={size * 1.3} viewBox="0 0 136 176" aria-hidden="true" style={{ animationDelay: `${delay}s` }}>
      <rect x="58" y="150" width="20" height="22" rx="3" fill="#7a5530" />
      <path d="M68 20 112 76H90l32 40H98l30 38H8l30-38H14l32-40H24z" fill="#14603e" />
      <path d="M68 20 112 76H90l32 40H98l30 38H68z" fill="#0f4d32" />
      <path d="M24 76q12 6 22 0 10 6 22 0 10 6 22 0 10 6 22 0M14 116q14 7 27 0 13 7 27 0 13 7 27 0 13 7 27 0M8 154q15 6 30 0 15 6 30 0 15 6 30 0 15 6 30 0" stroke="#f5efe1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.9" />
      {lights.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" className={`tree-light tl-${i % 3}`} style={{ animationDelay: `${(i * 0.37 + delay) % 2}s` }} />
      ))}
      <path className="tree-star" d="M68 2l4.7 9.6 10.6 1.5-7.7 7.4 1.8 10.5L68 26l-9.4 5 1.8-10.5-7.7-7.4 10.6-1.5z" />
    </svg>
  );
}

export function Present({ color = 'red', size = 54, className = '' }: { color?: 'red' | 'green' | 'gold'; size?: number; className?: string }) {
  const fill = { red: '#b3262d', green: '#17633f', gold: '#d4a648' }[color];
  const ribbon = color === 'gold' ? '#8e1b24' : '#f1d58c';
  return (
    <svg className={`present ${className}`} width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <rect x="6" y="24" width="48" height="34" rx="4" fill={fill} />
      <rect x="3" y="16" width="54" height="12" rx="3" fill={fill} />
      <rect x="3" y="16" width="54" height="12" rx="3" fill="#fff" opacity="0.12" />
      <rect x="26" y="16" width="8" height="42" fill={ribbon} />
      <path d="M30 16c-6-12-20-12-18-4 1 5 10 5 18 4zM30 16c6-12 20-12 18-4-1 5-10 5-18 4z" fill={ribbon} />
    </svg>
  );
}

export function Ornament({ color = 'gold', size = 30, className = '' }: { color?: 'red' | 'green' | 'gold'; size?: number; className?: string }) {
  const c = { red: ['#ff6a5e', '#a51d26'], green: ['#4cc086', '#0e4a30'], gold: ['#ffe39a', '#b07f25'] }[color];
  return (
    <svg className={`ornament ${className}`} width={size} height={size * 1.25} viewBox="0 0 40 50" aria-hidden="true">
      <defs>
        <radialGradient id={`orn-${color}`} cx="35%" cy="35%" r="70%"><stop offset="0" stopColor={c[0]} /><stop offset="1" stopColor={c[1]} /></radialGradient>
      </defs>
      <rect x="15" y="4" width="10" height="7" rx="2" fill="#c8a24f" />
      <circle cx="20" cy="30" r="17" fill={`url(#orn-${color})`} />
      <ellipse cx="14" cy="23" rx="5" ry="3.4" fill="#fff" opacity="0.55" transform="rotate(-30 14 23)" />
    </svg>
  );
}

/* Rolling snowy hills along the bottom edge of a hero. */
export function SnowHills() {
  return (
    <svg className="snow-hills" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 70C180 30 330 30 520 62s360 40 540 6 300-34 380-14v86H0z" className="hill-back" />
      <path d="M0 96c200-34 390-36 600-8s420 28 600 0 200-20 240-12v44H0z" className="hill-front" />
    </svg>
  );
}

/* Bauble-style avatar. */
export function Avatar({ emoji, color, size = 48, className = '' }: { emoji: string; color: string; size?: number; className?: string }) {
  return (
    <span className={`avatar av-${color} ${className}`} style={{ width: size, height: size, fontSize: size * 0.52 }} aria-hidden="true">
      <span className="avatar-cap" />
      {emoji}
    </span>
  );
}
