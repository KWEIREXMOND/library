import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { shade } from '../lib/format';

const sizes = {
  xs: 'w-9 rounded-[2px]',
  sm: 'w-14 rounded-[3px]',
  md: 'w-24 rounded-r-[5px] rounded-l-[3px]',
  lg: 'w-36 rounded-r-[7px] rounded-l-[4px]',
  xl: 'w-48 rounded-r-[8px] rounded-l-[5px]',
  hero: 'w-[220px] rounded-r-[10px] rounded-l-[6px]',
};

const titleSizes = {
  xs: 'text-[3px]',
  sm: 'text-[6px] leading-[1.15]',
  md: 'text-[10px] leading-[1.15]',
  lg: 'text-sm leading-[1.2]',
  xl: 'text-lg leading-[1.18]',
  hero: 'text-xl leading-[1.15]',
};

function Motif({ variant, color }: { variant: number; color: string }) {
  const stroke = color;
  const variants = [
    <g key="0" stroke={stroke} fill="none" strokeWidth="1.1">
      <circle cx="50" cy="118" r="36" />
      <circle cx="50" cy="118" r="26" />
      <circle cx="50" cy="118" r="16" />
      <path d="M14 118h72M50 82v72" />
    </g>,
    <g key="1" stroke={stroke} fill="none" strokeWidth="1.1">
      <path d="M-5 150C25 95 75 95 105 150" />
      <path d="M-5 162C25 107 75 107 105 162" />
      <path d="M-5 174C25 119 75 119 105 174" />
      <circle cx="50" cy="86" r="10" />
    </g>,
    <g key="2" stroke={stroke} fill="none" strokeWidth="1.1">
      <path d="M50 60l26 30-26 30-26-30z" />
      <path d="M50 78l14 16-14 16-14-16z" />
      <path d="M0 50h100M0 150h100" opacity="0.5" />
    </g>,
    <g key="3" stroke={stroke} fill="none" strokeWidth="1.1">
      <path d="M0 110c14-14 28-14 42 0s28 14 42 0 28-14 42 0" />
      <path d="M0 126c14-14 28-14 42 0s28 14 42 0 28-14 42 0" />
      <path d="M0 142c14-14 28-14 42 0s28 14 42 0 28-14 42 0" />
      <circle cx="50" cy="82" r="15" />
    </g>,
    <g key="4" stroke={stroke} fill="none" strokeWidth="1.1">
      <path d="M50 60v90M14 82l72 46M86 82L14 128" />
      <circle cx="50" cy="105" r="30" />
      <circle cx="50" cy="105" r="40" opacity="0.55" />
    </g>,
    <g key="5" stroke={stroke} fill="none" strokeWidth="1.1">
      <path d="M18 160V94c0-18 14-32 32-32s32 14 32 32v66" />
      <path d="M28 160V96c0-12 10-22 22-22s22 10 22 22v64" />
      <path d="M38 160v-60c0-7 5-12 12-12s12 5 12 12v60" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 100 150" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]" preserveAspectRatio="none" aria-hidden>
      {variants[Math.abs(variant) % variants.length]}
    </svg>
  );
}

export function BookCover({
  title, author, color = '#1F4A35', style = 0, size = 'md', className, imageUrl, flat,
}: {
  title: string; author?: string | null; color?: string | null; style?: number;
  size?: keyof typeof sizes; className?: string; imageUrl?: string | null; flat?: boolean;
}) {
  const { settings } = useAuth();
  const imprint = settings?.schoolShortName ? `${settings.schoolShortName} Library` : 'Tema Secondary Library';
  const base = color || '#1F4A35';
  const dark = shade(base, -28);
  const light = shade(base, 24);
  const small = size === 'xs' || size === 'sm';

  return (
    <div
      className={clsx('group relative aspect-[2/3] shrink-0 overflow-hidden', sizes[size], !flat && 'shadow-book ring-1 ring-black/20', className)}
      style={{ background: `linear-gradient(155deg, ${light} 0%, ${base} 42%, ${dark} 100%)` }}
      title={`${title}${author ? ` — ${author}` : ''}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={`Cover of ${title}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : null}
      {!imageUrl ? (
        <>
          <div className="absolute inset-y-0 left-0 w-[7%] bg-black/30" />
          <div className="absolute inset-y-0 left-[7%] w-px bg-white/20" />
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
          <Motif variant={style} color="rgba(255,255,255,0.9)" />
          {!small ? (
            <>
              <div className="absolute inset-x-[14%] top-[9%]">
                <p className="text-[5px] font-semibold uppercase tracking-[0.18em] text-white/55">{imprint}</p>
              </div>
              <div className="absolute inset-x-[14%] top-[26%] bottom-[26%] flex flex-col justify-center">
                <h3 className={clsx('font-display font-medium text-white drop-shadow-sm', titleSizes[size])} style={{ display: '-webkit-box', WebkitLineClamp: size === 'lg' || size === 'xl' || size === 'hero' ? 4 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {title}
                </h3>
              </div>
              <div className="absolute inset-x-[14%] bottom-[9%]">
                <div className="mb-1.5 h-px w-6 bg-white/50" />
                <p className={clsx('truncate font-medium uppercase tracking-[0.08em] text-white/70', size === 'md' ? 'text-[5.5px]' : 'text-[8px]')}>{author ?? 'Library collection'}</p>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-1">
              <span className={clsx('rotate-0 text-center font-display font-medium leading-[1.1] text-white/90', titleSizes[size])} style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {title}
              </span>
            </div>
          )}
          <div className="absolute inset-y-0 right-0 w-[3%] bg-gradient-to-l from-black/25 to-transparent" />
        </>
      ) : null}
    </div>
  );
}
