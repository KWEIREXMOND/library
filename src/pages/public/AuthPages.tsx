import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft, BookOpen, CheckCircle2, Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, Mail,
  UserRound,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { homeForRole, useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import type { Role } from '../../lib/types';
import { SchoolCrest } from '../../components/Brand';
import { Alert, Button, Field, Input, useToast } from '../../components/ui';

const quotes = [
  ['There is no story that is not true.', 'Chinua Achebe · Things Fall Apart'],
  ['A reader lives a thousand lives before he dies.', 'George R. R. Martin'],
  ['Education is the most powerful weapon which you can use to change the world.', 'Nelson Mandela'],
];

function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const { settings } = useAuth();
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);
  return (
    <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden overflow-hidden bg-forest-950 px-12 py-14 text-parchment lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.18]" />
        <div className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full border border-brass-400/10" />
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-96 w-96 rounded-full border border-parchment/[0.06]" />
        <Link to="/" className="relative flex items-center gap-3">
          <SchoolCrest className="h-10 w-10" dark />
          <div>
            <p className="font-display text-lg leading-none text-parchment">{settings?.siteName?.trim() || 'Libra'}</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-parchment/40">
              {settings?.schoolShortName ? `${settings.schoolShortName} Library` : 'Tema Secondary Library'}
            </p>
          </div>
        </Link>
        <div className="relative max-w-md">
          <BookOpen className="h-6 w-6 text-brass-400" />
          <p className="mt-5 font-display text-[32px] leading-[1.15] text-parchment">“{quote[0]}”</p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-brass-300/70">{quote[1]}</p>
        </div>
        <div className="relative grid grid-cols-2 gap-4 border-t border-parchment/10 pt-5 text-[10px] uppercase tracking-[0.1em] text-parchment/35">
          <span>Your library ID</span>
          <span>Every book online</span>
        </div>
      </div>

      <div className="flex flex-col justify-center bg-parchment px-5 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[430px]">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-[11.5px] font-semibold text-ink-mute hover:text-forest-700 lg:hidden">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the library
          </Link>
          <p className="eyebrow">Library account</p>
          <h1 className="mt-2 text-[32px] leading-tight text-ink">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mute">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, invalid }: {
  value: string; onChange: (value: string) => void; autoComplete?: string; invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="••••••••"
        icon={LockKeyhole}
        invalid={invalid}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((open) => !open)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-mute hover:text-ink"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ identifier: '', password: '', remember: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const next = (location.state as { from?: string } | null)?.from;

  // Readers belong on the shelves, staff on the dashboard.
  const target = (role?: Role | null) => (next && next.startsWith('/') ? next : homeForRole(role));

  useEffect(() => {
    if (user) navigate(target(user.role), { replace: true });
  }, [user, next, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: () => login(form.identifier.trim(), form.password, form.remember),
    onSuccess: (me) => {
      toast.push({ title: 'Welcome back', description: 'Your library account is ready.', tone: 'success' });
      navigate(target(me.user?.role), { replace: true });
    },
    onError: (error) => setErrors(error instanceof ApiError ? error.fieldErrors : {}),
  });

  return (
    <AuthFrame title="Welcome back." subtitle="Sign in with your username, library ID or email address to read books online.">
      {mutation.isError && !Object.keys(errors).length ? (
        <Alert tone="danger" className="mb-4">{mutation.error instanceof ApiError ? mutation.error.message : 'Sign-in failed. Please try again.'}</Alert>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.identifier.trim() || !form.password) {
            setErrors({
              ...(form.identifier.trim() ? {} : { identifier: 'Enter your username, library ID or email.' }),
              ...(form.password ? {} : { password: 'Enter your password.' }),
            });
            return;
          }
          mutation.mutate();
        }}
      >
        <Field label="Username, library ID or email" required>
          <Input
            value={form.identifier}
            onChange={(event) => setForm({ ...form, identifier: event.target.value })}
            placeholder="ama.boateng or LIB-2026-0001"
            icon={IdCard}
            autoComplete="username"
            invalid={Boolean(errors.identifier)}
            autoFocus
          />
        </Field>
        <Field label="Password" required>
          <PasswordInput value={form.password} onChange={(value) => setForm({ ...form, password: value })} autoComplete="current-password" />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink/25 text-forest-700"
              checked={form.remember}
              onChange={(event) => setForm({ ...form, remember: event.target.checked })}
            />
            Keep me signed in
          </label>
          <Link to="/reset-password" className="text-[11.5px] font-semibold text-forest-700 hover:underline">Forgot your password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>Sign in</Button>
      </form>
      <p className="mt-6 text-[12.5px] text-ink-mute">
        No account yet? <Link to="/register" className="font-semibold text-forest-700 hover:underline">Get a library ID</Link>.
        Library staff sign in here to run the front desk and manage books.
      </p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  useDocumentTitle('Get a library ID');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', className: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await api<{ libraryId: string; username?: string }>('/auth/register', {
        method: 'POST',
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
          className: form.className.trim() || undefined,
        },
      });
      return result;
    },
    onSuccess: async (result) => {
      try {
        await login(form.email.trim(), form.password, false);
      } catch {
        /* The account exists; sign-in can be retried from the login page. */
      }
      toast.push({
        title: 'Your library ID is ready',
        description: `${result.libraryId}${result.username ? ` · username ${result.username}` : ''} — keep both safe. Use either one to sign in and read any book online.`,
        tone: 'success',
      });
      navigate('/books', { replace: true });
    },
    onError: (error) => setErrors(error instanceof ApiError ? error.fieldErrors : {}),
  });

  return (
    <AuthFrame title="Get a library ID." subtitle="It takes a minute. Your library ID is yours for as long as you are at the school.">
      {mutation.isError && !Object.keys(errors).length ? (
        <Alert tone="danger" className="mb-4">{mutation.error instanceof ApiError ? mutation.error.message : 'We could not create the account. Please try again.'}</Alert>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const next: Record<string, string> = {};
          if (form.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
          if (form.lastName.trim().length < 2) next.lastName = 'Enter your surname.';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
          if (form.password.length < 8) next.password = 'Use at least 8 characters.';
          setErrors(next);
          if (Object.keys(next).length) return;
          mutation.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} icon={UserRound} autoComplete="given-name" invalid={Boolean(errors.firstName)} autoFocus />
          </Field>
          <Field label="Surname" required>
            <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" invalid={Boolean(errors.lastName)} />
          </Field>
        </div>
        <Field label="Email address" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} icon={Mail} autoComplete="email" invalid={Boolean(errors.email)} />
        </Field>
        <Field label="Class" hint="Optional — for example 2 Science 1.">
          <Input value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} placeholder="2 Science 1" />
        </Field>
        <Field label="Password" required hint="At least 8 characters, with a letter and a number.">
          <PasswordInput value={form.password} onChange={(value) => setForm({ ...form, password: value })} autoComplete="new-password" invalid={Boolean(errors.password)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>Create my library ID</Button>
      </form>
      <p className="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-ink-mute">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
        You will see your library ID and username as soon as the account is created. Write them down — either one signs you in, and your library ID opens books at the kiosk.
      </p>
      <p className="mt-4 text-[12.5px] text-ink-mute">
        Already have one? <Link to="/login" className="font-semibold text-forest-700 hover:underline">Sign in</Link>.
      </p>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  useDocumentTitle('Reset your password');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ identifier: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: form.identifier.trim(),
        email: form.email.trim(),
        password: form.password,
      },
    }),
    onSuccess: (result) => {
      setDone(true);
      toast.push({ title: 'Password changed', description: result.message, tone: 'success' });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'We could not reset the password. Please try again.'),
  });

  useEffect(() => {
    if (user && !done) navigate(homeForRole(user.role), { replace: true });
  }, [user, done, navigate]);

  return (
    <AuthFrame title="Reset your password." subtitle="Confirm the username (or library ID) and email on your account, then choose a new password.">
      {done ? (
        <div className="space-y-5">
          <Alert tone="success" title="Password changed">You can now sign in with your new password.</Alert>
          <Link to="/login"><Button size="lg" className="w-full">Go to sign in</Button></Link>
        </div>
      ) : (
        <>
          {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              if (!form.identifier.trim()) { setError('Enter your username, library ID or email address.'); return; }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter the email address on the account.'); return; }
              if (form.password.length < 8) { setError('Use a password of at least 8 characters.'); return; }
              if (form.password !== form.confirm) { setError('The two passwords do not match.'); return; }
              mutation.mutate();
            }}
          >
            <Field label="Username, library ID or email" required>
              <Input
                value={form.identifier}
                onChange={(event) => setForm({ ...form, identifier: event.target.value })}
                placeholder="LIB-2026-0001"
                icon={IdCard}
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="Email address on the account" required>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@example.com"
                icon={Mail}
                autoComplete="email"
              />
            </Field>
            <Field label="New password" required hint="At least 8 characters, with a letter and a number.">
              <PasswordInput value={form.password} onChange={(value) => setForm({ ...form, password: value })} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password" required>
              <PasswordInput value={form.confirm} onChange={(value) => setForm({ ...form, confirm: value })} autoComplete="new-password" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>Set a new password</Button>
          </form>
          <p className="mt-6 text-[12.5px] text-ink-mute">
            Remembered it? <Link to="/login" className="font-semibold text-forest-700 hover:underline">Back to sign in</Link>.
          </p>
        </>
      )}
    </AuthFrame>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <SchoolCrest className="h-12 w-12" />
      <p className="eyebrow mt-6">404</p>
      <h1 className="mt-2 text-4xl text-ink">This shelf is empty</h1>
      <p className="mt-3 max-w-md text-[14px] text-ink-mute">
        The page you were looking for is not here. Sign in with your library ID or browse the online books.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link to="/"><Button variant="secondary" icon={LibraryBig}>Library home</Button></Link>
        <Link to="/books"><Button icon={BookOpen}>Browse books</Button></Link>
      </div>
    </div>
  );
}
