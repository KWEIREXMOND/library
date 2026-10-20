import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity as ActivityIcon, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { Badge, EmptyState, PageHeader, Pagination, Table } from '../../components/ui';

type Entry = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  ip: string | null;
  createdAt: string;
  actor: string;
  actorRole: string | null;
};

type ActivityResponse = {
  rows: Entry[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.register': 'Registered',
  'auth.password_reset': 'Reset a password',
  'user.suspend': 'Suspended an account',
  'user.activate': 'Re-activated an account',
  'user.force_signout': 'Forced a sign-out',
  'user.password_reset': 'Reset an account password',
  'announcement.publish': 'Sent a broadcast',
  'announcement.update': 'Updated a broadcast',
  'announcement.archive': 'Archived a broadcast',
  'announcement.delete': 'Deleted a broadcast',
  'visit.sign_in': 'Signed a visitor in',
  'visit.sign_out': 'Signed a visitor out',
};

const label = (action: string) =>
  ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function ActivityPage() {
  useDocumentTitle('Activity');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['activity', debounced, page],
    queryFn: () => api<ActivityResponse>(`/activity?q=${encodeURIComponent(debounced)}&page=${page}&pageSize=25`),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Activity log"
        description="Who did what, and when. Sign-ins, account changes, broadcasts and front-desk activity are all recorded here."
      />

      <section className="rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-ink/10 p-4">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search action, summary or person…"
              aria-label="Search activity"
              className="field-input h-9 pl-9 text-[12.5px]"
            />
          </div>
          <span className="ml-auto hidden shrink-0 text-[11.5px] text-ink/35 sm:block">
            {data ? `${data.total} entries` : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-ink/[0.04]" />)}
          </div>
        ) : data?.rows.length ? (
          <>
            <div className="divide-y divide-ink/[0.06] md:hidden">
              {data.rows.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-ink">{label(entry.action)}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-mute">{entry.actor}</p>
                    </div>
                    <span className="shrink-0 text-[10.5px] text-ink/35">{timeAgo(entry.createdAt)}</span>
                  </div>
                  {entry.summary ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">{entry.summary}</p> : null}
                  <p className="mt-1 text-[10.5px] text-ink/30">{formatDateTime(entry.createdAt)}</p>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table minWidth="min-w-[760px]">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What</th>
                    <th>Detail</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap">
                        <p className="font-semibold text-ink-soft">{formatDateTime(entry.createdAt)}</p>
                        <p className="text-[11px] text-ink/35">{timeAgo(entry.createdAt)}</p>
                      </td>
                      <td>
                        <p className="font-semibold text-ink">{entry.actor}</p>
                        {entry.actorRole ? <p className="text-[11px] capitalize text-ink-mute">{entry.actorRole}</p> : null}
                      </td>
                      <td><Badge tone="neutral">{label(entry.action)}</Badge></td>
                      <td><span className="line-clamp-2">{entry.summary ?? <span className="text-ink/35">—</span>}</span></td>
                      <td className="font-mono text-[11px] text-ink/40">{entry.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {data.pages > 1 ? (
              <Pagination
                className="border-t border-ink/10"
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={data.pageSize}
                onPage={setPage}
              />
            ) : null}
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={ActivityIcon}
              title={debounced ? 'Nothing matches that search' : 'No activity recorded yet'}
              description={debounced ? 'Try a name or an action such as “suspend”.' : 'Actions appear here as people use the library.'}
            />
          </div>
        )}
      </section>
    </div>
  );
}
