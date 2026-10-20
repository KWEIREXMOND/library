import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ConfirmProvider, ToastProvider } from './components/ui';

/**
 * The kiosk is a staff tool. These tests exercise the real router and guards,
 * so a student can never reach the front-desk screen by typing its URL.
 */

const STUDENT = {
  id: 14, libraryId: 'LIB-2026-0004', email: 'student@tema.edu.gh',
  firstName: 'Ama', lastName: 'Mensah', role: 'student', status: 'active',
};

const LIBRARIAN = {
  id: 2, libraryId: 'LIB-2026-0002', email: 'librarian@tema.edu.gh',
  firstName: 'Efua', lastName: 'Owusu', role: 'librarian', status: 'active',
};

let sessionUser: typeof STUDENT | typeof LIBRARIAN;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function installFetchMock() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return json({
        user: sessionUser,
        settings: { schoolName: 'Tema Secondary School', schoolShortName: 'Tema SHS', logoUrl: '' },
        permissions: { manageLibrary: sessionUser.role === 'librarian', administer: false },
      });
    }
    if (url.includes('/api/kiosk/inside')) return json({ count: 0, recent: [] });
    if (url.includes('/api/kiosk/summary')) return json({ inside: 0, visitsToday: 0, books: 35 });
    if (url.endsWith('/api/client-log')) return new Response(null, { status: 204 });
    return json({ ok: true });
  }));
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('kiosk route guard', () => {
  beforeEach(() => {
    installFetchMock();
    window.scrollTo = vi.fn();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    if (!document.getElementById('root')) {
      const root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('refuses the kiosk to a signed-in student', async () => {
    sessionUser = STUDENT;
    renderAt('/kiosk');

    expect(await screen.findByText(/don’t have access to this page/i)).toBeTruthy();
    expect(screen.queryByText('Sign a visitor in.')).toBeNull();
  });

  it('lets a librarian open the kiosk', async () => {
    sessionUser = LIBRARIAN;
    renderAt('/kiosk');

    expect(await screen.findByText('Sign a visitor in.')).toBeTruthy();
    expect(screen.getByText(/Staff only · Efua Owusu/)).toBeTruthy();
  });
});
