import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { all, COVER_DIR, get, nowIso, RESOURCE_DIR, run, scalar } from '../db.js';
import { requireAuth, requireStaff } from '../auth.js';
import { deleteBlob, isBlobUrl } from '../blob.js';
import {
  asyncH, audit, badRequest, cleanSearch, conflict, notFound, paginated, pagination, parse,
} from '../http.js';

const router = Router();

/**
 * Online books.
 *
 * A book is an uploaded PDF plus cover/metadata, stored in the existing
 * `resources` table (kind = 'ebook'). Library staff upload and publish books;
 * students read them in the browser. Nothing else from the old library system
 * is involved.
 */

const MAX_PDF = 60 * 1024 * 1024;
const MAX_COVER = 6 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'file') {
      const pdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
      if (!pdf) return cb(new Error('Upload the book as a PDF file.'));
      return cb(null, true);
    }
    if (file.fieldname === 'cover') {
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
        return cb(new Error('The cover must be a PNG, JPEG, WebP or GIF image.'));
      }
      return cb(null, true);
    }
    return cb(new Error('Unexpected upload.'));
  },
});

const fields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

function isPdf(buffer: Buffer) {
  return buffer.length > 4 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function imageKind(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

type Uploaded = { file?: Express.Multer.File[]; cover?: Express.Multer.File[] };

function saveFile(buffer: Buffer) {
  const name = `${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(RESOURCE_DIR, name), buffer);
  return name;
}

function saveCover(buffer: Buffer) {
  const kind = imageKind(buffer);
  if (!kind) throw badRequest('That cover image is not a PNG, JPEG, WebP or GIF file.');
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${kind}`;
  fs.writeFileSync(path.join(COVER_DIR, name), buffer);
  return name;
}

function removeFile(key: string | null | undefined, dir = RESOURCE_DIR) {
  if (!key) return;
  const safe = path.basename(String(key));
  try { fs.unlinkSync(path.join(dir, safe)); } catch { /* already gone */ }
}

function mapBook(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? null,
    description: row.description ?? null,
    category: row.category ?? null,
    language: row.language ?? 'English',
    publishedYear: row.published_year ?? null,
    coverUrl: row.cover_url ?? null,
    coverColor: row.cover_color ?? '#1F4A35',
    fileSize: row.file_size ?? null,
    fileName: row.file_name ?? null,
    allowDownload: Boolean(row.allow_download),
    status: row.status,
    viewCount: Number(row.view_count ?? 0),
    downloadCount: Number(row.download_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BOOK_SELECT = 'SELECT r.* FROM resources r';

router.get('/books', asyncH(async (req, res) => {
  const p = pagination(req, 12, 200);
  const where = ["r.kind = 'ebook'", "r.status = 'approved'"];
  const params: (string | number)[] = [];
  if (req.query.category) { where.push('r.category = ?'); params.push(String(req.query.category)); }
  if (req.query.q) {
    const q = `%${cleanSearch(String(req.query.q)).toLowerCase()}%`;
    where.push('(LOWER(r.title) LIKE ? OR LOWER(COALESCE(r.author,\'\')) LIKE ? OR LOWER(COALESCE(r.description,\'\')) LIKE ?)');
    params.push(q, q, q);
  }
  const order = String(req.query.sort) === 'title' ? 'r.title COLLATE NOCASE ASC'
    : String(req.query.sort) === 'popular' ? 'r.view_count DESC, r.title'
    : 'r.created_at DESC';
  const filter = `WHERE ${where.join(' AND ')}`;
  const rows = await all<any>(`${BOOK_SELECT} ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, p.pageSize, p.offset]);
  const total = await scalar<number>(
    `SELECT COUNT(*) FROM resources r ${filter}`, params
  );
  const categories = (await all<any>(
    `SELECT r.category AS name, COUNT(*) AS count FROM resources r
     WHERE r.kind = 'ebook' AND r.status = 'approved' AND r.category IS NOT NULL AND r.category <> ''
     GROUP BY r.category ORDER BY r.category`
  )).map((r) => ({ name: r.name, count: Number(r.count) }));
  res.json({
    ...paginated(rows.map(mapBook), total, p),
    summary: { total: Number(total), categories },
  });
}));

router.get('/books/manage', requireStaff, asyncH(async (req, res) => {
  const p = pagination(req, 20, 100);
  const where = ["r.kind = 'ebook'"];
  const params: (string | number)[] = [];
  if (req.query.status && req.query.status !== 'all') { where.push('r.status = ?'); params.push(String(req.query.status)); }
  if (req.query.q) {
    const q = `%${cleanSearch(String(req.query.q)).toLowerCase()}%`;
    where.push('(LOWER(r.title) LIKE ? OR LOWER(COALESCE(r.author,\'\')) LIKE ?)');
    params.push(q, q);
  }
  const filter = `WHERE ${where.join(' AND ')}`;
  const rows = await all<any>(`${BOOK_SELECT} ${filter} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, p.pageSize, p.offset]);
  const total = await scalar<number>(`SELECT COUNT(*) FROM resources r ${filter}`, params);
  const summary = {
    total: await scalar<number>("SELECT COUNT(*) FROM resources WHERE kind = 'ebook'"),
    published: await scalar<number>("SELECT COUNT(*) FROM resources WHERE kind = 'ebook' AND status = 'approved'"),
    drafts: await scalar<number>("SELECT COUNT(*) FROM resources WHERE kind = 'ebook' AND status <> 'approved'"),
    views: await scalar<number>("SELECT COALESCE(SUM(view_count),0) FROM resources WHERE kind = 'ebook'"),
  };
  res.json({ ...paginated(rows.map(mapBook), total, p), summary });
}));

router.get('/books/:id', requireAuth, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const row = await get<any>(`${BOOK_SELECT} WHERE r.kind = 'ebook' AND r.id = ?`, [id]);
  if (!row) throw notFound('Book not found.');
  if (row.status !== 'approved' && !['librarian', 'admin'].includes(req.user!.role)) {
    throw notFound('Book not found.');
  }
  const seen = await get<any>(
    `SELECT id FROM resource_events WHERE resource_id = ? AND user_id = ? AND type = 'view' AND date(created_at) = date('now')`,
    [id, req.user!.id]
  );
  if (!seen) {
    await run(`INSERT INTO resource_events (resource_id, user_id, type, created_at) VALUES (?, ?, 'view', ?)`, [id, req.user!.id, nowIso()]);
    await run('UPDATE resources SET view_count = view_count + 1 WHERE id = ?', [id]);
  }
  res.json({ book: mapBook(await get<any>('SELECT * FROM resources WHERE id = ?', [id])) });
}));

router.get('/books/:id/file', requireAuth, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const book = await get<any>('SELECT * FROM resources WHERE id = ? AND kind = \'ebook\'', [id]);
  if (!book) throw notFound('Book not found.');
  if (book.status !== 'approved' && !['librarian', 'admin'].includes(req.user!.role)) throw notFound('Book not found.');
  if (!book.file_key) throw notFound('This book has no file attached.');
  const download = req.query.mode === 'download';
  if (download && !book.allow_download) throw badRequest('Downloads are switched off for this book. You can still read it online.');
  if (download) {
    await run('UPDATE resources SET download_count = download_count + 1 WHERE id = ?', [id]);
  }
  // Hosted uploads live in Vercel Blob; the file itself is served from there.
  if (isBlobUrl(book.file_key)) {
    const target = new URL(book.file_key);
    if (download) target.searchParams.set('download', '1');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.redirect(302, target.toString());
    return;
  }
  const safe = path.basename(String(book.file_key));
  const full = path.join(RESOURCE_DIR, safe);
  if (!full.startsWith(RESOURCE_DIR) || !fs.existsSync(full)) throw notFound('The book file is missing. Please ask the library to upload it again.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(book.file_name || `${book.title}.pdf`)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.sendFile(full);
}));

