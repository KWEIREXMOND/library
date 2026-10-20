import { Router } from 'express';
import { all, scalar } from '../db.js';
import { requireStaff } from '../auth.js';
import { asyncH } from '../http.js';

const router = Router();

/**
 * Basic library analytics.
 *
 * Everything is derived from the tables the two jobs already write: walk-in
 * visits from the kiosk, and the online books from the e-book library. There is
 * no separate tracking table, so the numbers can never drift from the register.
 */
router.get('/analytics', requireStaff, asyncH(async (req, res) => {
  const days = Math.min(90, Math.max(7, Math.round(Number(req.query.days) || 30)));
  const since = `-${days - 1} days`;

  const dayCount = async (modifier: string) => await scalar<number>(
    `SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) = date('now', ?)`, [modifier]
  );
  const rangeCount = async (where: string, params: (string | number)[] = []) => await scalar<number>(
    `SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) >= date('now', ?) ${where}`, [since, ...params]
  );

  const inside = await scalar<number>('SELECT COUNT(*) FROM library_visits WHERE signed_out_at IS NULL');
  const visitsToday = await dayCount('+0 days');
  const yesterday = await dayCount('-1 day');
  const lastWeek = await scalar<number>(
    `SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) >= date('now', '-6 days')`
  );
  const rangeVisits = await rangeCount('');
  const walkIns = await rangeCount('AND user_id IS NULL');
  const uniqueVisitors = await scalar<number>(
    `SELECT COUNT(DISTINCT LOWER(full_name)) FROM library_visits WHERE date(signed_in_at) >= date('now', ?)`, [since]
  );
  const repeatVisitors = await scalar<number>(
    `SELECT COUNT(*) FROM (
       SELECT LOWER(full_name) AS name FROM library_visits
       WHERE date(signed_in_at) >= date('now', ?)
       GROUP BY name HAVING COUNT(*) > 1
     )`, [since]
  );
  const averageRaw = await scalar<number | null>(
    `SELECT AVG((julianday(signed_out_at) - julianday(signed_in_at)) * 1440)
     FROM library_visits
     WHERE signed_out_at IS NOT NULL AND date(signed_in_at) >= date('now', ?)`, [since]
  );

  const seriesRows = await all<{ day: string; count: number }>(
    `SELECT date(signed_in_at) AS day, COUNT(*) AS count
     FROM library_visits
     WHERE date(signed_in_at) >= date('now', ?)
     GROUP BY day ORDER BY day`, [since]
  );
  const counts = new Map(seriesRows.map((row) => [String(row.day), Number(row.count)]));
  const series: Array<{ date: string; label: string; count: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    const [, month, day] = date.split('-');
    series.push({ date, label: `${day}/${month}`, count: counts.get(date) ?? 0 });
  }

  const houses = (await all<{ house: string; count: number }>(
    `SELECT COALESCE(NULLIF(house, ''), 'Not given') AS house, COUNT(*) AS count
     FROM library_visits
     WHERE date(signed_in_at) >= date('now', ?)
     GROUP BY house ORDER BY count DESC`, [since]
  )).map((row) => ({ house: row.house, count: Number(row.count) }));

  const purposes = (await all<{ purpose: string; count: number }>(
    `SELECT COALESCE(NULLIF(purpose, ''), 'Not given') AS purpose, COUNT(*) AS count
     FROM library_visits
     WHERE date(signed_in_at) >= date('now', ?)
     GROUP BY purpose ORDER BY count DESC LIMIT 6`, [since]
  )).map((row) => ({ purpose: row.purpose, count: Number(row.count) }));

  const hours = await all<{ hour: string; count: number }>(
    `SELECT strftime('%H', signed_in_at) AS hour, COUNT(*) AS count
     FROM library_visits
     WHERE date(signed_in_at) >= date('now', ?)
     GROUP BY hour ORDER BY hour`, [since]
  );
  const hourCounts = new Map(hours.map((row) => [Number(row.hour), Number(row.count)]));
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourCounts.get(hour) ?? 0 }));

  const staff = (await all<{ name: string; count: number }>(
    `SELECT u.first_name || ' ' || u.last_name AS name, COUNT(*) AS count
     FROM library_visits v JOIN users u ON u.id = v.signed_in_by
     WHERE date(v.signed_in_at) >= date('now', ?)
     GROUP BY v.signed_in_by ORDER BY count DESC LIMIT 5`, [since]
  )).map((row) => ({ name: row.name, count: Number(row.count) }));

  const booksTotal = await scalar<number>(`SELECT COUNT(*) FROM resources WHERE kind = 'ebook'`);
  const booksPublished = await scalar<number>(`SELECT COUNT(*) FROM resources WHERE kind = 'ebook' AND status = 'approved'`);
  const booksViews = await scalar<number>(`SELECT COALESCE(SUM(view_count), 0) FROM resources WHERE kind = 'ebook'`);
  const booksDownloads = await scalar<number>(`SELECT COALESCE(SUM(download_count), 0) FROM resources WHERE kind = 'ebook'`);
  const booksAdded = await scalar<number>(
    `SELECT COUNT(*) FROM resources WHERE kind = 'ebook' AND date(created_at) >= date('now', ?)`, [since]
  );
  const topViewed = (await all<{ id: number; title: string; author: string | null; views: number }>(
    `SELECT id, title, author, view_count AS views FROM resources
     WHERE kind = 'ebook' AND status = 'approved'
     ORDER BY view_count DESC, title LIMIT 5`
  )).map((row) => ({ id: Number(row.id), title: row.title, author: row.author, views: Number(row.views) }));

  // Books are typed as free text at sign-out, so tally the titles in JavaScript.
  const takenRows = await all<{ book_taken: string }>(
    `SELECT book_taken FROM library_visits
     WHERE book_taken IS NOT NULL AND book_taken <> '' AND date(signed_in_at) >= date('now', ?)`, [since]
  );
  const takenCounts = new Map<string, number>();
  for (const row of takenRows) {
    for (const raw of String(row.book_taken).split(',')) {
      const title = raw.trim();
      if (!title) continue;
      takenCounts.set(title, (takenCounts.get(title) ?? 0) + 1);
    }
  }
  const mostTaken = [...takenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  const members = (await all<{ role: string; count: number }>('SELECT role, COUNT(*) AS count FROM users GROUP BY role'))
    .map((row) => ({ role: row.role, count: Number(row.count) }));
  const memberCount = (role: string) => members.find((row) => row.role === role)?.count ?? 0;
  const newMembers = await scalar<number>(
    `SELECT COUNT(*) FROM users WHERE date(created_at) >= date('now', ?)`, [since]
  );

  // Book requests were part of the retired circulation module; analytics must
  // never assume those tables exist.
  res.json({
    range: { days, from: series[0]?.date ?? null, to: series[series.length - 1]?.date ?? null },
    generatedAt: new Date().toISOString(),
    visits: {
      inside: Number(inside),
      today: Number(visitsToday),
      yesterday: Number(yesterday),
      lastWeek: Number(lastWeek),
      range: Number(rangeVisits),
      walkIns: Number(walkIns),
      unique: Number(uniqueVisitors),
      repeat: Number(repeatVisitors),
      averageMinutes: Math.round(Number(averageRaw ?? 0)),
    },
    members: {
      total: members.reduce((total, row) => total + row.count, 0),
      students: memberCount('student'),
      teachers: memberCount('teacher'),
      staff: memberCount('librarian') + memberCount('admin'),
      newInRange: Number(newMembers),
    },
    books: {
      total: Number(booksTotal),
      published: Number(booksPublished),
      drafts: Number(booksTotal) - Number(booksPublished),
      views: Number(booksViews),
      downloads: Number(booksDownloads),
      addedInRange: Number(booksAdded),
      topViewed,
      mostTaken,
    },
    series,
    houses,
    purposes,
    peakHours,
    staff,
  });
}));

export default router;
