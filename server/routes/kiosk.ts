import { Router } from 'express';
import { z } from 'zod';
import { all, get, nowIso, run, scalar } from '../db.js';
import { asyncH, cleanSearch, conflict, notFound, paginated, pagination, parse } from '../http.js';
import { requireStaff } from '../auth.js';
import { getSettings } from '../settings.js';

const router = Router();

/**
 * Front desk.
 *
 * The kiosk screen is operated by library staff (librarian or admin): they type
 * the visitor's name, what they brought and the book they are taking. Every
 * kiosk endpoint therefore requires a staff session, and the visit records who
 * signed the visitor in. Students never use the kiosk — they create an account
 * and read books online.
 */

const WINDOW_MS = 5 * 60_000;
// A whole class can sign in within a few minutes at the same kiosk, so the
// threshold is generous; it exists to stop scripted abuse, not normal traffic.
const MAX_PER_WINDOW = 90;
const attempts = new Map<string, number[]>();

function clientKey(req: import('express').Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  attempts.set(key, recent);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  return false;
}

function mapKioskVisit(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    className: row.class_name,
    house: row.house,
    itemBrought: row.item_brought,
    bookTaken: row.book_taken,
    purpose: row.purpose,
    signedInAt: row.signed_in_at,
    signedOutAt: row.signed_out_at,
    isInside: row.signed_out_at === null,
    minutesInside: row.signed_out_at
      ? Math.max(0, Math.round((new Date(row.signed_out_at).getTime() - new Date(row.signed_in_at).getTime()) / 60000))
      : Math.max(0, Math.round((Date.now() - new Date(row.signed_in_at).getTime()) / 60000)),
  };
}

router.get('/kiosk/summary', requireStaff, asyncH(async (_req, res) => {
  const settings = getSettings();
  const today = nowIso().slice(0, 10);
  res.json({
    schoolName: settings.schoolName,
    schoolShortName: settings.schoolShortName,
    motto: settings.motto,
    logoUrl: settings.logoUrl,
    inside: get<any>('SELECT COUNT(*) AS n FROM library_visits WHERE signed_out_at IS NULL')?.n ?? 0,
    visitsToday: get<any>('SELECT COUNT(*) AS n FROM library_visits WHERE date(signed_in_at) = date(?)', [today])?.n ?? 0,
    books: get<any>("SELECT COUNT(*) AS n FROM resources WHERE kind = 'ebook' AND status = 'approved'")?.n ?? 0,
    today,
  });
}));

const signInSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  // Class is typed by the member of staff running the kiosk, e.g. "2 Science 1".
  className: z.string().trim().max(60).optional().nullable(),
  // The house is always one of four; stored as "House 1" … "House 4".
  house: z.string().trim().regex(/^[1-5]$/, 'Choose House 1, 2, 3, 4 or 5.').optional().nullable().or(z.literal('')),
  itemBrought: z.string().trim().max(120).optional().nullable(),
  purpose: z.string().trim().max(60).optional().nullable(),
  email: z.string().trim().email('Enter a valid email address.').max(160).optional().nullable().or(z.literal('')),
});

const empty = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
};