const bookFields = z.object({
  title: z.string().trim().min(2, 'Enter the book title.').max(200),
  author: z.string().trim().max(140).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  language: z.string().trim().max(40).optional().nullable(),
  publishedYear: z.coerce.number().int().min(1000).max(new Date().getFullYear() + 1).optional().nullable(),
  allowDownload: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  status: z.enum(['approved', 'archived']).optional(),
});

function allowDownloadValue(value: unknown, fallback = true): number {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 'true' ? 1 : 0;
}

router.post('/books', requireStaff, fields, asyncH(async (req, res) => {
  const data = parse(bookFields, req.body);
  const body = req.body as Record<string, string | undefined>;
  const files = req.files as Uploaded | undefined;
  const pdf = files?.file?.[0];
  const cover = files?.cover?.[0];
  const uploadedUrl = isBlobUrl(body.fileUrl) ? body.fileUrl : null;
  const uploadedCover = isBlobUrl(body.coverUrl) ? body.coverUrl : null;
  if (!pdf && !uploadedUrl) throw badRequest('Choose the book PDF to upload.', { file: 'A PDF file is required.' });
  if (pdf && !isPdf(pdf.buffer)) throw badRequest('That file is not a valid PDF.');
  const fileKey = pdf ? saveFile(pdf.buffer) : uploadedUrl!;
  const fileName = pdf
    ? path.basename(pdf.originalname).slice(0, 180)
    : String(body.fileName || `${data.title}.pdf`).slice(0, 180);
  const fileSize = pdf ? pdf.size : Number(body.fileSize) || null;
  const coverName = cover ? saveCover(cover.buffer) : null;
  const coverUrl = coverName ? `/api/media/covers/${coverName}` : uploadedCover;
  const stamp = nowIso();
  const result = await run(
    `INSERT INTO resources (title, description, kind, author, published_year, language, file_key, file_name,
       file_mime, file_size, cover_color, cover_url, category, allow_download, access, status, submitted_by,
       approved_by, approved_at, created_at, updated_at)
     VALUES (?, ?, 'ebook', ?, ?, ?, ?, ?, 'application/pdf', ?, '#1F4A35', ?, ?, ?, 'all', ?, ?, ?, ?, ?, ?)`,
    [
      data.title, data.description ?? null, data.author ?? null, data.publishedYear ?? null,
      data.language ?? 'English', fileKey, fileName, fileSize,
      coverUrl, data.category ?? null,
      allowDownloadValue(data.allowDownload), data.status ?? 'approved', req.user!.id, req.user!.id,
      (data.status ?? 'approved') === 'approved' ? stamp : null, stamp, stamp,
    ]
  );
  await audit({
    userId: req.user!.id, action: 'book.create', entityType: 'resource', entityId: result.lastInsertRowid,
    summary: `Uploaded book “${data.title}”`,
  });
  res.status(201).json({ book: mapBook(await get<any>('SELECT * FROM resources WHERE id = ?', [result.lastInsertRowid])) });
}));

