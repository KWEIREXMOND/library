import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BookOpen, CheckCircle2, DoorOpen, IdCard, LibraryBig, MonitorSmartphone, ShieldCheck,
  UploadCloud, Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { SchoolCrest } from '../../components/Brand';
import { BookCover } from '../../components/BookCover';
import { Button } from '../../components/ui';
import type { Book } from '../../lib/types';

export function HomePage() {
  const { user, settings } = useAuth();
  useDocumentTitle('Home');

  const summary = useQuery({
    queryKey: ['public', 'summary'],
    queryFn: () => api<{ books: number; inside: number; visitsToday: number }>('/public/summary'),
    refetchInterval: 60_000,
  });

  const latest = useQuery({
    queryKey: ['books', 'latest'],
    queryFn: () => api<{ rows: Book[] }>('/books?pageSize=4&sort=newest'),
  });

  const books = latest.data?.rows ?? [];
  const schoolName = settings?.schoolName ?? 'Tema Secondary School';
  const staff = user?.role === 'librarian' || user?.role === 'admin';

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-forest-950 text-parchment">
        <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.16]" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-[440px] w-[440px] rounded-full border border-brass-400/12" />
        <div className="pointer-events-none absolute -right-6 top-10 h-[300px] w-[300px] rounded-full border border-brass-400/10" />
        <div className="container-x relative grid gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <div className="flex items-center gap-3">
              <SchoolCrest className="h-12 w-12" dark />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brass-300/80">{schoolName}</p>
                <p className="mt-1 text-[11.5px] text-parchment/45">{settings?.motto ?? 'Knowledge, Integrity, Service'}</p>
              </div>
            </div>
            <h1 className="mt-7 text-balance font-display text-[44px] leading-[1.02] text-parchment sm:text-[62px]">
              Every book.<br />Any device.<br /><span className="text-brass-300">One ID.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-parchment/60">
              Create your library account and you are issued a library ID on the spot. Use it to open every
              book the library has put online — phone, laptop or library computer.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {user ? (
                <Link to={staff ? '/app' : '/books'}>
                  <Button size="lg" variant="brass" icon={staff ? DoorOpen : BookOpen} className="h-12 w-full px-7 text-[15px] sm:w-auto">
                    {staff ? 'Open staff dashboard' : 'Open my library'}
                  </Button>
                </Link>
              ) : (
                <Link to="/register">
                  <Button size="lg" variant="brass" icon={IdCard} className="h-12 w-full px-7 text-[15px] sm:w-auto">
                    Create a student account
                  </Button>
                </Link>
              )}
              <Link to="/books">
                <Button size="lg" variant="secondary" icon={LibraryBig} className="h-12 w-full border-parchment/20 bg-transparent px-7 text-[15px] text-parchment hover:bg-parchment/10 sm:w-auto">
                  Browse online books
                </Button>
              </Link>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-9 gap-y-4 border-t border-parchment/10 pt-6">
              {[
                { label: 'Books online', value: summary.data?.books ?? 0, icon: LibraryBig },
                { label: 'Visits today', value: summary.data?.visitsToday ?? 0, icon: Users },
                { label: 'In the library', value: summary.data?.inside ?? 0, icon: DoorOpen },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5">
                  <stat.icon className="h-4 w-4 text-brass-400/70" />
                  <div>
                    <dd className="font-display text-xl leading-none text-parchment">{stat.value}</dd>
                    <dt className="mt-1 text-[10px] uppercase tracking-[0.12em] text-parchment/40">{stat.label}</dt>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          {/* Library card */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-3 rounded-[32px] border border-parchment/10" />
            <div className="relative overflow-hidden rounded-[26px] border border-parchment/15 bg-parchment shadow-2xl">
              <div className="flex items-center justify-between bg-forest-950 px-5 py-3.5 text-parchment">
                <span className="font-display text-[15px]">Library card</span>
                <SchoolCrest className="h-6 w-6" dark />
              </div>
              <div className="relative px-5 py-6">
                <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.05]" />
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink/35">Library ID</p>
                <p className="mt-1 font-display text-[26px] tracking-tight text-ink">LIB-2026-0042</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink/30">Reader</p>
                    <p className="mt-1 text-[13px] font-semibold text-ink">Ama Mensah</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink/30">Class</p>
                    <p className="mt-1 text-[13px] font-semibold text-ink">2 Science 1</p>
                  </div>
                </div>
                <div className="mt-6 flex h-9 items-end gap-[3px] opacity-70" aria-hidden>
                  {[3, 7, 2, 8, 4, 9, 2, 6, 3, 8, 5, 2, 9, 4, 7, 3, 8, 2, 6, 9, 3, 7, 4, 8, 2, 5, 9, 3, 6, 8, 4, 7, 2, 9, 5, 3, 8, 6, 2, 7, 4, 9].map((height, index) => (
                  <span key={index} className="w-[2px] rounded-sm bg-ink/60" style={{ height: `${height * 10}%` }} />
                  ))}
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-ink/35">Sign in · Read · Return</p>
              </div>
              <div className="border-t border-ink/10 bg-white/60 px-5 py-3 text-center text-[11px] text-ink-mute">
                Your ID is issued the moment you register.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two audiences */}
      <section className="container-x py-16">
        <div className="max-w-xl">
          <p className="eyebrow">What this site does</p>
          <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Reading first. Desk second.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-mute">
            Students get a library ID and read the whole collection online. Library staff upload the books and
            run the front-desk kiosk from the same place.
          </p>
        </div>

        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-white p-7 shadow-sm sm:p-9">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-700/10 text-forest-700">
              <MonitorSmartphone className="h-6 w-6" />
            </span>
            <h3 className="mt-6 font-display text-2xl text-ink">Read the library online</h3>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-mute">
              Register as a student, get your library ID, and every uploaded book is yours to read — no paper
              card, no queue at the desk.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-[11px] text-ink/45">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-forest-600" /> Instant library ID</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-forest-600" /> Read on any device</span>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to={user ? '/books' : '/register'}>
                <Button icon={user ? BookOpen : IdCard}>{user ? 'Open my library' : 'Create a student account'}</Button>
              </Link>
              <Link to="/books" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-forest-700 hover:underline">
                Browse the shelves <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-forest-900 p-7 text-parchment shadow-card sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.14]" />
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-brass-400/15" />
            <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brass-400/15 text-brass-300">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h3 className="relative mt-6 font-display text-2xl">For library staff</h3>
            <p className="relative mt-2 max-w-md text-[13.5px] leading-relaxed text-parchment/60">
              Sign in with a librarian or admin account to run the front-desk kiosk, sign walk-ins in and out,
              and upload new books to the online shelves.
            </p>
            <div className="relative mt-6 flex flex-wrap gap-4 text-[11px] text-parchment/45">
              <span className="inline-flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5 text-brass-400/70" /> Upload books</span>
              <span className="inline-flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5 text-brass-400/70" /> Staff-run kiosk</span>
            </div>
            <div className="relative mt-7 flex flex-wrap items-center gap-3">
              <Link to={staff ? '/app' : '/login?next=/app'}>
                <Button variant="brass" icon={staff ? DoorOpen : ShieldCheck}>
                  {staff ? 'Open staff dashboard' : 'Staff sign in'}
                </Button>
              </Link>
              {staff ? (
                <Link to="/kiosk" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brass-300 hover:text-brass-200">
                  Kiosk screen <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            <p className="relative mt-4 text-[10.5px] text-parchment/30">Librarian and admin accounts only.</p>
          </div>
        </div>
      </section>

      {/* Newest books */}
      {books.length ? (
        <section className="border-y border-ink/10 bg-parchment-light/60">
          <div className="container-x py-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Recently added</p>
                <h2 className="mt-2 text-3xl text-ink">Fresh on the shelves</h2>
              </div>
              <Link to="/books" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-forest-700 hover:underline">
                See all {summary.data?.books ? `(${summary.data.books})` : ''} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {books.map((book) => (
                <Link
                  key={book.id}
                  to={user ? `/books/${book.id}` : '/login'}
                  state={user ? undefined : { from: `/books/${book.id}` }}
                  className="group rounded-2xl border border-ink/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-forest-600/25 hover:shadow-md"
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    color={book.coverColor}
                    imageUrl={book.coverUrl}
                    style={book.id}
                    size="lg"
                    className="mx-auto w-full max-w-[150px]"
                  />
                  <p className="mt-4 line-clamp-2 text-[14px] font-semibold leading-snug text-ink">{book.title}</p>
                  <p className="mt-1 truncate text-[11.5px] text-ink-mute">{book.author ?? 'Library collection'}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-forest-700">
                    Read online <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Library ID strip */}
      <section className="container-x py-14">
        <div className="flex flex-col gap-6 rounded-3xl border border-brass-500/25 bg-brass-100/40 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brass-400/25 text-brass-800">
              <IdCard className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-2xl text-ink">One ID, every book.</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-mute">
                Your library ID is issued when you register and stays with you for as long as you are at the
                school. Sign in anywhere to pick up where you left off.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            {user ? (
              <Link to={staff ? '/app' : '/books'}><Button size="lg" icon={staff ? DoorOpen : LibraryBig}>{staff ? 'Staff dashboard' : 'My online library'}</Button></Link>
            ) : (
              <>
                <Link to="/register"><Button size="lg">Get a library ID</Button></Link>
                <Link to="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
