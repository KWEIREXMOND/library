import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Info, Loader2, Search, X,
  type LucideIcon,
} from 'lucide-react';
import { initials } from '../lib/format';

export const cn = clsx;

// ── Loading ───────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-800 text-parchment shadow-lift">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
      <p className="text-sm font-medium text-ink-mute">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink/[0.06]', className)} />;
}

export function LoadingBlock({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass' | 'dark' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-forest-700 text-parchment shadow-sm hover:bg-forest-800 active:bg-forest-900',
  secondary: 'bg-white text-ink border border-ink/15 shadow-sm hover:border-ink/25 hover:bg-parchment-light',
  ghost: 'text-ink-soft hover:bg-ink/[0.055] hover:text-ink',
  danger: 'bg-clay-600 text-white shadow-sm hover:bg-clay-700',
  brass: 'bg-brass-400 text-forest-950 shadow-sm hover:bg-brass-300',
  dark: 'bg-ink text-parchment shadow-sm hover:bg-forest-900',
  outline: 'border border-forest-700/30 text-forest-700 hover:bg-forest-50',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8.5 px-3 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[13.5px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export function Button({
  variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: LucideIcon;
}) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant], buttonSizes[size], className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon, label, className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-mute transition hover:bg-ink/[0.06] hover:text-ink', className)}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ── Form controls ─────────────────────────────────────────────────────
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  containerClassName?: string;
};

export function Input({ label, error, hint, icon: Icon, invalid, className, containerClassName, id, ...props }: InputProps & { invalid?: boolean }) {
  const inputId = id ?? props.name ?? `input-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={containerClassName}>
      {label ? <label htmlFor={inputId} className="field-label">{label}</label> : null}
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /> : null}
        <input
          id={inputId}
          className={cn('field-input', Icon && 'pl-9', (error || invalid) && 'border-clay-500 focus:border-clay-500 focus:ring-clay-500/15', className)}
          aria-invalid={Boolean(error || invalid)}
          {...props}
        />
      </div>
      {error ? <p className="mt-1.5 text-[12px] font-medium text-clay-600">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

export function Textarea({
  label, error, hint, invalid, className, containerClassName, id, ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string; invalid?: boolean; containerClassName?: string }) {
  const inputId = id ?? props.name ?? `textarea-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={containerClassName}>
      {label ? <label htmlFor={inputId} className="field-label">{label}</label> : null}
      <textarea
        id={inputId}
        className={cn('field-input min-h-[110px] resize-y', (error || invalid) && 'border-clay-500 focus:border-clay-500 focus:ring-clay-500/15', className)}
        aria-invalid={Boolean(error || invalid)}
        {...props}
      />
      {error ? <p className="mt-1.5 text-[12px] font-medium text-clay-600">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

export function Select({
  label, error, hint, invalid, className, containerClassName, children, id, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string; invalid?: boolean; containerClassName?: string }) {
  const inputId = id ?? props.name ?? `select-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={containerClassName}>
      {label ? <label htmlFor={inputId} className="field-label">{label}</label> : null}
      <select
        id={inputId}
        className={cn('field-input appearance-none bg-[url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="%234A6157" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>\')] bg-[right_0.85rem_center] bg-no-repeat pr-9', (error || invalid) && 'border-clay-500', className)}
        {...props}
      >
        {children}
      </select>
      {error ? <p className="mt-1.5 text-[12px] font-medium text-clay-600">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label ? <span className="field-label">{label}{required ? <span className="ml-0.5 text-clay-600">*</span> : null}</span> : null}
      {children}
      {error ? <p className="mt-1.5 text-[12px] font-medium text-clay-600">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-soft', className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink/25 text-forest-700 focus:ring-forest-500/30" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SearchField({ value, onChange, placeholder = 'Search…', className, autoFocus, onSubmit }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <form
      className={cn('relative', className)}
      onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}
      role="search"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        className="field-input pl-10"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </form>
  );
}

// ── Display ───────────────────────────────────────────────────────────
type ToneName = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'brass' | 'violet';

const toneClasses: Record<ToneName, string> = {
  neutral: 'bg-ink/[0.055] text-ink-mute ring-ink/10',
  green: 'bg-forest-500/10 text-forest-700 ring-forest-600/20',
  amber: 'bg-brass-200/50 text-brass-800 ring-brass-500/25',
  red: 'bg-clay-100 text-clay-700 ring-clay-500/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  brass: 'bg-brass-100 text-brass-800 ring-brass-500/25',
  violet: 'bg-violet-50 text-violet-800 ring-violet-500/20',
};

export function Badge({ children, tone = 'neutral', className, dot }: { children: ReactNode; tone?: ToneName; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset', toneClasses[tone], className)}>
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', {
        neutral: 'bg-ink/40', green: 'bg-forest-500', amber: 'bg-brass-500', red: 'bg-clay-500',
        blue: 'bg-sky-500', brass: 'bg-brass-500', violet: 'bg-violet-500',
      }[tone])} /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: ReactNode; className?: string }) {
  const styles = {
    info: { wrap: 'border-sky-200 bg-sky-50/80 text-sky-900', icon: Info },
    success: { wrap: 'border-forest-200 bg-forest-50 text-forest-800', icon: Check },
    warning: { wrap: 'border-brass-200 bg-brass-50 text-brass-900', icon: AlertTriangle },
    danger: { wrap: 'border-clay-200 bg-clay-50 text-clay-800', icon: AlertTriangle },
  }[tone];
  const Icon = styles.icon;
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-[13px]', styles.wrap, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'leading-relaxed opacity-90')}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Avatar({ firstName, lastName, hue = 150, size = 'md', className }: {
  firstName?: string; lastName?: string; hue?: number; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string;
}) {
  const sizeClasses = { xs: 'h-7 w-7 text-[10px]', sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-[12px]', lg: 'h-14 w-14 text-base' }[size];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-inner ring-2 ring-white/70', sizeClasses, className)}
      style={{ background: `linear-gradient(145deg, hsl(${hue} 38% 34%), hsl(${(hue + 30) % 360} 42% 24%))` }}
    >
      {initials(firstName, lastName)}
    </span>
  );
}

export function ProgressBar({ value, tone = 'forest', className, showLabel }: { value: number; tone?: 'forest' | 'brass' | 'clay'; className?: string; showLabel?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const colors = { forest: 'bg-forest-600', brass: 'bg-brass-400', clay: 'bg-clay-500' };
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <div className={cn('h-full rounded-full transition-all duration-500', colors[tone])} style={{ width: `${clamped}%` }} />
      </div>
      {showLabel ? <span className="text-[11px] font-semibold tabular-nums text-ink-mute">{clamped}%</span> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'forest', className }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon;
  tone?: 'forest' | 'brass' | 'clay' | 'blue' | 'ink'; className?: string;
}) {
  const tones = {
    forest: 'bg-forest-600/10 text-forest-700',
    brass: 'bg-brass-300/30 text-brass-700',
    clay: 'bg-clay-100 text-clay-700',
    blue: 'bg-sky-50 text-sky-700',
    ink: 'bg-ink/[0.07] text-ink',
  };
  return (
    <div className={cn('card px-5 py-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute">{label}</p>
          <p className="mt-2 font-display text-[26px] leading-none tracking-tight text-ink">{value}</p>
        </div>
        {Icon ? <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-4 w-4" /></span> : null}
      </div>
      {hint ? <div className="mt-3 text-[12px] text-ink-mute">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-white/40 px-6 py-12 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-600">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-mute">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1.5 text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-mute">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, className }: { eyebrow?: string; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1 text-2xl text-ink sm:text-[27px]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────
export function Table({ children, className, minWidth = 'min-w-[720px]' }: { children: ReactNode; className?: string; minWidth?: string }) {
  return (
    <div className="table-wrap">
      <table className={cn('data-table', minWidth, className)}>{children}</table>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────
export function Pagination({ page, pages, total, pageSize, onPage, className }: {
  page: number; pages: number; total: number; pageSize: number; onPage: (page: number) => void; className?: string;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <p className="text-[12.5px] text-ink-mute">Showing <span className="font-semibold text-ink-soft">{from}–{to}</span> of {total}</p>
      <div className="flex items-center gap-1.5">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <span className="px-2 text-[12.5px] font-medium text-ink-soft">Page {page} of {pages}</span>
        <IconButton icon={ChevronRight} label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────
export function Tabs({ tabs, items, value, onChange, className }: {
  tabs?: Array<{ id: string; label: string; count?: number }>;
  items?: Array<{ value: string; label: string; count?: number }>;
  value: string; onChange: (id: string) => void; className?: string;
}) {
  const list = (items ?? tabs ?? []).map((tab) => ({ id: 'value' in tab ? tab.value : tab.id, label: tab.label, count: tab.count }));
  return (
    <div className={cn('no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl bg-ink/[0.045] p-1', className)} role="tablist">
      {list.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition',
            value === tab.id ? 'bg-white text-ink shadow-sm' : 'text-ink-mute hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', value === tab.id ? 'bg-forest-50 text-forest-700' : 'bg-ink/[0.06] text-ink-mute')}>{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={cn('animate-fade-up relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-parchment-light pb-[env(safe-area-inset-bottom)] shadow-lift ring-1 ring-ink/10 sm:max-h-[88vh] sm:rounded-2xl sm:pb-0', widths)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 sm:px-6">
          <div>
            {title ? <h2 className="text-xl leading-tight text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">{description}</p> : null}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-1 -mt-1" />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/10 bg-white/40 px-5 py-3.5 sm:rounded-b-2xl sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────
type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ options, resolve })), []);
  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.options.title}
        description={state?.options.message}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => close(false)}>{state?.options.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={state?.options.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.options.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        )}
      >
        <p className="text-[13px] text-ink-mute">This action will be recorded in the library audit trail.</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
}

// ── Toasts ────────────────────────────────────────────────────────────
type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: string; title: string; description?: string; tone: ToastTone };

const ToastContext = createContext<{ push: (toast: Omit<ToastItem, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id]; }
  }, []);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    timers.current[id] = setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:top-6 sm:bottom-auto sm:w-[360px]">
        {toasts.map((toast) => {
          const styles = {
            success: 'border-forest-200 bg-forest-800 text-parchment',
            error: 'border-clay-300 bg-clay-700 text-white',
            info: 'border-ink/20 bg-ink text-parchment',
          }[toast.tone];
          const Icon = toast.tone === 'success' ? Check : toast.tone === 'error' ? AlertTriangle : Info;
          return (
            <div key={toast.id} className={cn('pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-lift animate-fade-up', styles)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-[12px] leading-relaxed opacity-80">{toast.description}</p> : null}
              </div>
              <button onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="rounded p-0.5 opacity-60 transition hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
