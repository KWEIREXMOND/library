import { api } from './api';

/**
 * Uploading differs by deployment:
 *
 * - Hosted (Vercel): the browser sends the file straight to Vercel Blob. The API
 *   only issues a short-lived token, because serverless request bodies are
 *   capped at 4.5 MB while a book PDF may be 60 MB.
 * - Local development: the file is posted to the API as multipart form data and
 *   written to ./data/uploads.
 *
 * storageMode() asks the server once and the answer is reused for the session.
 */
export type UploadKind = 'book' | 'cover' | 'logo';
type StorageMode = 'blob' | 'local';

let cached: StorageMode | null = null;

export async function storageMode(): Promise<StorageMode> {
  if (cached) return cached;
  try {
    const result = await api<{ mode: StorageMode }>('/uploads/mode');
    cached = result.mode === 'blob' ? 'blob' : 'local';
  } catch {
    cached = 'local';
  }
  return cached;
}

export type UploadedFile = { url: string; size: number; name: string };

/** Send one file to Vercel Blob and return what the book/logo record needs. */
export async function uploadToBlob(file: File, kind: UploadKind): Promise<UploadedFile> {
  // Loaded on demand: the Blob client is only needed by staff upload screens.
  const { upload } = await import('@vercel/blob/client');
  const folder = kind === 'book' ? 'books' : kind === 'cover' ? 'covers' : 'branding';
  const safeName = file.name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80) || 'file';
  const blob = await upload(`${folder}/${Date.now().toString(36)}-${safeName}`, file, {
    access: 'public',
    handleUploadUrl: '/api/uploads/token',
    clientPayload: JSON.stringify({ kind }),
    contentType: file.type || undefined,
  });
  return { url: blob.url, size: file.size, name: file.name };
}
