import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

const user = vi.hoisted(() => ({
  id: 4,
  libraryId: 'LIB-2026-0004',
  username: 'ama.boateng',
  email: 'student@tema.edu.gh',
  firstName: 'Ama',
  lastName: 'Boateng',
  role: 'student' as const,
  status: 'active' as const,
  className: 'Form 2 Science A',
  programme: 'General Science',
  department: null,
  house: 'House 1',
  phone: null,
  gender: 'female',
  avatarHue: 196,
  lastLogin: null,
  createdAt: '2026-09-01T08:00:00.000Z',
}));

const refresh = vi.hoisted(() => vi.fn(async () => undefined));
const setAuthToken = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => vi.fn(async (_path: string, _init?: any): Promise<any> => ({})));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user, refresh }),
}));

vi.mock('../../lib/api', () => ({
  api: (path: string, init?: unknown) => apiMock(path, init),
  setAuthToken,
  ApiError: class ApiError extends Error {
    status = 400;
    details: Record<string, string> = {};
    get fieldErrors() { return this.details; }
  },
}));

import { ToastProvider } from '../../components/ui';
import { AccountPage } from './AccountPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AccountPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockClear();
  refresh.mockClear();
  setAuthToken.mockClear();
});

describe('AccountPage', () => {
  it('shows the signed-in person and their issued library ID', () => {
    renderPage();
    expect(screen.getByDisplayValue('Ama')).toBeTruthy();
    expect(screen.getByDisplayValue('student@tema.edu.gh')).toBeTruthy();
    expect(screen.getByDisplayValue('ama.boateng')).toBeTruthy();
    expect(screen.getByText('LIB-2026-0004')).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
  });

  it('saves an edited username, email and name through the profile endpoint', async () => {
    const events = userEvent.setup();
    apiMock.mockResolvedValueOnce({ user: { ...user, username: 'ama.b', email: 'ama.boateng@tema.edu.gh' } });
    renderPage();

    const handle = screen.getByLabelText('Username');
    await events.clear(handle);
    await events.type(handle, 'Ama.B');
    const email = screen.getByLabelText('Email address');
    await events.clear(email);
    await events.type(email, 'ama.boateng@tema.edu.gh');
    const first = screen.getByLabelText('First name');
    await events.clear(first);
    await events.type(first, 'Ama Serwaa');

    await events.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/auth/profile', expect.objectContaining({
      method: 'PATCH',
      body: expect.objectContaining({
        firstName: 'Ama Serwaa',
        username: 'ama.b',
        email: 'ama.boateng@tema.edu.gh',
        phone: null,
      }),
    })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('explains a username the sign-in screen would reject', async () => {
    const events = userEvent.setup();
    renderPage();

    const handle = screen.getByLabelText('Username');
    await events.clear(handle);
    await events.type(handle, '1ama');

    expect(await screen.findByText('Start the username with a letter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save changes/i })).toHaveProperty('disabled', true);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('refuses a password form whose two new passwords differ', async () => {
    const events = userEvent.setup();
    renderPage();

    await events.type(screen.getByLabelText('Current password'), 'Student@123');
    await events.type(screen.getByLabelText('New password'), 'NewPass123');
    await events.type(screen.getByLabelText('Repeat new password'), 'NewPass124');
    await events.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText('The two new passwords do not match.')).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalledWith('/auth/change-password', expect.anything());
  });

  it('changes the password and keeps this device signed in with the returned token', async () => {
    const events = userEvent.setup();
    apiMock.mockResolvedValueOnce({ ok: true, token: 'fresh-token' });
    renderPage();

    await events.type(screen.getByLabelText('Current password'), 'Student@123');
    await events.type(screen.getByLabelText('New password'), 'NewPass123');
    await events.type(screen.getByLabelText('Repeat new password'), 'NewPass123');
    await events.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/auth/change-password', expect.objectContaining({
      method: 'POST',
      body: { currentPassword: 'Student@123', newPassword: 'NewPass123' },
    })));
    await waitFor(() => expect(setAuthToken).toHaveBeenCalledWith('fresh-token', true));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
  });
});
