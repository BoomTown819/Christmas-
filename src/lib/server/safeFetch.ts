import { lookup } from 'node:dns/promises';
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 4;

export class FetchBlockedError extends Error {}
export class InvalidUrlError extends Error {}

/** Parse and validate a user-supplied product URL. Accepts links without a scheme ("amazon.com/..."). */
export function parseProductUrl(raw: string): URL {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new InvalidUrlError('Paste a product link first.');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidUrlError("That doesn't look like a web address.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError('Only http and https links can be read.');
  }
  if (!url.hostname.includes('.') && !allowPrivate()) {
    throw new InvalidUrlError("That doesn't look like a public website address.");
  }
  if (url.username || url.password) throw new InvalidUrlError("Links with a username or password in them can't be read.");
  if (url.port && !['80', '443'].includes(url.port) && !allowPrivate()) {
    throw new InvalidUrlError('Only normal website links (no special ports) can be read.');
  }
  return url;
}

const allowPrivate = () => process.env.ALLOW_PRIVATE_HOSTS === '1';

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** Refuse to fetch internal network addresses (SSRF protection). */
async function assertPublicHost(url: URL) {
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new FetchBlockedError("Couldn't find that website. Check the link for typos.");
  });
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new FetchBlockedError('That address points to a private network, so it was not read.');
  }
}

/**
 * Connections go through this agent, which checks the address it is *actually* connecting to.
 * That closes the gap where a site's DNS answers "public" to the check above and "private" a
 * moment later (DNS rebinding).
 */
const pinnedAgent = new Agent({
  connect: {
    lookup(hostname, options, cb) {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, '', 4);
        const list = (Array.isArray(addrs) ? addrs : [addrs]) as dns.LookupAddress[];
        if (!allowPrivate() && list.some((a) => isPrivateAddress(a.address))) {
          return cb(new FetchBlockedError('That address points to a private network, so it was not read.'), '', 4);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((options as any)?.all) return (cb as any)(null, list);
        return cb(null, list[0].address, list[0].family);
      });
    },
  },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

/** Fetch a public web page as text with a timeout, size cap and re-validated redirects. */
export async function fetchPage(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        dispatcher: pinnedAgent,
        headers: {
          // A normal browser-like request; many shops reject unknown clients.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof FetchBlockedError) throw err;
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof FetchBlockedError) throw cause;
      const aborted = (err as Error).name === 'AbortError';
      throw new FetchBlockedError(aborted ? 'The website took too long to respond.' : "The website couldn't be reached.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      url = new URL(res.headers.get('location')!, url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchBlockedError('The website redirected somewhere that can’t be read.');
      if (!allowPrivate() && ((url.port && !['80', '443'].includes(url.port)) || url.username || url.password)) {
        throw new FetchBlockedError('The website redirected somewhere that can’t be read.');
      }
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      const why = res.status === 403 || res.status === 429 || res.status === 503
        ? `The website blocked automated access (HTTP ${res.status}).`
        : `The website returned an error (HTTP ${res.status}).`;
      throw new FetchBlockedError(why);
    }
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) {
      clearTimeout(timer);
      throw new FetchBlockedError("That link isn't a web page the app can read.");
    }
    const html = await readCapped(res, ctrl).finally(() => clearTimeout(timer));
    return { html, finalUrl: url };
  }
  throw new FetchBlockedError('The website redirected too many times.');
}

async function readCapped(res: Awaited<ReturnType<typeof undiciFetch>>, ctrl: AbortController): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= MAX_BYTES) {
      ctrl.abort();
      break;
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
