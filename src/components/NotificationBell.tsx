import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';

/** Inbox shortcut with the unread count, kept fresh while the app is open. */
export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ unread: number }>('/notifications/unread'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unread = data?.unread ?? 0;

  return (
    <Link
      to="/app/notifications"
      aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink-soft shadow-sm transition hover:border-forest-600/30 hover:text-ink"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-parchment">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
