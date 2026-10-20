import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/ui';
import { KioskPage } from './KioskPage';
import { api } from '../../lib/api';

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 2, firstName: 'Efua', lastName: 'Owusu', role: 'librarian', libraryId: 'LIB-2026-0002' },
    settings: { schoolName: 'Tema Secondary School' },
  }),
}));

vi.mock('../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return {
    ApiError,
    api: vi.fn(async (path: string) => {
      if (path.startsWith('/kiosk/inside')) {
        return {
          count: 1,
          recent: [{
            id: 7,
            name: 'Ama Mensah',
            className: '2 Science 1',
            house: 'House 2',
            purpose: 'Reading',
            bookTaken: null,
            signedInAt: new Date().toISOString(),
          }],
        };
      }
      if (path.startsWith('/kiosk/summary')) return { inside: 1, visitsToday: 1, books: 35 };
      if (path.startsWith('/books?')) {
        return {
          rows: [{ id: 1, title: 'Things Fall Apart', author: 'Chinua Achebe', category: 'Literature' }],
        };
      }
      return { ok: true };
    }),
  };
});

function renderKiosk() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <KioskPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('staff kiosk', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the sign-in form for a signed-in librarian', async () => {
    renderKiosk();

    expect(await screen.findByText('Sign a visitor in.')).toBeTruthy();
    expect(screen.getByText(/Staff only · Efua Owusu/)).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Ama Mensah')).toBeTruthy();
  });

  it('records the books chosen when the visitor signs out', async () => {
    const user = userEvent.setup();
    renderKiosk();

    expect(await screen.findByText('Ama Mensah')).toBeTruthy();
    await user.click(screen.getByLabelText('Sign Ama Mensah out'));

    expect(await screen.findByText('Sign out Ama Mensah?')).toBeTruthy();
    await user.click(await screen.findByText('Things Fall Apart'));
    await user.click(screen.getByRole('button', { name: /Sign out · 1 book/i }));

    await waitFor(() => {
      expect(vi.mocked(api)).toHaveBeenCalledWith('/visits/7/sign-out', {
        method: 'POST',
        body: { books: ['Things Fall Apart'] },
      });
    });
  });
});
