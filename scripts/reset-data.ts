import fs from 'node:fs';
import path from 'node:path';
import { all, BACKUP_DIR, COVER_DIR, nowIso, RESOURCE_DIR, run, scalar, tx } from '../server/db.js';

/**
 * Clears the library's content while keeping the accounts and the branding.
 *
 * Deleting a `users` row drags half the schema with it, so this goes the other
 * way: every content table is emptied in foreign-key order, uploaded book files
 * are removed, and the accounts — library IDs, passwords, roles, statuses —
 * stay exactly as they are. Existing sessions are closed (token_version is
 * bumped) because their revocation records are part of the cleared data. Site settings (name, description, crest) are kept
 * because they are configuration, not demo content.
 *
 *   npm run reset -- --yes
 */

const CONFIRM = process.argv.includes('--yes') || process.env.CONFIRM_RESET === '1';

const KEEP = ['users', 'settings', 'id_sequences', 'categories', 'subjects', 'academic_years', 'terms'];

/** Children before parents, so the deletes work with foreign keys switched on. */
const CONTENT_TABLES = [
  'notification_deliveries',
  'notifications',
  'resource_favorites',
  'resource_events',
  'saved_books',
  'reading_list_items',
  'reading_lists',
  'stocktake_scans',
  'stocktakes',
  'payments',
  'charges',
  'loan_events',
  'reservations',
  'loans',
  'acquisitions',
  'book_requests',
  'announcements',
  'library_visits',
  'contact_messages',
  'audit_logs',
  'password_resets',
  'revoked_tokens',
  'resources',
  'copies',
  'titles',
];

async function counts() {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const counted = await Promise.all(
    rows.map(async ({ name }) => ({ table: name, count: await scalar<number>(`SELECT COUNT(*) FROM ${name}`) }))
  );
  return counted.filter((row) => row.count > 0);
}

const before = await counts();
const users = await all<{ library_id: string; email: string; role: string }>(
  'SELECT library_id, email, role FROM users ORDER BY id'
);

if (!CONFIRM) {
  console.error('This will delete every visit, book, notice, notification and audit entry.');
  console.error(`It keeps ${users.length} accounts, the site settings and the subject/category lists.`);
  console.error('Run again with --yes to confirm:  npm run reset -- --yes');
  process.exit(1);
}

const backupName = `libra-before-reset-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
const backupPath = path.join(BACKUP_DIR, backupName);
try {
  await run(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
} catch {
  /* the reset can still proceed without a snapshot */
}

await tx(async () => {
  for (const table of CONTENT_TABLES) {
    const exists = await scalar<number>(
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table]
    );
    if (exists) await run(`DELETE FROM ${table}`);
  }
  // Demo activity disappears, and every browser session is closed. The
  // accounts (and their passwords) stay exactly as they were.
  await run('UPDATE users SET last_login = NULL, token_version = token_version + 1');
  // Give the content tables fresh IDs. User IDs continue where they left off.
  await run("DELETE FROM sqlite_sequence WHERE name <> 'users'");
  // Point the library-ID counter at the highest account that still exists, so
  // the next registration follows the surviving logins without a gap.
  for (const sequence of await all<{ name: string }>("SELECT name FROM id_sequences WHERE name LIKE 'library_id:%'")) {
    const year = sequence.name.split(':')[1];
    const highest = await scalar<number>(
      'SELECT COALESCE(MAX(CAST(substr(library_id, 10) AS INTEGER)), 0) FROM users WHERE library_id LIKE ?',
      [`LIB-${year}-%`]
    );
    await run('UPDATE id_sequences SET value = ? WHERE name = ?', [highest, sequence.name]);
  }
  await run(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, summary, details, ip, created_at)
     VALUES (NULL, 'system.reset', 'library', NULL, ?, NULL, NULL, ?)`,
    ['Cleared all library content; accounts and site settings were kept', nowIso()]
  );
});

let removedFiles = 0;
for (const dir of [RESOURCE_DIR, COVER_DIR]) {
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    try {
      if (fs.statSync(file).isFile()) {
        fs.unlinkSync(file);
        removedFiles += 1;
      }
    } catch {
      /* a missing file is already the desired state */
    }
  }
}

const after = await counts();

console.log('Library content cleared.');
console.log(`Safety snapshot: ${backupPath}`);
console.log(`Removed ${removedFiles} uploaded book file${removedFiles === 1 ? '' : 's'}.`);
console.log('');
console.log(`Kept ${users.length} logins:`);
for (const user of users) console.log(`  ${user.role.padEnd(9)} ${user.library_id}  ${user.email}`);
console.log('');
console.log('Before → after:');
const tables = new Set([...before.map((row) => row.table), ...after.map((row) => row.table)]);
for (const table of [...tables].sort()) {
  if (KEEP.includes(table)) continue;
  const from = before.find((row) => row.table === table)?.count ?? 0;
  const to = after.find((row) => row.table === table)?.count ?? 0;
  if (from || to) console.log(`  ${table.padEnd(24)} ${String(from).padStart(4)} → ${to}`);
}
console.log('');
console.log(`Kept settings: ${await scalar<number>('SELECT COUNT(*) FROM settings')} · subjects/categories: ${await scalar<number>('SELECT COUNT(*) FROM subjects')}/${await scalar<number>('SELECT COUNT(*) FROM categories')}`);
