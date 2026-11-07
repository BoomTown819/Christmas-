// Local stand-ins for store pages and the AI API, used only by the end-to-end test.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const STILL = readFileSync(new URL('./fixtures/still.png', import.meta.url)).toString('base64');
const ANIM = readFileSync(new URL('./fixtures/anim.gif', import.meta.url)).toString('base64');
export const imageCalls = [];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#eee"/><circle cx="100" cy="100" r="60" fill="#333"/></svg>`;
const product = `<!doctype html><html><head><title>Aurora Headphones – Store</title>
<meta property="og:title" content="Aurora ANC Headphones"><meta name="description" content="Over-ear wireless headphones with adaptive noise cancellation and 40-hour battery life. Ships free.">
<meta property="og:image" content="/img.svg">
<script type="application/ld+json">{"@type":"Product","name":"Aurora ANC Headphones","brand":"Aurora","offers":{"price":"279.00","priceCurrency":"USD"}}</script>
</head><body><main><h1>Aurora ANC Headphones</h1><p>Over-ear wireless headphones with adaptive noise cancellation.</p></main></body></html>`;
http.createServer((req, res) => {
  if (req.url === '/v1/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const ok = body.includes('Aurora');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text: ok ? 'Over-ear wireless headphones with adaptive noise cancellation and a 40-hour battery.' : 'INSUFFICIENT' }] }));
    });
    return;
  }
  // Stand-in for OpenAI's image edit endpoint (multipart). GIF when output_format=gif.
  if (req.url === '/v1/images/edits' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1');
      const field = (n) => (body.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
      const ok = req.headers.authorization === 'Bearer test-openai' && body.includes('name="image"');
      res.setHeader('content-type', 'application/json');
      if (!ok) { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: 'bad key or missing image' } })); }
      const gif = field('output_format') === 'gif';
      if (gif && /sleigh/.test(field('prompt') || '')) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: 'GIF output is not available for this request' } })); }
      setTimeout(() => res.end(JSON.stringify({ data: [{ b64_json: gif ? ANIM : STILL }] })), 300);
    });
    return;
  }
  // Stand-in for the browser-based link preview service (Microlink's response shape).
  if (req.url.startsWith('/microlink')) {
    const target = new URL(req.url, 'http://x').searchParams.get('url') || '';
    res.setHeader('content-type', 'application/json');
    if (target.endsWith('/jsonly')) {
      return res.end(JSON.stringify({ status: 'success', data: { title: 'Frosty Snow Globe | Tiny Shop', description: 'A hand-blown glass snow globe with a tiny village inside.', image: { url: 'http://127.0.0.1:9911/globe.svg' }, publisher: 'Tiny Shop' } }));
    }
    return res.end(JSON.stringify({ status: 'fail', data: {} }));
  }
  if (req.url === '/jsonly') { res.setHeader('content-type', 'text/html'); return res.end('<html><head><title>Tiny Shop</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  if (req.url === '/captcha') { res.setHeader('content-type', 'text/html'); return res.end('<html><head><title>Robot Check</title></head><body><form action="/errors/validateCaptcha"><input name="field-keywords"></form></body></html>'); }
  if (req.url === '/globe.svg') { res.setHeader('content-type', 'image/svg+xml'); return res.end(svg.replace('#333', '#2a6')); }
  if (req.url === '/product') { res.setHeader('content-type', 'text/html'); return setTimeout(() => res.end(product), 700); }
  if (req.url === '/img.svg') { res.setHeader('content-type', 'image/svg+xml'); return res.end(svg); }
  if (req.url === '/blocked') { res.statusCode = 403; return res.end('Forbidden'); }
  if (req.url === '/empty') { res.setHeader('content-type', 'text/html'); return res.end('<html><head><title>Loading</title></head><body><div id="app"></div></body></html>'); }
  res.statusCode = 404; res.end();
}).listen(9911, () => console.log('fixtures on 9911'));
