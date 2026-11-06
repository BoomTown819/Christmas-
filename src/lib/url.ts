export type UrlParse = { ok: true; url: string; host: string } | { ok: false; error: string };

/** Normalise a pasted link. Adds https:// when the scheme is missing. */
export function parseUrl(input: string): UrlParse {
  const t = input.trim();
  if (!t) return { ok: false, error: 'Paste a link to the product.' };
  if (/\s/.test(t)) return { ok: false, error: "Links can't contain spaces." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Use a link that starts with http or https.' };
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { ok: false, error: "That doesn't look like a website address." };
    return { ok: true, url: u.toString(), host: u.hostname.replace(/^www\./, '') };
  } catch {
    return { ok: false, error: "That doesn't look like a website address." };
  }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
