/**
 * Free character engine (no AI): a Retro Bowl-style sprite.
 * The head is the person's real face at a higher resolution with a light grain,
 * the body is chunky 8-bit pixels, and each activity is a hand-built 8-frame animation
 * where arms, legs and props actually move.
 */
import sharp from 'sharp';
import * as gifencNs from 'gifenc';
import type { Activity } from '../activities';
import type { Outfit } from '../outfit';

const gifencMod = (gifencNs as unknown as { GIFEncoder?: unknown; default: typeof gifencNs.default }).GIFEncoder ? gifencNs : gifencNs.default;
const { GIFEncoder, quantize, applyPalette } = gifencMod as typeof gifencNs.default;

export const SPRITE = 96;            // frame size
export const HEAD_W = 34, HEAD_H = 38; // face area on the sprite
const FRAMES = 8;
const CX = 34;                       // character centre line
const HEAD_Y = 14;                   // top of the face

type RGB = readonly [number, number, number];
const P = {
  ink: [27, 25, 34], red: [214, 58, 58], redDk: [150, 32, 40], white: [250, 246, 236], whiteDk: [214, 208, 196],
  green: [47, 158, 95], greenDk: [22, 98, 58], gold: [255, 206, 84], goldDk: [196, 140, 40],
  jeans: [52, 74, 132], jeansDk: [34, 48, 92], boot: [64, 42, 34], brown: [122, 85, 48],
  snow: [236, 242, 246], snowDk: [190, 204, 214], carrot: [255, 138, 42], blue: [90, 184, 255], mug: [196, 52, 52],
  cocoa: [110, 66, 40], steam: [235, 235, 240], tree: [38, 138, 80], treeDk: [20, 92, 54],
  blueTop: [58, 98, 178], blueTopDk: [36, 62, 124], navy: [34, 46, 90], navyDk: [22, 30, 62],
  gray: [150, 152, 160], grayDk: [104, 106, 116], black: [44, 42, 50], blackDk: [26, 24, 30],
  antler: [138, 96, 58], antlerDk: [96, 64, 36],
} satisfies Record<string, RGB>;

/** Colours for each outfit choice. */
const TOPS: Record<Outfit['top'], { base: RGB; dark: RGB; band: RGB; dots: RGB; pattern?: 'stripes' | 'flakes' | 'hood' }> = {
  red: { base: P.red, dark: P.redDk, band: P.green, dots: P.white },
  green: { base: P.green, dark: P.greenDk, band: P.red, dots: P.white },
  blue: { base: P.blueTop, dark: P.blueTopDk, band: P.white, dots: P.red },
  stripes: { base: P.white, dark: P.whiteDk, band: P.red, dots: P.red, pattern: 'stripes' },
  snowflake: { base: P.navy, dark: P.navyDk, band: P.white, dots: P.white, pattern: 'flakes' },
  hoodie: { base: P.gray, dark: P.grayDk, band: P.grayDk, dots: P.grayDk, pattern: 'hood' },
};
const PANTS: Record<Outfit['pants'], [RGB, RGB]> = {
  jeans: [P.jeans, P.jeansDk], red: [P.red, P.redDk], green: [P.green, P.greenDk], black: [P.black, P.blackDk],
};
const MITTENS: Record<Outfit['mittens'], [RGB, RGB]> = {
  green: [P.green, P.greenDk], red: [P.red, P.redDk], white: [P.white, P.whiteDk], blue: [P.blue, P.blueTopDk],
};
export const DEFAULT_OUTFIT: Outfit = { hat: 'santa', top: 'red', pants: 'jeans', shoes: 'boots', scarf: 'none', mittens: 'green' };

