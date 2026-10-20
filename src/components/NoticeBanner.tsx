import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn as cx } from './ui';

type Notice = {
  id: number;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: string;
};

const DISMISSED_KEY = 'libra.notices.dismissed';

function readDismissed(): number[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function rememberDismissed(id: number) {
  try {
    const next = Array.from(new Set([...readDismissed(), id])).slice(-50);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the notice simply reappears next time */
  }
}

/**
 * The library's broadcast notices.
 *
 * The public endpoint already filters by audience: a visitor sees “everyone”
 * notices, a student also sees “students”, staff also see “staff”. Only the
 * newest un-dismissed notice is shown so the banner never becomes furniture.
 */
export function NoticeBanner({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [dismissed, setDismissed] = useState<number[]>(() => readDismissed());
  const { data } = useQuery({
    queryKey: ['announcements', 'public'],
    queryFn: () => api<{ rows: Notice[] }>('/announcements'),
    staleTime: 60_000,
  });

  const notice = data?.rows.find((row) => !dismissed.includes(row.id));
  if (!notice) return null;

  const dismiss = () => {
    rememberDismissed(notice.id);
    setDismissed((current) => [...current, notice.id]);
  };

  return (
    <div
      className={cx(
        compact
          ? 'mb-5 rounded-2xl border border-brass-300/50 bg-brass-50 px-4 py-3'
          : 'border-b border-brass-300/40 bg-brass-50',
        className,
      )}
      role="status"
      aria-label="Library notice"
    >
      <div className={cx('flex items-start gap-3', compact ? '' : 'container-x py-3')}>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brass-400/25 text-brass-800">
          <Megaphone className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-snug text-ink">{notice.title}</p>
          <p className={cx('mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-ink-mute', compact ? 'line-clamp-3' : 'line-clamp-2')}>
            {notice.body}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notice"
          className="rounded-md p-1 text-ink/35 transition hover:bg-ink/[0.06] hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
