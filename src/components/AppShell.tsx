import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DoorOpen, Globe2, LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { Brand, SchoolCrest } from './Brand';
import { Avatar } from './ui';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../lib/auth';
import { findNavContext, navForRole, type NavSection } from '../lib/nav';

const roleLabels: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  librarian: 'Librarian',
  admin: 'Administrator',
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sections: NavSection[] = navForRole(user?.role);
  const staff = user?.role === 'librarian' || user?.role === 'admin';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <Brand dark />
      </div>
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-parchment/10 bg-white/[0.04] px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brass-400/15 text-brass-300">
          <SchoolCrest className="h-5 w-5" dark />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-parchment/90">{roleLabels[user?.role ?? 'student']} workspace</p>
          <p className="truncate text-[10px] text-parchment/40">{user?.libraryId}</p>
        </div>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        {sections.map((section, index) => (
          <div key={section.label ?? index} className={clsx(index > 0 && 'mt-5')}>
            {section.label ? (
              <p className="px-3 pb-2 text-[9.5px] font-bold uppercase tracking-[0.18em] text-parchment/30">{section.label}</p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to + item.label}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) => clsx(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12.5px] font-medium transition',
                      isActive
                        ? 'bg-parchment/[0.09] text-parchment'
                        : 'text-parchment/55 hover:bg-parchment/[0.05] hover:text-parchment/90',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={clsx('h-1 w-1 rounded-full transition', isActive ? 'bg-brass-400' : 'bg-transparent group-hover:bg-parchment/30')} />
                        <item.icon className={clsx('h-[15px] w-[15px] shrink-0', isActive ? 'text-brass-300' : 'text-parchment/40 group-hover:text-parchment/70')} />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-parchment/10 p-3">
        <Link to="/kiosk" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px] text-parchment/45 transition hover:bg-parchment/5 hover:text-parchment/80">
          <DoorOpen className="h-3.5 w-3.5" /> Open the kiosk
        </Link>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px] text-parchment/45 transition hover:bg-parchment/5 hover:text-parchment/80">
          <Globe2 className="h-3.5 w-3.5" /> Back to the public site
        </Link>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} hue={user?.avatarHue} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-parchment/90">{user?.firstName} {user?.lastName}</p>
            <p className="truncate text-[10px] text-parchment/40">{user?.libraryId}</p>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
            className="rounded-md p-1.5 text-parchment/40 transition hover:bg-parchment/10 hover:text-parchment"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const context = findNavContext(location.pathname, user?.role);
  const staff = user?.role === 'librarian' || user?.role === 'admin';

  return (
    <div className="flex min-h-screen bg-parchment">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] bg-forest-950 bg-grain lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-forest-950/60 backdrop-blur-sm" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[270px] bg-forest-950 bg-grain shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-md p-2 text-parchment/50 hover:bg-parchment/10 hover:text-parchment"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-parchment/90 backdrop-blur-md">
          <div className="flex h-[60px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink-soft lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              {context.section ? <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink/35">{context.section}</p> : null}
              <h1 className="truncate font-display text-[19px] leading-tight text-ink">{context.title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <Link
                to="/books"
                className="hidden rounded-full border border-ink/10 bg-white/70 px-3.5 py-1.5 text-[12px] font-semibold text-ink-soft shadow-sm transition hover:border-forest-600/30 hover:text-ink sm:inline-flex"
              >
                Browse shelves
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink-soft shadow-sm transition hover:border-forest-600/30 hover:text-ink"
              >
                <SchoolCrest className="h-4 w-4" />
                {staff ? 'Public site' : 'Library home'}
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
