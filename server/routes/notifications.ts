import { Router } from 'express';
import { all, get, nowIso, run, scalar } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncH, badRequest, notFound, paginated, pagination } from '../http.js';

/**
 * The signed-in reader's inbox. Broadcasts land here as well as on the public
 * notice board, so a message reaches members whether or not they open the site
 * that day.
 */
const router = Router();

type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const mapNotification = (row: NotificationRow) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.read_at,
  createdAt: row.created_at,
});

router.get('/', requireAuth, asyncH(async (req, res) => {
  const p = pagination(req, 20, 50);
  const rows = await all<NotificationRow>(
    `SELECT id, type, title, body, link, read_at, created_at FROM notifications
     WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [req.user!.id, p.pageSize, p.offset]
  );
  const total = await scalar<number>('SELECT COUNT(*) FROM notifications WHERE user_id = ?', [req.user!.id]);
  const unread = await scalar<number>('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user!.id]);
  res.json({ ...paginated(rows.map(mapNotification), total, p), unread });
}));

router.get('/unread', requireAuth, asyncH(async (req, res) => {
  const unread = await scalar<number>('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user!.id]);
  res.json({ unread });
}));

router.post('/:id/read', requireAuth, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('That message is not valid.');
  const row = await get<{ id: number }>('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, req.user!.id]);
  if (!row) throw notFound('That message is not in your inbox.');
  await run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [nowIso(), id, req.user!.id]);
  res.json({ ok: true });
}));

router.post('/read-all', requireAuth, asyncH(async (req, res) => {
  const result = await run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), req.user!.id]);
  res.json({ ok: true, marked: Number(result.changes) });
}));

export default router;
