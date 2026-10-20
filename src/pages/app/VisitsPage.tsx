import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, DoorOpen, Download, LogOut, Search, Users } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import {
  Badge, Button, EmptyState, PageHeader, Pagination, StatCard, Table, Tabs, useToast,
} from '../../components/ui';
import { SignOutDialog } from '../../components/SignOutDialog';

type VisitRow = {
  id: number;
  fullName: string;
  className: string | null;
  house: string | null;
  purpose: string | null;
  itemBrought: string | null;
  bookTaken: string | null;
  signedInAt: string;
  signedOutAt: string | null;
  isInside: boolean;
  minutesInside: number;
  matchedMember: boolean;
};

type VisitsResponse = {
  rows: VisitRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  summary: { inside: number; visitsToday: number; walkInsToday: number; averageMinutes: number };
};

export function VisitsPage() {
  useDocumentTitle('Front desk sign-ins');
  const [signOutVisit, setSignOutVisit] = useState<VisitRow | null>(null);
  const [status, setStatus] = useState<'inside' | 'today' | 'all'>('inside');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [page, setPage] = useState(1);

  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['visits', status, debounced, page],
    queryFn: () => api<VisitsResponse>(
      `/visits?status=${status === 'inside' ? 'inside' : 'all'}${status === 'today' ? `&date=${new Date().toISOString().slice(0, 10)}` : ''}&q=${encodeURIComponent(debounced)}&page=${page}&pageSize=25`
    ),
    refetchInterval: 30_000,
  });

  const summary = data?.summary;

  // Downloads are fetched as a blob and saved from the page: navigating to the
  // export URL loses the app and some browsers refuse the download outright.
  const exportCsv = async () => {
    const date = new Date().toISOString().slice(0, 10);
    try {
      const blob = await apiBlob(`/visits/export?date=${date}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `visits-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.push({
        tone: 'error',
        title: 'The CSV could not be downloaded',
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sign-in register"
        title="Who is in the library?"
        description="Every kiosk sign-in lands here the moment it happens. Sign visitors out from this list when they leave."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Today’s CSV</Button>
            <Link to="/kiosk"><Button icon={DoorOpen}>Open the kiosk</Button></Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Inside now" value={summary?.inside ?? '—'} hint="Not yet signed out" icon={Users} />
        <StatCard label="Visits today" value={summary?.visitsToday ?? '—'} hint={`${summary?.walkInsToday ?? 0} walk-ins`} icon={DoorOpen} />
        <StatCard label="Average visit" value={summary ? `${summary.averageMinutes} min` : '—'} hint="Completed today" icon={LogOut} />
        <StatCard label="Matching members" value={data ? data.rows.filter((row) => row.matchedMember).length : '—'} hint="On this page" icon={Search} />
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center">
          <Tabs
            value={status}
            onChange={(value) => { setStatus(value as typeof status); setPage(1); }}
            items={[
              { value: 'inside', label: `Inside now${summary?.inside ? ` (${summary.inside})` : ''}` },
              { value: 'today', label: 'Today' },
              { value: 'all', label: 'All visits' },
            ]}
          />
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search name, class or book…"
              aria-label="Search visits"
              className="field-input h-9 pl-9 text-[12.5px]"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-ink/[0.04]" />)}
          </div>
        ) : data?.rows.length ? (
          <>
            {/* Phones get cards; the full table is easier on a desk screen. */}
            <div className="divide-y divide-ink/[0.06] md:hidden">
              {data.rows.map((visit) => (
                <div key={visit.id} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-700/10 text-[10.5px] font-bold uppercase text-forest-800">
                    {visit.fullName.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-ink">{visit.fullName}</p>
                        <p className="truncate text-[11px] text-ink-mute">
                          {[visit.className ?? 'Visitor', visit.house].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {visit.signedOutAt ? (
                        <span className="shrink-0 text-[10.5px] text-ink/35">{visit.minutesInside} min</span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setSignOutVisit(visit)}>Sign out</Button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ink-mute">
                      In {formatTime(visit.signedInAt)}
                      {visit.signedOutAt ? ` · out ${formatTime(visit.signedOutAt)}` : ''}
                      {visit.purpose ? ` · ${visit.purpose}` : ''}
                    </p>
                    {visit.bookTaken ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        <BookOpen className="h-3 w-3 shrink-0 text-ink/35" />
                        <span className="line-clamp-1">{visit.bookTaken}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <Table minWidth="min-w-[820px]">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Purpose</th>
                  <th>Book</th>
                  <th>Signed in</th>
                  <th>Signed out</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-700/10 text-[10.5px] font-bold uppercase text-forest-800">
                          {visit.fullName.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{visit.fullName}</p>
                          <p className="truncate text-[11px] text-ink-mute">
                            {[visit.className ?? 'Visitor', visit.house, visit.matchedMember ? 'member' : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{visit.purpose ?? <span className="text-ink/35">—</span>}</td>
                    <td>
                      {visit.bookTaken
                        ? <span className="line-clamp-1">{visit.bookTaken}</span>
                        : <span className="text-ink/35">—</span>}
                    </td>
                    <td>{formatTime(visit.signedInAt)}</td>
                    <td>
                      {visit.signedOutAt
                        ? formatTime(visit.signedOutAt)
                        : <Badge tone="green" dot>Inside</Badge>}
                    </td>
                    <td className="text-right">
                      {visit.signedOutAt ? (
                        <span className="text-[11px] text-ink/35">{visit.minutesInside} min</span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setSignOutVisit(visit)}>
                          Sign out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </div>
            {data.pages > 1 ? (
              <Pagination className="border-t border-ink/10" page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            ) : null}
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={DoorOpen}
              title={debounced ? 'No visits match that search' : 'No visits to show'}
              description={debounced ? 'Try a different name, class or book title.' : 'Open the kiosk on the front-desk screen and the first sign-in will appear here.'}
              action={<Link to="/kiosk"><Button size="sm" variant="outline">Open the kiosk</Button></Link>}
            />
          </div>
        )}
      </section>

      <SignOutDialog
        visit={signOutVisit}
        open={Boolean(signOutVisit)}
        onClose={() => setSignOutVisit(null)}
      />

      <p className="text-[11.5px] text-ink/40">
        Visits are timed from the moment they are recorded. Books are chosen when the visitor signs out. Export the day’s register at any time.
      </p>
    </div>
  );
}