router.post('/kiosk/sign-in', requireStaff, asyncH(async (req, res) => {
  if (rateLimited(clientKey(req))) {
    throw conflict('Too many sign-ins from this device. Please wait a moment before trying again.');
  }
  const data = parse(signInSchema, req.body);
  const existing = get<any>(
    `SELECT id, signed_in_at FROM library_visits
     WHERE signed_out_at IS NULL AND LOWER(full_name) = LOWER(?) ORDER BY id DESC LIMIT 1`,
    [data.fullName.trim()]
  );
  if (existing) {
    throw conflict(`${data.fullName.trim()} is already signed in. Sign out first, or ask the librarian to close the visit.`, {
      visitId: existing.id,
      signedInAt: existing.signed_in_at,
    });
  }

  // Match a name against the member list so the visit can link to their account.
  const member = get<any>(
    `SELECT id, first_name, last_name, email, class_name, house FROM users
     WHERE status = 'active' AND LOWER(first_name || ' ' || last_name) = LOWER(?) LIMIT 1`,
    [data.fullName.trim()]
  );

  const stamp = nowIso();
  const result = run(
    `INSERT INTO library_visits (user_id, full_name, email, class_name, house, item_brought, book_taken,
       purpose, signed_in_by, signed_in_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      member?.id ?? null,
      member ? `${member.first_name} ${member.last_name}` : data.fullName.trim(),
      empty(data.email)?.toLowerCase() ?? member?.email ?? null,
      empty(data.className) ?? member?.class_name ?? null,
      data.house && /^[1-5]$/.test(data.house) ? `House ${data.house}` : null,
      empty(data.itemBrought),
      null,
      empty(data.purpose),
      req.user!.id,
      stamp, stamp, stamp,
    ]
  );
  const row = get<any>('SELECT * FROM library_visits WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ visit: mapKioskVisit(row), summary: visitSummary() });
}));

/** Public landing data: school identity plus the shape of the library today. */
router.get('/public/summary', asyncH(async (_req, res) => {
  const settings = getSettings();
  const today = nowIso().slice(0, 10);
  res.json({
    schoolName: settings.schoolName,
    schoolShortName: settings.schoolShortName,
    motto: settings.motto,
    logoUrl: settings.logoUrl,
    address: settings.address,
    email: settings.email,
    phone: settings.phone,
    books: get<any>("SELECT COUNT(*) AS n FROM resources WHERE kind = 'ebook' AND status = 'approved'")?.n ?? 0,
    inside: get<any>('SELECT COUNT(*) AS n FROM library_visits WHERE signed_out_at IS NULL')?.n ?? 0,
    visitsToday: get<any>('SELECT COUNT(*) AS n FROM library_visits WHERE date(signed_in_at) = date(?)', [today])?.n ?? 0,
  });
}));

/**
 * Who is inside right now, for the staff kiosk and dashboard.
 */
router.get('/kiosk/inside', requireStaff, asyncH(async (_req, res) => {
  const rows = all<any>(
    `SELECT id, full_name, class_name, house, purpose, book_taken, signed_in_at FROM library_visits
     WHERE signed_out_at IS NULL ORDER BY signed_in_at DESC LIMIT 12`
  );
  res.json({
    count: get<any>('SELECT COUNT(*) AS n FROM library_visits WHERE signed_out_at IS NULL')?.n ?? 0,
    recent: rows.map((row) => ({
      id: row.id,
      name: cleanSearch(row.full_name),
      className: row.class_name,
      house: row.house,
      purpose: row.purpose,
      bookTaken: row.book_taken,
      signedInAt: row.signed_in_at,
    })),
  });
}));


/* ── Staff view of the sign-in register ───────────────────────────────── */

function visitSummary() {
  const inside = scalar<number>('SELECT COUNT(*) FROM library_visits WHERE signed_out_at IS NULL');
  const visitsToday = scalar<number>("SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) = date('now')");
  const walkInsToday = scalar<number>("SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) = date('now') AND user_id IS NULL");
  const averageMinutes = scalar<number>(
    `SELECT COALESCE(AVG((julianday(signed_out_at) - julianday(signed_in_at)) * 1440), 0)
     FROM library_visits WHERE signed_out_at IS NOT NULL AND date(signed_in_at) = date('now')`
  );
  return {
    inside,
    visitsToday,
    walkInsToday,
    averageMinutes: Math.round(Number(averageMinutes ?? 0)),
  };
}

router.get('/visits', requireStaff, asyncH(async (req, res) => {
  const p = pagination(req, 25, 200);
  const where = ['1 = 1'];
  const params: (string | number)[] = [];
  if (req.query.status === 'inside') where.push('signed_out_at IS NULL');
  if (req.query.date) { where.push('date(signed_in_at) = date(?)'); params.push(String(req.query.date)); }
  if (req.query.q) {
    const q = `%${cleanSearch(String(req.query.q)).toLowerCase()}%`;
    where.push('(LOWER(full_name) LIKE ? OR LOWER(COALESCE(class_name, \'\')) LIKE ? OR LOWER(COALESCE(house, \'\')) LIKE ? OR LOWER(COALESCE(book_taken, \'\')) LIKE ?)');
    params.push(q, q, q, q);
  }
  const filter = `WHERE ${where.join(' AND ')}`;
  const rows = all<any>(
    `SELECT * FROM library_visits ${filter} ORDER BY signed_out_at IS NOT NULL, signed_in_at DESC LIMIT ? OFFSET ?`,
    [...params, p.pageSize, p.offset]
  );
  const total = scalar<number>(`SELECT COUNT(*) FROM library_visits ${filter}`, params);
  res.json({
    ...paginated(rows.map((row) => ({ ...mapKioskVisit(row), matchedMember: row.user_id !== null })), total, p),
    summary: visitSummary(),
  });
}));

const signOutSchema = z.object({
  books: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

router.post('/visits/:id/sign-out', requireStaff, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const data = parse(signOutSchema, req.body ?? {});
  const row = get<any>('SELECT * FROM library_visits WHERE id = ?', [id]);
  if (!row) throw notFound('That visit could not be found.');
  if (!row.signed_out_at) {
    const stamp = nowIso();
    // Staff choose the books the visitor is taking as they leave. An explicit
    // empty list clears the field; omitting it leaves whatever was recorded.
    if (data.books !== undefined) {
      const books = Array.from(new Set(data.books.map((book) => book.trim()).filter(Boolean)));
      run('UPDATE library_visits SET signed_out_at = ?, book_taken = ?, updated_at = ? WHERE id = ?',
        [stamp, books.length ? books.join(', ') : null, stamp, id]);
    } else {
      run('UPDATE library_visits SET signed_out_at = ?, updated_at = ? WHERE id = ?', [stamp, stamp, id]);
    }
  }
  res.json({ visit: mapKioskVisit(get<any>('SELECT * FROM library_visits WHERE id = ?', [id])), summary: visitSummary() });
}));

router.get('/visits/export', requireStaff, asyncH(async (req, res) => {
  const date = String(req.query.date ?? nowIso().slice(0, 10));
  const rows = all<any>(
    'SELECT * FROM library_visits WHERE date(signed_in_at) = date(?) ORDER BY signed_in_at ASC',
    [date]
  );
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Name', 'Class', 'House', 'Purpose', 'Item brought', 'Books taken', 'Signed in', 'Signed out'];
  const lines = [header.map(escape).join(',')];
  for (const row of rows) {
    lines.push([
      row.full_name, row.class_name, row.house, row.purpose, row.item_brought, row.book_taken,
      row.signed_in_at, row.signed_out_at,
    ].map(escape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="library-signins-${date}.csv"`);
  res.send(lines.join('\r\n'));
}));

export default router;
