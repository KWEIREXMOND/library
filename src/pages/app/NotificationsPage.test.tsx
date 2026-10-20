import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const payload = vi.hoisted(() => ({
  rows: [
    {
      id: 1,
      type: 'broadcast',
      title: 'Library opens early during exams',
      body: 'From Monday the doors open at 6:30 am.',
      link: '/app/notifications',
      readAt: null,
      createdAt: '2026-10-20T08:00:00.000Z',
    },
    {
      id: 2,
      type: 'welcome',
      title: 'Welcome to Libra',
      body: 'Search the shelves and read online.',
      link: null,
      readAt: '2026-10-18T08:00:00.000Z',
      createdAt: '2026-10-18T08:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
  pages: 1,
  unread: 1,
}));

const apiMock = vi.fn(async (path: string) => {
  if (path.startsWith('/notifications?')) return payload;
  return { ok: true };
});

vi.mock('../../lib/api', () => ({
  api: (path: string) => apiMock(path),
  ApiError: class ApiError extends Error {},
}));

import { ToastProvider } from '../../components/ui';
import { NotificationsPage } from './NotificationsPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NotificationsPage', () => {
  it('shows broadcast messages and marks the unread one', async () => {
    renderPage();

    expect(await screen.findByText('Library opens early during exams')).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();
    expect(screen.getByText('Welcome to Libra')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mark all read/ })).toBeTruthy();
  });

  it('marks every message read', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Library opens early during exams');

    await user.click(screen.getByRole('button', { name: /Mark all read/ }));

    await waitFor(() => {
      expect(apiMock.mock.calls.some(([path]) => path === '/notifications/read-all')).toBe(true);
    });
    expect(await screen.findByText(/Inbox cleared/)).toBeTruthy();
  });
});
