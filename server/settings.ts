import { all, get, run, nowIso } from './db.js';

export type Settings = {
  siteName: string;
  siteDescription: string;
  schoolName: string;
  schoolShortName: string;
  motto: string;
  logoUrl: string;
  primaryColor: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  openingHours: string;
  libraryRules: string;
  borrowLimitStudent: number;
  borrowLimitTeacher: number;
  loanDaysStudent: number;
  loanDaysTeacher: number;
  renewalLimit: number;
  renewalDays: number;
  graceDays: number;
  reservationHoldDays: number;
  maxReservations: number;
  finesEnabled: boolean;
  overdueRatePerDay: number;
  maxFine: number;
  fineBlockThreshold: number;
  defaultReplacementCost: number;
  currency: string;
  allowStudentRenewals: boolean;
  allowStudentReservations: boolean;
  emailNotificationsEnabled: boolean;
  dueSoonReminderDays: number;
  maxLoginSessions: number;
};

export const DEFAULT_SETTINGS: Settings = {
  siteName: 'Libra',
  siteDescription: 'The Tema Secondary School library — sign every visitor in at the door, and read our books online from any device.',
  schoolName: 'Tema Secondary School',
  schoolShortName: 'Tema SHS',
  motto: 'Knowledge, Integrity, Service',
  logoUrl: '',
  primaryColor: '#1F4A35',
  address: 'P.O. Box 127, Tema, Greater Accra, Ghana',
  phone: '+233 24 555 0182',
  email: 'library@tema.edu.gh',
  website: 'www.temasecondary.edu.gh',
  openingHours:
    'Monday – Friday: 7:30 am – 5:00 pm\nSaturday: 9:00 am – 1:00 pm\nSundays & public holidays: Closed',
  libraryRules:
    'Silence is expected in all reading areas.\nBags and food are not permitted beyond the entrance.\nBooks must be borrowed at the front desk and returned by the due date.\nA maximum of two books may be borrowed at a time by each student.\nDamaged or lost books must be reported immediately to the librarian.\nStudents must present their library card when borrowing.',
  borrowLimitStudent: 2,
  borrowLimitTeacher: 5,
  loanDaysStudent: 14,
  loanDaysTeacher: 30,
  renewalLimit: 2,
  renewalDays: 7,
  graceDays: 2,
  reservationHoldDays: 3,
  maxReservations: 2,
  finesEnabled: true,
  overdueRatePerDay: 0.5,
  maxFine: 20,
  fineBlockThreshold: 10,
  defaultReplacementCost: 60,
  currency: 'GHS',
  allowStudentRenewals: true,
  allowStudentReservations: true,
  emailNotificationsEnabled: false,
  dueSoonReminderDays: 2,
  maxLoginSessions: 5,
};

export const NUMERIC_KEYS: (keyof Settings)[] = [
  'borrowLimitStudent', 'borrowLimitTeacher', 'loanDaysStudent', 'loanDaysTeacher',
  'renewalLimit', 'renewalDays', 'graceDays', 'reservationHoldDays', 'maxReservations',
  'overdueRatePerDay', 'maxFine', 'fineBlockThreshold', 'defaultReplacementCost',
  'dueSoonReminderDays', 'maxLoginSessions',
];
export const BOOLEAN_KEYS: (keyof Settings)[] = [
  'finesEnabled', 'allowStudentRenewals', 'allowStudentReservations', 'emailNotificationsEnabled',
];

let cache: Settings | null = null;

/**
 * Settings are read on almost every request (site name, currency, loan rules),
 * so they are loaded once into memory at boot and refreshed on every update.
 */
export async function loadSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const values: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    // Internal bookkeeping rows (such as the hosted-seed marker) must never be
    // returned to the browser as if they were site settings.
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try {
      values[row.key] = JSON.parse(row.value);
    } catch {
      values[row.key] = row.value;
    }
  }
  cache = values as Settings;
  return cache;
}

export function getSettings(): Settings {
  return cache ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
  const current = getSettings();
  const allowed = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
  const stamp = nowIso();
  for (const key of allowed) {
    if (!(key in patch)) continue;
    let value = patch[key];
    if (NUMERIC_KEYS.includes(key)) {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) continue;
      value = num;
    }
    if (BOOLEAN_KEYS.includes(key)) value = value === true || value === 'true' || value === 1;
    if (typeof DEFAULT_SETTINGS[key] === 'string') value = String(value ?? '');
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), stamp]
    );
    (current as any)[key] = value;
  }
  cache = { ...current };
  return cache;
}

export function clearSettingsCache() {
  cache = null;
}

export async function currentAcademicPeriod(): Promise<{ year: string | null; term: string | null; termStart: string | null; termEnd: string | null }> {
  const year = await get<{ id: number; name: string }>(
    'SELECT id, name FROM academic_years WHERE is_current = 1 ORDER BY id DESC LIMIT 1'
  );
  const term = year
    ? await get<{ name: string; start_date: string; end_date: string }>(
        'SELECT name, start_date, end_date FROM terms WHERE academic_year_id = ? AND is_current = 1 LIMIT 1',
        [year.id]
      )
    : undefined;
  return { year: year?.name ?? null, term: term?.name ?? null, termStart: term?.start_date ?? null, termEnd: term?.end_date ?? null };
}

export function money(value: number): string {
  return `${getSettings().currency} ${Number(value || 0).toFixed(2)}`;
}
