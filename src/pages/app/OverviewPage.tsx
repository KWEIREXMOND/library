import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, BookOpen, Clock3, DoorOpen, FilePlus2, LibraryBig, UploadCloud, Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatTime, timeAgo } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { BookCover } from '../../components/BookCover';
import { Badge, Button, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { SignOutDialog } from '../../components/SignOutDialog';
import type { Book } from '../../lib/types';

type VisitRow = {
  id: number;
  fullName: string;
  className: string | null;
  house: string | null;
  purpose: string | null;
  bookTaken: string | null;
  signedInAt: string;
  signedOutAt: string | null;
  isInside: boolean;
  minutesInside: number;
  matchedMember: boolean;
};

type VisitsResponse = {
  rows: VisitRow[];
  total: number;
  summary: { inside: number; visitsToday: number; walkInsToday: number; averageMinutes: number };
};

export function OverviewPage() {
  useDocumentTitle('Overview');
  const [signOutVisit, setSignOutVisit] = useState<VisitRow | null>(null);

  const visits = useQuery({
    queryKey: ['visits', 'overview'],
    queryFn: () => api<VisitsResponse>('/visits?status=inside&pageSize=6'),
    refetchInterval: 30_000,
  });

  const books = useQuery({
    queryKey: ['books', 'manage', 'overview'],
    queryFn: () => api<{ rows: Book[]; summary: { total: number; published: number; drafts: number; views: number } }>('/books/manage?pageSize=4'),
  });

  const summary = visits.data?.summary;
  const bookSummary = books.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Front desk"
        title="A quiet desk is a good desk."
        description="Everyone who signed in at the kiosk, and every book on the online shelves — in one place."
        actions={
          <>
            <Link to="/app/visits"><Button variant="secondary" icon={DoorOpen}>Sign-in register</Button></Link>
            <Link to="/app/books/new"><Button icon={UploadCloud}>Add a book</Button></Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Inside now" value={summary?.inside ?? '—'} hint="Signed in and not yet out" icon={Users} />
        <StatCard label="Visits today" value={summary?.visitsToday ?? '—'} hint={`${summary?.walkInsToday ?? 0} walk-ins without an account`} icon={DoorOpen} />
        <StatCard label="Books online" value={bookSummary?.published ?? '—'} hint={`${bookSummary?.drafts ?? 0} not published`} icon={LibraryBig} />
        <StatCard label="Average visit" value={summary ? `${summary.averageMinutes} min` : '—'} hint="Completed visits today" icon={Clock3} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-2xl border border-ink/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
            <div>
              <h2 className="font-display text-lg text-ink">In the library now</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-mute">Tap a name to close their visit when they leave.</p>
            </div>
            <Link to="/app/visits" className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest-700 hover:underline">
              Full register <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {visits.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((row) => <div key={row} className="h-14 animate-pulse rounded-xl bg-ink/[0.04]" />)}
            </div>
          ) : visits.data?.rows.length ? (
            <ul className="divide-y divide-ink/[0.06]">
              {visits.data.rows.map((visit) => (
                <li key={visit.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-700/10 text-[11px] font-bold uppercase text-forest-800">
                    {visit.fullName.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{visit.fullName}</p>
                    <p className="truncate text-[11.5px] text-ink-mute">
                      {[visit.className, visit.house, visit.purpose].filter(Boolean).join(' · ') || 'No details given'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] font-medium text-ink-soft">{formatTime(visit.signedInAt)}</p>
                    <p className="text-[10.5px] text-ink/40">{visit.minutesInside} min</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setSignOutVisit(visit)}>
                    Sign out
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <EmptyState icon={DoorOpen} title="Nobody has signed in yet" description="The kiosk is ready — leave it open on the front-desk screen." action={<Link to="/kiosk"><Button size="sm" variant="outline">Open the kiosk</Button></Link>} />
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg text-ink">Quick actions</h2>
            <div className="mt-4 space-y-2">
              {[
                { to: '/kiosk', label: 'Open the sign-in kiosk', hint: 'Full screen, ready for visitors', icon: DoorOpen },
                { to: '/app/books/new', label: 'Upload a book', hint: 'PDF, cover and a few details', icon: FilePlus2 },
                { to: '/app/books', label: 'Manage online books', hint: `${bookSummary?.total ?? 0} in the library`, icon: LibraryBig },
                { to: '/app/analytics', label: 'See the analytics', hint: 'Traffic, houses and reading habits', icon: BarChart3 },
                { to: '/books', label: 'See what students see', hint: 'Browse the public shelves', icon: BookOpen },
              ].map((action) => (
                <Link key={action.to} to={action.to} className="group flex items-center gap-3 rounded-xl border border-ink/10 px-3.5 py-3 transition hover:border-forest-600/25 hover:bg-forest-50/60">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-700/10 text-forest-700">
                    <action.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-ink">{action.label}</span>
                    <span className="block truncate text-[11px] text-ink-mute">{action.hint}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-forest-700" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-ink">Just uploaded</h2>
              <Link to="/app/books" className="text-[11.5px] font-semibold text-forest-700 hover:underline">All books</Link>
            </div>
            <div className="mt-4 space-y-3">
              {(books.data?.rows ?? []).map((book) => (
                <div key={book.id} className="flex items-center gap-3">
                  <BookCover title={book.title} author={book.author} color={book.coverColor} imageUrl={book.coverUrl} style={book.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{book.title}</p>
                    <p className="truncate text-[10.5px] text-ink-mute">{timeAgo(book.createdAt)} · {book.viewCount} reads</p>
                  </div>
                  {book.status === 'approved' ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Draft</Badge>}
                </div>
              ))}
              {!(books.data?.rows ?? []).length ? (
                <p className="text-[12px] text-ink-mute">No books uploaded yet.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <SignOutDialog
        visit={signOutVisit}
        open={Boolean(signOutVisit)}
        onClose={() => setSignOutVisit(null)}
      />
    </div>
  );
}
