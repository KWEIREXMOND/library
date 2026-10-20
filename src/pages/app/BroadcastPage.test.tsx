import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const broadcast = vi.hoisted(() => ({
  id: 7,
  title: 'Library opens early during exams',
  body: 'From Monday the doors open at 6:30 am.',
  audience: 'all' as const,
  pinned: true,
  status: 'published' as const,
  publishAt: '2026-10-20T08:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-10-20T08:00:00.000Z',
  author: 'Akosua Mensah',
  delivered: 4,
  seen: 2,
}));

const apiMock = vi.fn(async (path: string, _init?: unknown) => {
  if (path.startsWith('/announcements/manage')) {
    return {
      rows: [broadcast],
      page: 1,
      pageSize: 50,
      total: 1,
      pages: 1,
      audiences: { all: 5, students: 2, teachers: 1, staff: 2 },
    };
  }
  if (path === '/announcements') return { announcement: { ...broadcast, id: 8 } };
  return {};
});

vi.mock('../../lib/api', () => ({
  api: (path: string, init?: unknown) => apiMock(path, init),
  ApiError: class ApiError extends Error {},
}));

import { ConfirmProvider, ToastProvider } from '../../components/ui';
import { BroadcastPage } from './BroadcastPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <BroadcastPage />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BroadcastPage', () => {
  it('shows sent broadcasts with delivery and read counts', async () => {
    renderPage();

    expect(await screen.findByText('Library opens early during exams')).toBeTruthy();
    expect(screen.getByText(/4 inboxes/)).toBeTruthy();
    expect(screen.getByText(/2 read/)).toBeTruthy();
    expect(screen.getByText('Everyone')).toBeTruthy();
  });

  it('sends a broadcast to the chosen audience', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Library opens early during exams');

    await user.click(screen.getByRole('button', { name: 'New broadcast' }));
    await user.type(screen.getByPlaceholderText(/Library opens early/), 'Revision week hours');
    await user.type(screen.getByPlaceholderText(/What do you need people to know/), 'The library is open until 7 pm.');
    await user.click(screen.getByRole('radio', { name: /^Students/ }));
    await user.click(screen.getByRole('button', { name: 'Send broadcast' }));

    await waitFor(() => {
      const call = apiMock.mock.calls.find(([path]) => path === '/announcements');
      expect(call).toBeTruthy();
      expect(call?.[1]).toMatchObject({
        method: 'POST',
        body: expect.objectContaining({
          title: 'Revision week hours',
          audience: 'students',
        }),
      });
    });
    expect(await screen.findByText(/Broadcast sent/)).toBeTruthy();
  });
});
