import {
  Activity, BarChart3, Bell, BookOpen, DoorOpen, LayoutDashboard, LibraryBig, LogIn,
  Megaphone, Settings, UserCog, Users, type LucideIcon,
} from 'lucide-react';
import type { Role } from './types';

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
};

export type NavSection = { label?: string; items: NavItem[] };

/**
 * Libra now does two jobs: signing walk-ins into the library, and putting books
 * online for students to read. The navigation mirrors exactly those two jobs.
 */
const staffSections: NavSection[] = [
  {
    label: 'Library',
    items: [
      { label: 'Overview', to: '/app', icon: LayoutDashboard, end: true },
      { label: 'Front desk sign-ins', to: '/app/visits', icon: DoorOpen },
      { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
      { label: 'Inbox', to: '/app/notifications', icon: Bell },
      { label: 'Online books', to: '/app/books', icon: LibraryBig },
      { label: 'Kiosk screen', to: '/kiosk', icon: LogIn },
    ],
  },
];

const adminSection: NavSection = {
  label: 'Administration',
  items: [
    { label: 'People', to: '/app/people', icon: Users },
    { label: 'Broadcast', to: '/app/broadcast', icon: Megaphone },
    { label: 'Activity log', to: '/app/activity', icon: Activity },
    { label: 'Site settings', to: '/app/settings', icon: Settings },
  ],
};

const accountSection: NavSection = {
  label: 'Account',
  items: [{ label: 'Account settings', to: '/app/account', icon: UserCog }],
};

const readerNav: NavSection[] = [
  {
    label: 'Read',
    items: [
      { label: 'Online library', to: '/books', icon: LibraryBig },
      { label: 'My inbox', to: '/app/notifications', icon: Bell },
    ],
  },
];

export function navForRole(role: Role | undefined | null): NavSection[] {
  if (role === 'admin') return [...staffSections, adminSection, ...readerNav, accountSection];
  if (role === 'librarian') return [...staffSections, ...readerNav, accountSection];
  return [...readerNav, accountSection];
}

const extraTitles: Array<[RegExp, string, string]> = [
  [/^\/app\/books\/new$/, 'Add a book', 'Online books'],
  [/^\/app\/books\/\d+$/, 'Edit book', 'Online books'],
];

export function findNavContext(
  pathname: string,
  role?: Role | null
): { title: string; section?: string } {
  for (const [pattern, title, section] of extraTitles) {
    if (pattern.test(pathname)) return { title, section };
  }
  const seen = new Set<string>();
  const sections = navForRole(role).map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (seen.has(item.to)) return false;
      seen.add(item.to);
      return true;
    }),
  }));
  let best: { to: string; label: string; section?: string } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname === item.to) { best = { to: item.to, label: item.label, section: section.label }; continue; }
      if (pathname.startsWith(`${item.to}/`) && !item.end) {
        if (!best || item.to.length > best.to.length) best = { to: item.to, label: item.label, section: section.label };
      }
    }
  }
  return { title: best?.label ?? 'Overview', section: best?.section };
}

export const publicLinks = [
  { label: 'Home', to: '/' },
  { label: 'Online books', to: '/books' },
];
