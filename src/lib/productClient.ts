import type { ProductResponse } from './server/types';

/** Ask our own server to read a product link. Any keys stay on the server. */
export async function lookupProduct(url: string, name: string, signal?: AbortSignal): Promise<ProductResponse> {
  try {
    const res = await fetch('/api/product', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, name }),
      signal,
    });
    if (!res.ok && res.status !== 429 && res.status !== 401) throw new Error(String(res.status));
    return (await res.json()) as ProductResponse;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { status: 'failed', product: {}, message: 'Couldn’t reach the server. Fill in the details below, or try again.' };
  }
}

/** Shrink a picture in the browser, then upload it. Returns the saved picture's address. */
export async function uploadItemImage(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('Choose a picture file (JPG, PNG, HEIC or WebP).');
  const dataUrl = await shrink(file).catch(() => readAsDataUrl(file));
  const res = await fetch('/api/item-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: dataUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error ?? 'Couldn’t upload the picture. Try again.');
  return body.url as string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(file);
  });
}

async function shrink(file: File, max = 1200): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
