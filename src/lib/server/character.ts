import sharp from 'sharp';
import * as gifencNs from 'gifenc';
// gifenc ships both CommonJS and ESM builds; pick whichever shape this bundler hands us.
const gifencMod = (gifencNs as unknown as { GIFEncoder?: unknown; default: typeof gifencNs.default }).GIFEncoder ? gifencNs : gifencNs.default;
const { GIFEncoder, quantize, applyPalette } = gifencMod as typeof gifencNs.default;
import { ACTIVITIES, type Activity } from '../activities';

/** Every character lands on the same grid so they all look like they're from one game. */
export const GRID = 64;

const model = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst';
const base = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');

const realKey = () => {
  const k = (process.env.OPENAI_API_KEY ?? '').trim();
  return k && !/^PASTE/i.test(k) ? k : null; // ignore the placeholder until a real key is pasted in
};
export const openAIConfigured = () => Boolean(realKey());

export class CharacterError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const STYLE =
  'Classic 8-bit video game sprite style: chunky square pixels, bold dark outline, flat colors, a small limited palette of vibrant Christmas reds, greens, whites and golds, ' +
  'cute chibi proportions (big head, small body), full body, facing forward, centered, filling most of the frame. ' +
  'Transparent background. No text, no border, no scenery behind the character.';

const STILL_PROMPT =
  'Turn the person in this photo into a cute, friendly 8-bit pixel-art Christmas character. ' +
  'Keep them recognizable: same hairstyle and hair color, skin tone, glasses if they wear them, facial hair if they have it. ' +
  'Dress them in a Santa hat and a cozy red-and-green Christmas sweater. ' + STYLE;

const animPrompt = (a: Activity) =>
  `Animate this exact pixel-art character ${ACTIVITIES[a].prompt}. Keep the character's look, colors, size and position identical in every frame; ` +
  'only the motion changes. A short smooth loop where the last frame flows back into the first. ' + STYLE;

/** Calls OpenAI's image edit endpoint with one input image. Returns the image bytes. */
async function openAIEdit(image: Buffer, mime: string, prompt: string, extra: Record<string, string>): Promise<Buffer> {
  const key = realKey();
  if (!key) throw new CharacterError('Character drawing isn’t set up yet: the site owner needs to add an OpenAI API key.', 503);
  const form = new FormData();
  form.append('model', model());
  form.append('prompt', prompt);
  form.append('image', new Blob([image], { type: mime }), mime === 'image/png' ? 'image.png' : 'image.jpg');
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${base()}/v1/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = '';
    try { msg = JSON.parse(body).error?.message ?? ''; } catch { /* not json */ }
    console.error('[character] OpenAI error', res.status, body.slice(0, 400));
    if (res.status === 400 && /safety|moderation|policy/i.test(msg)) {
      throw new CharacterError('OpenAI declined this photo. Try a different, clear photo of just yourself.', 422);
    }
    if (res.status === 401) throw new CharacterError('The OpenAI API key on the server isn’t valid.', 503);
    if (res.status === 429) throw new CharacterError('OpenAI is busy or the account is out of credit. Try again in a bit.', 503);
    throw new CharacterError(`OpenAI couldn’t draw the character${msg ? `: ${msg}` : ''}.`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new CharacterError('OpenAI returned no image.');
  return Buffer.from(b64, 'base64');
}

/**
 * Makes background pixels transparent: anything connected to the image border that is
 * close to the border's typical color. Handles models that ignore the transparency request.
 */
function keyOutBackground(px: Buffer, w: number, h: number) {
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const border: number[][] = [];
  for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) border.push([0, y], [w - 1, y]);
  const opaqueBorder = border.filter(([x, y]) => px[idx(x, y) + 3] > 200);
  if (opaqueBorder.length < border.length * 0.6) return; // already transparent around the edges
  const avg = [0, 1, 2].map((c) => opaqueBorder.reduce((s, [x, y]) => s + px[idx(x, y) + c], 0) / opaqueBorder.length);
  const close = (i: number) => Math.hypot(px[i] - avg[0], px[i + 1] - avg[1], px[i + 2] - avg[2]) < 48;
  const seen = new Uint8Array(w * h);
  const stack = border.filter(([x, y]) => close(idx(x, y)));
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
    seen[y * w + x] = 1;
    const i = idx(x, y);
    if (!close(i) && px[i + 3] > 0) continue;
    px[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

/** Hard pixel edges: alpha is either fully on or fully off. */
function binarizeAlpha(px: Buffer) {
  for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0;
}

/** Large AI image → 64×64 sprite on a transparent background with a small palette. */
export async function pixelate(input: Buffer): Promise<Buffer> {
  // Work at 256px to clean the background, then shrink onto the shared 64px grid.
  const work = await sharp(input).ensureAlpha().resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  keyOutBackground(work.data, work.info.width, work.info.height);
  const cleaned = await sharp(work.data, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer();
  let trimmed: Buffer;
  try {
    trimmed = await sharp(cleaned).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).toBuffer();
  } catch {
    trimmed = cleaned; // nothing to trim
  }
  const small = await sharp(trimmed)
    .resize(GRID - 4, GRID - 2, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'mitchell' })
    .extend({ top: 2, bottom: 0, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  binarizeAlpha(small.data);
  return sharp(small.data, { raw: { width: GRID, height: GRID, channels: 4 } })
    .png({ palette: true, colors: 32, dither: 0, compressionLevel: 9 }).toBuffer();
}

/** Animated AI GIF → 64×64 looping GIF with transparent background and crisp pixels. */
export async function pixelateGif(input: Buffer): Promise<{ gif: Buffer; frames: number }> {
  const meta = await sharp(input, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  if (pages < 2) throw new CharacterError('The animation came back with a single frame.');
  const delays = meta.delay ?? [];
  const w = GRID, h = GRID;
  const enc = GIFEncoder();
  for (let p = 0; p < pages; p++) {
    const frame = await sharp(input, { page: p }).ensureAlpha()
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
    keyOutBackground(frame, 256, 256);
    const small = await sharp(frame, { raw: { width: 256, height: 256, channels: 4 } })
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'mitchell' })
      .ensureAlpha().raw().toBuffer();
    binarizeAlpha(small);
    const rgba = new Uint8Array(small);
    const palette = quantize(rgba, 32, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaIndex: 0 });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((c) => c[3] === 0);
    enc.writeFrame(index, w, h, {
      palette, delay: Math.max(60, Math.min(400, delays[p] ?? 160)), repeat: 0,
      transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex), dispose: 2,
    });
  }
  enc.finish();
  return { gif: Buffer.from(enc.bytes()), frames: pages };
}

