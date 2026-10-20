import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const settings = vi.hoisted(() => ({
  siteName: 'Libra',
  siteDescription: 'The Tema Secondary School library — sign every visitor in at the door.',
  schoolName: 'Tema Secondary School',
  schoolShortName: 'Tema SHS',
  motto: 'Knowledge, Integrity, Service',
  logoUrl: '',
}));

const auth = vi.hoisted(() => ({
  settings,
  refresh: vi.fn(async () => undefined),
}));

const apiMock = vi.fn(async (_path: string, _init?: unknown): Promise<unknown> => ({ settings }));

vi.mock('../../lib/auth', () => ({
  useAuth: () => auth,
}));

vi.mock('../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    details?: Record<string, string>;
    constructor(message: string, status: number, details?: Record<string, string>) {
      super(message);
      this.status = status;
      this.details = details;
    }
    get fieldErrors() { return this.details ?? {}; }
  }
  return {
    api: (path: string, init?: unknown) => apiMock(path, init),
    ApiError,
  };
});

import { ApiError } from '../../lib/api';
import { ConfirmProvider, ToastProvider } from '../../components/ui';
import { SettingsPage } from './SettingsPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <SettingsPage />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('starts from the saved branding and previews it', () => {
    renderPage();

    expect((screen.getByPlaceholderText('Libra') as HTMLInputElement).value).toBe('Libra');
    expect((screen.getByPlaceholderText('Tema Secondary School') as HTMLInputElement).value).toBe('Tema Secondary School');
    expect(screen.getByText('Libra · Tema SHS Library')).toBeTruthy();
    expect(screen.getAllByText(/sign every visitor in at the door/).length).toBeGreaterThan(0);
  });

  it('saves the new name and description', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      settings: { ...settings, siteName: 'Grace Library', siteDescription: 'Grace Library — reading for every student, every day.' },
    });
    renderPage();

    const name = screen.getByPlaceholderText('Libra');
    await user.clear(name);
    await user.type(name, 'Grace Library');
    const description = screen.getByPlaceholderText(/A sentence about the library/);
    await user.clear(description);
    await user.type(description, 'Grace Library — reading for every student, every day.');

    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/settings', expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({
          siteName: 'Grace Library',
          siteDescription: 'Grace Library — reading for every student, every day.',
        }),
      }));
    });
    expect(auth.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Site branding saved')).toBeTruthy();
  });

  it('shows the server’s field errors', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError('Please check the highlighted fields and try again.', 422, {
      siteDescription: 'Write a longer description.',
    }));
    renderPage();

    const description = screen.getByPlaceholderText(/A sentence about the library/);
    await user.clear(description);
    await user.type(description, 'Too short');
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

    expect(await screen.findByText('Write a longer description.')).toBeTruthy();
  });
});
