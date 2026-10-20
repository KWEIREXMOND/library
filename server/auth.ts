import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get, nowIso, run } from './db.js';
import { clientIp, forbidden, HttpError, unauthorized, publicUser } from './http.js';

export type Role = 'student' | 'teacher' | 'librarian' | 'admin';
export type AuthUser = {
  id: number;
  role: Role;
  libraryId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  className: string | null;
  tokenVersion: number;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Every credential presented with this request, for logout revocation. */
      authTokens?: string[];
    }
  }
}

const SECRET = process.env.SESSION_SECRET || 'libra-development-secret-change-me';
export const COOKIE_NAME = 'libra_session';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  // Fail loudly rather than signing production tokens with a known default.
  console.warn('[security] SESSION_SECRET is not set — refusing to run with the development secret.');
  process.exit(1);
}

export const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compareSync(plain, hash);

export function signSession(user: { id: number; role: string; token_version: number }, remember = false) {
  return jwt.sign(
    // `jti` gives every session a stable identity so it can be revoked on logout.
    { sub: String(user.id), role: user.role, ver: user.token_version, jti: crypto.randomUUID() },
    SECRET,
    { expiresIn: remember ? '30d' : '12h' }
  );
}

type SessionPayload = { sub?: string; ver?: number; jti?: string; exp?: number };

const tokenFingerprint = (token: string) => `sha256:${crypto.createHash('sha256').update(token).digest('hex')}`;

function isRevoked(...keys: (string | undefined)[]): boolean {
  const present = keys.filter((key): key is string => Boolean(key));
  if (!present.length) return false;
  const placeholders = present.map(() => '?').join(', ');
  return Boolean(get(`SELECT 1 AS hit FROM revoked_tokens WHERE jti IN (${placeholders})`, present));
}

/**
 * Invalidate a session token server-side. Logout must genuinely end the session:
 * a signed JWT is otherwise valid until it expires, which would silently sign the
 * user back in on the next page load.
 */
export function revokeSession(token: string): boolean {
  try {
    const payload = jwt.decode(token) as SessionPayload | null;
    const expiresAt = payload?.exp ? new Date(payload.exp * 1000).toISOString() : new Date(Date.now() + 31 * 864e5).toISOString();
    // Revoke by token fingerprint as well as by `jti`: sessions minted before
    // `jti` existed carry no identifier, and they must still be revocable.
    const keys = [tokenFingerprint(token)];
    if (payload?.jti) keys.push(payload.jti);
    for (const key of keys) {
      run(
        `INSERT INTO revoked_tokens (jti, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(jti) DO NOTHING`,
        [key, payload?.sub ? Number(payload.sub) : null, expiresAt, nowIso()]
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Drop revocations whose tokens have expired on their own. */
export function pruneRevokedSessions(): number {
  const result = run('DELETE FROM revoked_tokens WHERE expires_at < ?', [nowIso()]);
  return Number(result.changes ?? 0);
}

export function setSessionCookie(req: Request, res: Response, token: string, remember = false) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && req.secure),
    path: '/',
    maxAge: (remember ? 30 : 1) * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
}

function loadAuthUser(id: number): AuthUser | null {
  const row = get<any>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    libraryId: row.library_id ?? row.school_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    status: row.status,
    className: row.class_name,
    tokenVersion: row.token_version,
  };
}

function verifySession(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, SECRET) as SessionPayload;
    if (!payload.sub) return null;
    if (isRevoked(payload.jti, tokenFingerprint(token))) return null;
    const user = loadAuthUser(Number(payload.sub));
    if (!user) return null;
    if (payload.ver !== user.tokenVersion) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Resolve the signed-in user.
 *
 * Two credentials may arrive: an explicit `Authorization: Bearer` token and the
 * ambient session cookie. We try the explicit one first and fall back to the
 * cookie, so a stale or blocked cookie can never mask a valid token. (Browsers
 * that refuse to store cookies in an embedded preview keep sending an old one
 * while the app's token is perfectly good.)
 */
/**
 * Collect every credential the request may carry, most explicit first.
 *
 * Some hosting proxies strip the `Authorization` header, and cookie support is
 * unreliable when the app is embedded in an iframe. The client therefore sends
 * both a bearer header and `X-Libra-Token`, and media URLs append `?token=`.
 */
function candidateTokens(req: Request): string[] {
  const tokens: string[] = [];
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) tokens.push(header.slice(7));
  const xtoken = req.headers['x-libra-token'];
  if (typeof xtoken === 'string' && xtoken) tokens.push(xtoken);
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof queryToken === 'string' && queryToken) tokens.push(queryToken);
  const cookie = (req as any).cookies?.[COOKIE_NAME];
  if (typeof cookie === 'string' && cookie) tokens.push(cookie);
  return Array.from(new Set(tokens));
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const candidates = candidateTokens(req);
  req.authTokens = candidates;
  const cookie = (req as any).cookies?.[COOKIE_NAME];
  const hasCookie = typeof cookie === 'string' && cookie.length > 0;
  const bearer = candidates[0] && req.headers.authorization?.startsWith('Bearer ') ? candidates[0] : null;

  const isMe = String(req.originalUrl || req.url).split('?')[0] === '/api/auth/me';
  if (isMe) {
    const sources = [
      req.headers.authorization ? 'authorization' : null,
      req.headers['x-libra-token'] ? 'x-token' : null,
      (req.query as any)?.token ? 'query' : null,
      hasCookie ? 'cookie' : null,
    ].filter(Boolean);
    console.info('[auth] /auth/me credentials=%s host=%s', sources.length ? sources.join('+') : 'NONE',
      req.headers['x-forwarded-host'] || req.headers.host || '-');
  }

  for (const token of candidates) {
    const user = verifySession(token);
    if (!user) continue;
    if (user.status === 'suspended') return next(forbidden('Your account has been suspended. Please contact the librarian.'));
    if (user.status !== 'active') return next(forbidden('Your account is not active. Please contact the librarian.'));
    if (bearer && token === bearer && hasCookie) {
      // The explicit token won. If the cookie points at a different (stale)
      // session, drop it so the browser stops sending conflicting credentials.
      const cookieUser = verifySession(cookie as string);
      if (!cookieUser || cookieUser.id !== user.id) clearSessionCookie(res);
    }
    req.user = user;
    if (isMe) console.info('[auth] /auth/me authenticated as user %s via %s', user.id, token === bearer ? 'bearer' : 'cookie/other');
    return next();
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

const STAFF_ROLES: Role[] = ['librarian', 'admin'];
export const isStaff = (role?: string) => role === 'librarian' || role === 'admin';
export const isAdmin = (role?: string) => role === 'admin';

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!STAFF_ROLES.includes(req.user.role)) return next(forbidden('This area is for library staff.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!isAdmin(req.user.role)) return next(forbidden('Administrator access is required.'));
  next();
}

// ── Basic brute-force protection ───────────────────────────────────
type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function checkLoginRate(req: Request, identifier: string) {
  const key = `${clientIp(req)}:${identifier.toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    throw new HttpError(429, `Too many sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
  return key;
}

export function recordFailedLogin(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}

export function issueSession(req: Request, res: Response, user: any, remember = false) {
  run('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), user.id]);
  const token = signSession(user, remember);
  setSessionCookie(req, res, token, remember);
  return token;
}

export { publicUser };
