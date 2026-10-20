import { all, get, nowIso, run, scalar, tx } from '../db.js';
import { getSettings } from '../settings.js';
import {
  advanceQueue, audit, calculateFine, conflict, daysBetween, HttpError, notFound,
  notify, outstandingBalance, overdueDays, releaseHeldCopy,
} from '../http.js';
import { LOAN_SELECT, mapLoan, mapReservation, mapTitle, TITLE_SELECT } from './serialize.js';

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export type TitleFilters = {
  q?: string;
  category?: string;
  subject?: string;
  programme?: string;
  level?: string;
  availability?: string;
  language?: string;
  sort?: string;
  includeArchived?: boolean;
  featured?: boolean;
  limit?: number;
  offset?: number;
};

export function searchTitles(filters: TitleFilters) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!filters.includeArchived) where.push('t.archived_at IS NULL');
  if (filters.featured) where.push('t.featured = 1');
  if (filters.q) {
    const q = `%${filters.q.trim().toLowerCase()}%`;
    where.push(`(LOWER(t.title) LIKE ? OR LOWER(t.author) LIKE ? OR LOWER(COALESCE(t.isbn,'')) LIKE ?
      OR LOWER(COALESCE(t.publisher,'')) LIKE ? OR LOWER(COALESCE(cat.name,'')) LIKE ? OR LOWER(COALESCE(sub.name,'')) LIKE ?)`);
    params.push(q, q, q, q, q, q);
  }
  if (filters.category) {
    where.push('(cat.slug = ? OR cat.id = ?)');
    params.push(filters.category, Number(filters.category) || -1);
  }
  if (filters.subject) {
    where.push('(sub.code = ? OR sub.name = ? OR sub.id = ?)');
    params.push(filters.subject, filters.subject, Number(filters.subject) || -1);
  }
  if (filters.programme) {
    where.push('(t.programme = ? OR t.programme IS NULL OR t.programme = \'\')');
    params.push(filters.programme);
  }
  if (filters.level) {
    where.push('(t.class_level = ? OR t.class_level IS NULL OR t.class_level = \'\')');
    params.push(filters.level);
  }
  if (filters.language) {
    where.push('t.language = ?');
    params.push(filters.language);
  }
  const inner = `${TITLE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const outerWhere: string[] = [];
  if (filters.availability === 'available') outerWhere.push('x.copies_available > 0');
  else if (filters.availability === 'unavailable') outerWhere.push('x.copies_available = 0');
  else if (filters.availability === 'available_online') outerWhere.push('1 = 1');

  const sortMap: Record<string, string> = {
    newest: 'x.created_at DESC, x.id DESC',
    oldest: 'x.created_at ASC',
    title: 'x.title COLLATE NOCASE ASC',
    author: 'x.author COLLATE NOCASE ASC',
    popular: 'x.loan_count DESC, x.title COLLATE NOCASE ASC',
    copies: 'x.copies_total DESC, x.title COLLATE NOCASE ASC',
  };
  let order = sortMap[filters.sort || 'relevance'] || sortMap.newest;
  // The relevance tie-breaker adds a bind parameter that only the paged query
  // uses. Keep a copy of the filter parameters for the count query, otherwise
  // SQLite rejects the extra value ("column index out of range").
  const filterParams = [...params];
  const rowParams = [...params];
  if (filters.q && (!filters.sort || filters.sort === 'relevance')) {
    order = `CASE WHEN LOWER(x.title) LIKE ? THEN 0 ELSE 1 END, x.loan_count DESC, x.title COLLATE NOCASE ASC`;
    rowParams.push(`${filters.q.trim().toLowerCase()}%`);
  }
  const limit = Math.min(100, Math.max(1, filters.limit ?? 12));
  const offset = Math.max(0, filters.offset ?? 0);
  const rows = all<any>(
    `SELECT * FROM (${inner}) x ${outerWhere.length ? `WHERE ${outerWhere.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...rowParams, limit, offset]
  );
  const total = scalar<number>(
    `SELECT COUNT(*) FROM (${inner}) x ${outerWhere.length ? `WHERE ${outerWhere.join(' AND ')}` : ''}`,
    filterParams
  );
  return { rows: rows.map(mapTitle), total };
}

export function getTitleDetail(id: number) {
  const row = get<any>(`${TITLE_SELECT} WHERE t.id = ?`, [id]);
  if (!row) throw notFound('That book could not be found.');
  const title = mapTitle(row);
  const copies = all<any>(
    `SELECT c.*, t.title, t.author, t.cover_color FROM copies c JOIN titles t ON t.id = c.title_id
     WHERE c.title_id = ? ORDER BY c.status = 'available' DESC, c.barcode ASC`,
    [id]
  ).map((c) => ({
    id: c.id,
    barcode: c.barcode,
    accessionNo: c.accession_no,
    shelf: c.shelf,
    rack: c.rack,
    section: c.section,
    condition: c.condition,
    status: c.status,
    acquisition: c.acquisition,
    acquiredOn: c.acquired_on,
  }));
  const relatedResources = all<any>(
    `SELECT * FROM resources WHERE status = 'approved' AND subject_id = ? LIMIT 4`,
    [row.subject_id ?? -1]
  );
  const similar = all<any>(
    `${TITLE_SELECT} WHERE t.archived_at IS NULL AND t.id <> ? AND (t.category_id = ? OR t.subject_id = ?)
     ORDER BY (SELECT COUNT(*) FROM loans l JOIN copies cp ON cp.id = l.copy_id WHERE cp.title_id = t.id) DESC LIMIT 4`,
    [id, row.category_id ?? -1, row.subject_id ?? -1]
  ).map(mapTitle);
  return { ...title!, copies, relatedResourceIds: relatedResources.map((r) => r.id), similar };
}

// ── Borrowing ─────────────────────────────────────────────────────────
export type IssueInput = {
  userId: number;
  copyId: number;
  actorId: number;
  dueDays?: number;
  overrideLimit?: boolean;
  overrideRestriction?: boolean;
  notes?: string;
};

export function issueLoan(input: IssueInput) {
  const settings = getSettings();
  return tx(() => {
    const copy = get<any>(
      `SELECT c.*, t.title, t.archived_at FROM copies c JOIN titles t ON t.id = c.title_id WHERE c.id = ?`,
      [input.copyId]
    );
    if (!copy) throw notFound('That copy could not be found.');
    if (copy.archived_at) throw conflict('This title has been archived and cannot be issued.');

    const user = get<any>('SELECT * FROM users WHERE id = ?', [input.userId]);
    if (!user) throw notFound('That borrower could not be found.');
    if (user.status !== 'active') throw conflict(`This account is ${user.status} and cannot borrow books.`);

    if (copy.status === 'borrowed') throw conflict('This copy is already on loan.');
    if (['lost', 'damaged', 'retired', 'missing'].includes(copy.status))
      throw conflict(`This copy is marked “${copy.status}” and cannot be issued.`);
    if (copy.status === 'reserved') {
      const held = get<any>(
        `SELECT r.* FROM reservations r WHERE r.title_id = ? AND r.user_id = ? AND r.status = 'ready'`,
        [copy.title_id, user.id]
      );
      if (!held) throw conflict('This copy is being held for another reader on the waiting list.');
    }

    const loanDays = input.dueDays ??
      (user.role === 'student' ? settings.loanDaysStudent : settings.loanDaysTeacher);
    if (!Number.isFinite(loanDays) || loanDays < 1 || loanDays > 365) throw conflict('Loan period must be between 1 and 365 days.');

    const activeCount = scalar<number>(`SELECT COUNT(*) FROM loans WHERE user_id = ? AND status = 'active'`, [user.id]);
    const limit = user.role === 'student' ? settings.borrowLimitStudent : settings.borrowLimitTeacher;
    if (activeCount >= limit && !input.overrideLimit) {
      throw conflict(`${user.first_name} already has ${activeCount} book${activeCount === 1 ? '' : 's'} on loan (limit ${limit}).`, { code: 'limit' });
    }
    const sameTitle = scalar<number>(
      `SELECT COUNT(*) FROM loans l JOIN copies c ON c.id = l.copy_id
       WHERE l.user_id = ? AND l.status = 'active' AND c.title_id = ?`,
      [user.id, copy.title_id]
    );
    if (sameTitle > 0 && !input.overrideLimit)
      throw conflict('This borrower already has a copy of this title on loan.', { code: 'duplicate-title' });

    const balance = outstandingBalance(user.id);
    if (settings.fineBlockThreshold > 0 && balance > settings.fineBlockThreshold && !input.overrideRestriction) {
      throw conflict(
        `${user.first_name} has outstanding charges of ${settings.currency} ${balance.toFixed(2)}. Settle the balance or override to issue this book.`,
        { code: 'balance', balance }
      );
    }

    const now = new Date();
    const due = addDays(now, loanDays);
    const stamp = now.toISOString();
    const loan = run(
      `INSERT INTO loans (copy_id, user_id, issued_by, issue_date, due_date, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [copy.id, user.id, input.actorId, stamp, due.toISOString(), input.notes ?? null, stamp]
    );
    run(`UPDATE copies SET status = 'borrowed', updated_at = ? WHERE id = ?`, [stamp, copy.id]);
    run(`INSERT INTO loan_events (loan_id, type, actor_id, notes, created_at) VALUES (?, 'issued', ?, ?, ?)`,
      [loan.lastInsertRowid, input.actorId, input.notes ?? null, stamp]);

    const ready = get<any>(
      `SELECT id FROM reservations WHERE title_id = ? AND user_id = ? AND status IN ('ready','waiting')`,
      [copy.title_id, user.id]
    );
    if (ready) {
      run(`UPDATE reservations SET status = 'fulfilled', resolved_at = ? WHERE id = ?`, [stamp, ready.id]);
      releaseHeldCopy(copy.title_id);
    }

    notify({
      userId: user.id,
      type: 'loan_issued',
      title: 'Book issued',
      body: `“${copy.title}” is due on ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
      link: '/app/borrowed',
      dedupeKey: `loan-${loan.lastInsertRowid}`,
    });
    audit({
      userId: input.actorId,
      action: 'loan.issue',
      entityType: 'loan',
      entityId: loan.lastInsertRowid,
      summary: `Issued “${copy.title}” (${copy.barcode}) to ${user.first_name} ${user.last_name}`,
    });

    const full = get<any>(`${LOAN_SELECT} WHERE l.id = ?`, [loan.lastInsertRowid]);
    return mapLoan(full) as any;
  });
}

export type ReturnInput = {
  loanId: number;
  actorId: number;
  condition?: string;
  notes?: string;
  lost?: boolean;
  damageCharge?: number;
  replacementCost?: number;
};

export function returnLoan(input: ReturnInput) {
  const settings = getSettings();
  return tx(() => {
    const loan = get<any>(`${LOAN_SELECT} WHERE l.id = ?`, [input.loanId]);
    if (!loan) throw notFound('That loan could not be found.');
    if (loan.status !== 'active') throw conflict('This loan has already been closed.');

    const stamp = nowIso();
    const fine = calculateFine(loan.due_date);
    const charges: { id: number; type: string; amount: number }[] = [];

    if (fine.amount > 0) {
      const c = run(
        `INSERT INTO charges (user_id, loan_id, type, amount, description, status, created_by, created_at)
         VALUES (?, ?, 'overdue', ?, ?, 'outstanding', ?, ?)`,
        [
          loan.user_id,
          loan.id,
          fine.amount,
          `${fine.days} day${fine.days === 1 ? '' : 's'} overdue — “${loan.title}”`,
          input.actorId,
          stamp,
        ]
      );
      charges.push({ id: c.lastInsertRowid, type: 'overdue', amount: fine.amount });
    }

    if (input.lost) {
      const cost = input.replacementCost ?? settings.defaultReplacementCost;
      const c = run(
        `INSERT INTO charges (user_id, loan_id, type, amount, description, status, created_by, created_at)
         VALUES (?, ?, 'lost', ?, ?, 'outstanding', ?, ?)`,
        [loan.user_id, loan.id, cost, `Replacement cost — “${loan.title}” (${loan.barcode})`, input.actorId, stamp]
      );
      charges.push({ id: c.lastInsertRowid, type: 'lost', amount: cost });
      run(`UPDATE copies SET status = 'lost', updated_at = ? WHERE id = ?`, [stamp, loan.copy_id]);
      run(`UPDATE loans SET status = 'lost', return_date = ?, returned_by = ?, notes = COALESCE(?, notes) WHERE id = ?`,
        [stamp, input.actorId, input.notes ?? null, loan.id]);
    } else {
      const newCondition = input.condition && ['new', 'good', 'fair', 'poor'].includes(input.condition) ? input.condition : 'good';
      const damaged = input.condition === 'damaged';
      run(
        `UPDATE copies SET status = ?, condition = ?, updated_at = ? WHERE id = ?`,
        [damaged ? 'damaged' : 'available', damaged ? 'poor' : newCondition, stamp, loan.copy_id]
      );
      run(`UPDATE loans SET status = 'returned', return_date = ?, returned_by = ?, notes = COALESCE(?, notes) WHERE id = ?`,
        [stamp, input.actorId, input.notes ?? null, loan.id]);
      if (input.damageCharge && input.damageCharge > 0) {
        const c = run(
          `INSERT INTO charges (user_id, loan_id, type, amount, description, status, created_by, created_at)
           VALUES (?, ?, 'damage', ?, ?, 'outstanding', ?, ?)`,
          [loan.user_id, loan.id, input.damageCharge, `Damage charge — “${loan.title}” (${loan.barcode})`, input.actorId, stamp]
        );
        charges.push({ id: c.lastInsertRowid, type: 'damage', amount: input.damageCharge });
      }
    }

    run(`INSERT INTO loan_events (loan_id, type, actor_id, notes, created_at) VALUES (?, ?, ?, ?, ?)`,
      [loan.id, input.lost ? 'lost' : 'returned', input.actorId, input.notes ?? null, stamp]);

    const total = charges.reduce((sum, c) => sum + c.amount, 0);
    notify({
      userId: loan.user_id,
      type: 'loan_returned',
      title: input.lost ? 'Book recorded as lost' : 'Book returned',
      body: total > 0
        ? `“${loan.title}” has been closed. A charge of ${settings.currency} ${total.toFixed(2)} was added to your account.`
        : `“${loan.title}” was returned. Thank you!`,
      link: total > 0 ? '/app/fines' : '/app/borrowed',
      dedupeKey: `return-${loan.id}`,
    });

    if (!input.lost) advanceQueue(loan.title_id);

    audit({
      userId: input.actorId,
      action: input.lost ? 'loan.lost' : 'loan.return',
      entityType: 'loan',
      entityId: loan.id,
      summary: `${input.lost ? 'Marked lost' : 'Returned'} “${loan.title}” (${loan.barcode})`,
      details: { charges },
    });

    const updated = get<any>(`${LOAN_SELECT} WHERE l.id = ?`, [loan.id]);
    return { loan: mapLoan(updated, { withFine: false }), charges, fine: fine.amount };
  });
}

export function renewLoan(loanId: number, actorId: number, actorRole: string, userId: number) {
  const settings = getSettings();
  return tx(() => {
    const loan = get<any>(`${LOAN_SELECT} WHERE l.id = ?`, [loanId]);
    if (!loan) throw notFound('That loan could not be found.');
    if (loan.user_id !== userId && !['librarian', 'admin'].includes(actorRole))
      throw new HttpError(403, 'You can only renew your own loans.');
    if (loan.status !== 'active') throw conflict('Only active loans can be renewed.');
    if (overdueDays(loan.due_date) > 0) throw conflict('Overdue books cannot be renewed — please return the book first.');
    if (loan.renewal_count >= settings.renewalLimit)
      throw conflict(`This loan has reached the renewal limit (${settings.renewalLimit}).`);
    const waiting = scalar<number>(
      `SELECT COUNT(*) FROM reservations WHERE title_id = ? AND status IN ('waiting','ready') AND user_id <> ?`,
      [loan.title_id, loan.user_id]
    );
    if (waiting > 0) throw conflict('Another reader is waiting for this title, so it cannot be renewed.');

    const base = new Date(Math.max(Date.now(), new Date(loan.due_date).getTime()));
    const newDue = addDays(base, settings.renewalDays);
    run(`UPDATE loans SET due_date = ?, renewal_count = renewal_count + 1 WHERE id = ?`, [newDue.toISOString(), loan.id]);
    run(`INSERT INTO loan_events (loan_id, type, actor_id, notes, created_at) VALUES (?, 'renewed', ?, ?, ?)`,
      [loan.id, actorId, `Extended to ${newDue.toISOString().slice(0, 10)}`, nowIso()]);
    notify({
      userId: loan.user_id,
      type: 'renewal_approved',
      title: 'Renewal approved',
      body: `“${loan.title}” is now due on ${newDue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
      link: '/app/borrowed',
      dedupeKey: `renew-${loan.id}-${loan.renewal_count + 1}`,
    });
    audit({
      userId: actorId,
      action: 'loan.renew',
      entityType: 'loan',
      entityId: loan.id,
      summary: `Renewed “${loan.title}” for ${loan.borrower_name}`,
    });
    return mapLoan(get<any>(`${LOAN_SELECT} WHERE l.id = ?`, [loan.id]));
  });
}