class Canvas {
  px = Buffer.alloc(SPRITE * SPRITE * 4);
  set(x: number, y: number, c: RGB) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= SPRITE || y >= SPRITE) return;
    const i = (y * SPRITE + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255;
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(x0 + x, y0 + y, c);
  }
  /** A thick limb from a to b, drawn as stacked squares so it stays chunky. */
  limb(ax: number, ay: number, bx: number, by: number, w: number, c: RGB) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      this.rect(Math.round(x - w / 2), Math.round(y - w / 2), w, w, c);
    }
  }
  /** Draw a text pixel map; each char is a palette key, '.' is empty. */
  map(rows: string[], x0: number, y0: number, pal: Record<string, RGB>, scale = 1) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) this.rect(x0 + x * scale, y0 + y * scale, scale, scale, pal[ch]); }));
  }
  solid(x: number, y: number) { return x >= 0 && y >= 0 && x < SPRITE && y < SPRITE && this.px[(y * SPRITE + x) * 4 + 3] === 255; }
  /** 1px dark outline around everything, the classic sprite look. */
  outline() {
    const add: [number, number][] = [];
    for (let y = 0; y < SPRITE; y++) for (let x = 0; x < SPRITE; x++) {
      if (!this.solid(x, y) && (this.solid(x + 1, y) || this.solid(x - 1, y) || this.solid(x, y + 1) || this.solid(x, y - 1))) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, P.ink);
  }
}

/** Rounded-rectangle head mask (Retro Bowl heads are big and squarish). */
function inHead(x: number, y: number) {
  const r = 9;
  const dx = Math.max(r - x, 0, x - (HEAD_W - 1 - r));
  const dy = Math.max(r - y, 0, y - (HEAD_H - 1 - r));
  return dx * dx + dy * dy <= r * r + 2;
}

/**
 * Finds the photo's background around the head (wall, sky...) so only hair and face remain:
 * colours connected to the side and top edges that stay close to the edge colour.
 * Gives up (keeps everything) if it would remove too much, e.g. hair against a dark wall.
 */
