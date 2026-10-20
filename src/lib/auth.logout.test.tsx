import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './auth';

/**
 * Regression test for the sign-out race.
 *
 * `logout()` used to call `queryClient.clear()`, which deleted the `['me']`
 * query while its observer was still mounted. React Query then refetched
 * `/auth/me` immediately; if that probe beat the revoke request, the response
 * still contained the signed-in user and `RequireAuth` sent the user straight
 * back into the app shell (spinners and all) instead of the login screen.
 */

const LIBRARIAN = {
  id: 2,
  libraryId: 'LIB-001',
  email: 'librarian@tema.edu.gh',
  firstName: 'Efua',
  lastName: 'Owusu',
  role: 'librarian' as const,
  status: 'active',
};

const SETTINGS = { schoolName: 'Tema Secondary School', currency: 'GHS' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let sessionUser: typeof LIBRARIAN | null;
let meCalls: number;
let logoutCalls: number;

/** Fake API with a deliberate delay on logout, widening the race window. */
function installFetchMock() {
  sessionUser = LIBRARIAN;
  meCalls = 0;
  logoutCalls = 0;

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/auth/me')) {
      meCalls += 1;
      return json({
        user: sessionUser,
        settings: SETTINGS,
        period: { year: '2026/2027', term: 'First Term' },
        unreadNotifications: sessionUser ? 3 : 0,
        balance: 0,
        permissions: {
          manageLibrary: Boolean(sessionUser),
          administer: false,
        },
      });
    }

    if (url.endsWith('/api/auth/logout')) {
      // The revoke takes 60ms — during which the old code re-probed /auth/me.
      await new Promise((resolve) => setTimeout(resolve, 60));
      logoutCalls += 1;
      sessionUser = null;
      return json({ ok: true, revoked: 1 });
    }

    if (url.endsWith('/api/client-log')) return new Response(null, { status: 204 });

    return json({ ok: true });
  }));
}

function AppShellStub() {
  const { user, logout } = useAuth();
  return (
    <div>
      <p>APP SHELL for {user?.email}</p>
      <button onClick={() => void logout()}>Sign out</button>
    </div>
  );
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/app" element={<RequireAuth />}>
              <Route index element={<AppShellStub />} />
            </Route>
            <Route path="/login" element={<div>LOGIN PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('sign out', () => {
  beforeEach(() => {
    installFetchMock();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('leaves the app shell and lands on the login page', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/APP SHELL for librarian@tema\.edu\.gh/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
    expect(screen.queryByText(/APP SHELL/)).toBeNull();
    await waitFor(() => expect(logoutCalls).toBe(1));
  });

  it('does not re-probe the session while signing out', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText(/APP SHELL/);
    const callsBeforeLogout = meCalls;

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('LOGIN PAGE');

    // Give any stray refetch time to land.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(meCalls).toBe(callsBeforeLogout);
    expect(screen.queryByText(/APP SHELL/)).toBeNull();
  });

  it('stays signed out even if the browser still holds a token', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('libra.session', 'stale-token');
    renderApp();

    await screen.findByText(/APP SHELL/);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('LOGIN PAGE');

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(screen.queryByText(/APP SHELL/)).toBeNull();
    expect(window.localStorage.getItem('libra.session')).toBeNull();
  });
});
