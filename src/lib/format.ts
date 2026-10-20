const dateFormatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', options);

export function formatDate(value?: string | null, style: 'short' | 'long' | 'weekday' = 'short') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  if (style === 'long') return dateFormatter({ day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  if (style === 'weekday') return dateFormatter({ weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  return dateFormatter({ day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return dateFormatter({ month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1));
}

export function timeAgo(value?: string | null) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

export function money(value?: number | null, currency = 'GHS') {
  const amount = Number(value ?? 0);
  return `${currency} ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compactNumber(value?: number | null) {
  const n = Number(value ?? 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function initials(first?: string, last?: string) {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '?';
}

export function titleCase(value?: string | null) {
  if (!value) return '';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'brass' | 'violet';

export function statusTone(status?: string | null): Tone {
  switch (status) {
    case 'active':
    case 'available':
    case 'returned':
    case 'approved':
    case 'published':
    case 'paid':
    case 'clear':
    case 'fulfilled':
      return 'green';
    case 'pending':
    case 'waiting':
    case 'partial':
    case 'due_soon':
    case 'fair':
      return 'amber';
    case 'overdue':
    case 'suspended':
    case 'lost':
    case 'rejected':
    case 'missing':
    case 'expired':
    case 'damaged':
      return 'red';
    case 'ready':
    case 'reserved':
    case 'inactive':
      return 'blue';
    case 'draft':
    case 'waived':
    case 'cancelled':
    case 'archived':
      return 'neutral';
    case 'graduated':
    case 'transferred':
      return 'violet';
    default:
      return 'neutral';
  }
}

export function dueInfo(dueDate?: string | null, returned?: boolean) {
  if (!dueDate) return { label: '—', tone: 'neutral' as Tone, days: 0 };
  if (returned) return { label: formatDate(dueDate), tone: 'neutral' as Tone, days: 0 };
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDay(new Date(dueDate)) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, tone: 'red' as Tone, days };
  if (days === 0) return { label: 'Due today', tone: 'amber' as Tone, days };
  if (days <= 3) return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'amber' as Tone, days };
  return { label: `Due ${formatDate(dueDate, 'weekday')}`, tone: 'neutral' as Tone, days };
}

export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

export function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(value, 16);
  if (Number.isNaN(num)) return `rgba(31,74,53,${alpha})`;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

export function shade(hex: string, amount: number) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(value, 16);
  if (Number.isNaN(num)) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function relativeToTerm(term: string | null | undefined) {
  return term ? term : 'This term';
}