export async function drawStill(photo: Buffer, mime: string): Promise<Buffer> {
  const raw = await openAIEdit(photo, mime, STILL_PROMPT, { background: 'transparent', output_format: 'png' });
  return pixelate(raw);
}

export async function drawAnimation(sprite: Buffer, activity: Activity): Promise<{ gif: Buffer; frames: number }> {
  // Hand the model a big, crisp copy of the sprite so it keeps the same character.
  const big = await sharp(sprite).resize(1024, 1024, { kernel: 'nearest' }).png().toBuffer();
  const raw = await openAIEdit(big, 'image/png', animPrompt(activity), {
    background: 'transparent', output_format: 'gif', frame_count: '8', frame_duration_ms: '160',
  });
  return pixelateGif(raw);
}

/* ---------------------------------------------------------------------------
   Free mode (no AI, no key): turn the photo itself into an 8-bit "bobblehead".
   The face area is cut into a round pixel head with a small Christmas palette,
   then given a pixel Santa hat, sweater, arms and boots. Same 64×64 grid as AI characters.
   --------------------------------------------------------------------------- */
const C = {
  outline: [27, 27, 34], red: [214, 58, 58], darkRed: [142, 27, 36], white: [251, 247, 238],
  green: [47, 158, 95], gold: [255, 210, 90], boot: [40, 30, 28], skin: [246, 201, 168],
} as const;

export async function drawPixelPortrait(photo: Buffer): Promise<Buffer> {
  const img = sharp(photo).rotate(); // respect phone orientation
  const meta = await img.metadata();
  const w = meta.width ?? 512, h = meta.height ?? 512;
  // Faces are usually upper-middle in a selfie: take a square from there.
  const side = Math.round(Math.min(w, h) * 0.62);
  const left = Math.max(0, Math.round((w - side) / 2));
  const top = Math.max(0, Math.min(h - side, Math.round(h * 0.4 - side / 2)));
  const D = 30; // head diameter in sprite pixels
  const face = await img.extract({ left, top, width: Math.min(side, w - left), height: Math.min(side, h - top) })
    .resize(D, D, { kernel: 'mitchell' }).modulate({ saturation: 1.25 }).linear(1.08, -6)
    .removeAlpha().raw().toBuffer();

  const S = GRID;
  const px = Buffer.alloc(S * S * 4);
  const set = (x: number, y: number, c: readonly number[]) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: readonly number[]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };

  // body: sweater, stripe, buttons, arms, mittens, boots
  rect(20, 41, 43, 55, C.red);
  rect(20, 47, 43, 48, C.green);
  for (const x of [24, 29, 34, 39]) set(x, 47, C.white);
  rect(31, 50, 32, 51, C.gold); rect(31, 53, 32, 54, C.gold);
  rect(14, 42, 19, 51, C.red); rect(44, 42, 49, 51, C.red);
  rect(14, 52, 19, 55, C.green); rect(44, 52, 49, 55, C.green);
  rect(22, 56, 29, 61, C.boot); rect(34, 56, 41, 61, C.boot);
  rect(20, 55, 43, 55, C.white); // sweater hem

  // round pixel head from the photo
  const cx = 31.5, cy = 25.5, r = D / 2;
  const hx0 = Math.round(cx - r + 0.5), hy0 = Math.round(cy - r + 0.5);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    if (Math.hypot(x + hx0 - cx, y + hy0 - cy) > r - 0.3) continue;
    const i = (y * D + x) * 3;
    set(hx0 + x, hy0 + y, [face[i], face[i + 1], face[i + 2]]);
  }

  // Santa hat over the top of the head, with a white brim and pompom
  for (let y = 2; y <= 14; y++) {
    const t = (y - 2) / 12;
    const xl = Math.round(36 - t * 19), xr = Math.round(40 + t * 7);
    rect(xl, y, xr, y, y < 6 ? C.darkRed : C.red);
  }
  rect(15, 13, 48, 16, C.white);
  rect(44, 1, 48, 5, C.white);

  // dark outline around everything solid, for the classic sprite look
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && px[(y * S + x) * 4 + 3] === 255;
  const edge: [number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) set(x, y, C.outline);

  return sharp(px, { raw: { width: S, height: S, channels: 4 } }).png({ palette: true, colors: 28, dither: 0, compressionLevel: 9 }).toBuffer();
}
