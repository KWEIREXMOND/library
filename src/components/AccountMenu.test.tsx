import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type DemoUser = {
  id: number; firstName: string; lastName: string; role: string; libraryId: string; avatarHue: number;
};

const state = vi.hoisted(() => ({
  user: null as DemoUser | null,
  logout: vi.fn(async () => {}),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: state.user, logout: state.logout }),
}));

import { AccountMenu } from './AccountMenu';

const student: DemoUser = {
  id: 4, firstName: 'Ama', lastName: 'Boateng', role: 'student', libraryId: 'LIB-2026-0004', avatarHue: 120,
};
const librarian: DemoUser = {
  id: 2, firstName: 'Efua', lastName: 'Owusu', role: 'librarian', libraryId: 'LIB-2026-0002', avatarHue: 40,
};

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/books']}>
      <Routes>
        <Route path="/books" element={<div>shelves<AccountMenu /></div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AccountMenu', () => {
  it('shows the reader their account and signs them out', async () => {
    state.user = student;
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('LIB-2026-0004 · Student')).toBeTruthy();

    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(state.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('home page')).toBeTruthy();
  });

  it('gives staff their dashboard and kiosk links', async () => {
    state.user = librarian;
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const dashboard = screen.getByRole('menuitem', { name: /staff dashboard/i });
    const kiosk = screen.getByRole('menuitem', { name: /kiosk screen/i });
    expect(dashboard.getAttribute('href')).toBe('/app');
    expect(kiosk.getAttribute('href')).toBe('/kiosk');
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeTruthy();
  });

  it('renders nothing once the session has ended', () => {
    state.user = null;
    const { container } = renderMenu();
    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
  });
});
