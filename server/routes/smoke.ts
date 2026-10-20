import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, scalar } from '../db.js';
import { getSettings } from '../settings.js';
import { blobMode } from '../blob.js';
import { asyncH } from '../http.js';

/**
 * Temporary deployment probe: confirms the hosted database kept the school's
 * accounts and that their passwords still verify. Mounted only when SMOKE_KEY
 * is set and removed once the deployment has been checked.
 */
export default function smokeRoutes(key: string) {
  const router = Router();
  router.get('/smoke', asyncH(async (req, res) => {
    if (req.query.key !== key) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const users = await all<{ email: string; password_hash: string; role: string; library_id: string }>(
      'SELECT email, password_hash, role, library_id FROM users ORDER BY id'
    );
    const known: Record<string, string> = {
      'admin@tema.edu.gh': 'Admin@123',
      'librarian@tema.edu.gh': 'Library@123',
      'teacher@tema.edu.gh': 'Teacher@123',
      'student@tema.edu.gh': 'Student@123',
    };
    let blobCheck: unknown = 'skipped';
    if (req.query.blob === '1' && blobMode()) {
      const { put, del } = await import('@vercel/blob');
      const created = await put(`smoke/${Date.now()}.txt`, 'libra blob check', { access: 'public', addRandomSuffix: true });
      const fetched = await fetch(created.url);
      const text = await fetched.text();
      await del(created.url);
      blobCheck = { status: fetched.status, body: text, host: new URL(created.url).hostname };
    }
    res.json({
      blobCheck,
      users: users.length,
      accounts: users.map((u) => ({
        email: u.email,
        libraryId: u.library_id,
        role: u.role,
        passwordOk: known[u.email] ? bcrypt.compareSync(known[u.email], u.password_hash) : null,
      })),
      books: await scalar<number>("SELECT COUNT(*) FROM resources WHERE kind = 'ebook'"),
      settings: getSettings().siteName,
      storage: blobMode() ? 'blob' : 'local',
      remoteDatabase: Boolean(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL),
    });
  }));
  return router;
}
