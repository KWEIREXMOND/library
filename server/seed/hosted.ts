import { get, nowIso, run, tx } from '../db.js';

/**
 * The hosted database starts empty. Everything the school cannot recreate from
 * the browser lives here: the five real accounts (with the password hashes they
 * already use), the reference lists every screen needs, and the settings.
 *
 * ensureHostedSeed() runs once per database — a marker row in `settings` makes it
 * idempotent — and only when the app is pointed at a remote libSQL database, so
 * local file databases are never touched.
 */
const VERSION = 1;
const MARKER_KEY = 'hostedSeed';

export type HostedUser = {
  id: number; schoolId: string; libraryId: string; email: string; username: string; hash: string;
  first: string; last: string; role: string; status: string;
  className: string | null; programme: string | null; department: string | null;
  phone: string | null; gender: string | null; house: string | null; hue: number;
  createdAt: string; updatedAt: string;
};

export const HOSTED_SETTINGS: [string, string][] = [
  ["logoUrl", "\"\""],
  ["motto", "\"Knowledge, Integrity, Service\""],
  ["schoolName", "\"Tema Secondary School\""],
  ["schoolShortName", "\"Tema SHS\""],
  ["siteDescription", "\"The Tema Secondary School library — sign every visitor in at the door, and read our books online from any device.\""],
  ["siteName", "\"Libra\""],
];

export const HOSTED_CATEGORIES = [
  {
    id: 1,
    name: "African Literature",
    slug: "african-literature",
    description: "Novels, plays and poetry by African writers.",
    icon: "BookOpen",
    sort_order: 0,
  },
  {
    id: 2,
    name: "Fiction",
    slug: "fiction",
    description: "Novels and short stories from around the world.",
    icon: "Library",
    sort_order: 1,
  },
  {
    id: 3,
    name: "Science",
    slug: "science",
    description: "Biology, chemistry, physics and general science.",
    icon: "FlaskConical",
    sort_order: 2,
  },
  {
    id: 4,
    name: "Mathematics",
    slug: "mathematics",
    description: "Core and elective mathematics texts and revision aids.",
    icon: "Calculator",
    sort_order: 3,
  },
  {
    id: 5,
    name: "Languages",
    slug: "languages",
    description: "English, French, dictionaries and grammar references.",
    icon: "Languages",
    sort_order: 4,
  },
  {
    id: 6,
    name: "Social Sciences",
    slug: "social-sciences",
    description: "History, geography, government, economics and social studies.",
    icon: "Globe2",
    sort_order: 5,
  },
  {
    id: 7,
    name: "Business",
    slug: "business",
    description: "Business management, accounting and cost accounting.",
    icon: "Briefcase",
    sort_order: 6,
  },
  {
    id: 8,
    name: "ICT & Computing",
    slug: "ict-computing",
    description: "Information technology and computer science.",
    icon: "Laptop",
    sort_order: 7,
  },
  {
    id: 9,
    name: "Reference",
    slug: "reference",
    description: "Dictionaries, encyclopaedias and almanacs.",
    icon: "BookMarked",
    sort_order: 8,
  },
  {
    id: 10,
    name: "Religion",
    slug: "religion",
    description: "Christian religious studies and comparative religion.",
    icon: "Church",
    sort_order: 9,
  },
  {
    id: 11,
    name: "Arts & Music",
    slug: "arts-music",
    description: "Music, visual arts and creative practice.",
    icon: "Palette",
    sort_order: 10,
  },
  {
    id: 12,
    name: "Health & Wellbeing",
    slug: "health-wellbeing",
    description: "Physical education, health and personal development.",
    icon: "HeartPulse",
    sort_order: 11,
  },
  {
    id: 13,
    name: "Careers & Life Skills",
    slug: "careers-life-skills",
    description: "Career guidance, study skills and life skills.",
    icon: "Compass",
    sort_order: 12,
  },
  {
    id: 14,
    name: "Children & Young Readers",
    slug: "children-young-readers",
    description: "Illustrated stories and readers for younger students.",
    icon: "Baby",
    sort_order: 13,
  },
];