// ── Reservations ──────────────────────────────────────────────────────
export function queuePosition(titleId: number, reservationId: number) {
  const row = get<{ pos: number }>(
    `SELECT COUNT(*) + 1 AS pos FROM reservations
     WHERE title_id = ? AND status = 'waiting' AND (created_at < (SELECT created_at FROM reservations WHERE id = ?)
     OR (created_at = (SELECT created_at FROM reservations WHERE id = ?) AND id < ?))`,
    [titleId, reservationId, reservationId, reservationId]
  );
  return row?.pos ?? 1;
}

export function createReservation(userId: number, titleId: number, actorId?: number) {
  const settings = getSettings();
  return tx(() => {
    const title = get<any>('SELECT * FROM titles WHERE id = ?', [titleId]);
    if (!title || title.archived_at) throw notFound('That book could not be found.');
    const user = get<any>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw notFound('Borrower not found.');
    if (user.status !== 'active') throw conflict('Only active accounts can place reservations.');
    if (user.role === 'student' && !settings.allowStudentReservations)
      throw conflict('Student reservations are currently disabled. Please ask the librarian for help.');

    const available = scalar<number>(`SELECT COUNT(*) FROM copies WHERE title_id = ? AND status = 'available'`, [titleId]);
    if (available > 0) throw conflict('A copy is already available — you can borrow it from the library desk.', { code: 'available' });

    const existing = get<any>(
      `SELECT id FROM reservations WHERE title_id = ? AND user_id = ? AND status IN ('waiting','ready')`,
      [titleId, userId]
    );
    if (existing) throw conflict('You already have an active reservation for this title.');

    const activeCount = scalar<number>(
      `SELECT COUNT(*) FROM reservations WHERE user_id = ? AND status IN ('waiting','ready')`,
      [userId]
    );
    if (activeCount >= settings.maxReservations)
      throw conflict(`You can hold a maximum of ${settings.maxReservations} reservations at a time.`);

    const stamp = nowIso();
    const res = run(
      `INSERT INTO reservations (title_id, user_id, status, queue_position, created_at) VALUES (?, ?, 'waiting', ?, ?)`,
      [titleId, userId, activeCount + 1, stamp]
    );
    const position = queuePosition(titleId, res.lastInsertRowid);
    run(`UPDATE reservations SET queue_position = ? WHERE id = ?`, [position, res.lastInsertRowid]);
    notify({
      userId,
      type: 'reservation_created',
      title: 'Reservation placed',
      body: `You are number ${position} in the queue for “${title.title}”.`,
      link: '/app/reservations',
      dedupeKey: `res-created-${res.lastInsertRowid}`,
    });
    audit({
      userId: actorId ?? userId,
      action: 'reservation.create',
      entityType: 'reservation',
      entityId: res.lastInsertRowid,
      summary: `Reserved “${title.title}” for ${user.first_name} ${user.last_name}`,
    });
    advanceQueue(titleId);
    return get<any>(
      `SELECT r.*, t.title, t.author, t.cover_color, ? AS position FROM reservations r JOIN titles t ON t.id = r.title_id WHERE r.id = ?`,
      [position, res.lastInsertRowid]
    );
  });
}

