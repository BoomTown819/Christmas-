// Builds stand-in "AI" images for tests: a character on an opaque white background (PNG)
// and an 8-frame animated GIF of it bobbing. Real OpenAI output is not used in tests.
import sharp from 'sharp';
import * as gifencNs from 'gifenc';
// gifenc ships both CommonJS and ESM builds; pick whichever shape this bundler hands us.
const gifencMod = (gifencNs).GIFEncoder ? gifencNs : gifencNs.default;
const { GIFEncoder, quantize, applyPalette } = gifencMod;
import { writeFileSync } from 'node:fs';
const figure = (dy = 0, arm = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
 <rect width="512" height="512" fill="#ffffff"/>
 <g transform="translate(0 ${dy})">
  <rect x="196" y="300" width="120" height="150" fill="#c4302f" stroke="#111" stroke-width="10"/>
  <circle cx="256" cy="220" r="80" fill="#f2c29b" stroke="#111" stroke-width="10"/>
  <polygon points="176,190 336,190 300,90" fill="#c4302f" stroke="#111" stroke-width="10"/>
  <rect x="170" y="180" width="172" height="28" fill="#fff" stroke="#111" stroke-width="6"/>
  <rect x="300" y="${300 - arm}" width="70" height="26" fill="#0f7a3c" stroke="#111" stroke-width="8"/>
  <circle cx="228" cy="220" r="10" fill="#111"/><circle cx="284" cy="220" r="10" fill="#111"/>
 </g></svg>`;
writeFileSync('e2e/fixtures/still.png', await sharp(Buffer.from(figure())).png().toBuffer());
const enc = GIFEncoder();
for (let f = 0; f < 8; f++) {
  const dy = Math.round(Math.sin((f / 8) * Math.PI * 2) * 14), arm = Math.round(Math.abs(Math.sin((f / 8) * Math.PI * 2)) * 40);
  const rgba = new Uint8Array(await sharp(Buffer.from(figure(dy, arm))).ensureAlpha().raw().toBuffer());
  const pal = quantize(rgba, 32); const idx = applyPalette(rgba, pal);
  enc.writeFrame(idx, 512, 512, { palette: pal, delay: 160, repeat: 0 });
}
enc.finish();
writeFileSync('e2e/fixtures/anim.gif', Buffer.from(enc.bytes()));
console.log('fixtures written');
