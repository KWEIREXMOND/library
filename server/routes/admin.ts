import { Router } from 'express';
import { z } from 'zod';
import { all, get, nowIso, run, scalar } from '../db.js';
import { hashPassword, requireAdmin } from '../auth.js';
import {
  asyncH, audit, badRequest, cleanSearch, conflict, notFound, notifyMany, paginated, pagination, parse,
} from '../http.js';

const router = Router();

/**
 * Administration.
 *
 * The people directory merges the two kinds of person the library knows about:
 * registered accounts (students, teachers, staff) and the walk-in identities
 * that only exist in the kiosk register. Broadcasts are the announcements the
 * library already stores; the activity feed is the audit trail.
 */

type PersonKind = 'member' | 'walkin';

const PEOPLE_CTE = `
  WITH people AS (
    SELECT 'member' AS kind,
           CAST(u.id AS TEXT) AS key,
           u.id AS user_id,
           u.library_id AS library_id,
           u.first_name || ' ' || u.last_name AS name,
           u.email AS email,
           u.role AS role,
           u.status AS status,
           u.class_name AS class_name,
           u.house AS house,
           u.created_at AS joined_at,
           u.last_login AS last_login,
           (SELECT COUNT(*) FROM library_visits v WHERE v.user_id = u.id) AS visits,
           (SELECT MAX(v.signed_in_at) FROM library_visits v WHERE v.user_id = u.id) AS last_visit
    FROM users u
    UNION ALL
    SELECT 'walkin' AS kind,
           LOWER(v.full_name) AS key,
           NULL AS user_id,
           NULL AS library_id,
           MAX(v.full_name) AS name,
           MAX(v.email) AS email,
           NULL AS role,
           NULL AS status,
           (SELECT x.class_name FROM library_visits x
            WHERE x.user_id IS NULL AND LOWER(x.full_name) = LOWER(v.full_name)
            ORDER BY x.signed_in_at DESC LIMIT 1) AS class_name,
           (SELECT x.house FROM library_visits x
            WHERE x.user_id IS NULL AND LOWER(x.full_name) = LOWER(v.full_name)
            ORDER BY x.signed_in_at DESC LIMIT 1) AS house,
           MIN(v.signed_in_at) AS joined_at,
           NULL AS last_login,
           COUNT(*) AS visits,
           MAX(v.signed_in_at) AS last_visit
    FROM library_visits v
    WHERE v.user_id IS NULL
    GROUP BY LOWER(v.full_name)
  )`;

function peopleFilter(kind: string, query: string) {
  const where = ["(? = 'all' OR kind = ?)"];
  const params: (string | number)[] = [kind, kind];
  if (query) {
    where.push(`(LOWER(name) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(library_id, '')) LIKE ? OR LOWER(COALESCE(class_name, '')) LIKE ?)`);
    params.push(query, query, query, query);
  }
  return { where: where.join(' AND '), params };
}

type PersonRow = {
  kind: PersonKind; key: string; user_id: number | null; library_id: string | null;
  name: string; email: string | null; role: string | null; status: string | null;
  class_name: string | null; house: string | null; joined_at: string | null;
  last_login: string | null; visits: number; last_visit: string | null;
};

const mapPerson = (row: PersonRow) => ({
  kind: row.kind,
  key: row.key,
  userId: row.user_id,
  libraryId: row.library_id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  className: row.class_name,
  house: row.house,
  joinedAt: row.joined_at,
  lastLogin: row.last_login,
  visits: Number(row.visits),
  lastVisit: row.last_visit,
});

