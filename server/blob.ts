import { del } from '@vercel/blob';

/**
 * Vercel Blob is the only writable storage on the hosted deployment: the
 * serverless filesystem is read-only apart from /tmp, which disappears with the
 * instance. When a blob store is connected (BLOB_STORE_ID or the classic
 * BLOB_READ_WRITE_TOKEN), uploads go to Blob and the database stores the public
 * URL; in local development the same code keeps writing files to ./data.
 */
export function blobMode(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

/** Public and private Blob hosts both look like <store>.public.blob.vercel-storage.com. */
export function isBlobUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function deleteBlob(url: string | null | undefined): Promise<void> {
  if (!isBlobUrl(url)) return;
  try {
    await del(url);
  } catch (err) {
    console.warn('[blob] could not delete %s', url, err);
  }
}