export const HOSTED_SUBJECTS = [
  {
    id: 1,
    name: "English Language",
    code: "ENG",
    description: "Senior high school english language collection.",
  },
  {
    id: 2,
    name: "Core Mathematics",
    code: "MTH",
    description: "Senior high school core mathematics collection.",
  },
  {
    id: 3,
    name: "Integrated Science",
    code: "SCI",
    description: "Senior high school integrated science collection.",
  },
  {
    id: 4,
    name: "Social Studies",
    code: "SOC",
    description: "Senior high school social studies collection.",
  },
  {
    id: 5,
    name: "Physics",
    code: "PHY",
    description: "Senior high school physics collection.",
  },
  {
    id: 6,
    name: "Chemistry",
    code: "CHE",
    description: "Senior high school chemistry collection.",
  },
  {
    id: 7,
    name: "Biology",
    code: "BIO",
    description: "Senior high school biology collection.",
  },
  {
    id: 8,
    name: "Elective Mathematics",
    code: "EMAT",
    description: "Senior high school elective mathematics collection.",
  },
  {
    id: 9,
    name: "Economics",
    code: "ECO",
    description: "Senior high school economics collection.",
  },
  {
    id: 10,
    name: "Geography",
    code: "GEO",
    description: "Senior high school geography collection.",
  },
  {
    id: 11,
    name: "History",
    code: "HIS",
    description: "Senior high school history collection.",
  },
  {
    id: 12,
    name: "Government",
    code: "GOV",
    description: "Senior high school government collection.",
  },
  {
    id: 13,
    name: "Literature in English",
    code: "LIT",
    description: "Senior high school literature in english collection.",
  },
  {
    id: 14,
    name: "French",
    code: "FRE",
    description: "Senior high school french collection.",
  },
  {
    id: 15,
    name: "Information Technology",
    code: "ICT",
    description: "Senior high school information technology collection.",
  },
  {
    id: 16,
    name: "Christian Religious Studies",
    code: "CRS",
    description: "Senior high school christian religious studies collection.",
  },
  {
    id: 17,
    name: "Business Management",
    code: "BME",
    description: "Senior high school business management collection.",
  },
  {
    id: 18,
    name: "Financial Accounting",
    code: "ACC",
    description: "Senior high school financial accounting collection.",
  },
  {
    id: 19,
    name: "Cost Accounting",
    code: "COST",
    description: "Senior high school cost accounting collection.",
  },
  {
    id: 20,
    name: "Technical Drawing",
    code: "TDR",
    description: "Senior high school technical drawing collection.",
  },
  {
    id: 21,
    name: "Food & Nutrition",
    code: "FNU",
    description: "Senior high school food & nutrition collection.",
  },
  {
    id: 22,
    name: "Clothing & Textiles",
    code: "CTA",
    description: "Senior high school clothing & textiles collection.",
  },
  {
    id: 23,
    name: "General Agriculture",
    code: "AGR",
    description: "Senior high school general agriculture collection.",
  },
  {
    id: 24,
    name: "Music",
    code: "MUS",
    description: "Senior high school music collection.",
  },
  {
    id: 25,
    name: "Visual Arts",
    code: "VPA",
    description: "Senior high school visual arts collection.",
  },
  {
    id: 26,
    name: "Ghanaian Language",
    code: "GHL",
    description: "Senior high school ghanaian language collection.",
  },
  {
    id: 27,
    name: "Physical Education",
    code: "PEH",
    description: "Senior high school physical education collection.",
  },
  {
    id: 28,
    name: "Life Skills",
    code: "LSK",
    description: "Senior high school life skills collection.",
  },
];

export const HOSTED_YEARS = [
  {
    id: 1,
    name: "2025/2026",
    start_date: "2025-09-09",
    end_date: "2026-07-25",
    is_current: 0,
  },
  {
    id: 2,
    name: "2026/2027",
    start_date: "2026-09-09",
    end_date: "2027-07-24",
    is_current: 1,
  },
];