/** Everyone: members and walk-in visitors, searchable and filterable. */
router.get('/people', requireAdmin, asyncH(async (req, res) => {
  const kind = ['all', 'member', 'walkin'].includes(String(req.query.kind)) ? String(req.query.kind) : 'all';
  const query = cleanSearch(String(req.query.q ?? '')).toLowerCase();
  const search = query ? `%${query}%` : '';
  const { where, params } = peopleFilter(kind, search);
  const p = pagination(req, 20, 100);

  const rows = await all<PersonRow>(
    `${PEOPLE_CTE}
     SELECT * FROM people WHERE ${where}
     ORDER BY COALESCE(last_visit, joined_at) DESC, name COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    [...params, p.pageSize, p.offset]
  );
  const total = await scalar<number>(`${PEOPLE_CTE} SELECT COUNT(*) FROM people WHERE ${where}`, params);

  const summary = {
    members: await scalar<number>('SELECT COUNT(*) FROM users'),
    students: await scalar<number>("SELECT COUNT(*) FROM users WHERE role = 'student'"),
    suspended: await scalar<number>("SELECT COUNT(*) FROM users WHERE status = 'suspended'"),
    walkIns: await scalar<number>(
      'SELECT COUNT(*) FROM (SELECT 1 FROM library_visits WHERE user_id IS NULL GROUP BY LOWER(full_name))'
    ),
  };

  res.json({ ...paginated(rows.map(mapPerson), total, p), summary });
}));

/** One person plus their recent visits. */
router.get('/people/:kind/:key', requireAdmin, asyncH(async (req, res) => {
  const kind = req.params.kind as PersonKind;
  const key = decodeURIComponent(req.params.key);

  if (kind === 'member') {
    const row = await get<PersonRow>(
      `${PEOPLE_CTE}
       SELECT * FROM people WHERE kind = 'member' AND key = ?`,
      [key]
    );
    if (!row) throw notFound('That person is not in the register.');
    const visits = await all(
      `SELECT id, full_name, class_name, house, purpose, book_taken, signed_in_at, signed_out_at, minutes
       FROM (SELECT *, CAST((julianday(COALESCE(signed_out_at, ?)) - julianday(signed_in_at)) * 1440 AS INTEGER) AS minutes
             FROM library_visits WHERE user_id = ?)
       ORDER BY signed_in_at DESC LIMIT 12`,
      [nowIso(), row.user_id]
    );
    res.json({ person: mapPerson(row), visits });
    return;
  }

  if (kind !== 'walkin') throw notFound('Unknown person type.');
  const rows = await all<any>(
    `SELECT id, full_name, class_name, house, purpose, book_taken, signed_in_at, signed_out_at,
            CAST((julianday(COALESCE(signed_out_at, ?)) - julianday(signed_in_at)) * 1440 AS INTEGER) AS minutes
     FROM library_visits
     WHERE user_id IS NULL AND LOWER(full_name) = ?
     ORDER BY signed_in_at DESC LIMIT 12`,
    [nowIso(), key.toLowerCase()]
  );
  if (!rows.length) throw notFound('That visitor is not in the register.');

  const person = await get<PersonRow>(
    `${PEOPLE_CTE}
     SELECT * FROM people WHERE kind = 'walkin' AND key = ?`,
    [key.toLowerCase()]
  );
  res.json({ person: person ? mapPerson(person) : null, visits: rows });
}));

/** Admin: suspend or re-activate a library account. */
router.patch('/people/:id/status', requireAdmin, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('That account is not valid.');
  if (id === req.user!.id) throw badRequest('You cannot change the status of your own account.');
  const schema = z.object({ status: z.enum(['active', 'suspended']) });
  const { status } = parse(schema, req.body);
  const user = await get<any>('SELECT id, first_name, last_name, status FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('That account does not exist.');
  if (user.status === status) throw conflict(`${user.first_name} is already ${status === 'active' ? 'active' : 'suspended'}.`);
  // Bumping token_version signs the account out everywhere it is already open.
  await run('UPDATE users SET status = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
  await audit({
    userId: req.user!.id,
    action: status === 'suspended' ? 'user.suspend' : 'user.activate',
    entityType: 'user',
    entityId: id,
    summary: `${status === 'suspended' ? 'Suspended' : 'Re-activated'} ${user.first_name} ${user.last_name}`,
  });
  res.json({ user: { id, status } });
}));

/** Admin: set a temporary password for someone who cannot sign in. */
router.post('/people/:id/reset-password', requireAdmin, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('That account is not valid.');
  const schema = z.object({
    password: z.string().min(8, 'Use at least 8 characters.').regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.'),
  });
  const { password } = parse(schema, req.body);
  if (id === req.user!.id) throw badRequest('Use your own account menu to change your password.');
  const user = await get<any>('SELECT id, first_name, last_name FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('That account does not exist.');
  await run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [hashPassword(password), nowIso(), id]);
  await run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [id]);
  await audit({
    userId: req.user!.id,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: id,
    summary: `Reset the password for ${user.first_name} ${user.last_name}`,
  });
  res.json({ ok: true });
}));

/** Admin: sign someone out of every device without changing their password. */
router.post('/people/:id/sign-out', requireAdmin, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('That account is not valid.');
  if (id === req.user!.id) throw badRequest('Use the sign-out button in your own account menu.');
  const user = await get<any>('SELECT id, first_name, last_name FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('That account does not exist.');
  await run('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
  await audit({
    userId: req.user!.id,
    action: 'user.force_signout',
    entityType: 'user',
    entityId: id,
    summary: `Signed ${user.first_name} ${user.last_name} out of every device`,
  });
  res.json({ ok: true });
}));

/** CSV of the current filter, for the front desk or the head teacher. */
router.get('/people/export.csv', requireAdmin, asyncH(async (req, res) => {
  const kind = ['all', 'member', 'walkin'].includes(String(req.query.kind)) ? String(req.query.kind) : 'all';
  const query = cleanSearch(String(req.query.q ?? '')).toLowerCase();
  const { where, params } = peopleFilter(kind, query ? `%${query}%` : '');
  const rows = (await all<PersonRow>(
    `${PEOPLE_CTE} SELECT * FROM people WHERE ${where}
     ORDER BY COALESCE(last_visit, joined_at) DESC, name COLLATE NOCASE`,
    params
  )).map(mapPerson);

  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Type', 'Library ID', 'Name', 'Email', 'Role', 'Status', 'Class', 'House', 'Visits', 'Last visit', 'Joined'];
  const lines = rows.map((row) => [
    row.kind === 'member' ? 'Member' : 'Walk-in',
    row.libraryId ?? '', row.name, row.email ?? '', row.role ?? '', row.status ?? '',
    row.className ?? '', row.house ?? '', row.visits, row.lastVisit ?? '', row.joinedAt ?? '',
  ].map(quote).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="library-people-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header.map(quote).join(','), ...lines].join('\r\n'));
}));

// ── Broadcasts ────────────────────────────────────────────────────────
type Announcement = {
  id: number; title: string; body: string; audience: string; pinned: number;
  status: string; publish_at: string; expires_at: string | null; created_at: string; author: string | null;
  delivered: number; seen: number;
};

const mapAnnouncement = (row: Announcement) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  audience: row.audience,
  pinned: Boolean(row.pinned),
  status: row.status,
  publishAt: row.publish_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  author: row.author,
  delivered: Number(row.delivered ?? 0),
  seen: Number(row.seen ?? 0),
});

const ANNOUNCEMENT_SELECT = `
  SELECT a.*, u.first_name || ' ' || u.last_name AS author,
         (SELECT COUNT(*) FROM notifications n WHERE n.dedupe_key LIKE 'announcement:' || a.id || ':%') AS delivered,
         (SELECT COUNT(*) FROM notifications n WHERE n.dedupe_key LIKE 'announcement:' || a.id || ':%' AND n.read_at IS NOT NULL) AS seen
  FROM announcements a LEFT JOIN users u ON u.id = a.created_by`;

/** The notices the current visitor should see (public, also used by the staff shell). */
router.get('/announcements', asyncH(async (req, res) => {
  const role = req.user?.role;
  const audiences = role === 'student' ? ['all', 'students']
    : role === 'teacher' ? ['all', 'teachers']
      : role === 'librarian' || role === 'admin' ? ['all', 'staff']
        : ['all'];
  const stamp = nowIso();
  const rows = await all<Announcement>(
    `${ANNOUNCEMENT_SELECT}
     WHERE a.status = 'published' AND a.publish_at <= ?
       AND (a.expires_at IS NULL OR a.expires_at > ?)
       AND a.audience IN (${audiences.map(() => '?').join(',')})
     ORDER BY a.pinned DESC, a.publish_at DESC LIMIT 6`,
    [stamp, stamp, ...audiences]
  );
  res.json({ rows: rows.map(mapAnnouncement) });
}));

/** Admin: every broadcast, including drafts and archived ones. */
router.get('/announcements/manage', requireAdmin, asyncH(async (req, res) => {
  const p = pagination(req, 20, 100);
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  const status = String(req.query.status ?? 'all');
  if (['published', 'draft', 'archived'].includes(status)) {
    where.push('a.status = ?');
    params.push(status);
  }
  const query = cleanSearch(String(req.query.q ?? '')).toLowerCase();
  if (query) {
    where.push('(LOWER(a.title) LIKE ? OR LOWER(a.body) LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
  }
  const filter = where.join(' AND ');
  const rows = await all<Announcement>(
    `${ANNOUNCEMENT_SELECT} WHERE ${filter} ORDER BY a.pinned DESC, a.publish_at DESC LIMIT ? OFFSET ?`,
    [...params, p.pageSize, p.offset]
  );
  const total = await scalar<number>(`SELECT COUNT(*) FROM announcements a WHERE ${filter}`, params);
  const audiences = Object.fromEntries(
    await Promise.all(
      Object.entries(AUDIENCE_ROLES).map(async ([key, roles]) => [
        key,
        await scalar<number>(
          `SELECT COUNT(*) FROM users WHERE status = 'active' AND role IN (${roles.map(() => '?').join(',')})`,
          roles
        ),
      ] as const)
    )
  );
  res.json({ ...paginated(rows.map(mapAnnouncement), total, p), audiences });
}));

const broadcastSchema = z.object({
  title: z.string().trim().min(3, 'Give the notice a title.').max(140),
  body: z.string().trim().min(3, 'Write the message.').max(2000),
  audience: z.enum(['all', 'students', 'teachers', 'staff']),
  pinned: z.boolean().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.').nullable().optional(),
});

const expiryOf = (date?: string | null) => (date ? `${date}T23:59:59.999Z` : null);

/** Which account roles receive a given audience. */
const AUDIENCE_ROLES: Record<'all' | 'students' | 'teachers' | 'staff', string[]> = {
  all: ['student', 'teacher', 'librarian', 'admin'],
  students: ['student'],
  teachers: ['teacher'],
  staff: ['librarian', 'admin'],
};

router.post('/announcements', requireAdmin, asyncH(async (req, res) => {
  const data = parse(broadcastSchema, req.body);
  const stamp = nowIso();
  const result = await run(
    `INSERT INTO announcements (title, body, audience, pinned, status, publish_at, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?)`,
    [data.title, data.body, data.audience, data.pinned ? 1 : 0, stamp, expiryOf(data.expiresAt), req.user!.id, stamp]
  );
  const recipients = await all<{ id: number }>(
    `SELECT id FROM users WHERE status = 'active' AND role IN (${AUDIENCE_ROLES[data.audience].map(() => '?').join(',')})`,
    AUDIENCE_ROLES[data.audience]
  );
  await notifyMany(recipients.map((recipient) => recipient.id), {
    type: 'broadcast',
    title: data.title,
    body: data.body,
    dedupeKey: `announcement:${result.lastInsertRowid}`,
  });
  await audit({
    userId: req.user!.id,
    action: 'announcement.publish',
    entityType: 'announcement',
    entityId: result.lastInsertRowid,
    summary: `Published “${data.title}” to ${data.audience} (${recipients.length} inbox${recipients.length === 1 ? '' : 'es'})`,
  });
  const row = await get<Announcement>(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [result.lastInsertRowid]);
  res.status(201).json({ announcement: mapAnnouncement(row!) });
}));

router.patch('/announcements/:id', requireAdmin, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const row = await get<any>('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!row) throw notFound('That broadcast does not exist.');
  const schema = z.object({
    pinned: z.boolean().optional(),
    status: z.enum(['published', 'archived']).optional(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  });
  const data = parse(schema, req.body);
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (data.pinned !== undefined) { sets.push('pinned = ?'); params.push(data.pinned ? 1 : 0); }
  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.expiresAt !== undefined) { sets.push('expires_at = ?'); params.push(expiryOf(data.expiresAt)); }
  if (!sets.length) throw badRequest('Nothing to change.');
  params.push(id);
  await run(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`, params);
  await audit({
    userId: req.user!.id,
    action: data.status === 'archived' ? 'announcement.archive' : 'announcement.update',
    entityType: 'announcement',
    entityId: id,
    summary: `Updated broadcast “${row.title}”`,
  });
  res.json({ announcement: mapAnnouncement((await get<Announcement>(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [id]))!) });
}));