export function cancelReservation(reservationId: number, userId: number, isStaffUser: boolean, reason?: string) {
  return tx(() => {
    const res = get<any>(
      `SELECT r.*, t.title FROM reservations r JOIN titles t ON t.id = r.title_id WHERE r.id = ?`,
      [reservationId]
    );
    if (!res) throw notFound('That reservation could not be found.');
    if (res.user_id !== userId && !isStaffUser) throw new HttpError(403, 'You can only cancel your own reservations.');
    if (!['waiting', 'ready'].includes(res.status)) throw conflict('This reservation is no longer active.');
    run(`UPDATE reservations SET status = 'cancelled', resolved_at = ?, cancel_reason = ? WHERE id = ?`,
      [nowIso(), reason ?? null, reservationId]);
    if (res.status === 'ready') {
      releaseHeldCopy(res.title_id);
      advanceQueue(res.title_id);
    }
    audit({
      userId,
      action: 'reservation.cancel',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Cancelled reservation for “${res.title}”`,
    });
    return { ok: true };
  });
}

// ── Recommendations ───────────────────────────────────────────────────
export function recommendationsFor(userId: number, limit = 6) {
  const borrowed = new Set(
    all<{ title_id: number }>(
      `SELECT DISTINCT c.title_id FROM loans l JOIN copies c ON c.id = l.copy_id WHERE l.user_id = ?`,
      [userId]
    ).map((r) => r.title_id)
  );
  const interests = all<{ subject_id: number | null; category_id: number | null }>(
    `SELECT DISTINCT t.subject_id, t.category_id FROM loans l
     JOIN copies c ON c.id = l.copy_id JOIN titles t ON t.id = c.title_id WHERE l.user_id = ?
     UNION SELECT t.subject_id, t.category_id FROM saved_books s JOIN titles t ON t.id = s.title_id WHERE s.user_id = ?`,
    [userId, userId]
  );
  const subjectIds = interests.map((i) => i.subject_id).filter(Boolean);
  const categoryIds = interests.map((i) => i.category_id).filter(Boolean);
  const rows = all<any>(
    `${TITLE_SELECT} WHERE t.archived_at IS NULL ORDER BY
      (CASE WHEN t.subject_id IN (${subjectIds.map(() => '?').join(',') || 'NULL'}) THEN 2 ELSE 0 END) +
      (CASE WHEN t.category_id IN (${categoryIds.map(() => '?').join(',') || 'NULL'}) THEN 1 ELSE 0 END) +
      (CASE WHEN (SELECT COUNT(*) FROM copies cp WHERE cp.title_id = t.id AND cp.status = 'available') > 0 THEN 1 ELSE 0 END) DESC,
      (SELECT COUNT(*) FROM loans l JOIN copies cp ON cp.id = l.copy_id WHERE cp.title_id = t.id) DESC
     LIMIT ?`,
    [...subjectIds, ...categoryIds, limit + borrowed.size]
  ).map(mapTitle);
  return rows.filter((r) => r && !borrowed.has(r.id)).slice(0, limit);
}

// ── Staff dashboard figures ───────────────────────────────────────────
export function staffStats() {
  const totalCopies = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status <> 'retired'`);
  const available = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'available'`);
  const borrowed = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'borrowed'`);
  const reservedHolds = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'reserved'`);
  const lost = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'lost'`);
  const damaged = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'damaged'`);
  const missing = scalar<number>(`SELECT COUNT(*) FROM copies WHERE status = 'missing'`);
  const titles = scalar<number>(`SELECT COUNT(*) FROM titles WHERE archived_at IS NULL`);
  const activeLoans = scalar<number>(`SELECT COUNT(*) FROM loans WHERE status = 'active'`);
  const overdue = scalar<number>(
    `SELECT COUNT(*) FROM loans WHERE status = 'active' AND date(due_date) < date('now')`
  );
  const dueSoon = scalar<number>(
    `SELECT COUNT(*) FROM loans WHERE status = 'active' AND date(due_date) BETWEEN date('now') AND date('now','+3 day')`
  );
  const waiting = scalar<number>(`SELECT COUNT(*) FROM reservations WHERE status = 'waiting'`);
  const ready = scalar<number>(`SELECT COUNT(*) FROM reservations WHERE status = 'ready'`);
  const students = scalar<number>(`SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active'`);
  const teachers = scalar<number>(`SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'active'`);
  const outstanding = scalar<number>(
    `SELECT COALESCE(SUM(amount - paid_amount - waived_amount), 0) FROM charges WHERE status IN ('outstanding','partial')`
  );
  const collected = scalar<number>(
    `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE method <> 'waiver' AND date(created_at) >= date('now','start of month')`
  );
  const loansThisMonth = scalar<number>(
    `SELECT COUNT(*) FROM loans WHERE date(issue_date) >= date('now','start of month')`
  );
  const loansLastMonth = scalar<number>(
    `SELECT COUNT(*) FROM loans WHERE date(issue_date) >= date('now','start of month','-1 month') AND date(issue_date) < date('now','start of month')`
  );

  const monthly = all<any>(
    `WITH months(month) AS (
       SELECT strftime('%Y-%m', 'now') UNION SELECT strftime('%Y-%m','now','-1 month')
       UNION SELECT strftime('%Y-%m','now','-2 month') UNION SELECT strftime('%Y-%m','now','-3 month')
       UNION SELECT strftime('%Y-%m','now','-4 month') UNION SELECT strftime('%Y-%m','now','-5 month'))
     SELECT m.month,
       (SELECT COUNT(*) FROM loans l WHERE strftime('%Y-%m', l.issue_date) = m.month) AS issued,
       (SELECT COUNT(*) FROM loans l WHERE l.return_date IS NOT NULL AND strftime('%Y-%m', l.return_date) = m.month) AS returned
     FROM months m ORDER BY m.month ASC`
  );

  const popular = all<any>(
    `SELECT t.id, t.title, t.author, t.cover_color, COUNT(l.id) AS loans
     FROM titles t JOIN copies c ON c.title_id = t.id JOIN loans l ON l.copy_id = c.id
     WHERE t.archived_at IS NULL GROUP BY t.id ORDER BY loans DESC, t.title ASC LIMIT 5`
  );
  const popularSubjects = all<any>(
    `SELECT s.name, COUNT(l.id) AS loans FROM subjects s
     JOIN titles t ON t.subject_id = s.id JOIN copies c ON c.title_id = t.id JOIN loans l ON l.copy_id = c.id
     GROUP BY s.id ORDER BY loans DESC LIMIT 5`
  );
  const recent = all<any>(`${LOAN_SELECT} ORDER BY l.created_at DESC LIMIT 6`).map((r) => mapLoan(r));
  const overdueLoans = all<any>(
    `SELECT * FROM (${LOAN_SELECT}) x WHERE x.status = 'active' AND date(x.due_date) < date('now')
     ORDER BY x.due_date ASC LIMIT 5`
  ).map((r) => mapLoan(r));
  const visits = {
    inside: scalar<number>('SELECT COUNT(*) FROM library_visits WHERE signed_out_at IS NULL'),
    today: scalar<number>("SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) = date('now')"),
    booksTakenToday: scalar<number>(
      "SELECT COUNT(*) FROM library_visits WHERE date(signed_in_at) = date('now') AND book_taken IS NOT NULL AND book_taken <> ''"
    ),
  };

  const alerts = {
    poorCondition: scalar<number>(`SELECT COUNT(*) FROM copies WHERE condition = 'poor' AND status = 'available'`),
    noCopies: scalar<number>(
      `SELECT COUNT(*) FROM titles t WHERE t.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM copies c WHERE c.title_id = t.id AND c.status <> 'retired')`
    ),
    longOverdue: scalar<number>(
      `SELECT COUNT(*) FROM loans WHERE status = 'active' AND date(due_date) < date('now','-14 day')`
    ),
    pendingRequests: scalar<number>(`SELECT COUNT(*) FROM book_requests WHERE status = 'pending'`),
    pendingResources: scalar<number>(`SELECT COUNT(*) FROM resources WHERE status = 'pending'`),
  };

  return {
    totals: {
      titles, totalCopies, available, borrowed, held: reservedHolds,
      lost, damaged, missing, activeLoans, overdue, dueSoon,
      waiting, ready, students, teachers, outstanding, collected, loansThisMonth, loansLastMonth,
      utilisation: totalCopies ? Math.round(((borrowed + reservedHolds) / totalCopies) * 100) : 0,
    },
    monthly, popular, popularSubjects, recent, overdueLoans, alerts, visits,
  };
}

export function studentStats(userId: number) {
  const active = all<any>(`${LOAN_SELECT} WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.due_date ASC`, [userId])
    .map((r) => mapLoan(r));
  const dueSoon = active.filter((l) => l && l.overdueDays === 0 && daysBetween(l.dueDate) >= -3);
  const overdue = active.filter((l) => l && l.overdueDays > 0);
  const reservations = all<any>(
    `SELECT r.*, t.title, t.author, t.cover_color,
       (SELECT COUNT(*) FROM reservations r2 WHERE r2.title_id = r.title_id AND r2.status = 'waiting' AND r2.created_at < r.created_at) + 1 AS position,
       (SELECT COUNT(*) FROM copies c WHERE c.title_id = r.title_id AND c.status = 'available') AS copies_available
     FROM reservations r JOIN titles t ON t.id = r.title_id
     WHERE r.user_id = ? AND r.status IN ('waiting','ready') ORDER BY r.created_at ASC`,
    [userId]
  ).map(mapReservation);
  const history = all<any>(`${LOAN_SELECT} WHERE l.user_id = ? AND l.status <> 'active' ORDER BY l.return_date DESC LIMIT 8`, [userId])
    .map((r) => mapLoan(r, { withFine: false }));
  const saved = all<any>(
    `SELECT x.*, s.status AS saved_status, s.progress, s.note, s.updated_at AS saved_at
     FROM saved_books s JOIN (${TITLE_SELECT}) x ON x.id = s.title_id
     WHERE s.user_id = ? ORDER BY s.updated_at DESC`,
    [userId]
  ).map((r) => ({ ...mapTitle(r), savedStatus: r.saved_status, progress: r.progress, note: r.note, savedAt: r.saved_at }));
  const balance = outstandingBalance(userId);
  return {
    activeLoans: active,
    dueSoon,
    overdue,
    reservations,
    history,
    saved,
    balance,
    totalBorrowed: scalar<number>('SELECT COUNT(*) FROM loans WHERE user_id = ?', [userId]),
    booksRead: scalar<number>(`SELECT COUNT(*) FROM loans WHERE user_id = ? AND status IN ('returned','lost')`, [userId]),
  };
}