export const HOSTED_TERMS = [
  {
    id: 1,
    academic_year_id: 1,
    name: "First Term",
    start_date: "2025-09-09",
    end_date: "2025-12-18",
    is_current: 0,
  },
  {
    id: 2,
    academic_year_id: 1,
    name: "Second Term",
    start_date: "2026-01-12",
    end_date: "2026-04-02",
    is_current: 0,
  },
  {
    id: 3,
    academic_year_id: 1,
    name: "Third Term",
    start_date: "2026-04-27",
    end_date: "2026-07-24",
    is_current: 0,
  },
  {
    id: 4,
    academic_year_id: 2,
    name: "First Term",
    start_date: "2026-09-09",
    end_date: "2026-12-18",
    is_current: 1,
  },
  {
    id: 5,
    academic_year_id: 2,
    name: "Second Term",
    start_date: "2027-01-12",
    end_date: "2027-04-02",
    is_current: 0,
  },
  {
    id: 6,
    academic_year_id: 2,
    name: "Third Term",
    start_date: "2027-04-27",
    end_date: "2027-07-24",
    is_current: 0,
  },
];

export const HOSTED_USERS: HostedUser[] = [
  {
    id: 1,
    schoolId: "ADM-001",
    libraryId: "LIB-2026-0001",
    email: "admin@tema.edu.gh",
    username: "admin",
    hash: "$2a$10$zs5PxJM6CR4Tc4/tCnrj5euemFLzm0lekeetDEpIdSWRd/n/Uuac.",
    first: "Akosua",
    last: "Mensah",
    role: "admin",
    status: "active",
    className: null,
    programme: null,
    department: "Administration",
    phone: "+233 24 127 8819",
    gender: "female",
    house: null,
    hue: 283,
    createdAt: "2026-10-20T19:16:18.325Z",
    updatedAt: "2026-10-20T22:26:41.125Z",
  },
  {
    id: 2,
    schoolId: "LIB-001",
    libraryId: "LIB-2026-0002",
    email: "librarian@tema.edu.gh",
    username: "librarian",
    hash: "$2a$10$SufUCWDQ0v9D3y54wKe4tOumWvjnJI9H/Z4Nl7yjZZOS57Q4f1YA6",
    first: "Efua",
    last: "Owusu",
    role: "librarian",
    status: "active",
    className: null,
    programme: null,
    department: "Library",
    phone: "+233 24 956 6541",
    gender: "female",
    house: null,
    hue: 83,
    createdAt: "2026-10-20T19:16:18.325Z",
    updatedAt: "2026-10-20T21:58:23.850Z",
  },
  {
    id: 4,
    schoolId: "TCH-001",
    libraryId: "LIB-2026-0003",
    email: "teacher@tema.edu.gh",
    username: "teacher",
    hash: "$2a$10$dPb3wp937pSCnzfwo1nnMOLvyYLiEGgyXhoqeWWJaaxCSMd2hfIK2",
    first: "Daniel",
    last: "Appiah",
    role: "teacher",
    status: "active",
    className: null,
    programme: null,
    department: "English",
    phone: "+233 24 310 3054",
    gender: "male",
    house: null,
    hue: 237,
    createdAt: "2026-10-20T19:16:18.325Z",
    updatedAt: "2026-10-20T21:58:23.945Z",
  },
  {
    id: 14,
    schoolId: "TSS-2024-001",
    libraryId: "LIB-2026-0004",
    email: "student@tema.edu.gh",
    username: "student",
    hash: "$2a$10$lFIAevo3EI8zuaAGXWN5dOBwHoPJ9hdXrwC3HZymuoR/KvM5zXCzu",
    first: "Ama",
    last: "Boateng",
    role: "student",
    status: "active",
    className: "Form 2 Science A",
    programme: "General Science",
    department: null,
    phone: "+233 24 734 3143",
    gender: "female",
    house: "House 1",
    hue: 196,
    createdAt: "2026-10-20T19:16:18.327Z",
    updatedAt: "2026-10-20T21:58:24.041Z",
  },
  {
    id: 59,
    schoolId: "LIB-2026-0059",
    libraryId: "LIB-2026-0059",
    email: "kweirexmond@gmail.com",
    username: "kweirexmond",
    hash: "$2a$10$AnTsxkXB2CFu388CESSgSeX8L4DF8hEM1h3kZPA3Qax9RHPYEq05G",
    first: "Rexmond",
    last: "Kwei",
    role: "student",
    status: "active",
    className: "3GA1B",
    programme: "General Arts",
    department: null,
    phone: "0573322344",
    gender: "male",
    house: null,
    hue: 228,
    createdAt: "2026-10-20T19:41:26.329Z",
    updatedAt: "2026-10-20T19:41:26.329Z",
  },
];