router.patch('/books/:id', requireStaff, fields, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const book = await get<any>("SELECT * FROM resources WHERE id = ? AND kind = 'ebook'", [id]);
  if (!book) throw notFound('Book not found.');
  const data = parse(bookFields.partial(), req.body);
  const files = req.files as Uploaded | undefined;
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const map: Record<string, string> = {
    title: 'title', author: 'author', description: 'description', category: 'category',
    language: 'language', publishedYear: 'published_year', status: 'status',
  };
  for (const [key, column] of Object.entries(map)) {
    if (key in data) { sets.push(`${column} = ?`); params.push((data as any)[key] ?? null); }
  }
  if (data.allowDownload !== undefined) {
    sets.push('allow_download = ?');
    params.push(allowDownloadValue(data.allowDownload));
  }
  if (data.status === 'approved' && book.status !== 'approved') {
    sets.push('approved_by = ?', 'approved_at = ?');
    params.push(req.user!.id, nowIso());
  }

  const body = req.body as Record<string, string | undefined>;
  const pdf = files?.file?.[0];
  if (pdf) {
    if (!isPdf(pdf.buffer)) throw badRequest('That file is not a valid PDF.');
    const key = saveFile(pdf.buffer);
    if (book.file_key) removeFile(book.file_key);
    sets.push('file_key = ?', 'file_name = ?', 'file_mime = ?', 'file_size = ?');
    params.push(key, path.basename(pdf.originalname).slice(0, 180), 'application/pdf', pdf.size);
  } else if (isBlobUrl(body.fileUrl)) {
    await deleteBlob(book.file_key);
    sets.push('file_key = ?', 'file_name = ?', 'file_mime = ?', 'file_size = ?');
    params.push(
      body.fileUrl,
      String(body.fileName || `${data.title ?? book.title}.pdf`).slice(0, 180),
      'application/pdf',
      Number(body.fileSize) || null
    );
  }
  const cover = files?.cover?.[0];
  if (cover) {
    const name = saveCover(cover.buffer);
    if (book.cover_url?.startsWith('/api/media/covers/')) removeFile(book.cover_url.split('/').pop(), COVER_DIR);
    sets.push('cover_url = ?');
    params.push(`/api/media/covers/${name}`);
  } else if (isBlobUrl(body.coverUrl)) {
    await deleteBlob(book.cover_url);
    sets.push('cover_url = ?');
    params.push(body.coverUrl);
  }

  if (!sets.length) throw badRequest('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await run(`UPDATE resources SET ${sets.join(', ')} WHERE id = ?`, params);
  await audit({ userId: req.user!.id, action: 'book.update', entityType: 'resource', entityId: id, summary: `Updated book “${data.title ?? book.title}”` });
  res.json({ book: mapBook(await get<any>('SELECT * FROM resources WHERE id = ?', [id])) });
}));

router.delete('/books/:id', requireStaff, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const book = await get<any>("SELECT * FROM resources WHERE id = ? AND kind = 'ebook'", [id]);
  if (!book) throw notFound('Book not found.');
  removeFile(book.file_key);
  if (book.cover_url?.startsWith('/api/media/covers/')) removeFile(book.cover_url.split('/').pop(), COVER_DIR);
  await deleteBlob(book.file_key);
  await deleteBlob(book.cover_url);
  await run('DELETE FROM resource_events WHERE resource_id = ?', [id]);
  await run('DELETE FROM resource_favorites WHERE resource_id = ?', [id]);
  await run('DELETE FROM resources WHERE id = ?', [id]);
  await audit({ userId: req.user!.id, action: 'book.delete', entityType: 'resource', entityId: id, summary: `Removed book “${book.title}”` });
  res.json({ ok: true });
}));

export default router;
