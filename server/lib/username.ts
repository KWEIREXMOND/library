/**
 * Usernames.
 *
 * A username is an optional handle alongside the library ID and the email
 * address: any of the three signs you in. They are stored in lowercase so two
 * accounts can never differ only by case, which also keeps the login lookup a
 * single indexed comparison.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/** Every library ID is shaped like LIB-2026-0004; a handle must never mimic one. */
const LIBRARY_ID_SHAPE = /^lib-\d{4}-\d{4}$/;

export function normaliseUsername(input: string): string {
  return String(input ?? '').trim().toLowerCase();
}

/**
 * The reason a handle cannot be used, or null when it is fine. The client
 * repeats these rules so people see the problem before the request; the server
 * stays the authority.
 */
export function usernameIssue(input: string): string | null {
  const username = normaliseUsername(input);
  if (!username) return 'Choose a username.';
  if (username.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return 'Use only letters, numbers, dots, hyphens and underscores.';
  }
  if (!/^[a-z]/.test(username)) return 'Start the username with a letter.';
  if (LIBRARY_ID_SHAPE.test(username)) return 'That looks like a library ID — choose another username.';
  return null;
}

/**
 * Turn an email address or a person's name into a starting point for a handle.
 * Dots inside the local part are kept (`kofi.mensah@…` → `kofi.mensah`) because
 * readers are used to seeing their address in that shape.
 */
export function usernameBase(seed: string): string {
  const raw = String(seed ?? '').toLowerCase().trim();
  const local = raw.includes('@') ? raw.split('@')[0] : raw;
  let base = local
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[^a-z]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, USERNAME_MAX - 4);

  if (LIBRARY_ID_SHAPE.test(base)) base = `reader.${base}`;
  if (base.length < USERNAME_MIN) base = base ? `reader.${base}` : 'reader';
  return base;
}

/** `base`, then `base2`, `base3`… trimmed to fit the maximum length. */
export function usernameCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  const suffix = String(attempt + 1);
  return `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
}
