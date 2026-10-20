import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { BRAND_DIR } from '../db.js';
import { requireAdmin } from '../auth.js';
import { getSettings, updateSettings } from '../settings.js';
import { asyncH, audit, badRequest, parse } from '../http.js';

/**
 * Site branding.
 *
 * The public name, description, motto and crest are all stored in `settings`,
 * so every screen (header, footer, tab title, favicon, kiosk) reads the same
 * values. Only an administrator can change them, and the crest is accepted as
 * an uploaded image rather than a URL — that keeps the favicon same-origin and
 * avoids inline SVG being served from the app's origin.
 */
const router = Router();

const brandingSchema = z.object({
  siteName: z.string().trim().min(1, 'Give the site a name.').max(40, 'Keep the site name under 40 characters.'),
  schoolName: z.string().trim().min(2, 'Enter the school name.').max(80, 'Keep the school name under 80 characters.'),
  schoolShortName: z.string().trim().min(1, 'Enter a short name.').max(24, 'Keep the short name under 24 characters.'),
  siteDescription: z.string().trim().min(10, 'Write a description of at least 10 characters.').max(220, 'Keep the description under 220 characters.'),
  motto: z.string().trim().max(80, 'Keep the motto under 80 characters.').optional(),
});

/** The branding values every signed-in and anonymous client already receives. */
router.get('/', asyncH(async (_req, res) => {
  res.json({ settings: getSettings() });
}));

router.patch('/', requireAdmin, asyncH(async (req, res) => {
  const data = parse(brandingSchema, req.body);
  const before = getSettings();
  const settings = updateSettings(data);
  const changed = (Object.keys(data) as (keyof typeof data)[])
    .filter((key) => String(before[key] ?? '') !== String(settings[key] ?? ''));
  audit({
    userId: req.user!.id,
    action: 'settings.branding',
    entityType: 'settings',
    entityId: null,
    summary: changed.length
      ? `Updated site branding (${changed.join(', ')})`
      : 'Saved site branding without changes',
  });
  res.json({ settings });
}));

const MAX_LOGO = 4 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO, files: 1 },
});

function imageKind(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function removeBrandingFile(url: string | null | undefined) {
  if (!url?.startsWith('/api/media/branding/')) return;
  const name = path.basename(url);
  if (!/^[a-z0-9][a-z0-9-]*\.(png|jpe?g|webp|gif)$/i.test(name)) return;
  try {
    fs.unlinkSync(path.join(BRAND_DIR, name));
  } catch {
    /* the file is already gone */
  }
}

/** Upload the crest. It is used in the header and as the browser favicon. */
router.post('/logo', requireAdmin, upload.single('logo'), asyncH(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose an image to upload.', { logo: 'An image file is required.' });
  const kind = imageKind(file.buffer);
  if (!kind) throw badRequest('That file is not a PNG, JPEG, WebP or GIF image.', { logo: 'Choose a PNG, JPEG, WebP or GIF image.' });

  const previous = getSettings().logoUrl;
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${kind}`;
  fs.writeFileSync(path.join(BRAND_DIR, name), file.buffer);
  const settings = updateSettings({ logoUrl: `/api/media/branding/${name}` });
  removeBrandingFile(previous);
  audit({
    userId: req.user!.id,
    action: 'settings.logo',
    entityType: 'settings',
    entityId: null,
    summary: 'Uploaded a new site crest and favicon',
  });
  res.status(201).json({ settings });
}));

router.delete('/logo', requireAdmin, asyncH(async (req, res) => {
  const previous = getSettings().logoUrl;
  const settings = updateSettings({ logoUrl: '' });
  removeBrandingFile(previous);
  audit({
    userId: req.user!.id,
    action: 'settings.logo',
    entityType: 'settings',
    entityId: null,
    summary: 'Removed the site crest; the default Libra mark is back',
  });
  res.json({ settings });
}));

export default router;
