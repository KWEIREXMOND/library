import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, BookOpen, Clock3, DoorOpen, Download, Eye, TrendingUp, UserRound, Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Badge, Button, EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui';

type Analytics = {
  range: { days: number; from: string | null; to: string | null };
  generatedAt: string;
  visits: {
    inside: number; today: number; yesterday: number; lastWeek: number; range: number;
    walkIns: number; unique: number; repeat: number; averageMinutes: number;
  };
  members: { total: number; students: number; teachers: number; staff: number; newInRange: number };
  books: {
    total: number; published: number; drafts: number; views: number; downloads: number; addedInRange: number;
    topViewed: Array<{ id: number; title: string; author: string | null; views: number }>;
    mostTaken: Array<{ title: string; count: number }>;
  };
  series: Array<{ date: string; label: string; count: number }>;
  houses: Array<{ house: string; count: number }>;
  purposes: Array<{ purpose: string; count: number }>;
  peakHours: Array<{ hour: number; count: number }>;
  staff: Array<{ name: string; count: number }>;
};

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export function AnalyticsPage() {
  useDocumentTitle('Analytics');
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api<Analytics>(`/analytics?days=${days}`),
    refetchInterval: 60_000,
  });

  const maxVisits = Math.max(1, ...(data?.series.map((point) => point.count) ?? [1]));
  const maxHour = Math.max(1, ...(data?.peakHours.map((point) => point.count) ?? [1]));
  const totalHouses = Math.max(1, (data?.houses ?? []).reduce((total, row) => total + row.count, 0));
  const busiest = data?.series.reduce((best, point) => (point.count > best.count ? point : best), { date: '', label: '', count: 0 });
  const today = data?.visits.today ?? 0;
  const yesterday = data?.visits.yesterday ?? 0;
  const change = yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="How the library is being used."
        description="Walk-in traffic, reading habits and the online shelves — calculated live from the sign-in register and the book library."
        actions={
          <div className="inline-flex rounded-xl bg-ink/[0.045] p-1" role="group" aria-label="Analytics range">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                onClick={() => setDays(range.days)}
                aria-pressed={days === range.days}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                  days === range.days ? 'bg-white text-ink shadow-sm' : 'text-ink-mute hover:text-ink'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Visits · last ${days} days`}
          value={isLoading ? '—' : data?.visits.range ?? 0}
          hint={change === null ? `${today} today` : `${today} today · ${change >= 0 ? '+' : ''}${change}% vs yesterday`}
          icon={DoorOpen}
        />
        <StatCard
          label="Inside now"
          value={isLoading ? '—' : data?.visits.inside ?? 0}
          hint="Signed in, not yet out"
          icon={Users}
        />
        <StatCard
          label="Unique visitors"
          value={isLoading ? '—' : data?.visits.unique ?? 0}
          hint={`${data?.visits.repeat ?? 0} came back more than once`}
          icon={UserRound}
        />
        <StatCard
          label="Average visit"
          value={isLoading ? '—' : `${data?.visits.averageMinutes ?? 0} min`}
          hint={`${data?.visits.walkIns ?? 0} walk-ins without an account`}
          icon={Clock3}
        />
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">Visits per day</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-mute">
              Kiosk sign-ins, day by day
              {busiest && busiest.count > 0 ? ` · busiest ${busiest.label} with ${busiest.count}` : ''}
            </p>
          </div>
          <Badge tone="green" dot>{data?.range.from ?? '—'} → {data?.range.to ?? '—'}</Badge>
        </div>

        {isLoading ? (
          <Skeleton className="mt-5 h-44 w-full" />
        ) : (
          <div className="mt-5">
            <div className="relative h-44">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((line) => <div key={line} className="border-t border-dashed border-ink/[0.07]" />)}
              </div>
              <div className="relative flex h-full items-end gap-[1.5px] sm:gap-[3px]">
                {data?.series.map((point) => (
                  <div key={point.date} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[3px] bg-forest-700/75 transition group-hover:bg-forest-700"
                      style={{ height: `${Math.max(2, (point.count / maxVisits) * 100)}%` }}
                      title={`${point.date}: ${point.count} visit${point.count === 1 ? '' : 's'}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wide text-ink/35">
              <span>{data?.series[0]?.label}</span>
              <span className="hidden sm:inline">{data?.series[Math.floor((data.series.length - 1) / 2)]?.label}</span>
              <span>{data?.series[data.series.length - 1]?.label}</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-lg text-ink">Which houses come in</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-mute">Houses typed at the kiosk</p>
          <div className="mt-4 space-y-3">
            {isLoading ? (
              [0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-7 w-full" />)
            ) : data?.houses.length ? (
              data.houses.map((row) => (
                <div key={row.house}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-ink-soft">{row.house}</span>
                    <span className="tabular-nums text-ink-mute">{row.count} · {Math.round((row.count / totalHouses) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-forest-700/70" style={{ width: `${(row.count / totalHouses) * 100}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState icon={BarChart3} title="No visits yet" description="House numbers appear once the kiosk records a visit." />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-lg text-ink">Busiest hours</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-mute">When the library fills up</p>
          <div className="mt-5">
            <div className="flex h-32 items-end gap-[3px]">
              {data?.peakHours.map((point) => (
                <div key={point.hour} className="group flex h-full flex-1 items-end" title={`${String(point.hour).padStart(2, '0')}:00 — ${point.count} visits`}>
                  <div
                    className="w-full rounded-t-[2px] bg-brass-400/80 transition group-hover:bg-brass-500"
                    style={{ height: `${Math.max(2, (point.count / maxHour) * 100)}%` }}
                  />
                </div>
              )) ?? null}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink/35">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
          </div>
          {data?.purposes.length ? (
            <div className="mt-5 border-t border-ink/[0.07] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/35">Reasons for visiting</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.purposes.map((row) => (
                  <span key={row.purpose} className="rounded-full bg-ink/[0.045] px-2.5 py-1 text-[11.5px] text-ink-soft">
                    {row.purpose} <span className="text-ink/40">{row.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-lg text-ink">The people</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Members', value: data?.members.total ?? 0, icon: Users },
              { label: 'Students', value: data?.members.students ?? 0, icon: UserRound },
              { label: 'Teachers', value: data?.members.teachers ?? 0, icon: BookOpen },
              { label: 'Staff', value: data?.members.staff ?? 0, icon: TrendingUp },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-ink/10 px-3.5 py-3">
                <item.icon className="h-4 w-4 text-forest-700/70" />
                <p className="mt-2 font-display text-2xl text-ink">{isLoading ? '—' : item.value}</p>
                <p className="text-[11px] text-ink-mute">{item.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-mute">
            <span className="font-semibold text-forest-700">{data?.members.newInRange ?? 0}</span> new library IDs in the last {days} days.
          </p>

          {data?.staff.length ? (
            <div className="mt-5 border-t border-ink/[0.07] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/35">Signing people in</p>
              <ul className="mt-2 space-y-1.5">
                {data.staff.map((row) => (
                  <li key={row.name} className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">{row.name}</span>
                    <span className="tabular-nums text-ink-mute">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-ink">The online shelves</h2>
            <Badge tone="neutral">{data?.books.published ?? 0} published</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Books', value: data?.books.published ?? 0, icon: BookOpen },
              { label: 'Reads', value: data?.books.views ?? 0, icon: Eye },
              { label: 'Downloads', value: data?.books.downloads ?? 0, icon: Download },
              { label: 'Added', value: data?.books.addedInRange ?? 0, icon: TrendingUp },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-ink/[0.03] px-3 py-2.5">
                <item.icon className="h-3.5 w-3.5 text-ink/35" />
                <p className="mt-1.5 font-display text-xl text-ink">{isLoading ? '—' : item.value}</p>
                <p className="text-[10.5px] text-ink-mute">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/35">Most read online</p>
              <ul className="mt-2 space-y-2">
                {(data?.books.topViewed ?? []).map((book, index) => (
                  <li key={book.id} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-0.5 w-4 shrink-0 text-[10.5px] font-bold text-ink/25">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-soft">{book.title}</span>
                      <span className="text-[11px] text-ink-mute">{book.views} reads</span>
                    </span>
                  </li>
                ))}
                {!isLoading && !data?.books.topViewed.length ? <li className="text-[12px] text-ink-mute">No reads yet.</li> : null}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/35">Most taken at sign-out</p>
              <ul className="mt-2 space-y-2">
                {(data?.books.mostTaken ?? []).map((book, index) => (
                  <li key={book.title} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-0.5 w-4 shrink-0 text-[10.5px] font-bold text-ink/25">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-soft">{book.title}</span>
                      <span className="text-[11px] text-ink-mute">{book.count} visitor{book.count === 1 ? '' : 's'}</span>
                    </span>
                  </li>
                ))}
                {!isLoading && !data?.books.mostTaken.length ? <li className="text-[12px] text-ink-mute">No books recorded at sign-out yet.</li> : null}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-[11px] text-ink/40">
        <span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Live from the register and the shelves.</span>
        <span className="hidden sm:inline">·</span>
        <span>Updated {data ? new Date(data.generatedAt).toLocaleTimeString() : '—'}</span>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>
      </p>
    </div>
  );
}
