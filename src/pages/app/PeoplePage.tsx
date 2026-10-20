import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, Download, KeyRound, LogOut, Search, ShieldBan, ShieldCheck, UserRound, Users,
} from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import {
  Avatar, Badge, Button, EmptyState, Modal, PageHeader, Pagination, StatCard, Table, Tabs, useConfirm, useToast,
} from '../../components/ui';

type Kind = 'member' | 'walkin';

type Person = {
  kind: Kind;
  key: string;
  userId: number | null;
  libraryId: string | null;
  name: string;
  email: string | null;
  role: string | null;
  status: string | null;
  className: string | null;
  house: string | null;
  joinedAt: string | null;
  lastLogin: string | null;
  visits: number;
  lastVisit: string | null;
};

type PeopleResponse = {
  rows: Person[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  summary: { members: number; students: number; suspended: number; walkIns: number };
};

type VisitRow = {
  id: number;
  full_name: string;
  class_name: string | null;
  house: string | null;
  purpose: string | null;
  book_taken: string | null;
  signed_in_at: string;
  signed_out_at: string | null;
  minutes: number;
};

type DetailResponse = { person: Person | null; visits: VisitRow[] };

const ROLE_TONE: Record<string, 'green' | 'blue' | 'brass' | 'violet'> = {
  student: 'blue',
  teacher: 'violet',
  librarian: 'brass',
  admin: 'green',
};

const nameParts = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first: first ?? '?', last: rest.join(' ') };
};

const randomPassword = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pick = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join('');
  return `${pick(letters, 8)}${pick(digits, 4)}`;
};

