import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiError, setAuthToken } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { Avatar, Badge, Button, Input, PageHeader, useToast } from '../../components/ui';

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  librarian: 'Librarian',
  admin: 'Administrator',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The signed-in person's own account.
 *
 * Everyone — students included — can correct their name, change the email they
 * use as a username, and set a new password. The library ID is issued by the
 * school, so it is shown but not editable here.
 */
export function AccountPage() {
  useDocumentTitle('Account settings');
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Only re-seed the form when a different person is signed in, so a refresh
  // triggered by saving does not overwrite what is being typed.
  useEffect(() => {
    if (!user) return;
    setProfile({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!user) return null;

  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  const email = profile.email.trim();
  const profileIssue = firstName.length < 2 ? 'Enter your first name.'
    : lastName.length < 2 ? 'Enter your surname.'
      : !EMAIL.test(email) ? 'Enter a valid email address.'
        : null;
  const profileDirty = firstName !== user.firstName || lastName !== user.lastName
    || email.toLowerCase() !== user.email.toLowerCase() || (profile.phone.trim() || null) !== (user.phone ?? null);

  const saveProfile = useMutation({
    mutationFn: () => api('/auth/profile', {
      method: 'PATCH',
      body: { firstName, lastName, email, phone: profile.phone.trim() || null },
    }),
    onSuccess: async () => {
      setProfileErrors({});
      await refresh();
      toast.push({ tone: 'success', title: 'Account updated', description: 'Your details are saved. Use the new username the next time you sign in.' });
    },
    onError: (error) => {
      if (error instanceof ApiError) setProfileErrors(error.fieldErrors);
      toast.push({ tone: 'error', title: 'Could not save your details', description: (error as Error).message });
    },
  });

  const changePassword = useMutation({
    mutationFn: () => api<{ token?: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
    }),
    onSuccess: async (result) => {
      // Changing the password rotates the session on the server. Keep this
      // device signed in with the token that came back.
      if (result?.token) setAuthToken(result.token, true);
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordError(null);
      await refresh();
      toast.push({ tone: 'success', title: 'Password changed', description: 'Other devices have been signed out.' });
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Please try again.';
      setPasswordError(message);
      toast.push({ tone: 'error', title: 'Could not change the password', description: message });
    },
  });

  const submitProfile = (event: React.FormEvent) => {
    event.preventDefault();
    if (profileIssue || saveProfile.isPending) return;
    saveProfile.mutate();
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    const issue = !passwords.currentPassword ? 'Enter your current password.'
      : passwords.newPassword.length < 8 ? 'Use at least 8 characters.'
        : !/[A-Za-z]/.test(passwords.newPassword) ? 'Include a letter.'
          : !/[0-9]/.test(passwords.newPassword) ? 'Include a number.'
            : passwords.newPassword !== passwords.confirm ? 'The two new passwords do not match.'
              : null;
    setPasswordError(issue);
    if (issue || changePassword.isPending) return;
    changePassword.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Account settings"
        description="Change your name, the email address you sign in with, and your password. These details are yours — the library keeps the ID."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-[17px] font-semibold text-ink">Your details</h2>
          <p className="mt-1 text-[12.5px] text-ink-mute">
            Your email doubles as your username: sign in with it or with your library ID.
          </p>

          <form className="mt-5 space-y-4" onSubmit={submitProfile} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                name="firstName"
                autoComplete="given-name"
                value={profile.firstName}
                onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
                error={profileErrors.firstName}
              />
              <Input
                label="Surname"
                name="lastName"
                autoComplete="family-name"
                value={profile.lastName}
                onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
                error={profileErrors.lastName}
              />
            </div>
            <Input
              label="Username (email)"
              name="email"
              type="email"
              autoComplete="email"
              hint="You will use this address — or your library ID — the next time you sign in."
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              error={profileErrors.email}
            />
            <Input
              label="Phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+233 …"
              hint="Optional. Only library staff can see this."
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              error={profileErrors.phone}
            />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" icon={BadgeCheck} loading={saveProfile.isPending} disabled={!profileDirty || Boolean(profileIssue)}>
                Save changes
              </Button>
              {profileIssue && profileDirty ? <span className="text-[12px] text-clay-600">{profileIssue}</span> : null}
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar firstName={user.firstName} lastName={user.lastName} hue={user.avatarHue} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-ink">{user.firstName} {user.lastName}</p>
                <p className="text-[12px] text-ink-mute">{ROLE_LABEL[user.role] ?? user.role}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-[12.5px]">
              <div>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink/40">Library ID</dt>
                <dd className="mt-1 font-mono text-[15px] font-semibold text-ink">{user.libraryId}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink/40">Status</dt>
                <dd className="mt-1">
                  <Badge tone={user.status === 'active' ? 'green' : 'amber'}>
                    {user.status === 'active' ? 'Active' : user.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink/40">Joined</dt>
                <dd className="mt-1 text-ink-soft">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-xl bg-parchment-light px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-mute">
              Your library ID is issued by the school and stays with you. Ask library staff if it needs correcting.
            </p>
          </section>
        </aside>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-700/10 text-forest-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Password</h2>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              Choose something only you know. Changing it signs you out on every other device.
            </p>
          </div>
        </div>

        <form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={submitPassword} noValidate>
          <Input
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
          />
          <Input
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            value={passwords.newPassword}
            onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
          />
          <Input
            label="Repeat new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
          />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <Button type="submit" icon={KeyRound} loading={changePassword.isPending}>Change password</Button>
            {passwordError ? <span className="text-[12px] text-clay-600">{passwordError}</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
