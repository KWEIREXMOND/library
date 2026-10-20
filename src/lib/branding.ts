/**
 * The site name and short name are editable in Administration → Site settings,
 * so they cannot be baked into hooks and components. AuthProvider publishes the
 * current values here as soon as settings load; plain functions such as
 * useDocumentTitle read them without needing React context.
 */
export const DEFAULT_SITE_NAME = 'Libra';
export const DEFAULT_SCHOOL_SHORT_NAME = 'Tema SHS';
export const DEFAULT_SITE_DESCRIPTION =
  'The Tema Secondary School library — sign every visitor in at the door, and read our books online from any device.';

let siteName = DEFAULT_SITE_NAME;
let schoolShortName = DEFAULT_SCHOOL_SHORT_NAME;

export function setRuntimeBranding(next: { siteName?: string | null; schoolShortName?: string | null }) {
  if (next.siteName !== undefined) siteName = (next.siteName ?? '').trim() || DEFAULT_SITE_NAME;
  if (next.schoolShortName !== undefined) {
    schoolShortName = (next.schoolShortName ?? '').trim() || DEFAULT_SCHOOL_SHORT_NAME;
  }
}

export function runtimeSiteName() {
  return siteName;
}

export function siteTabTitle(shortName?: string | null) {
  const short = (shortName ?? '').trim() || schoolShortName;
  return `${siteName} · ${short} Library`;
}