function backgroundMask(raw: Buffer): Uint8Array {
  const W = HEAD_W, H = HEAD_H, mask = new Uint8Array(W * H);
  const at = (x: number, y: number) => (y * W + x) * 3;
  // Sample the outer two columns on each side (where a selfie's wall shows), take the median colour.
  const seeds: [number, number][] = [];
  for (let y = 0; y < Math.round(H * 0.8); y++) seeds.push([0, y], [1, y], [W - 1, y], [W - 2, y]);
  const med = (k: number) => { const v = seeds.map(([x, y]) => raw[at(x, y) + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ref = [med(0), med(1), med(2)];
  const near = (x: number, y: number) => Math.hypot(raw[at(x, y)] - ref[0], raw[at(x, y) + 1] - ref[1], raw[at(x, y) + 2] - ref[2]) < 42;
  const stack: [number, number][] = [];
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  for (let x = 0; x < W; x++) stack.push([x, 0]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x] || !near(x, y)) continue;
    mask[y * W + x] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const removed = mask.reduce((a, b) => a + b, 0);
  return removed > W * H * 0.5 ? new Uint8Array(W * H) : mask;
}

/** Turns the person's cropped face photo into the sprite's head: real detail, a little grain. */
export async function makeFace(facePhoto: Buffer): Promise<Buffer> {
  const raw = await sharp(facePhoto).rotate()
    .resize(HEAD_W, HEAD_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .modulate({ saturation: 1.18 }).linear(1.06, -4).sharpen({ sigma: 0.6 })
    .removeAlpha().raw().toBuffer();
  // Light grain + gentle posterize: old-console feel without losing the face.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const bg = backgroundMask(raw);
  const out = Buffer.alloc(HEAD_W * HEAD_H * 4);
  for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
    const n = rand() * 14;
    for (let k = 0; k < 3; k++) out[j + k] = Math.max(0, Math.min(255, Math.round((raw[i + k] + n) / 6) * 6));
    const x = (j / 4) % HEAD_W, y = Math.floor(j / 4 / HEAD_W);
    out[j + 3] = inHead(x, y) && !bg[j / 4] ? 255 : 0;
  }
  return sharp(out, { raw: { width: HEAD_W, height: HEAD_H, channels: 4 } }).png().toBuffer();
}

interface Pose {
  bob: number; dx: number;
  lHand: [number, number]; rHand: [number, number];
  lFoot: number; rFoot: number;   // vertical lift of each foot
  lStep: number; rStep: number;   // horizontal step of each foot
  seated?: boolean;
}

function drawBody(cv: Canvas, p: Pose, o: Outfit) {
  const x = CX + p.dx, top = HEAD_Y + HEAD_H - 2 + p.bob; // shoulders just under the chin
  const [leg, legDk] = PANTS[o.pants];
  const t = TOPS[o.top];
  if (!p.seated) {
    cv.rect(x - 10 + p.lStep, top + 22 - p.lFoot, 9, 12, leg);
    cv.rect(x + 1 + p.rStep, top + 22 - p.rFoot, 9, 12, leg);
    cv.rect(x - 10 + p.lStep, top + 22 - p.lFoot, 2, 12, legDk);
    const shoe = (sx: number, sy: number) => {
      if (o.shoes === 'boots') { cv.rect(sx - 1, sy, 11, 4, P.boot); cv.rect(sx - 1, sy, 11, 1, P.brown); }
      else if (o.shoes === 'sneakers') { cv.rect(sx - 1, sy + 1, 11, 3, P.white); cv.rect(sx - 1, sy + 3, 11, 1, P.whiteDk); cv.rect(sx + 2, sy + 1, 4, 1, P.red); }
      else { cv.rect(sx - 1, sy, 10, 4, P.green); cv.rect(sx + 8, sy - 1, 3, 2, P.green); cv.set(sx + 11, sy - 2, P.gold); }
    };
    shoe(x - 10 + p.lStep, top + 33 - p.lFoot);
    shoe(x + 1 + p.rStep, top + 33 - p.rFoot);
  }
  // top
  cv.rect(x - 13, top, 26, 23, t.base);
  cv.rect(x - 13, top, 3, 23, t.dark);
  if (t.pattern === 'stripes') {
    for (let r = 2; r < 21; r += 5) cv.rect(x - 13, top + r, 26, 2, P.red);
  } else if (t.pattern === 'flakes') {
    for (const [fx, fy] of [[-7, 5], [5, 4], [-2, 14], [8, 15]] as const) {
      cv.set(x + fx, top + fy, P.white); cv.set(x + fx - 1, top + fy, P.white); cv.set(x + fx + 1, top + fy, P.white);
      cv.set(x + fx, top + fy - 1, P.white); cv.set(x + fx, top + fy + 1, P.white);
    }
  } else if (t.pattern === 'hood') {
    cv.rect(x - 2, top + 8, 4, 10, t.dark);              // zip
    cv.rect(x - 8, top + 15, 16, 5, t.dark);              // pocket
    cv.rect(x - 4, top + 2, 1, 6, P.white); cv.rect(x + 3, top + 2, 1, 6, P.white); // drawstrings
  } else {
    cv.rect(x - 13, top + 9, 26, 4, t.band);
    for (let i = 0; i < 6; i++) cv.set(x - 11 + i * 4, top + 10, t.dots), cv.set(x - 9 + i * 4, top + 11, t.dots);
    cv.rect(x - 2, top + 15, 3, 2, P.gold);
  }
  cv.rect(x - 13, top + 21, 26, 2, t.pattern === 'hood' ? t.dark : P.white);
  // arms, sleeves match the top, mittens chosen
  const [mit, mitDk] = MITTENS[o.mittens];
  const sl: [number, number] = [x - 12, top + 4], sr: [number, number] = [x + 12, top + 4];
  const hand = (sh: [number, number], h: [number, number]) => {
    const hx = h[0] + p.dx, hy = h[1] + p.bob;
    cv.limb(sh[0], sh[1], hx, hy, 6, t.pattern === 'stripes' ? P.red : t.base);
    cv.rect(hx - 3, hy - 3, 7, 7, mit);
    cv.rect(hx - 3, hy + 2, 7, 1, mitDk);
  };
  hand(sl, p.lHand); hand(sr, p.rHand);
  // scarf around the neck, tail hanging over the chest
  if (o.scarf !== 'none') {
    const a: RGB = o.scarf === 'green' ? P.green : P.red, b: RGB = o.scarf === 'striped' ? P.white : o.scarf === 'green' ? P.greenDk : P.redDk;
    for (let i = 0; i < 28; i++) cv.rect(x - 14 + i, top - 1, 1, 4, o.scarf === 'striped' && Math.floor(i / 3) % 2 ? b : a);
    for (let j = 0; j < 9; j++) cv.rect(x + 4, top + 3 + j, 5, 1, o.scarf === 'striped' && Math.floor(j / 3) % 2 ? b : a);
    cv.rect(x + 4, top + 12, 5, 1, b);
  }
}

function drawHat(cv: Canvas, bob: number, dx: number, sway: number, drop: number, hat: Outfit['hat']) {
  const x0 = CX - HEAD_W / 2 + dx, y = HEAD_Y + bob + drop;
  if (hat === 'none') return;
  if (hat === 'santa' || hat === 'elf') {
    const cone: RGB = hat === 'santa' ? P.red : P.green, coneDk: RGB = hat === 'santa' ? P.redDk : P.greenDk;
    const brim: RGB = hat === 'santa' ? P.white : P.red, brimDk: RGB = hat === 'santa' ? P.whiteDk : P.redDk;
    const tall = hat === 'elf' ? 15 : 12;
    for (let r = 0; r < tall; r++) {
      const w = Math.round(HEAD_W - 2 - r * (hat === 'elf' ? 2 : 2.4));
      cv.rect(x0 + 1 + Math.round(r * (hat === 'elf' ? 1.1 : 1.5)) + Math.round((sway * r) / tall), y - 1 - r, Math.max(3, w), 1, cone);
    }
    cv.rect(x0 + 2, y - 4, 4, 3, coneDk);
    cv.rect(x0 - 2, y - 1, HEAD_W + 4, 5, brim);
    cv.rect(x0 - 2, y + 3, HEAD_W + 4, 1, brimDk);
    const px = x0 + HEAD_W - (hat === 'elf' ? 6 : 2) + sway, py = y - (hat === 'elf' ? 18 : 14);
    if (hat === 'santa') { cv.rect(px, py, 6, 6, P.white); cv.rect(px + 1, py + 5, 4, 1, P.whiteDk); }
    else { cv.rect(px, py, 5, 5, P.gold); cv.rect(px + 1, py + 4, 3, 1, P.goldDk); }
    return;
  }
  if (hat === 'beanie') {
    for (let r = 0; r < 9; r++) {
      const inset = Math.round((r * r) / 7);
      cv.rect(x0 - 1 + inset, y - 1 - r, HEAD_W + 2 - inset * 2, 1, r % 3 === 1 ? P.white : P.blueTop);
    }
    cv.rect(x0 - 2, y - 1, HEAD_W + 4, 5, P.blueTopDk);
    for (let i = 0; i < HEAD_W + 4; i += 3) cv.rect(x0 - 2 + i, y, 1, 3, P.blueTop);
    const px = CX + dx - 3 + Math.round(sway / 2);
    cv.rect(px, y - 15, 7, 6, P.white); cv.rect(px + 1, y - 10, 5, 1, P.whiteDk);
    return;
  }
  // reindeer antlers on a headband
  cv.rect(x0 - 1, y + 1, HEAD_W + 2, 3, P.antlerDk);
  const antler = (ax: number, dir: number) => {
    for (let k = 0; k < 12; k++) cv.rect(ax + Math.round(dir * k * 0.5), y - k, 3, 1, P.antler);
    cv.rect(ax + dir * 2, y - 6, dir * 6, 2, P.antler); cv.rect(ax + dir * 6, y - 9, 2, 4, P.antler);
    cv.rect(ax + dir * 3, y - 12, dir * 4, 2, P.antler);
  };
  antler(x0 + 4, -1); antler(x0 + HEAD_W - 7, 1);
  cv.rect(x0 + 2, y - 2, 4, 3, P.antlerDk); cv.rect(x0 + HEAD_W - 6, y - 2, 4, 3, P.antlerDk);
}

/** Pastes the head; returns how far down the top of the hair starts, so the hat sits on it. */
async function pasteFace(cv: Canvas, face: Buffer, bob: number, dx: number): Promise<number> {
  const { data } = await sharp(face).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = CX - HEAD_W / 2 + dx, y0 = HEAD_Y + bob;
  let top = -1;
  for (let y = 0; y < HEAD_H; y++) {
    let row = 0;
    for (let x = 0; x < HEAD_W; x++) {
      const i = (y * HEAD_W + x) * 4;
      if (data[i + 3] > 128) { cv.set(x0 + x, y0 + y, [data[i], data[i + 1], data[i + 2]]); row++; }
    }
    if (top < 0 && row > HEAD_W * 0.4) top = y;
  }
  return Math.max(0, Math.min(14, top));
}

const TREE = [
  '.......y.......', '......yyy......', '.......g.......', '......ggg......', '.....ggrgg.....', '....ggggggg....',
  '......ggg......', '.....ggggbg....', '....gggggggg...', '...ggrggggyg...', '.....ggggg.....', '....gggggbggg..',
  '...ggggggggggg.', '..ggrgggggggrgg', '.ggggggyggggggg', '......ttt......', '......ttt......',
];
const TREE_PAL: Record<string, RGB> = { g: P.tree, y: P.gold, r: P.red, b: P.blue, t: P.brown };

/** Pose + props for one frame of an activity. f = 0..7 */
function frame(activity: Activity, f: number): { pose: Pose; sway: number; props: (cv: Canvas) => void; before?: (cv: Canvas) => void } {
  const t = (f / FRAMES) * Math.PI * 2;
  const s = Math.sin(t), c = Math.cos(t);
  const top = HEAD_Y + HEAD_H - 2;
  const rest: Pose = { bob: 0, dx: 0, lHand: [CX - 16, top + 20], rHand: [CX + 16, top + 20], lFoot: 0, rFoot: 0, lStep: 0, rStep: 0 };
  const none = () => {};
  switch (activity) {
    case 'waving':
      return { pose: { ...rest, rHand: [CX + 24 + Math.round(s * 4), top - 14 + Math.round(Math.abs(c) * 2)] }, sway: Math.round(s), props: none };
    case 'dancing': {
      const up = f % 4 < 2;
      return {
        pose: { ...rest, bob: f % 2 ? -3 : 0, dx: Math.round(s * 3),
          lHand: up ? [CX - 22, top - 10] : [CX - 22, top + 12], rHand: up ? [CX + 22, top + 12] : [CX + 22, top - 10],
          lFoot: f % 4 === 0 ? 3 : 0, rFoot: f % 4 === 2 ? 3 : 0, lStep: -2, rStep: 2 },
        sway: Math.round(s * 2),
        props: (cv) => { // music notes floating up
          for (const [nx, off] of [[70, 0], [82, 4]] as const) {
            const ny = 40 - ((f * 4 + off * 2) % 30);
            cv.rect(nx, ny, 3, 3, P.ink); cv.rect(nx + 2, ny - 7, 1, 8, P.ink); cv.rect(nx + 3, ny - 7, 3, 1, P.ink);
          }
        },
      };
    }
    case 'presents': {
      const step = Math.round(s * 4);
      return {
        pose: { ...rest, bob: Math.abs(s) > 0.7 ? -1 : 0, lHand: [CX + 4, top + 14], rHand: [CX + 22, top + 14],
          lStep: step, rStep: -step, lFoot: s > 0.3 ? 2 : 0, rFoot: s < -0.3 ? 2 : 0 },
        sway: Math.round(-s), props: (cv) => {
          const by = top + 6 + (Math.abs(s) > 0.7 ? -1 : 0);
          cv.rect(CX + 1, by, 26, 18, P.red); cv.rect(CX + 12, by, 4, 18, P.gold); cv.rect(CX + 1, by + 7, 26, 4, P.gold);
          cv.rect(CX + 9, by - 4, 5, 4, P.gold); cv.rect(CX + 15, by - 4, 5, 4, P.gold);
        },
      };
    }
    case 'decorating': {
      const reach = f < 5;
      const k = Math.min(f, 4) / 4;
      return {
        pose: { ...rest, rHand: reach ? [CX + 18 + Math.round(k * 18), top + 4 - Math.round(k * 12)] : [CX + 16, top + 20] },
        sway: 0,
        before: (cv) => cv.map(TREE, 58, 34, TREE_PAL, 2),
        props: (cv) => {
          if (reach) { const hx = CX + 18 + Math.round(k * 18), hy = top + 4 - Math.round(k * 12); cv.rect(hx - 2, hy + 4, 5, 5, P.gold); }
          else cv.rect(72, 52, 5, 5, P.gold); // ornament now hanging on the tree
          if (f % 2) { cv.rect(64, 60, 2, 2, P.gold); cv.rect(78, 56, 2, 2, P.blue); } else { cv.rect(70, 52, 2, 2, P.red); cv.rect(76, 62, 2, 2, P.white); }
        },
      };
    }
    case 'snowman': {
      const parts = f < 3 ? 1 : f < 6 ? 2 : 3;
      const pat = f % 2 ? 4 : 0;
      return {
        pose: { ...rest, rHand: [CX + 26, top + 6 + pat], lHand: [CX + 14, top + 12 + pat] },
        sway: 0,
        before: (cv) => {
          const sx = 76;
          const ball = (cy: number, r: number) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) cv.set(sx + x, cy + y, x + y > r * 0.6 ? P.snowDk : P.snow); };
          ball(82, 11);
          if (parts >= 2) ball(64, 8);
          if (parts >= 3) { ball(50, 6); cv.rect(sx - 3, 49, 2, 2, P.ink); cv.rect(sx + 2, 49, 2, 2, P.ink); cv.rect(sx + 1, 52, 5, 2, P.carrot); cv.rect(sx - 7, 56, 14, 3, P.red); }
        },
        props: none,
      };
    }
    case 'cocoa': {
      const lift = f >= 2 && f <= 5;
      const mx = lift ? CX + 10 : CX + 18, my = lift ? top - 6 : top + 12;
      return {
        pose: { ...rest, rHand: [mx - 2, my + 4] },
        sway: 0,
        props: (cv) => {
          cv.rect(mx, my - 4, 11, 12, P.mug); cv.rect(mx + 1, my - 3, 9, 2, P.cocoa); cv.rect(mx + 11, my, 3, 6, P.mug);
          cv.rect(mx + 2, my + 2, 2, 2, P.white); cv.rect(mx + 6, my + 2, 2, 2, P.white);
          for (let i = 0; i < 3; i++) { const sy = my - 8 - ((f * 3 + i * 6) % 14); cv.set(mx + 3 + i * 3 + ((f + i) % 2), sy, P.steam); cv.set(mx + 3 + i * 3, sy - 1, P.steam); }
        },
      };
    }
    case 'wrapping': {
      const bow = f >= 4;
      return {
        pose: { ...rest, lHand: [CX + 14, top + 22 + (f % 2) * 2], rHand: [CX + 30, top + 20 - (f % 2) * 2] },
        sway: 0,
        props: (cv) => {
          cv.rect(54, 66, 30, 22, P.green); cv.rect(54, 66, 30, 3, P.greenDk);
          cv.rect(67, 66, 4, 22, f >= 2 ? P.gold : P.green); cv.rect(54, 75, 30, 4, f >= 3 ? P.gold : P.green);
          if (bow) { const b = f >= 6 ? 1 : 0; cv.rect(62 - b, 60 - b, 6 + b, 6 + b, P.gold); cv.rect(70, 60 - b, 6 + b, 6 + b, P.gold); cv.rect(67, 62, 4, 4, P.goldDk); }
        },
      };
    }
    case 'sleigh': {
      const b = Math.round(s * 2);
      return {
        pose: { ...rest, seated: true, bob: b + 6, lHand: [CX + 8, top + 22], rHand: [CX + 20, top + 22] },
        sway: Math.round(-s * 2),
        props: (cv) => {
          const sy = top + 22 + b;
          cv.rect(CX - 22, sy, 60, 14, P.red); cv.rect(CX - 22, sy, 60, 3, P.redDk); cv.rect(CX + 30, sy - 10, 8, 14, P.red);
          cv.rect(CX - 26, sy + 18, 70, 3, P.gold); cv.rect(CX - 26, sy + 14, 3, 6, P.gold); cv.rect(CX + 38, sy + 14, 3, 6, P.gold); cv.rect(CX + 41, sy + 12, 4, 3, P.gold);
          for (let i = 0; i < 6; i++) cv.rect((90 - ((f * 12 + i * 17) % 96)), 20 + ((i * 23) % 60), 2, 2, P.snow);
        },
      };
    }
    case 'candycane': {
      const swing = Math.round(s * 6);
      return {
        pose: { ...rest, rHand: [CX + 22, top + 10] },
        sway: 0,
        props: (cv) => {
          const hx = CX + 22, hy = top + 10;
          for (let i = 0; i < 26; i++) cv.rect(hx + Math.round((swing * i) / 26) - 1, hy - 18 + i, 4, 1, Math.floor(i / 3) % 2 ? P.white : P.red);
          const tx = hx + 0, ty = hy - 18;
          cv.rect(tx - 1 + Math.round(swing / 5), ty - 4, 4, 4, P.red); cv.rect(tx + 3 + Math.round(swing / 5), ty - 6, 6, 4, P.white); cv.rect(tx + 8 + Math.round(swing / 5), ty - 3, 4, 5, P.red);
        },
      };
    }
    case 'lights': {
      return {
        pose: { ...rest, lHand: [CX + 10, top + 8], rHand: [CX + 26, top + 2 + (f % 2)], bob: f % 4 === 0 ? -1 : 0 },
        sway: 0,
        props: (cv) => {
          const y0 = top + 2 + (f % 2), x0 = CX + 26, x1 = 95;
          for (let x = x0; x <= x1; x++) cv.set(x, y0 + Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 6), P.ink);
          const cols: RGB[] = [P.red, P.gold, P.green, P.blue];
          for (let i = 0; i < 4; i++) {
            const bx = x0 + 4 + i * 8, by = y0 + Math.round(Math.sin(((bx - x0) / (x1 - x0)) * Math.PI) * 6) + 1;
            const on = (i + f) % 2 === 0;
            cv.rect(bx, by, 3, 4, on ? cols[i % 4] : P.whiteDk);
          }
        },
      };
    }
  }
}

