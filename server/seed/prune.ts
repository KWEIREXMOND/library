import { all, get, run, tx } from '../db.js';

/**
 * The demo library keeps exactly one account per role. The seed still builds a
 * full set of borrowers so that the generated loans, visits and reading lists
 * look realistic, then this prunes everything back to the four demo logins
 * (plus any extra accounts the caller asks to keep, such as a real sign-up).
 *
 * Library IDs are renumbered to LIB-2026-0001…0004 so the demo logins are easy
 * to remember. Any other surviving account keeps its number, and the sequence
 * is moved past the highest one in use.
 */
export const DEMO_LOGINS = [
  { email: 'admin@tema.edu.gh', libraryId: 'LIB-2026-0001' },
  { email: 'librarian@tema.edu.gh', libraryId: 'LIB-2026-0002' },
  { email: 'teacher@tema.edu.gh', libraryId: 'LIB-2026-0003' },
  { email: 'student@tema.edu.gh', libraryId: 'LIB-2026-0004' },
];

export async function pruneToDemoAccounts(extraKeepEmails: string[] = []): Promise<number> {
  const emails = [...DEMO_LOGINS.map((account) => account.email), ...extraKeepEmails]
    .map((email) => email.toLowerCase());
  const keep = await all<{ id: number; email: string }>(
    `SELECT id, email FROM users WHERE LOWER(email) IN (${emails.map(() => '?').join(',')})`,
    emails
  );

  // Never prune unless every demo account is present; a half-seeded database
  // should fail loudly rather than silently deleting the wrong rows.
  if (keep.length < DEMO_LOGINS.length) {
    throw new Error('Cannot prune demo accounts: one or more demo logins are missing.');
  }

  const ids = keep.map((row) => row.id);
  const ph = ids.map(() => '?').join(',');
  const librarian = keep.find((row) => row.email === 'librarian@tema.edu.gh')!.id;

  await tx(async () => {
    // Rows owned by people who are about to be removed.
    await run(`DELETE FROM notifications WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM saved_books WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM password_resets WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM resource_events WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM resource_favorites WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM revoked_tokens WHERE user_id IS NOT NULL AND user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM book_requests WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM reservations WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM charges WHERE user_id NOT IN (${ph})`, ids);
    await run(`DELETE FROM loans WHERE user_id NOT IN (${ph})`, ids);
    // Visits keep their name/class/house snapshots, so they stay on the front
    // desk dashboard as walk-in records once the member account is gone.
    await run(`UPDATE library_visits SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (${ph})`, ids);
    await run(`UPDATE audit_logs SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (${ph})`, ids);

    // References from rows that are staying, but pointed at removed staff.
    await run(`UPDATE book_requests SET reviewed_by = ? WHERE reviewed_by IS NOT NULL AND reviewed_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE charges SET created_by = ? WHERE created_by IS NOT NULL AND created_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE loans SET issued_by = ? WHERE issued_by IS NOT NULL AND issued_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE loans SET returned_by = NULL WHERE returned_by IS NOT NULL AND returned_by NOT IN (${ph})`, ids);
    await run(`UPDATE library_visits SET signed_in_by = ? WHERE signed_in_by IS NOT NULL AND signed_in_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE announcements SET created_by = ? WHERE created_by IS NOT NULL AND created_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE resources SET submitted_by = ? WHERE submitted_by IS NOT NULL AND submitted_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE resources SET approved_by = ? WHERE approved_by IS NOT NULL AND approved_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE titles SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN (${ph})`, ids);
    await run(`UPDATE acquisitions SET recorded_by = ? WHERE recorded_by IS NOT NULL AND recorded_by NOT IN (${ph})`, [librarian, ...ids]);
    await run(`UPDATE stocktakes SET started_by = ? WHERE started_by IS NOT NULL AND started_by NOT IN (${ph})`, [librarian, ...ids]);

    // Reading lists belong to their owner; lists from removed users go with them.
    await run(`DELETE FROM reading_list_items WHERE list_id IN (SELECT id FROM reading_lists WHERE owner_id NOT IN (${ph}))`, ids);
    await run(`DELETE FROM reading_lists WHERE owner_id NOT IN (${ph})`, ids);

    await run(`DELETE FROM users WHERE id NOT IN (${ph})`, ids);

    // Renumber the four demo accounts. Temp values first so the unique index on
    // library_id never collides while teacher/student shift down a number.
    for (const account of DEMO_LOGINS) {
      const row = keep.find((entry) => entry.email === account.email)!;
      await run('UPDATE users SET library_id = ? WHERE id = ?', [`TMP-${row.id}`, row.id]);
    }
    for (const account of DEMO_LOGINS) {
      const row = keep.find((entry) => entry.email === account.email)!;
      await run('UPDATE users SET library_id = ? WHERE id = ?', [account.libraryId, row.id]);
    }

    // Copies follow the loans that survived the prune.
    await run(`UPDATE copies SET status = 'available'
         WHERE status = 'borrowed' AND id NOT IN (SELECT copy_id FROM loans WHERE status = 'active')`);
    await run(`UPDATE copies SET status = 'borrowed'
         WHERE id IN (SELECT copy_id FROM loans WHERE status = 'active')`);

    const year = new Date().getFullYear();
    const latest = (await get<{ value: number }>(
      'SELECT MAX(CAST(substr(library_id, 10) AS INTEGER)) AS value FROM users WHERE library_id LIKE ?',
      [`LIB-${year}-%`]
    ))?.value ?? 0;
    await run(
      'INSERT INTO id_sequences (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value',
      [`library_id:${year}`, latest]
    );
  });

  return ids.length;
}
