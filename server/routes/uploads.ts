import { Router } from 'express';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireStaff } from '../auth.js';
import { asyncH, badRequest } from '../http.js';
import { blobMode } from '../blob.js';

const router = Router();

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const LIMITS: Record<string, { max: number; types: string[] }> = {
  book: { max: 60 * 1024 * 1024, types: ['application/pdf'] },
  cover: { max: 6 * 1024 * 1024, types: IMAGE_TYPES },
  logo: { max: 4 * 1024 * 1024, types: IMAGE_TYPES },
};

/** The browser asks which storage the server uses before choosing an upload path. */
router.get('/uploads/mode', requireStaff, (_req, res) => {
  res.json({ mode: blobMode() ? 'blob' : 'local' });
});

/**
 * Issues a short-lived client token so the browser can send the file straight to
 * Vercel Blob. That keeps big PDFs (up to 60 MB) away from the 4.5 MB serverless
 * request limit; the API only ever receives the resulting URL.
 */
router.post('/uploads/token', asyncH(async (req, res) => {
  if (!blobMode()) throw badRequest('File storage is not configured on this server.');
  const body = req.body as HandleUploadBody & { type?: string };
  // Blob calls this URL back after a finished upload to run onUploadCompleted.
  // That request is signed by Vercel, not by a user session, so it has no cookie.
  const isCallback = body?.type === 'blob.upload-completed';
  if (!isCallback && !req.user) {
    res.status(401).json({ error: 'Sign in to upload files.' });
    return;
  }

  const jsonResponse = await handleUpload({
    body,
    request: req as unknown as Request,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      let kind = '';
      try {
        kind = String(JSON.parse(clientPayload || '{}').kind || '');
      } catch {
        throw badRequest('Unknown upload type.');
      }
      const spec = LIMITS[kind];
      if (!spec) throw badRequest('Unknown upload type.');
      if (kind === 'logo' && req.user!.role !== 'admin') {
        throw badRequest('Only an administrator can change the site crest.');
      }
      if (kind !== 'logo' && !['librarian', 'admin'].includes(req.user!.role)) {
        throw badRequest('Only library staff can upload books.');
      }
      return {
        allowedContentTypes: spec.types,
        maximumSizeInBytes: spec.max,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ kind, userId: req.user!.id }),
      };
    },
    // The row is written by the normal create/update request once the browser
    // has the URL, so there is nothing to do when Blob reports completion.
    onUploadCompleted: async () => undefined,
  });

  res.json(jsonResponse);
}));

export default router;
