import type { DescribeResponse } from './server/types';

/** Ask our own server to read a product page. The AI key never leaves the server. */
export async function describeProduct(url: string, name: string, signal?: AbortSignal): Promise<DescribeResponse> {
  try {
    const res = await fetch('/api/describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, name }),
      signal,
    });
    if (res.status === 401) return { status: 'blocked', message: 'Log in again to use AI descriptions, or write one yourself.' };
    if (!res.ok && res.status !== 429) throw new Error(String(res.status));
    return (await res.json()) as DescribeResponse;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { status: 'blocked', message: 'Couldn’t reach the server. Write the description yourself, or try again.' };
  }
}
