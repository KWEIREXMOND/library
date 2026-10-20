import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LogoMark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={clsx('relative inline-flex items-center justify-center rounded-xl', className)}>
      <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden>
        <rect width="44" height="44" rx="12" fill={dark ? '#EBD49A' : '#173A2A'} />
        <path d="M9 28.5c4.8-2.6 8.6-2.6 13-.4 4.4-2.2 8.2-2.2 13 .4V15.6c-4.8-2.6-8.6-2.6-13-.4-4.4-2.2-8.2-2.2-13 .4v12.9z" fill="none" stroke={dark ? '#173A2A' : '#EBD49A'} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M22 14.9v13.4" stroke={dark ? '#173A2A' : '#EBD49A'} strokeWidth="1.8" />
        <path d="M22 5.5l1.3 2.9 3.1.4-2.3 2.1.6 3.1-2.7-1.5-2.7 1.5.6-3.1-2.3-2.1 3.1-.4L22 5.5z" fill="#CFA043" />
      </svg>
    </span>
  );
}

export function SchoolCrest({ className, dark = false }: { className?: string; dark?: boolean }) {
  const { settings } = useAuth();
  const logo = settings?.logoUrl?.trim();
  if (logo) {
    return (
      <span className={clsx('relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/10', className)}>
        <img src={logo} alt={`${settings?.schoolName ?? 'School'} crest`} className="h-full w-full object-contain" />
      </span>
    );
  }
  return <LogoMark className={className} dark={dark} />;
}

export function Brand({ dark = false, compact = false, className }: { dark?: boolean; compact?: boolean; className?: string }) {
  const { settings } = useAuth();
  const siteName = settings?.siteName?.trim() || 'Libra';
  return (
    <Link to="/" className={clsx('group inline-flex items-center gap-2.5', className)} aria-label={`${siteName} home`}>
      <SchoolCrest className={compact ? 'h-8 w-8' : 'h-10 w-10'} dark={dark} />
      <span className="leading-none">
        <span className={clsx('block font-display text-[22px] font-semibold tracking-tight', dark ? 'text-parchment' : 'text-ink')}>
          {siteName}
        </span>
        {!compact ? (
          <span className={clsx('mt-1 hidden text-[9.5px] font-semibold uppercase tracking-[0.18em] sm:block', dark ? 'text-parchment/50' : 'text-ink-mute')}>
            {settings?.schoolShortName ? `${settings.schoolShortName} Library` : 'Tema Secondary Library'}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