/** Builds all frames for an activity. Returns the still (frame 0, PNG) and the looping GIF. */
export async function buildPixelCharacter(face: Buffer, activity: Activity, outfit: Outfit = DEFAULT_OUTFIT): Promise<{ png: Buffer; gif: Buffer }> {
  const enc = GIFEncoder();
  let png: Buffer | null = null;
  for (let f = 0; f < FRAMES; f++) {
    const { pose, sway, props, before } = frame(activity, f);
    const cv = new Canvas();
    before?.(cv);
    drawBody(cv, pose, outfit);
    const hairTop = await pasteFace(cv, face, pose.bob, pose.dx);
    drawHat(cv, pose.bob, pose.dx, sway, Math.max(0, hairTop - 1), outfit.hat);
    props(cv);
    cv.outline();
    if (f === 0) png = await sharp(cv.px, { raw: { width: SPRITE, height: SPRITE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const rgba = new Uint8Array(cv.px);
    const palette = quantize(rgba, 128, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaIndex: 0 });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const ti = palette.findIndex((p) => p[3] === 0);
    enc.writeFrame(index, SPRITE, SPRITE, { palette, delay: activity === 'dancing' ? 110 : 140, repeat: 0, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: 2 });
  }
  enc.finish();
  return { png: png!, gif: Buffer.from(enc.bytes()) };
}
