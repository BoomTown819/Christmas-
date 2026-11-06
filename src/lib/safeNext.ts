/** Only allow same-site relative redirects after login. */
export const safeNext = (n: string | null | undefined, fallback = '/') =>
  n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : fallback;
