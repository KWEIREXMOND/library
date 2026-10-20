import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { all, get, run, nowIso } from './db.js';
import { getSettings } from './settings.js';
import { emailConfigured, sendMail } from './mail.js';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'You need to sign in to continue.') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);

/** Wrap an async route so thrown errors reach the error middleware. */
export function asyncH<T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): ReturnType<T['parse']> {
  try {
    return schema.parse(data) as ReturnType<T['parse']>;
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      throw new HttpError(422, 'Please check the highlighted fields and try again.', fieldErrors);
    }
    throw err;
  }
}

export type Pagination = { page: number; pageSize: number; offset: number };
export function pagination(req: Request, defaultSize = 12, maxSize = 100): Pagination {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(req.query.pageSize) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginated<T>(rows: T[], total: number, p: Pagination) {
  return { rows, total, page: p.page, pageSize: p.pageSize, pages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function audit(opts: {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  summary?: string;
  details?: unknown;
  ip?: string;
}) {
  run(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, summary, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.userId ?? null,
      opts.action,
      opts.entityType ?? null,
      opts.entityId != null ? String(opts.entityId) : null,
      opts.summary ?? null,
      opts.details != null ? JSON.stringify(opts.details) : null,
      opts.ip ?? null,
      nowIso(),
    ]
  );
}

export function notify(opts: {
  userId: number;
  type: string;
  title: string;
  body: string;
  link?: string;
  dedupeKey?: string;
  email?: boolean;
  emailSubject?: string;
  emailBody?: string;
}) {
  const stamp = nowIso();
  let notificationId = 0;
  try {
    const res = run(
      `INSERT INTO notifications (user_id, type, title, body, link, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [opts.userId, opts.type, opts.title, opts.body, opts.link ?? null, opts.dedupeKey ?? null, stamp]
    );
    notificationId = res.lastInsertRowid;
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) return null;
    throw err;
  }

  const settings = getSettings();
  if (settings.emailNotificationsEnabled || opts.email) {
    const user = get<{ email: string }>('SELECT email FROM users WHERE id = ?', [opts.userId]);
    if (!user?.email) {
      logDelivery(notificationId, 'failed', 'The account has no email address.', stamp);
    } else if (!emailConfigured()) {
      logDelivery(notificationId, 'failed', 'Email transport is not configured (set SMTP_URL). Notification kept in-app.', stamp);
    } else {
      const deliveryId = logDelivery(notificationId, 'queued', `Recipient ${user.email}`, stamp);
      void sendMail({
        to: user.email,
        subject: opts.emailSubject ?? opts.title,
        text: opts.emailBody ?? `${opts.title}\n\n${opts.body}\n\n— Tema Secondary Library`,
      }).then((result) => {
        run('UPDATE notification_deliveries SET status = ?, detail = ? WHERE id = ?', [
          result.ok ? 'sent' : 'failed',
          result.detail,
          deliveryId,
        ]);
      });
    }
  }
  return notificationId;
}

function logDelivery(notificationId: number, status: string, detail: string, stamp: string): number {
  const res = run(
    `INSERT INTO notification_deliveries (notification_id, channel, status, detail, created_at)
     VALUES (?, 'email', ?, ?, ?)`,
    [notificationId, status, detail, stamp]
  );
  return Number(res.lastInsertRowid);
}

export function notifyMany(
  userIds: number[],
  opts: { type: string; title: string; body: string; link?: string; dedupeKey?: string }
) {
  for (const id of userIds) notify({ userId: id, ...opts, dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${id}` : undefined });
}

export function csvResponse(res: Response, filename: string, columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + header + '\r\n' + body);
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function daysBetween(fromIso: string, toDate = new Date()): number {
  const from = new Date(fromIso);
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export function overdueDays(dueDate: string, at = new Date()): number {
  return Math.max(0, daysBetween(dueDate, at));
}

export function calculateFine(dueDate: string, at = new Date()): { days: number; amount: number } {
  const settings = getSettings();
  const days = overdueDays(dueDate, at);
  if (!settings.finesEnabled || days <= settings.graceDays) return { days, amount: 0 };
  const billable = days - settings.graceDays;
  const amount = Math.min(billable * settings.overdueRatePerDay, settings.maxFine);
  return { days, amount: Math.round(amount * 100) / 100 };
}

export function outstandingBalance(userId: number): number {
  return Number(
    get<{ total: number }>(
      `SELECT COALESCE(SUM(amount - paid_amount - waived_amount), 0) AS total FROM charges
       WHERE user_id = ? AND status IN ('outstanding','partial')`,
      [userId]
    )?.total ?? 0
  );
}

/** Expire uncollected reservations and release held copies, then advance queues. */
export function expireReservations() {
  const stamp = nowIso();
  const expired = all<{ id: number; user_id: number; title_id: number }>(
    `SELECT id, user_id, title_id FROM reservations
     WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?`,
    [stamp]
  );
  for (const r of expired) {
    run(`UPDATE reservations SET status = 'expired', resolved_at = ? WHERE id = ?`, [stamp, r.id]);
    releaseHeldCopy(r.title_id);
    notify({
      userId: r.user_id,
      type: 'reservation_expired',
      title: 'Reservation expired',
      body: 'Your reservation was not collected in time and has expired. You can join the waiting list again.',
      link: '/app/reservations',
      dedupeKey: `res-expired-${r.id}`,
    });
    advanceQueue(r.title_id);
  }
}

/** Release a copy held for a ready reservation that no longer exists. */
export function releaseHeldCopy(titleId: number) {
  const held = get<{ id: number }>(
    `SELECT id FROM copies WHERE title_id = ? AND status = 'reserved' AND id NOT IN (
       SELECT COALESCE(copy_id, 0) FROM loans WHERE status = 'active'
     ) LIMIT 1`,
    [titleId]
  );
  const stillReady = get<{ id: number }>(
    `SELECT id FROM reservations WHERE title_id = ? AND status = 'ready' LIMIT 1`,
    [titleId]
  );
  if (held && !stillReady) {
    run(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [nowIso(), held.id]);
  }
}

/** Promote the next waiting member when a copy is available. */
export function advanceQueue(titleId: number) {
  const settings = getSettings();
  const readyCount = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM reservations WHERE title_id = ? AND status = 'ready'`,
    [titleId]
  )?.n ?? 0;
  if (readyCount > 0) return;
  const available = get<{ id: number }>(
    `SELECT id FROM copies WHERE title_id = ? AND status = 'available' AND id NOT IN (
       SELECT COALESCE(copy_id, 0) FROM loans WHERE status = 'active'
     ) LIMIT 1`,
    [titleId]
  );
  if (!available) return;
  const next = get<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM reservations WHERE title_id = ? AND status = 'waiting'
     ORDER BY created_at ASC, id ASC LIMIT 1`,
    [titleId]
  );
  if (!next) return;
  const readyAt = new Date();
  const expires = new Date(readyAt.getTime() + settings.reservationHoldDays * 86_400_000);
  run(
    `UPDATE reservations SET status = 'ready', ready_at = ?, expires_at = ? WHERE id = ?`,
    [readyAt.toISOString(), expires.toISOString(), next.id]
  );
  run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [nowIso(), available.id]);
  const title = get<{ title: string }>('SELECT title FROM titles WHERE id = ?', [titleId]);
  notify({
    userId: next.user_id,
    type: 'reservation_ready',
    title: 'Your reserved book is ready',
    body: `“${title?.title ?? 'Your book'}” is being held for you. Please collect it before ${expires.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
    link: '/app/reservations',
    dedupeKey: `res-ready-${next.id}`,
  });
}

/** Create due-soon and overdue notifications. Idempotent via dedupe keys. */
export function runDueReminders() {
  const settings = getSettings();
  const active = all<{
    id: number; user_id: number; due_date: string; title: string; first_name: string;
  }>(
    `SELECT l.id, l.user_id, l.due_date, t.title, u.first_name
     FROM loans l JOIN copies c ON c.id = l.copy_id JOIN titles t ON t.id = c.title_id
     JOIN users u ON u.id = l.user_id WHERE l.status = 'active'`
  );
  let sent = 0;
  const today = new Date();
  for (const loan of active) {
    const days = daysBetween(loan.due_date, today);
    if (days > 0) {
      const res = notify({
        userId: loan.user_id,
        type: 'overdue',
        title: `Overdue: ${loan.title}`,
        body: `This book is ${days} day${days === 1 ? '' : 's'} overdue. Please return it to the library as soon as possible.`,
        link: '/app/borrowed',
        dedupeKey: `overdue-${loan.id}-${today.toISOString().slice(0, 10)}`,
      });
      if (res) sent++;
    } else if (days >= -settings.dueSoonReminderDays) {
      const dueLabel = new Date(loan.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const res = notify({
        userId: loan.user_id,
        type: 'due_soon',
        title: `Due soon: ${loan.title}`,
        body: `Please return or renew this book by ${dueLabel}.`,
        link: '/app/borrowed',
        dedupeKey: `duesoon-${loan.id}-${today.toISOString().slice(0, 10)}`,
      });
      if (res) sent++;
    }
  }
  return sent;
}

export function publicUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    libraryId: row.library_id ?? row.school_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status,
    className: row.class_name,
    programme: row.programme,
    department: row.department,
    phone: row.phone,
    gender: row.gender,
    avatarHue: row.avatar_hue,
    lastLogin: row.last_login,
    createdAt: row.created_at,
  };
}

export function cleanSearch(q: string): string {
  return q.trim().replace(/[%_]/g, ' ').slice(0, 100);
}
