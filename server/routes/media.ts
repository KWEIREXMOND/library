import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_DIR, COVER_DIR } from '../db.js';
import { asyncH, notFound } from '../http.js';

const router = Router();

/**
 * Public read access to uploaded images: book covers and the school crest.
 * Files live under `data/uploads/` and are served through /api/media/... so the
 * same URLs work in the dev proxy and in production.
 */

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp|gif)$/i;
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function serve(directory: string) {
  return (req: import('express').Request, res: import('express').Response) => {
    const name = String(req.params.file ?? '');
    if (!SAFE_NAME.test(name)) throw notFound('Image not found.');
    const file = path.join(directory, name);
    if (!file.startsWith(directory) || !fs.existsSync(file)) throw notFound('Image not found.');
    const extension = name.split('.').pop()!.toLowerCase();
    res.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file);
  };
}

router.get('/media/covers/:file', asyncH(async (req, res) => serve(COVER_DIR)(req, res)));

router.get('/media/branding/:file', asyncH(async (req, res) => serve(BRAND_DIR)(req, res)));

export default router;
