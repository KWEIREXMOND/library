import './env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { all, db, initDb, scalar, BRAND_DIR } from './db.js';
import { authenticate, pruneRevokedSessions } from './auth.js';
import { HttpError } from './http.js';
import { seed } from './seed/index.js';
import { ensureHostedSeed } from './seed/hosted.js';
import { getSettings, loadSettings } from './settings.js';

import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import kioskRoutes from './routes/kiosk.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';
import mediaRoutes from './routes/media.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProd = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Compress JSON and the big hashed assets (pdf.js alone is >1 MB).
app.use(compression());

// JSON from the API is personal and live: never let a proxy or browser cache it.
app.use('/api', (req, res, next) => {
  const isBinary = req.path.startsWith('/media/') || req.path.endsWith('/file');
  if (!isBinary) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Same-origin protection for state-changing requests (cookies are SameSite=Lax as well).
const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    // Compare against both the direct Host and any proxy-forwarded host so
    // same-origin requests still pass when the app sits behind a reverse proxy
    // or inside a hosted preview iframe.
    const hosts = [req.headers.host, req.headers['x-forwarded-host']]
      .flatMap((value) => String(value ?? '').split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const allowed = hosts.includes(originUrl.host.toLowerCase())
      || extraOrigins.includes(origin)
      || extraOrigins.includes(originUrl.origin);
    if (allowed) return next();
  } catch {
    /* fall through */
  }
  console.warn('[csrf] blocked %s %s origin=%s host=%s xfhost=%s', req.method, req.path,
    req.headers.origin ?? '-', req.headers.host ?? '-', req.headers['x-forwarded-host'] ?? '-');
  res.status(403).json({ error: 'Cross-site request blocked.' });
});

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    database: await scalar<number>('SELECT COUNT(*) FROM users') > 0 ? 'ready' : 'empty',
    version: '1.0.0',
  });
});

app.use('/api/auth', (_req, res, next) => {
  // Session state must never be served from a browser or proxy cache.
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Browser-side diagnostics (unauthenticated, tiny, never persisted).
app.post('/api/client-log', express.json({ limit: '8kb' }), (req, res) => {
  const { event, data, path, ua } = (req.body ?? {}) as Record<string, any>;
  console.info('[client] %s %s path=%s %s', String(event ?? '-'), JSON.stringify(data ?? {}), String(path ?? '-'), String(ua ?? '').slice(0, 80));
  res.status(204).end();
});

app.use(authenticate);

app.use('/api/auth', authRoutes);
app.use('/api', bookRoutes);
app.use('/api', kioskRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', mediaRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'That API endpoint does not exist.' });
});

// The uploaded school crest doubles as the favicon. Browsers that ask for
// /favicon.ico directly (bookmarks, crawlers) get the real image.
app.get('/favicon.ico', (req, res) => {
  const logo = getSettings().logoUrl;
  if (!logo?.startsWith('/api/media/branding/')) return res.redirect(302, '/favicon.svg');
  const name = logo.split('/').pop() ?? '';
  const file = path.join(BRAND_DIR, name);
  if (!/^[a-z0-9-]+\.(png|jpg|jpeg|webp|gif)$/i.test(name) || !fs.existsSync(file)) return res.redirect(302, '/favicon.svg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(file);
});

// Static client build (production)
const clientDist = path.resolve(process.env.CLIENT_DIST || 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      // Vite fingerprints everything under /assets/, so those can be cached
      // forever; index.html is served below without a long cache.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the upload limit.' : `Upload failed: ${err.message}`;
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Error && /^(Upload the book as a PDF file\.|The cover must be a PNG|Unexpected upload\.|That file is not a valid PDF\.)/.test(err.message)) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'The request body was not valid JSON.' });
    return;
  }
  const sqliteMessage = String(err?.message ?? '');
  if (sqliteMessage.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'That record already exists. Please check for duplicates and try again.' });
    return;
  }
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({
    error: isProd ? 'Something went wrong on our side. Please try again.' : sqliteMessage || 'Unexpected server error.',
  });
});

// Housekeeping: expiries and reminders. Runs at start and every 30 minutes.
async function housekeeping() {
  try {
    await pruneRevokedSessions();
  } catch (err) {
    console.error('[housekeeping]', err);
  }
}

/**
 * Everything that must exist before the first query. A serverless host imports
 * this module per request, so the work is done behind a single shared promise
 * instead of top-level await (which some bundlers cannot emit).
 */
async function boot() {
  await initDb();
  await loadSettings();

  if (await ensureHostedSeed()) {
    await loadSettings();
    console.log('[seed] Hosted database prepared: school accounts and reference lists restored.');
  }

  const userCount = await scalar<number>('SELECT COUNT(*) FROM users');
  const autoSeed = process.env.AUTO_SEED !== 'false';
  if (userCount === 0 && !autoSeed) {
    console.warn('[seed] The database is empty and AUTO_SEED=false — no accounts exist yet.');
  }
  if (userCount === 0 && autoSeed) {
    console.log('[seed] Empty database detected — creating the demo library…');
    const result = await seed();
    if (result.seeded) {
      await loadSettings();
      console.log(`[seed] ${result.titles} titles, ${result.copies} copies, ${result.users} members, ${result.loans} loans, ${result.resources} books online.`);
      if (isProd) {
        console.warn('[seed] Demo accounts were created in production. Sign in and change their passwords.');
        console.warn('[seed] Set AUTO_SEED=false to skip this on future empty databases.');
      }
      if (!isProd) {
        console.log('[seed] Demo sign-ins: admin@tema.edu.gh / Admin@123 · librarian@tema.edu.gh / Library@123');
        console.log('[seed]               teacher@tema.edu.gh / Teacher@123 · student@tema.edu.gh / Student@123');
        if (!isProd) {
          const demo = await all<{ email: string; library_id: string }>(
            `SELECT email, library_id FROM users WHERE email IN ('admin@tema.edu.gh','librarian@tema.edu.gh','teacher@tema.edu.gh','student@tema.edu.gh') ORDER BY id`
          );
          for (const row of demo) console.log(`[seed]               library ID ${row.library_id} → ${row.email}`);
        }
      }
    }
  }

  housekeeping();
  setInterval(housekeeping, 30 * 60 * 1000).unref?.();
}

/** Resolves once the schema, settings and accounts are ready. */
export const ready: Promise<void> = boot();

// Vercel imports this module as a serverless function: it must not listen.
if (!process.env.VERCEL) {
  void ready.then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Libra API listening on http://0.0.0.0:${PORT}${isProd ? ' (production)' : ''}`);
    });

    const shutdown = (signal: string) => {
      console.log(`[shutdown] ${signal} received — closing the library server…`);
      server.close(() => {
        try { void db.close(); } catch { /* already closed */ }
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 8000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}

// Exported for tests / tooling
export { app };
export const stats = async () => await all(`SELECT COUNT(*) AS users FROM users`);
