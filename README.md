# Libra

The Tema Secondary School library, reduced to the two things it actually needs:

1. **A front-desk kiosk, run by library staff.** Librarians and admins sign walk-in visitors in and out by name; the register shows who is inside in real time.
2. **Books online.** Library staff upload a PDF and a cover; students create an account, get a library ID, and read in the browser.

Everything else — the catalogue, loans, fines, reservations, reports, acquisitions and stocktaking — has been removed.

## Running it

```bash
npm install
npm run seed     # creates the demo library (never run while the API is up)
npm run dev      # API on :4000, web on :5173
```

The database is libSQL — a plain SQLite file in `data/libra.db` for development, or a hosted
[Turso](https://turso.tech) database when `LIBSQL_URL` is set. Uploaded PDFs and covers live in
`data/uploads/` and are ignored by Git.

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | API + Vite together |
| `npm run dev:api` | API only (tsx watch) |
| `npm run seed` | Wipe and reseed the demo library |
| `npm run typecheck` | Client + server TypeScript |
| `npm test` | Vitest suite |
| `npm run build` | Production build |

## Deploying

The app is one Node process: Express serves `/api` **and** the built client from `dist/`. The database
is libSQL (SQLite file by default), and uploaded PDFs live in `DATA_DIR`, so that directory is the only
thing that needs a persistent disk.

**Requirements:** Node **22+**, and a writable `DATA_DIR` — unless `LIBSQL_URL` points at a hosted
database, in which case only the uploads need a disk.

```bash
npm ci
npm run build                # tsc -p tsconfig.server.json  +  vite build
NODE_ENV=production \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  DATA_DIR=/var/lib/libra \
  npm start                  # node dist-server/index.js
```

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | The server binds `0.0.0.0`. |
| `NODE_ENV` | `development` | `production` requires `SESSION_SECRET` and hides internal errors. |
| `SESSION_SECRET` | dev fallback | **Required in production**; the server exits without it. |
| `DATA_DIR` | `./data` | Database, uploads and backups. Back this up. |
| `CLIENT_DIST` | `./dist` | Where the built frontend lives. |
| `COOKIE_SECURE` | `false` | Set `true` when the site is served over HTTPS. |
| `ALLOWED_ORIGINS` | — | Extra browser origins for the API, comma separated. |
| `AUTO_SEED` | `true` | On an empty database, create the demo library. Set `false` after launch. |
| `LIBSQL_URL` / `TURSO_DATABASE_URL` | — | Hosted libSQL database. Without it the app uses `DATA_DIR/libra.db`. |
| `LIBSQL_AUTH_TOKEN` / `TURSO_AUTH_TOKEN` | — | Token for the hosted database. |
| `BLOB_STORE_ID` | — | Connected Vercel Blob store; enables browser-direct uploads. |

**Docker**

```bash
docker build -t libra .
docker run -d -p 4000:4000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e COOKIE_SECURE=true \
  -v libra-data:/data \
  libra
```

The image runs as the non-root `node` user, stores everything in the `/data` volume and has a
`HEALTHCHECK` against `/api/health`.

**Behind a proxy / HTTPS**

The server trusts one proxy hop (`trust proxy`) so client IPs and `X-Forwarded-*` are honoured. Point
the proxy at `http://127.0.0.1:4000`, forward `Host`, and set `COOKIE_SECURE=true`. Health checks can
use `GET /api/health` (returns `{ ok: true, database: "ready" }`).

Hashed files under `/assets/` are served with a one-year immutable cache; `index.html` is not cached,
so a new build is picked up immediately. Responses are gzip-compressed.

**Vercel**

The repository ships a serverless entry point — `api/index.ts` plus `vercel.json` — so the same Express
app runs as a Vercel function while the built client is served from the CDN. Everything writable is
remote: rows live in a hosted libSQL database (Turso) and files live in Vercel Blob.

1. Import the repository as a Vercel project. The build command is `npm run build` and the output
   directory is `dist` (both are set in `vercel.json`).
2. **Storage → Create → Turso** (Vercel Marketplace). Connecting it to the project injects
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; `LIBSQL_URL` / `LIBSQL_AUTH_TOKEN` are accepted too.
3. **Storage → Create → Blob**, connected to the same project (`BLOB_STORE_ID` and
   `BLOB_WEBHOOK_PUBLIC_KEY`). Uploads then go browser → Blob directly, because a serverless request
   body is capped at 4.5 MB while a book PDF may be 60 MB.
4. Set `SESSION_SECRET`, `COOKIE_SECURE=true`, `ALLOWED_ORIGINS=https://<your-domain>` and
   `AUTO_SEED=false`.
5. Deploy. The first request builds the schema and, on a hosted database, restores the school's five
   accounts and the reference lists from `server/seed/hosted.ts`. A `hostedSeed` row in `settings`
   makes that bootstrap run once per database; bump `VERSION` in that file if you ever need it again.

Passwords changed in the running app (Administration → People → reset password) are written to Turso.
`hosted.ts` is the disaster-recovery snapshot, not the live copy.

**Before you hand it over**

1. Set `SESSION_SECRET`, `NODE_ENV=production` and `COOKIE_SECURE=true`.
2. Sign in as the administrator and change the demo passwords (or delete the demo accounts).
3. Set `AUTO_SEED=false` so an empty or reset database never recreates demo logins.
4. Schedule a backup of `DATA_DIR` — `libra.db` (plus `-wal`/`-shm`) and `uploads/`.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` | Public | The two jobs, explained |
| `/kiosk` | Librarian / admin | Walk-in sign-in; shows who is inside |
| `/books` | Public | The online shelves |
| `/books/:id` | Signed-in readers | Full-screen PDF reader |
| `/login`, `/register` | Public | Library ID sign-in and student self-registration |
| `/app` | Staff | Overview: who is inside, books online |
| `/app/visits` | Staff | Sign-in register, CSV export, sign visitors out |
| `/app/books` | Staff | Upload, edit, publish and delete books |
| `/app/analytics` | Staff | Walk-in traffic, houses, peak hours, reading and members |
| `/app/notifications` | Signed-in | The inbox: broadcasts and account notices |
| `/app/account` | Signed-in | Your name, username (email), phone and password |
| `/app/people` | Admin | Everyone the library knows, plus **Add staff account** (administrator/librarian) and account actions |
| `/app/broadcast` | Admin | Compose a notice, target an audience, see delivery and read counts |
| `/app/activity` | Admin | The audit trail: sign-ins, account changes, broadcasts |
| `/app/settings` | Admin | Site name, description, motto and crest/favicon |

## Analytics

`/app/analytics` is built from the two things the library already records — the kiosk register and the
online shelves — so there is no separate tracking table to fall out of sync. It shows, for 7, 30 or 90
days: visits per day, who is inside, unique and returning visitors, average visit length, houses,
reasons for visiting, busiest hours, who is signing people in, member counts, and the most-read and
most-taken books. The data comes from `GET /api/analytics?days=30`, which requires a librarian or admin
session.

## People and broadcast

`/app/people` is the whole library in one register: everyone with an account, and every kiosk visitor who
signed in without one. Members show their library ID, role and status; walk-ins show the name, class and
house they gave at the desk, and are labelled **walk-in**. The list merges two sources — `users` and
`library_visits WHERE user_id IS NULL` (deduplicated by lowercased name) — so a guest never has to be
typed in twice. Search by name, email, library ID, class or house, switch between everyone/members/walk-ins,
and export exactly what is on screen as CSV.

Opening a person shows their profile and recent visits. For a real account an admin can:

- **Suspend / re-activate** — suspension bumps `token_version`, so every open session ends at once and
  sign-in is refused until the account is re-activated.
- **Sign out everywhere** — ends every session without touching the password.
- **Reset the password** — sets a temporary password, shown once for the admin to hand over.

Walk-ins have no password or session, so the actions are hidden for them. Every action is written to
`audit_logs` and appears on `/app/activity`.

`/app/broadcast` sends a notice to **everyone**, **students**, **teachers** or **staff**. Sending does two
things: it publishes the notice to the public notice board (`GET /api/announcements`, also shown as a
dismissible banner on public pages) and inserts an inbox row for every *active* account in the audience
(`notifications`). Each history entry shows how many inboxes it reached and how many recipients have read
it; notices can be pinned, archived or deleted. Walk-in guests have no account, so they only see the
public board — the composer says so before you send.

The bell in the staff and reader headers links to `/app/notifications`, which lists the messages, marks
them read and keeps an unread count fresh.

## Site name, description and crest

`/app/settings` is where the library is branded. An administrator can change:

- **Site name** — the wordmark in the header and the first half of the browser tab title.
- **Short name** — used for the “Tema SHS Library” subtitle on the brand, book covers and auth screens.
- **School name** — shown in the footer, on the kiosk and on printed book covers.
- **Description** — the sentence in the footer and the page’s `meta description` / Open Graph description.
- **Motto** — shown on the public home hero and the kiosk.
- **Crest** — an uploaded image used beside the site name, as the favicon, the Apple touch icon and at `/favicon.ico`.

The form includes a live preview of the tab, header and description. The crest is uploaded immediately
(PNG, JPEG, WebP or GIF, up to 4 MB); text is saved as one form with the server validating every field.
Uploads are written to `DATA_DIR/uploads/branding/`, the previous file is removed, and the new URL is stored
in `settings.logoUrl` so every screen picks it up on the next settings refresh. SVG uploads are intentionally
refused — serving user-authored SVG from the app origin would allow script injection.

Under the hood: `GET /api/settings` (public, the same object `/api/auth/me` returns), `PATCH /api/settings`
(admin), `POST /api/settings/logo` and `DELETE /api/settings/logo` (admin, `multipart/form-data` field
`logo`). Uploaded crests are served from `/api/media/branding/<file>`, and `/favicon.ico` resolves to the
current crest or redirects to the bundled `/favicon.svg` when none is set.

## Signing in and out

One sign-in form serves everyone. Staff land on `/app`; students and teachers land on `/books`. When a
screen needs an account, the sign-in page remembers where you were and takes you back there.

Every signed-in screen has a way out:

| Screen | Where the account menu is |
| --- | --- |
| Home, books, any public page | Avatar menu, top right (also in the mobile menu) |
| The reader (`/books/:id`) | Avatar menu, top right of the reader bar |
| Staff dashboard (`/app/*`) | Avatar and sign-out icon at the foot of the sidebar |
| Kiosk (`/kiosk`) | “Sign out” beside “Dashboard” |

Signing out calls `POST /api/auth/logout`, which revokes every credential the request carried (cookie,
bearer token, `?token=`), clears the cookie and drops cached queries; the account menu then leaves for
the public site. Sign-in and sign-out were checked against all four demo roles: `GET /api/auth/me`
returns the user before signing out, `null` afterwards, and the old bearer token is rejected.

## Demo accounts

Every account signs in with its **library ID** or email address.

| Role | Library ID | Email | Password |
| --- | --- | --- | --- |
| Administrator | `LIB-2026-0001` | `admin@tema.edu.gh` | `Admin@123` |
| Librarian | `LIB-2026-0002` | `librarian@tema.edu.gh` | `Library@123` |
| Teacher | `LIB-2026-0003` | `teacher@tema.edu.gh` | `Teacher@123` |
| Student | `LIB-2026-0004` | `student@tema.edu.gh` | `Student@123` |

A fresh seed creates exactly these four accounts — one demo login per role. The full credential list
lives in [`data/logins.md`](data/logins.md).

## Starting from a clean library

When the demo content has served its purpose, clear it without touching the logins:

```bash
npm run reset -- --yes
```

That empties every content table — books, visits, notices, inbox messages, loans, reservations, reading
lists, saved books, contact messages and the audit trail — and deletes the uploaded PDFs and covers. It
keeps:

- **all accounts**, with the same library IDs, passwords, roles and statuses;
- **site settings**, including the name, description and uploaded crest;
- the reference lists (subjects, categories, academic years, terms) and the library-ID counter, which is
  re-pointed at the highest surviving account.

A safety snapshot is written to `data/backups/libra-before-reset-…db` first, existing sessions are closed
(`token_version` is bumped, because their revocation records are part of the cleared data), and the script
prints a before/after table. Run it without `--yes` to see what it would delete.

## How the kiosk works

The kiosk is a staff tool. Every `/api/kiosk/*` endpoint requires a librarian or admin session, and the
visit records which staff member signed the visitor in. `/kiosk` is guarded by `RequireStaff`, so a
student who opens it is sent to sign in and then refused. Sign-ins are rate-limited per device and a
duplicate open visit with the same name is rejected.

At sign-in the staff member **types the class** (for example “2 Science 1”) and picks a **house from
House 1–5**; “Staff / visitor” is available for people without a house. Books are not recorded at
sign-in. When the visitor leaves, staff open the sign-out dialog, tick the titles they are taking from
the online shelves (or type a book that is not online), and the visit closes with those titles stored
in `book_taken`. The register, CSV export and dashboards all show the house and the books taken.

Students never use the kiosk: they register themselves at `/register`, receive a library ID
immediately, and use it to read books at `/books`.

## Uploading books

`POST /api/books` takes multipart form data: a required PDF (validated by its `%PDF-` header, up to
60 MB), an optional cover image, and the book details. Files are stored under
`data/uploads/resources/` and `data/uploads/covers/`; the database only holds the file names.
`GET /api/books/:id/file` streams the PDF for the in-browser reader.

The reader renders each page to a canvas with pdf.js (`src/components/PdfReader.tsx`) instead of
handing the PDF to the browser's built-in viewer through an `<iframe>`: phones will not display a PDF
inside a frame, and sandboxed previews block the plugin. The reader has page navigation, zoom and a
page counter, and it fetches the file with the session token in the header so it still works when
cookies are dropped. pdf.js is loaded lazily, so the shelves stay light.

**Download** saves the copy the reader already holds through a Blob link rather than navigating to
`/books/:id/file?mode=download`, which browsers inside an embedded preview often refuse. The CSV
export on the visits page uses the same approach. Books with *Allow download* switched off show no
download or raw-PDF link at all; the server also rejects `mode=download` for them.