export function PeoplePage() {
  useDocumentTitle('People');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Person | null>(null);
  const [resetting, setResetting] = useState<Person | null>(null);
  const [tempPassword, setTempPassword] = useState(randomPassword);
  const [resetDone, setResetDone] = useState(false);

  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const listKey = ['people', kind, debounced, page];
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api<PeopleResponse>(
      `/people?kind=${kind}&q=${encodeURIComponent(debounced)}&page=${page}&pageSize=20`
    ),
  });

  const detail = useQuery({
    queryKey: ['people', 'detail', selected?.kind, selected?.key],
    queryFn: () => api<DetailResponse>(`/people/${selected!.kind}/${encodeURIComponent(selected!.key)}`),
    enabled: Boolean(selected),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['people'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ person, status }: { person: Person; status: 'active' | 'suspended' }) =>
      api(`/people/${person.userId}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (_data, variables) => {
      toast.push({
        tone: 'success',
        title: variables.status === 'suspended' ? 'Account suspended' : 'Account re-activated',
        description:
          variables.status === 'suspended'
            ? `${variables.person.name} has been signed out everywhere and cannot sign in.`
            : `${variables.person.name} can sign in again.`,
      });
      setSelected((current) => (current ? { ...current, status: variables.status } : current));
      refresh();
    },
    onError: (error: Error) => toast.push({ tone: 'error', title: 'Could not change the account', description: error.message }),
  });

  const signOutMutation = useMutation({
    mutationFn: (person: Person) => api(`/people/${person.userId}/sign-out`, { method: 'POST' }),
    onSuccess: (_data, person) => {
      toast.push({ tone: 'success', title: 'Signed out everywhere', description: `${person.name} will need to sign in again on every device.` });
      refresh();
    },
    onError: (error: Error) => toast.push({ tone: 'error', title: 'Could not sign that account out', description: error.message }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ person, password }: { person: Person; password: string }) =>
      api(`/people/${person.userId}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => setResetDone(true),
    onError: (error: Error) => toast.push({ tone: 'error', title: 'Could not reset the password', description: error.message }),
  });

  const exportCsv = async () => {
    try {
      const blob = await apiBlob(`/people/export.csv?kind=${kind}&q=${encodeURIComponent(debounced)}`);
      downloadBlob(blob, `library-people-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      toast.push({ tone: 'error', title: 'The CSV could not be downloaded', description: (error as Error).message });
    }
  };

  const summary = data?.summary;
  const activePerson = detail.data?.person ?? selected;
  const isMember = activePerson?.kind === 'member';

  const totals = useMemo(() => ({
    all: summary ? summary.members + summary.walkIns : 0,
    member: summary?.members ?? 0,
    walkin: summary?.walkIns ?? 0,
  }), [summary]);

  const suspend = async (person: Person) => {
    const suspended = person.status === 'suspended';
    const ok = await confirm({
      title: suspended ? `Re-activate ${person.name}?` : `Suspend ${person.name}?`,
      message: suspended
        ? 'They will be able to sign in and read books again immediately.'
        : 'They will be signed out of every device and blocked from signing in until you re-activate the account. Their reading history is kept.',
      confirmLabel: suspended ? 'Re-activate' : 'Suspend account',
      tone: suspended ? 'default' : 'danger',
    });
    if (ok) statusMutation.mutate({ person, status: suspended ? 'active' : 'suspended' });
  };

  const forceSignOut = async (person: Person) => {
    const ok = await confirm({
      title: `Sign ${person.name} out?`,
      message: 'Every open session ends. They can sign straight back in with the same password.',
      confirmLabel: 'Sign out everywhere',
    });
    if (ok) signOutMutation.mutate(person);
  };

  const openReset = (person: Person) => {
    setTempPassword(randomPassword());
    setResetDone(false);
    setResetting(person);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Everyone the library knows"
        description="Registered members and kiosk-only visitors in one register. Search a name, check who has been in, and manage an account when it is needed."
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="People" value={summary ? summary.members + summary.walkIns : '—'} hint="Members and walk-ins" icon={Users} />
        <StatCard label="Members" value={summary?.members ?? '—'} hint="With a library ID" icon={BadgeCheck} />
        <StatCard label="Walk-ins" value={summary?.walkIns ?? '—'} hint="Kiosk sign-ins, no account" icon={UserRound} />
        <StatCard label="Suspended" value={summary?.suspended ?? '—'} hint="Blocked from signing in" icon={ShieldBan} />
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink/10 p-4 lg:flex-row lg:items-center">
          <Tabs
            value={kind}
            onChange={(value) => { setKind(value as typeof kind); setPage(1); }}
            items={[
              { value: 'all', label: 'Everyone', count: totals.all },
              { value: 'member', label: 'Members', count: totals.member },
              { value: 'walkin', label: 'Walk-ins', count: totals.walkin },
            ]}
          />
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search name, email, ID or class…"
              aria-label="Search people"
              className="field-input h-9 pl-9 text-[12.5px]"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-ink/[0.04]" />)}
          </div>
        ) : data?.rows.length ? (
          <>
            {/* Phones get cards; the full register is easier on a desk screen. */}
            <div className="divide-y divide-ink/[0.06] md:hidden">
              {data.rows.map((person) => {
                const parts = nameParts(person.name);
                return (
                  <button
                    key={`${person.kind}-${person.key}`}
                    type="button"
                    onClick={() => setSelected(person)}
                    className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-parchment/60"
                  >
                    <Avatar firstName={parts.first} lastName={parts.last} size="sm" hue={person.kind === 'member' ? 150 : 35} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-ink">{person.name}</p>
                        {person.kind === 'walkin'
                          ? <Badge tone="amber">walk-in</Badge>
                          : person.status === 'suspended'
                            ? <Badge tone="red">suspended</Badge>
                            : <Badge tone={ROLE_TONE[person.role ?? ''] ?? 'neutral'}>{person.role}</Badge>}
                      </div>
                      <p className="truncate text-[11.5px] text-ink-mute">
                        {[person.libraryId ?? 'No account', person.className, person.house].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 text-[11px] text-ink/40">
                        {person.visits} visit{person.visits === 1 ? '' : 's'}
                        {person.lastVisit ? ` · last ${timeAgo(person.lastVisit)}` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block">
              <Table minWidth="min-w-[860px]">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Source</th>
                    <th>Role</th>
                    <th>Class / house</th>
                    <th>Visits</th>
                    <th>Last seen</th>
                    <th className="text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((person) => {
                    const parts = nameParts(person.name);
                    return (
                      <tr key={`${person.kind}-${person.key}`} className="cursor-pointer" onClick={() => setSelected(person)}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar firstName={parts.first} lastName={parts.last} size="sm" hue={person.kind === 'member' ? 150 : 35} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">{person.name}</p>
                              <p className="truncate text-[11px] text-ink-mute">
                                {person.libraryId ?? person.email ?? 'Kiosk visitor'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {person.kind === 'member'
                            ? <Badge tone="green" dot>member</Badge>
                            : <Badge tone="amber">walk-in</Badge>}
                        </td>
                        <td>
                          {person.kind === 'member'
                            ? <Badge tone={ROLE_TONE[person.role ?? ''] ?? 'neutral'}>{person.role}</Badge>
                            : <span className="text-ink/35">—</span>}
                        </td>
                        <td>{[person.className, person.house].filter(Boolean).join(' · ') || <span className="text-ink/35">—</span>}</td>
                        <td className="tabular-nums">{person.visits}</td>
                        <td>{person.lastVisit ? timeAgo(person.lastVisit) : <span className="text-ink/35">Never</span>}</td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(event) => { event.stopPropagation(); setSelected(person); }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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
              icon={Users}
              title={debounced ? 'Nobody matches that search' : 'No people yet'}
              description={debounced
                ? 'Try a different name, email, library ID, class or house.'
                : 'Members appear when they register. Walk-ins appear after their first kiosk sign-in.'}
            />
          </div>
        )}
      </section>

      <p className="text-[11.5px] text-ink/40">
        Walk-in records are created at the kiosk when a visitor has no library account. They keep their sign-in history but cannot receive in-app messages.
      </p>

      {/* Profile */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={activePerson?.name ?? 'Person'}
        description={isMember ? 'Library member' : 'Kiosk-only visitor — no account'}
        size="lg"
        footer={isMember && activePerson?.userId && activePerson.userId !== user?.id ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" icon={KeyRound} onClick={() => activePerson && openReset(activePerson)}>
              Reset password
            </Button>
            <Button variant="outline" icon={LogOut} onClick={() => activePerson && forceSignOut(activePerson)} loading={signOutMutation.isPending}>
              Sign out everywhere
            </Button>
            {activePerson.status === 'suspended' ? (
              <Button icon={ShieldCheck} onClick={() => suspend(activePerson)} loading={statusMutation.isPending}>
                Re-activate
              </Button>
            ) : (
              <Button variant="danger" icon={ShieldBan} onClick={() => suspend(activePerson)} loading={statusMutation.isPending}>
                Suspend account
              </Button>
            )}
          </div>
        ) : null}
      >
        {!activePerson ? null : (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Avatar
                firstName={nameParts(activePerson.name).first}
                lastName={nameParts(activePerson.name).last}
                size="lg"
                hue={isMember ? 150 : 35}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={isMember ? 'green' : 'amber'}>{isMember ? 'member' : 'walk-in'}</Badge>
                  {isMember && activePerson.role
                    ? <Badge tone={ROLE_TONE[activePerson.role] ?? 'neutral'}>{activePerson.role}</Badge>
                    : null}
                  {activePerson.status === 'suspended' ? <Badge tone="red">suspended</Badge> : null}
                </div>
                <p className="mt-2 text-[12.5px] text-ink-mute">{activePerson.email ?? 'No email on record'}</p>
                <p className="text-[12px] text-ink/45">
                  {activePerson.libraryId ? `Library ID ${activePerson.libraryId}` : 'Signed in at the kiosk as a guest'}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink/10 bg-parchment/50 p-3 text-[12px] sm:grid-cols-3">
              {[
                ['Class', activePerson.className ?? '—'],
                ['House', activePerson.house ?? '—'],
                ['Visits', String(activePerson.visits)],
                ['Joined', activePerson.joinedAt ? formatDate(activePerson.joinedAt) : '—'],
                ['Last visit', activePerson.lastVisit ? formatDateTime(activePerson.lastVisit) : '—'],
                ['Last login', activePerson.lastLogin ? formatDateTime(activePerson.lastLogin) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink/35">{label}</dt>
                  <dd className="mt-0.5 truncate font-semibold text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/40">Recent visits</h3>
              {detail.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-ink/[0.04]" />)}
                </div>
              ) : detail.data?.visits.length ? (
                <ul className="divide-y divide-ink/[0.06] rounded-xl border border-ink/10">
                  {detail.data.visits.map((visit) => (
                    <li key={visit.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-ink-soft">{formatDate(visit.signed_in_at)}</p>
                        <p className="truncate text-[11px] text-ink-mute">
                          {[visit.class_name, visit.house, visit.purpose].filter(Boolean).join(' · ')}
                          {visit.book_taken ? ` · ${visit.book_taken}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-ink/40">
                        {visit.signed_out_at ? `${visit.minutes} min` : 'Inside'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-ink/15 px-3 py-4 text-[12px] text-ink-mute">
                  No visits recorded for this person yet.
                </p>
              )}
            </section>

            {!isMember ? (
              <p className="rounded-xl bg-brass-50 px-3 py-2.5 text-[12px] leading-relaxed text-brass-900">
                This person signed in at the kiosk without a matching account, so there is nothing to suspend or reset.
                If they register, future visits will link to their account automatically.
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title={resetDone ? 'Temporary password ready' : 'Reset password'}
        description={resetDone
          ? 'Give this password to the person directly. They are signed out everywhere and can change it from their account.'
          : `Set a temporary password for ${resetting?.name ?? 'this member'}. They will be signed out of every device.`}
        size="sm"
        footer={resetDone ? (
          <Button onClick={() => setResetting(null)}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>Cancel</Button>
            <Button
              icon={KeyRound}
              loading={resetMutation.isPending}
              disabled={tempPassword.length < 8 || !/[A-Za-z]/.test(tempPassword) || !/[0-9]/.test(tempPassword)}
              onClick={() => resetting && resetMutation.mutate({ person: resetting, password: tempPassword })}
            >
              Reset password
            </Button>
          </>
        )}
      >
        {resetDone ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-600/25 bg-forest-50 px-3 py-3">
              <code className="select-all break-all text-[15px] font-semibold tracking-wide text-forest-900">{tempPassword}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tempPassword);
                    toast.push({ tone: 'success', title: 'Password copied' });
                  } catch {
                    toast.push({ tone: 'error', title: 'Copy failed', description: 'Select the password and copy it manually.' });
                  }
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-mute">
              Share it privately. It will not be shown again, and {resetting?.name} should change it after signing in.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Temporary password</span>
              <div className="flex gap-2">
                <input
                  value={tempPassword}
                  onChange={(event) => setTempPassword(event.target.value)}
                  className="field-input flex-1 font-mono text-[13px]"
                  autoComplete="new-password"
                />
                <Button variant="secondary" onClick={() => setTempPassword(randomPassword())}>Generate</Button>
              </div>
            </label>
            <p className="text-[11.5px] leading-relaxed text-ink/45">
              At least 8 characters with a letter and a number. The member keeps their library ID.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
