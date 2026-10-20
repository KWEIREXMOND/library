import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, DoorOpen, LayoutDashboard, LibraryBig, LogOut, UserCog } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Avatar, cn } from './ui';

const roleLabels: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  librarian: 'Librarian',
  admin: 'Administrator',
};

/**
 * The account menu on the public pages and in the reader.
 *
 * Students and teachers live on the public side of the app, so this is the only
 * place they can sign out. It shows who is signed in, links to the screens that
 * role can use, and ends the session properly (server revoke + local clear).
 */
export function AccountMenu({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const staff = user.role === 'librarian' || user.role === 'admin';
  const dark = tone === 'dark';

  const signOut = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    setOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-[12px] font-semibold transition',
          dark
            ? 'border-parchment/20 bg-parchment/10 text-parchment hover:border-parchment/35 hover:bg-parchment/15'
            : 'border-ink/15 bg-white/70 text-ink hover:border-ink/30 hover:bg-white',
        )}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} hue={user.avatarHue} size="sm" />
        <span className="hidden max-w-[7.5rem] truncate sm:block">{user.firstName}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-70 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-white text-ink shadow-lift"
        >
          <div className="border-b border-ink/10 bg-parchment-light/70 px-4 py-3">
            <p className="text-[13px] font-semibold leading-tight">{user.firstName} {user.lastName}</p>
            <p className="mt-1 text-[11px] text-ink-mute">{user.libraryId} · {roleLabels[user.role] ?? user.role}</p>
          </div>

          <div className="p-1.5">
            <Link
              to="/books"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-soft transition hover:bg-ink/[0.05] hover:text-ink"
            >
              <LibraryBig className="h-3.5 w-3.5 text-ink/40" /> Online books
            </Link>
            {staff ? (
              <Link
                to="/app"
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-soft transition hover:bg-ink/[0.05] hover:text-ink"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-ink/40" /> Staff dashboard
              </Link>
            ) : null}
            {staff ? (
              <Link
                to="/kiosk"
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-soft transition hover:bg-ink/[0.05] hover:text-ink"
              >
                <DoorOpen className="h-3.5 w-3.5 text-ink/40" /> Kiosk screen
              </Link>
            ) : null}
            <Link
              to="/app/account"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-soft transition hover:bg-ink/[0.05] hover:text-ink"
            >
              <UserCog className="h-3.5 w-3.5 text-ink/40" /> Account settings
            </Link>
          </div>

          <div className="border-t border-ink/10 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-semibold text-clay-700 transition hover:bg-clay-50 disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
