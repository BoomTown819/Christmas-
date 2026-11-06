import type { CSSProperties } from 'react';

/** Draws a pixel map (one string per row, one character per pixel) as crisp SVG squares. */
export function PixelArt({ rows, scale = 4, className, style }: { rows: string[]; scale?: number; className?: string; style?: CSSProperties }) {
  const w = Math.max(...rows.map((r) => r.length));
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PALETTE[row[x]];
      if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c} />);
    }
  });
  return (
    <svg className={className} style={style} width={w * scale} height={rows.length * scale} viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>
  );
}

const PALETTE: Record<string, string> = {
  r: '#d63a3a', R: '#8e1b24', g: '#2f9e5f', G: '#145c38', y: '#ffd25a', Y: '#c9962c',
  w: '#fbf7ee', W: '#cfd6d2', s: '#f6c9a8', k: '#1b1b22', b: '#5ab8ff', t: '#7a5530',
  o: '#ff8a2a', p: '#e8806e', c: '#8a5a3a', m: '#b07acc',
};

export const SANTA = [
  '......rrr.......',
  '.....rrrrr...ww.',
  '....rrrrrrr.www.',
  '...rrrrrrrrrww..',
  '..wwwwwwwwwww...',
  '..wssssssssw....',
  '..sskssskssss...',
  '..ssssspsssss...',
  '.wwwwwsswwwww...',
  '.wwwwwwwwwwwww..',
  '..wwwwwwwwwww...',
  '.rrrwwwwwwwrrr..',
  'rrrrrrwwwrrrrrr.',
  'rrrrrrrwrrrrrrr.',
  'kkkkkkkykkkkkkk.',
  'rrrrrrrrrrrrrrr.',
  '.rrrrr...rrrrr..',
  '.kkkk.....kkkk..',
];

export const PROPS: Record<string, string[]> = {
  tree: [
    '.....y......', '....yyy.....', '.....g......', '....ggg.....', '...ggrgg....', '..ggggggg...',
    '....ggg.....', '...gggygg...', '..ggggggrg..', '.ggrggggggg.', '....ggg.....', '..ggggbgggg.',
    '.ggggggggggg', 'ggrgggggyggg', '.....tt.....', '.....tt.....',
  ],
  present: ['...w..w...', '....ww....', 'rrrrwwrrrr', 'rrrrwwrrrr', 'wwwwwwwwww', 'rrrrwwrrrr', 'rrrrwwrrrr', 'rrrrwwrrrr', 'RRRRwwRRRR'],
  presentGreen: ['...y..y...', '....yy....', 'ggggyygggg', 'ggggyygggg', 'yyyyyyyyyy', 'ggggyygggg', 'GGGGyyGGGG'],
  snowman: [
    '...kkkk...', '...kkkk...', '..kkkkkk..', '...wwww...', '..wwkwkw..', '..wwwoww..', '...wwww...',
    '..rrrrrr..', '.wwwwrwww.', '.wwwkwwww.', '.wwwwwwww.', 'wwwwkwwwww', 'wwwwwwwwww', '.WwwwwwwW.',
  ],
  mug: ['rrrrrrr..', 'rwrwrwrrr', 'rrrrrrr.r', 'rrrrrrr.r', 'rrrrrrrrr', '.RRRRR...'],
  steam: ['.w...w', '..w...', '.w..w.', 'w...w.'],
  sleigh: [
    'r...............', 'rr..............', 'rrrrrrrrrrrrrr..', 'rrrrrrrrrrrrrrr.',
    '.RRRRRRRRRRRRR..', '..y.........y...', '.yyyyyyyyyyyyyyy', '...............y',
  ],
  candycane: ['.rwr..', 'rw.wr.', 'w...r.', '....w.', '....r.', '....w.', '....r.', '....w.', '....r.', '....w.', '....r.'],
  lights: ['kkkkkkkkkkkkkkkkkkkkkkkk', '.r.....y.....g.....b....', '.r.....y.....g.....b....'],
  ornament: ['.y.', 'rrr', 'rrr'],
  note: ['..kk', '..k.', '..k.', 'kkk.', 'kk..'],
  sparkle: ['..y..', '..y..', 'yyyyy', '..y..', '..y..'],
  bow: ['y.y', '.y.', 'y.y'],
};