router.delete('/announcements/:id', requireAdmin, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const row = await get<any>('SELECT title FROM announcements WHERE id = ?', [id]);
  if (!row) throw notFound('That broadcast does not exist.');
  await run('DELETE FROM notifications WHERE dedupe_key LIKE ?', [`announcement:${id}:%`]);
  await run('DELETE FROM announcements WHERE id = ?', [id]);
  await audit({
    userId: req.user!.id,
    action: 'announcement.delete',
    entityType: 'announcement',
    entityId: id,
    summary: `Deleted broadcast “${row.title}”`,
  });
  res.json({ ok: true });
}));

// ── Activity feed ─────────────────────────────────────────────────────
router.get('/activity', requireAdmin, asyncH(async (req, res) => {
  const p = pagination(req, 25, 100);
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  const query = cleanSearch(String(req.query.q ?? '')).toLowerCase();
  if (query) {
    where.push(`(LOWER(COALESCE(l.summary, '')) LIKE ? OR LOWER(l.action) LIKE ? OR LOWER(COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE ?)`);
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  const filter = where.join(' AND ');
  const rows = await all(
    `SELECT l.id, l.action, l.entity_type AS entityType, l.entity_id AS entityId, l.summary,
            l.ip, l.created_at AS createdAt,
            CASE WHEN u.id IS NULL THEN 'System' ELSE u.first_name || ' ' || u.last_name END AS actor,
            u.role AS actorRole
     FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
     WHERE ${filter}
     ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...params, p.pageSize, p.offset]
  );
  const total = await scalar<number>(
    `SELECT COUNT(*) FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id WHERE ${filter}`,
    params
  );
  res.json(paginated(rows, total, p));
}));

export default router;
