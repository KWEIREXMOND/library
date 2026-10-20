import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, DoorOpen, LayoutDashboard, LogOut,
  RefreshCw, ShieldCheck, Users, UserRound,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { SchoolCrest } from '../../components/Brand';
import { Alert, Button, Field, Input, Select, Spinner, useToast } from '../../components/ui';
import { SignOutDialog, type SignOutVisit } from '../../components/SignOutDialog';

type KioskVisit = {
  id: number;
  fullName: string;
  className: string | null;
  house: string | null;
  itemBrought: string | null;
  bookTaken: string | null;
  purpose: string | null;
  signedInAt: string;
  signedOutAt: string | null;
  isInside: boolean;
  minutesInside: number;
};

type InsideResponse = {
  count: number;
  recent: Array<{
    id: number;
    name: string;
    className: string | null;
    house: string | null;
    purpose: string | null;
    bookTaken: string | null;
    signedInAt: string;
  }>;
};

const HOUSES = ['1', '2', '3', '4', '5'];

const PURPOSES = ['Reading', 'Studying', 'Research', 'Borrowing a book', 'Returning a book', 'Computer use', 'Group work'];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="tabular-nums">
      {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export function KioskPage() {
  useDocumentTitle('Front desk kiosk');
  const { user, settings, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [lastVisit, setLastVisit] = useState<KioskVisit | null>(null);
  const [signOutVisit, setSignOutVisit] = useState<SignOutVisit | null>(null);
  const [form, setForm] = useState({ fullName: '', className: '', house: '', purpose: '', itemBrought: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const live = useQuery({
    queryKey: ['kiosk', 'inside'],
    queryFn: () => api<InsideResponse>('/kiosk/inside'),
    refetchInterval: 30_000,
  });

  const summary = useQuery({
    queryKey: ['kiosk', 'summary'],
    queryFn: () => api<{ inside: number; visitsToday: number; books: number }>('/kiosk/summary'),
    refetchInterval: 60_000,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['kiosk'] });
    void queryClient.invalidateQueries({ queryKey: ['visits'] });
  };

  const signIn = useMutation({
    mutationFn: () => api<{ visit: KioskVisit }>('/kiosk/sign-in', {
      method: 'POST',
      body: {
        fullName: form.fullName.trim(),
        className: form.className.trim() || null,
        house: form.house || null,
        purpose: form.purpose || null,
        itemBrought: form.itemBrought.trim() || null,
      },
    }),
    onSuccess: (result) => {
      setLastVisit(result.visit);
      setForm({ fullName: '', className: '', house: '', purpose: '', itemBrought: '' });
      setErrors({});
      refreshAll();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          toast.push({ title: 'Already signed in', description: error.message, tone: 'info' });
        }
        setErrors(error.fieldErrors);
      }
    },
  });

  const inside = live.data?.count ?? summary.data?.inside ?? 0;
  const firstName = useMemo(() => (lastVisit?.fullName ?? '').split(' ')[0], [lastVisit?.fullName]);
  const schoolName = settings?.schoolName ?? 'Tema Secondary School';

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-950 via-forest-900 to-forest-950" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.14]" />
      <div className="pointer-events-none absolute -left-32 top-10 h-[420px] w-[420px] rounded-full border border-brass-400/10" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[360px] w-[360px] rounded-full border border-parchment/[0.06]" />

      <div className="relative mx-auto max-w-6xl px-5 py-8 text-parchment sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SchoolCrest className="h-11 w-11" dark />
            <div>
              <p className="font-display text-xl leading-none text-parchment">Front desk kiosk</p>
              <p className="mt-1 text-[9.5px] uppercase tracking-[0.2em] text-parchment/40">{schoolName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-parchment/55">
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-brass-400/80" /><LiveClock /></span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-brass-400/80" />{inside} inside</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brass-400/25 bg-brass-400/10 px-3 py-1 text-[11px] font-semibold text-brass-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Staff only · {user?.firstName} {user?.lastName}
            </span>
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 rounded-full border border-parchment/15 px-3 py-1 text-[11.5px] font-semibold text-parchment/70 transition hover:border-parchment/30 hover:text-parchment"
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </Link>
            <button
              type="button"
              onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-parchment/15 px-3 py-1 text-[11.5px] font-semibold text-parchment/70 transition hover:border-parchment/30 hover:text-parchment"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </header>

        <div className="mt-8 grid gap-7 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
          <div>
            {lastVisit ? (
              <section className="rounded-3xl border border-parchment/15 bg-parchment/[0.06] p-7 backdrop-blur-sm sm:p-9">
                <span className="inline-flex items-center gap-2 rounded-full bg-forest-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-300 ring-1 ring-inset ring-brass-400/25">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Visitor signed in
                </span>
                <h1 className="mt-5 text-balance font-display text-4xl leading-tight text-parchment sm:text-5xl">
                  Welcome, {firstName}.
                </h1>
                <p className="mt-3 max-w-md text-[14px] leading-relaxed text-parchment/60">
                  {lastVisit.fullName} was signed in at{' '}
                  {new Date(lastVisit.signedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
                  Hand the screen back when they are ready — or sign them out now if they are leaving.
                </p>

                <dl className="mt-7 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Class', lastVisit.className ?? '—'],
                    ['House', lastVisit.house ?? '—'],
                    ['Purpose', lastVisit.purpose ?? '—'],
                    ['Item brought', lastVisit.itemBrought ?? '—'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-parchment/10 bg-forest-950/30 px-4 py-3">
                      <dt className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-parchment/35">{label}</dt>
                      <dd className="mt-1 text-[14px] font-medium text-parchment/85">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    variant="brass"
                    icon={LogOut}
                    className="h-14 flex-1 text-[16px]"
                    onClick={() => setSignOutVisit(lastVisit)}
                  >
                    Sign visitor out
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    icon={ArrowRight}
                    className="h-14 border-parchment/20 bg-transparent text-parchment hover:bg-parchment/10"
                    onClick={() => { setLastVisit(null); setErrors({}); }}
                  >
                    Next visitor
                  </Button>
                </div>
                <p className="mt-4 text-[11.5px] text-parchment/35">
                  The visit stays open until you sign them out. Books are recorded at sign-out, when the
                  visitor leaves.
                </p>
              </section>
            ) : (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brass-400/80">Staff sign-in</p>
                <h1 className="mt-3 text-balance font-display text-4xl leading-[1.05] text-parchment sm:text-[52px]">
                  Sign a visitor in.
                </h1>
                <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-parchment/60">
                  Type their details as they give them. If they already have a library account, the name is matched
                  automatically so the visit is linked to their record.
                </p>

                <form
                  className="mt-8 rounded-3xl border border-parchment/15 bg-parchment/[0.06] p-6 backdrop-blur-sm sm:p-8"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (form.fullName.trim().length < 2) {
                      setErrors({ fullName: 'Enter the visitor’s full name.' });
                      return;
                    }
                    setErrors({});
                    signIn.mutate();
                  }}
                >
                  {signIn.isError && !Object.keys(errors).length ? (
                    <Alert tone="danger" className="mb-5 border-clay-400/30 bg-clay-500/10 text-parchment">
                      {signIn.error instanceof ApiError ? signIn.error.message : 'We could not sign the visitor in. Please try again.'}
                    </Alert>
                  ) : null}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Visitor’s full name" required className="sm:col-span-2">
                      <Input
                        value={form.fullName}
                        onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                        placeholder="e.g. Ama Mensah"
                        icon={UserRound}
                        autoComplete="off"
                        autoFocus
                        invalid={Boolean(errors.fullName)}
                        className="h-14 rounded-xl border-parchment/20 bg-white/95 text-[16px] text-ink placeholder:text-ink/30"
                      />
                    </Field>

                    <Field label="Class" hint="Type the class as the visitor gives it.">
                      <Input
                        value={form.className}
                        onChange={(event) => setForm({ ...form, className: event.target.value })}
                        placeholder="e.g. 2 Science 1"
                        className="h-14 rounded-xl border-parchment/20 bg-white/95 text-[15px] text-ink"
                      />
                    </Field>

                    <Field label="House" hint="House 1 to House 5.">
                      <Select
                        value={form.house}
                        onChange={(event) => setForm({ ...form, house: event.target.value })}
                        className="h-14 rounded-xl border-parchment/20 bg-white/95 text-[15px] text-ink"
                      >
                        <option value="">Staff / visitor</option>
                        {HOUSES.map((value) => <option key={value} value={value}>House {value}</option>)}
                      </Select>
                    </Field>

                    <Field label="Why are they here?">
                      <Select
                        value={form.purpose}
                        onChange={(event) => setForm({ ...form, purpose: event.target.value })}
                        className="h-14 rounded-xl border-parchment/20 bg-white/95 text-[15px] text-ink"
                      >
                        <option value="">Choose a reason</option>
                        {PURPOSES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </Select>
                    </Field>

                    <Field label="What did they bring in?" hint="Bag, laptop, textbook — helps us keep track.">
                      <Input
                        value={form.itemBrought}
                        onChange={(event) => setForm({ ...form, itemBrought: event.target.value })}
                        placeholder="e.g. Blue backpack"
                        className="h-14 rounded-xl border-parchment/20 bg-white/95 text-[15px] text-ink"
                      />
                    </Field>

                  </div>

                  <Button type="submit" size="lg" variant="brass" icon={ArrowRight} className="mt-6 h-14 w-full text-[16px]" loading={signIn.isPending}>
                    Sign in visitor
                  </Button>
                </form>

                <p className="mt-4 flex items-center gap-1.5 text-[12px] text-parchment/40">
                  <BookOpen className="h-3.5 w-3.5" />
                  Students do not sign in here — they create their own account to read online.
                  <Link to="/app/books" className="font-semibold text-brass-300/90 hover:text-brass-200">Manage books</Link>
                </p>
              </section>
            )}
          </div>

          <aside className="rounded-3xl border border-parchment/12 bg-forest-950/40 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-parchment">In the library now</h2>
              <button
                onClick={() => void live.refetch()}
                className="rounded-md p-1.5 text-parchment/40 transition hover:bg-parchment/10 hover:text-parchment"
                aria-label="Refresh"
              >
                {live.isFetching ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[12px] text-parchment/45">
              {inside === 0 ? 'The reading room is quiet right now.' : `${inside} ${inside === 1 ? 'person' : 'people'} signed in.`}
            </p>
            <ul className="mt-5 space-y-2">
              {(live.data?.recent ?? []).map((person) => (
                <li key={person.id} className="flex items-center gap-3 rounded-xl border border-parchment/10 bg-white/[0.03] px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass-400/15 text-[11px] font-bold uppercase text-brass-300">
                    {person.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-parchment/85">{person.name}</span>
                    <span className="block truncate text-[10.5px] text-parchment/40">
                      {[person.className, person.house, person.bookTaken && `“${person.bookTaken}”`].filter(Boolean).join(' · ') || 'Visitor'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-parchment/35">
                    {new Date(person.signedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={() => setSignOutVisit({
                      id: person.id,
                      fullName: person.name,
                      className: person.className,
                      house: person.house,
                      bookTaken: person.bookTaken,
                    })}
                    className="shrink-0 rounded-md p-1.5 text-parchment/40 transition hover:bg-parchment/10 hover:text-brass-300"
                    aria-label={`Sign ${person.name} out`}
                    title="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {!live.isLoading && !(live.data?.recent ?? []).length ? (
                <li className="rounded-xl border border-dashed border-parchment/15 px-4 py-6 text-center text-[12px] text-parchment/35">
                  Nobody is signed in yet. Use the form to add the first visitor.
                </li>
              ) : null}
            </ul>

            <div className="mt-6 border-t border-parchment/10 pt-5">
              <Link to="/app/books" className="group flex items-center gap-3 rounded-xl border border-parchment/10 bg-white/[0.04] px-4 py-3 transition hover:border-brass-400/30 hover:bg-white/[0.07]">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brass-400/15 text-brass-300"><BookOpen className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-parchment/90">{summary.data?.books ?? 0} books online</span>
                  <span className="block text-[11px] text-parchment/40">Add or manage the shelves</span>
                </span>
                <ArrowRight className="h-4 w-4 text-parchment/30 transition group-hover:translate-x-0.5 group-hover:text-brass-300" />
              </Link>
              <div className="mt-4 flex items-center justify-between text-[11px] text-parchment/35">
                <Link to="/app/visits" className="inline-flex items-center gap-1.5 hover:text-parchment/70">
                  Sign-in register <ArrowRight className="h-3 w-3" />
                </Link>
                <Link to="/app" className="inline-flex items-center gap-1.5 hover:text-parchment/70">
                  <ArrowLeft className="h-3 w-3" /> Dashboard
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <SignOutDialog
        visit={signOutVisit}
        open={Boolean(signOutVisit)}
        onClose={() => setSignOutVisit(null)}
        onSignedOut={(id) => { if (lastVisit?.id === id) setLastVisit(null); }}
      />
    </div>
  );
}
