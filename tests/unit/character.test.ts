import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { GRID, pixelate, pixelateGif } from '@/lib/server/character';

describe('pixelate', () => {
  it('turns a big opaque image into a 64px sprite with a transparent background', async () => {
    const out = await pixelate(readFileSync('e2e/fixtures/still.png'));
    const img = sharp(out);
    const meta = await img.metadata();
    expect([meta.width, meta.height]).toEqual([GRID, GRID]);
    const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * GRID + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(GRID - 1, GRID - 1)).toBe(0);
    expect(alpha(GRID / 2, GRID / 2)).toBe(255);
    const alphas = new Set<number>();
    for (let i = 3; i < data.length; i += 4) alphas.add(data[i]);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(out.length).toBeLessThan(20000);
  });
});

describe('pixelateGif', () => {
  it('keeps every frame, shrinks to 64px and loops', async () => {
    const { gif, frames } = await pixelateGif(readFileSync('e2e/fixtures/anim.gif'));
    expect(frames).toBe(8);
    const meta = await sharp(gif, { animated: true }).metadata();
    expect(meta.width).toBe(GRID);
    expect(meta.pages).toBe(8);
    expect(meta.loop).toBe(0);
    const first = await sharp(gif, { page: 0 }).ensureAlpha().raw().toBuffer();
    expect(first[3]).toBe(0);
    expect(gif.length).toBeLessThan(200000);
  });
});

describe('free Retro Bowl-style sprite', () => {
  it('keeps the real face, removes the background, and animates 8 frames', async () => {
    const { makeFace, buildPixelCharacter, SPRITE, HEAD_W, HEAD_H } = await import('@/lib/server/sprite');
    const photo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="340" height="380"><rect width="340" height="380" fill="#7c93a8"/>
      <ellipse cx="170" cy="210" rx="120" ry="150" fill="#e8b48f"/><circle cx="125" cy="205" r="14" fill="#2b2320"/><circle cx="215" cy="205" r="14" fill="#2b2320"/></svg>`)).jpeg().toBuffer();
    const face = await makeFace(photo);
    const fm = await sharp(face).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([fm.info.width, fm.info.height]).toEqual([HEAD_W, HEAD_H]);
    expect(fm.data[(2 * HEAD_W + 1) * 4 + 3]).toBe(0);                       // blue wall removed at the side
    const mid = ((HEAD_H >> 1) * HEAD_W + (HEAD_W >> 1)) * 4;
    expect(fm.data[mid + 3]).toBe(255);                                    // face kept
    expect(fm.data[mid]).toBeGreaterThan(fm.data[mid + 2]);                // skin, not wall
    for (const act of ['waving', 'presents', 'sleigh', 'lights'] as const) {
      const { png, gif } = await buildPixelCharacter(face, act);
      const meta = await sharp(gif, { animated: true }).metadata();
      expect([meta.width, meta.pages, meta.loop]).toEqual([SPRITE, 8, 0]);
      expect((await sharp(png).metadata()).width).toBe(SPRITE);
      // frames really differ (limbs/props move), so it's an animation, not one picture
      const a = await sharp(gif, { page: 0 }).raw().toBuffer(), b = await sharp(gif, { page: 3 }).raw().toBuffer();
      expect(a.equals(b)).toBe(false);
      expect(gif.length).toBeLessThan(60000);
    }
  });
});

describe('outfits', () => {
  it('gives different people different default outfits, the same person always the same', async () => {
    const { outfitFor, cleanOutfit } = await import('@/lib/outfit');
    const looks = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(outfitFor(`user-${i}`))));
    expect(looks.size).toBeGreaterThan(15);
    expect(outfitFor('abc')).toEqual(outfitFor('abc'));
    for (let i = 0; i < 50; i++) expect(outfitFor(`u${i}`).hat).not.toBe('none');
    const base = outfitFor('x');
    expect(cleanOutfit({ hat: 'elf', top: 'lava', shoes: 7 }, base)).toEqual({ ...base, hat: 'elf' });
  });
  it('draws every outfit choice differently', async () => {
    const { makeFace, buildPixelCharacter } = await import('@/lib/server/sprite');
    const { OUTFIT_OPTIONS } = await import('@/lib/outfit');
    const face = await makeFace(await sharp({ create: { width: 200, height: 220, channels: 3, background: '#e8b48f' } }).jpeg().toBuffer());
    const base = { hat: 'santa', top: 'red', pants: 'jeans', shoes: 'boots', scarf: 'none', mittens: 'green' } as const;
    const first = (await buildPixelCharacter(face, 'waving', base)).png;
    for (const [part, opts] of Object.entries(OUTFIT_OPTIONS)) {
      for (const value of Object.keys(opts)) {
        if ((base as Record<string, string>)[part] === value) continue;
        const { png } = await buildPixelCharacter(face, 'waving', { ...base, [part]: value } as never);
        expect(png.equals(first), `${part}=${value}`).toBe(false);
      }
    }
  });
});