/** True once this process has checked/created the hosted data. */
let attempted = false;

export function isHostedDatabase(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL);
}

/**
 * Restore the school's accounts and reference data into a hosted database.
 * Safe to call on every boot: the marker row short-circuits once the work is done
 * and every insert is idempotent, so two cold starts racing each other cannot
 * duplicate a row.
 */
export async function ensureHostedSeed(): Promise<boolean> {
  if (attempted || !isHostedDatabase()) return false;
  attempted = true;

  const marker = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [MARKER_KEY]);
  if (marker?.value?.includes(`"version":${VERSION}`)) return false;

  const stamp = nowIso();
  let created = 0;

  await tx(async () => {
    for (const [key, value] of HOSTED_SETTINGS) {
      await run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO NOTHING`,
        [key, value, stamp]
      );
    }

    for (const row of HOSTED_CATEGORIES) {
      await run(
        `INSERT OR IGNORE INTO categories (id, name, slug, description, icon, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.name, row.slug, row.description, row.icon, row.sort_order]
      );
    }

    for (const row of HOSTED_SUBJECTS) {
      await run(
        `INSERT OR IGNORE INTO subjects (id, name, code, description) VALUES (?, ?, ?, ?)`,
        [row.id, row.name, row.code, row.description]
      );
    }

    for (const row of HOSTED_YEARS) {
      await run(
        `INSERT OR IGNORE INTO academic_years (id, name, start_date, end_date, is_current)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.name, row.start_date, row.end_date, row.is_current]
      );
    }

    for (const row of HOSTED_TERMS) {
      await run(
        `INSERT OR IGNORE INTO terms (id, academic_year_id, name, start_date, end_date, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.academic_year_id, row.name, row.start_date, row.end_date, row.is_current]
      );
    }

    for (const row of HOSTED_USERS) {
      await run(
        `INSERT OR IGNORE INTO users
           (id, school_id, library_id, email, username, password_hash, first_name, last_name, role, status,
            class_name, programme, department, phone, gender, house, avatar_hue,
            token_version, last_login, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
        [row.id, row.schoolId, row.libraryId, row.email, row.username, row.hash, row.first, row.last, row.role,
          row.status, row.className, row.programme, row.department, row.phone, row.gender, row.house,
          row.hue, row.createdAt, row.updatedAt]
      );
      created += 1;
    }

    // Membership numbers continue from the highest one the school already issued.
    const highest = HOSTED_USERS.reduce((max, row) => {
      const year = row.libraryId?.split('-')[1];
      const serial = Number(row.libraryId?.split('-')[2] ?? 0);
      return year === String(new Date().getFullYear()) && serial > max ? serial : max;
    }, 0);
    if (highest > 0) {
      const name = `library_id:${new Date().getFullYear()}`;
      await run(
        `INSERT INTO id_sequences (name, value) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)`,
        [name, highest]
      );
    }

    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [MARKER_KEY, JSON.stringify({ version: VERSION, at: stamp, users: created }), stamp]
    );
  });

  return true;
}
