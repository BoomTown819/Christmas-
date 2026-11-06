/** What a character wears. Every option is drawn by the sprite engine. */
export const OUTFIT_OPTIONS = {
  hat: { santa: 'Santa hat', elf: 'Elf hat', beanie: 'Bobble beanie', antlers: 'Reindeer antlers', none: 'No hat' },
  top: { red: 'Red sweater', green: 'Green sweater', blue: 'Blue sweater', stripes: 'Candy stripes', snowflake: 'Snowflake sweater', hoodie: 'Cozy hoodie' },
  pants: { jeans: 'Jeans', red: 'Red pants', green: 'Green pants', black: 'Black pants' },
  shoes: { boots: 'Boots', sneakers: 'Sneakers', elf: 'Elf shoes' },
  scarf: { none: 'No scarf', red: 'Red scarf', green: 'Green scarf', striped: 'Striped scarf' },
  mittens: { green: 'Green', red: 'Red', white: 'White', blue: 'Blue' },
} as const;

export type OutfitPart = keyof typeof OUTFIT_OPTIONS;
export type Outfit = { [K in OutfitPart]: keyof (typeof OUTFIT_OPTIONS)[K] };
export const OUTFIT_PARTS = Object.keys(OUTFIT_OPTIONS) as OutfitPart[];
export const PART_LABELS: Record<OutfitPart, string> = { hat: 'Hat', top: 'Top', pants: 'Pants', shoes: 'Shoes', scarf: 'Scarf', mittens: 'Mittens' };

const keys = <K extends OutfitPart>(k: K) => Object.keys(OUTFIT_OPTIONS[k]) as Outfit[K][];

/** A stable "random" outfit per person, so everyone looks a bit different by default. */
export function outfitFor(seedText: string): Outfit {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return (h ^= h >>> 16) >>> 0; };
  const pick = <K extends OutfitPart>(k: K, weights?: number[]) => {
    const opts = keys(k);
    if (!weights) return opts[next() % opts.length];
    let r = next() % weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r < 0) return opts[i]; }
    return opts[0];
  };
  return {
    hat: pick('hat', [5, 2, 2, 1, 0]),     // mostly Santa hats, never bare by default
    top: pick('top'),
    pants: pick('pants', [4, 1, 1, 2]),
    shoes: pick('shoes', [3, 2, 1]),
    scarf: pick('scarf', [3, 2, 2, 2]),
    mittens: pick('mittens'),
  };
}

export function randomOutfit(): Outfit {
  return outfitFor(Math.random().toString(36));
}

/** Keeps only known values; fills gaps from the person's default. */
export function cleanOutfit(input: unknown, fallback: Outfit): Outfit {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...fallback } as Record<OutfitPart, string>;
  for (const part of OUTFIT_PARTS) {
    const v = o[part];
    if (typeof v === 'string' && v in OUTFIT_OPTIONS[part]) out[part] = v;
  }
  return out as Outfit;
}
