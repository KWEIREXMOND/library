import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type Client, type ResultSet } from '@libsql/client';

/**
 * The library runs on libSQL: a plain SQLite file in development and a hosted
 * database (Turso) in production. Both speak the same SQL, so the schema and
 * every query below are unchanged — only the calls are asynchronous now,
 * because the production database is reached over HTTPS.
 */
const onVercel = Boolean(process.env.VERCEL);
export const DATA_DIR = path.resolve(process.env.DATA_DIR || (onVercel ? '/tmp/libra' : './data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const RESOURCE_DIR = path.join(UPLOAD_DIR, 'resources');
export const COVER_DIR = path.join(UPLOAD_DIR, 'covers');
export const BRAND_DIR = path.join(UPLOAD_DIR, 'branding');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// A serverless filesystem is read-only apart from /tmp, so this is best-effort.
try {
  for (const dir of [DATA_DIR, UPLOAD_DIR, RESOURCE_DIR, COVER_DIR, BRAND_DIR, BACKUP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch {
  /* read-only filesystem — uploads live in blob storage there */
}

export const DB_PATH = path.join(DATA_DIR, 'libra.db');
const remoteUrl = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL;
export const db: Client = createClient(
  remoteUrl
    ? { url: remoteUrl, authToken: process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${DB_PATH}` }
);

/** Statements inside a `tx()` body must run on the transaction, not the client. */
type Runner = Pick<Client, 'execute'>;
const txStorage = new AsyncLocalStorage<Runner>();

const schema = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','librarian','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','inactive','graduated','transferred')),
  class_name TEXT,
  programme TEXT,
  department TEXT,
  phone TEXT,
  gender TEXT,
  avatar_hue INTEGER NOT NULL DEFAULT 140,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_name);

CREATE TABLE IF NOT EXISTS id_sequences (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT NOT NULL,
  publisher TEXT,
  published_year INTEGER,
  edition TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  description TEXT,
  category_id INTEGER REFERENCES categories(id),
  subject_id INTEGER REFERENCES subjects(id),
  programme TEXT,
  class_level TEXT,
  pages INTEGER,
  cover_url TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  cover_color TEXT NOT NULL DEFAULT '#1F4A35',
  cover_style INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_titles_title ON titles(title);
CREATE INDEX IF NOT EXISTS idx_titles_category ON titles(category_id);
CREATE INDEX IF NOT EXISTS idx_titles_subject ON titles(subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_isbn ON titles(isbn) WHERE isbn IS NOT NULL AND isbn <> '';

CREATE TABLE IF NOT EXISTS copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  barcode TEXT UNIQUE NOT NULL,
  accession_no TEXT UNIQUE NOT NULL,
  shelf TEXT,
  rack TEXT,
  section TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new','good','fair','poor')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','borrowed','reserved','lost','damaged','retired','missing')),
  acquisition TEXT NOT NULL DEFAULT 'purchase' CHECK (acquisition IN ('purchase','donation','transfer')),
  acquired_on TEXT,
  cost REAL,
  donor TEXT,
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_copies_title ON copies(title_id);
CREATE INDEX IF NOT EXISTS idx_copies_status ON copies(status);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES copies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  issued_by INTEGER REFERENCES users(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  return_date TEXT,
  returned_by INTEGER REFERENCES users(id),
  renewal_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned','lost')),
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_due ON loans(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_active_copy ON loans(copy_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS loan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','ready','fulfilled','cancelled','expired')),
  queue_position INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  ready_at TEXT,
  expires_at TEXT,
  notified_at TEXT,
  resolved_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_reservations_title ON reservations(title_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_active
  ON reservations(title_id, user_id) WHERE status IN ('waiting','ready');

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('ebook','wassce','notes','handout','syllabus')),
  subject_id INTEGER REFERENCES subjects(id),
  exam_year INTEGER,
  paper TEXT,
  level TEXT,
  author TEXT,
  publisher TEXT,
  published_year INTEGER,
  language TEXT NOT NULL DEFAULT 'English',
  file_key TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  cover_color TEXT NOT NULL DEFAULT '#1F4A35',
  allow_download INTEGER NOT NULL DEFAULT 1,
  access TEXT NOT NULL DEFAULT 'all' CHECK (access IN ('all','students','teachers')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','archived')),
  submitted_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);
CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id);

CREATE TABLE IF NOT EXISTS resource_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('view','download')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS saved_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want','reading','finished')),
  progress INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, title_id)
);

CREATE TABLE IF NOT EXISTS reading_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject_id INTEGER REFERENCES subjects(id),
  class_level TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  note TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (list_id, title_id)
);

CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  type TEXT NOT NULL CHECK (type IN ('overdue','lost','damage','replacement','other')),
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  waived_amount REAL NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding','partial','paid','waived')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_charges_user ON charges(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','momo','bank','waiver','other')),
  reference TEXT,
  notes TEXT,
  received_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','acquired')),
  review_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acquisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase','donation')),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  supplier TEXT,
  donor TEXT,
  invoice_ref TEXT,
  acquired_on TEXT NOT NULL,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students','teachers','staff')),
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  publish_at TEXT NOT NULL,
  expires_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry ON revoked_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS academic_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stocktakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  expected_count INTEGER NOT NULL DEFAULT 0,
  found_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_by INTEGER REFERENCES users(id),
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS stocktake_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
  condition TEXT,
  scanned_by INTEGER REFERENCES users(id),
  scanned_at TEXT NOT NULL,
  UNIQUE (stocktake_id, copy_id)
);

CREATE TABLE IF NOT EXISTS library_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  school_id TEXT,
  email TEXT,
  class_name TEXT,
  house TEXT,
  item_brought TEXT,
  book_taken TEXT,
  copy_id INTEGER REFERENCES copies(id) ON DELETE SET NULL,
  title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL,
  purpose TEXT,
  notes TEXT,
  signed_in_by INTEGER REFERENCES users(id),
  signed_in_at TEXT NOT NULL,
  signed_out_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_signed_in ON library_visits(signed_in_at);
CREATE INDEX IF NOT EXISTS idx_visits_open ON library_visits(signed_out_at) WHERE signed_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visits_user ON library_visits(user_id);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at TEXT NOT NULL
);
`;

/**
 * Small forward-compatible migrations. `CREATE TABLE IF NOT EXISTS` never adds
 * columns to a table that already exists, so new fields are ensured explicitly.
 */
async function ensureColumn(table: string, column: string, definition: string) {
  const columns = await all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await execRaw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Multi-statement SQL (schema, pragmas). Never used inside a transaction. */
export async function execRaw(sql: string) {
  await db.executeMultiple(sql);
}

export type Params = ReadonlyArray<string | number | null | Uint8Array | bigint | boolean>;

function normalise(params: Params) {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
}

async function execute(sql: string, params: Params): Promise<ResultSet> {
  const runner = txStorage.getStore() ?? db;
  return runner.execute({ sql, args: normalise(params) as never });
}

export async function all<T = Record<string, any>>(sql: string, params: Params = []): Promise<T[]> {
  return (await execute(sql, params)).rows as unknown as T[];
}

export async function get<T = Record<string, any>>(sql: string, params: Params = []): Promise<T | undefined> {
  const rows = (await execute(sql, params)).rows as unknown as T[];
  return rows[0];
}

export async function run(sql: string, params: Params = []): Promise<{ changes: number; lastInsertRowid: number }> {
  const res = await execute(sql, params);
  return { changes: Number(res.rowsAffected), lastInsertRowid: Number(res.lastInsertRowid ?? 0) };
}

export async function scalar<T = number>(sql: string, params: Params = []): Promise<T> {
  const row = await get<Record<string, any>>(sql, params);
  return (row ? Object.values(row)[0] : 0) as T;
}

/**
 * Run a group of statements atomically. The callback receives the transaction
 * through async context, so helpers called inside it use the same connection.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return fn();
  const transaction = await db.transaction('write');
  try {
    const result = await txStorage.run(transaction as unknown as Runner, fn);
    await transaction.commit();
    return result;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

/** Library IDs look like LIB-2026-0001: year of joining plus a running number. */
export const LIBRARY_ID_RE = /^LIB-\d{4}-\d{4}$/;

export function formatLibraryId(year: number, sequence: number) {
  return `LIB-${year}-${String(sequence).padStart(4, '0')}`;
}

export async function nextLibraryId(date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const name = `library_id:${year}`;
  // Numbers are never reissued, even if an account is later deleted.
  const counter = await get<{ value: number }>('SELECT value FROM id_sequences WHERE name = ?', [name]);
  const latest = await get<{ value: number }>(
    'SELECT MAX(CAST(substr(library_id, 10) AS INTEGER)) AS value FROM users WHERE library_id LIKE ?',
    [`LIB-${year}-%`]
  );
  const last = Math.max(Number(counter?.value ?? 0), Number(latest?.value ?? 0));
  const next = (Number.isFinite(last) ? last : 0) + 1;
  await run('INSERT INTO id_sequences (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value', [name, next]);
  return formatLibraryId(year, next);
}

/**
 * Issue library IDs to accounts created before the library number existed
 * (legacy rows and freshly seeded demo users). Safe to call repeatedly.
 */
export async function ensureLibraryIds(): Promise<number> {
  const missing = await all<{ id: number; created_at: string | null }>(
    `SELECT id, created_at FROM users WHERE library_id IS NULL OR library_id = '' ORDER BY id`
  );
  if (!missing.length) return 0;
  for (const user of missing) {
    const year = Number(String(user.created_at ?? '').slice(0, 4)) || new Date().getFullYear();
    const latest = await get<{ library_id: string }>(
      'SELECT library_id FROM users WHERE library_id LIKE ? ORDER BY library_id DESC LIMIT 1',
      [`LIB-${year}-%`]
    );
    const last = latest?.library_id ? Number(latest.library_id.split('-')[2]) : 0;
    const value = formatLibraryId(year, (Number.isFinite(last) ? last : 0) + 1);
    await run('UPDATE users SET library_id = ? WHERE id = ?', [value, user.id]);
  }
  return missing.length;
}

/**
 * Historical front-desk rows kept the old admission number. Rewrite them to the
 * member's library number so the register speaks one language.
 */
export async function refreshVisitLibraryIds(): Promise<void> {
  await run(
    `UPDATE library_visits
        SET school_id = (SELECT u.library_id FROM users u WHERE u.id = library_visits.user_id)
      WHERE user_id IS NOT NULL
        AND school_id IS NOT
            (SELECT u.library_id FROM users u WHERE u.id = library_visits.user_id)`
  );
}

let booted: Promise<{ seeded: boolean; users: number }> | null = null;

/**
 * Prepare the database once per process: create the schema on first boot, run
 * the small migrations, then issue any missing library numbers.
 */
export function initDb(): Promise<{ seeded: boolean; users: number }> {
  booted ??= initialise();
  return booted;
}

async function initialise() {
  const exists = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  );
  if (!exists.length) await execRaw(schema);

  // School house — used on the front-desk register.
  await ensureColumn('users', 'house', 'TEXT');
  // Library membership number, issued instead of a school admission number.
  await ensureColumn('users', 'library_id', 'TEXT');
  // Online books reuse the digital-resources table.
  await ensureColumn('resources', 'cover_url', 'TEXT');
  await ensureColumn('resources', 'category', 'TEXT');

  await execRaw('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_library_id ON users(library_id)');

  await ensureLibraryIds();
  await refreshVisitLibraryIds();
  const count = await scalar<number>('SELECT COUNT(*) FROM users');
  return { seeded: count > 0, users: count };
}
