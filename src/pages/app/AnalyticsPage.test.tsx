import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const payload = vi.hoisted(() => ({
  range: { days: 30, from: '2026-09-21', to: '2026-10-20' },
  generatedAt: '2026-10-20T12:00:00.000Z',
  visits: {
    inside: 5, today: 9, yesterday: 4, lastWeek: 19, range: 42,
    walkIns: 40, unique: 12, repeat: 3, averageMinutes: 38,
  },
  members: { total: 5, students: 2, teachers: 1, staff: 2, newInRange: 1 },
  books: {
    total: 30, published: 28, drafts: 2, views: 400, downloads: 20, addedInRange: 3,
    topViewed: [{ id: 1, title: 'Things Fall Apart', author: null, views: 50 }],
    mostTaken: [{ title: 'Purple Hibiscus', count: 4 }],
  },
  series: [
    { date: '2026-10-19', label: '19/10', count: 3 },
    { date: '2026-10-20', label: '20/10', count: 9 },
  ],
  houses: [{ house: 'House 1', count: 5 }, { house: 'House 2', count: 3 }],
  purposes: [{ purpose: 'Reading', count: 10 }],
  peakHours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 10 ? 4 : 0 })),
  staff: [{ name: 'Efua Owusu', count: 20 }],
}));

vi.mock('../../lib/api', () => ({
  api: vi.fn(async () => payload),
}));

import { api } from '../../lib/api';
import { AnalyticsPage } from './AnalyticsPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AnalyticsPage', () => {
  it('shows traffic, members and books from the analytics endpoint', async () => {
    renderPage();

    expect(await screen.findByText('Visits · last 30 days')).toBeTruthy();
    expect(await screen.findByText('Things Fall Apart')).toBeTruthy();
    expect(await screen.findByText('Purple Hibiscus')).toBeTruthy();
    expect(await screen.findByText('Efua Owusu')).toBeTruthy();
    expect(await screen.findByText('House 1')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/analytics?days=30');
  });

  it('asks for a different range when the chips are used', async () => {
    renderPage();
    await screen.findByText('Visits · last 30 days');

    await userEvent.click(screen.getByRole('button', { name: '7 days' }));

    await waitFor(() => expect(api).toHaveBeenCalledWith('/analytics?days=7'));
  });
});
