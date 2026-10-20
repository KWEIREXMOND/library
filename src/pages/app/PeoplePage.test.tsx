import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const data = vi.hoisted(() => ({
  member: {
    kind: 'member' as const,
    key: '4',
    userId: 4,
    libraryId: 'LIB-2026-0004',
    name: 'Ama Boateng',
    email: 'student@tema.edu.gh',
    role: 'student',
    status: 'active',
    className: 'Form 2 Science A',
    house: 'House 2',
    joinedAt: '2026-09-01T08:00:00.000Z',
    lastLogin: '2026-10-20T08:10:00.000Z',
    visits: 6,
    lastVisit: '2026-10-20T08:05:00.000Z',
  },
  walkin: {
    kind: 'walkin' as const,
    key: 'esi amponsah',
    userId: null,
    libraryId: null,
    name: 'Esi Amponsah',
    email: 'esi.amponsah@example.com',
    role: null,
    status: null,
    className: 'Form 1 Arts A',
    house: 'House 3',
    joinedAt: '2026-10-19T09:45:00.000Z',
    lastLogin: null,
    visits: 2,
    lastVisit: '2026-10-19T09:45:00.000Z',
  },
}));

const payload = vi.hoisted(() => ({
  rows: [data.member, data.walkin],
  page: 1,
  pageSize: 20,
  total: 2,
  pages: 1,
  summary: { members: 4, students: 1, suspended: 1, walkIns: 18 },
}));

const detail = vi.hoisted(() => ({
  person: data.member,
  visits: [
    {
      id: 1,
      full_name: 'Ama Boateng',
      class_name: 'Form 2 Science A',
      house: 'House 2',
      purpose: 'Private study',
      book_taken: 'Things Fall Apart',
      signed_in_at: '2026-10-20T08:05:00.000Z',
      signed_out_at: '2026-10-20T09:00:00.000Z',
      minutes: 55,
    },
  ],
}));

const apiMock = vi.fn(async (path: string, _init?: unknown): Promise<any> => {
  if (path.startsWith('/people/member/')) return detail;
  if (path.startsWith('/people?')) return payload;
  return {};
});

vi.mock('../../lib/api', () => ({
  api: (path: string, init?: unknown) => apiMock(path, init),
  apiBlob: vi.fn(async () => new Blob(['a,b'])),
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', firstName: 'Akosua', lastName: 'Mensah' } }),
}));

import { ConfirmProvider, ToastProvider } from '../../components/ui';
import { PeoplePage } from './PeoplePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <PeoplePage />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PeoplePage', () => {
  it('lists members and kiosk-only walk-ins with their source', async () => {
    renderPage();

    expect((await screen.findAllByText('Ama Boateng')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Esi Amponsah').length).toBeGreaterThan(0);
    expect(screen.getAllByText('member').length).toBeGreaterThan(0);
    expect(screen.getAllByText('walk-in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
  });

  it('opens a profile with recent visits and admin actions', async () => {
    const user = userEvent.setup();
    renderPage();

    const viewButtons = await screen.findAllByRole('button', { name: 'View' });
    await user.click(viewButtons[0]);

    expect(await screen.findByText('Recent visits')).toBeTruthy();
    expect(await screen.findByText(/Private study/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Suspend account/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Reset password/ })).toBeTruthy();
  });

  it('filters the register through the search box', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Ama Boateng');

    await user.type(screen.getByLabelText('Search people'), 'esi');

    await vi.waitFor(() => {
      expect(apiMock.mock.calls.some(([path]) => String(path).includes('q=esi'))).toBe(true);
    });
  });
  it('creates a librarian account and shows the sign-in details once', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/people/staff') return { user: {}, libraryId: 'LIB-2026-0060', password: null, generated: false };
      if (path.startsWith('/people/member/')) return detail;
      if (path.startsWith('/people?')) return payload;
      return {};
    });
    renderPage();
    await screen.findAllByText('Ama Boateng');

    await user.click(screen.getByRole('button', { name: /add staff account/i }));
    await user.type(screen.getByLabelText('First name'), 'Yaw');
    await user.type(screen.getByLabelText('Surname'), 'Owusu');
    await user.type(screen.getByLabelText(/email \(their username\)/i), 'yaw.owusu@tema.edu.gh');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/people/staff', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        firstName: 'Yaw',
        lastName: 'Owusu',
        email: 'yaw.owusu@tema.edu.gh',
        role: 'librarian',
      }),
    })));

    expect(await screen.findByText('LIB-2026-0060')).toBeTruthy();
    expect(screen.getByText(/Staff account ready/i)).toBeTruthy();
  });
});
