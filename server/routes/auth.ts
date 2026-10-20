import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { get, nextLibraryId, nowIso, run, uniqueUsername } from '../db.js';
import {
  checkLoginRate, clearLoginAttempts, clearSessionCookie, hashPassword, issueSession,
  publicUser, recordFailedLogin, requireAuth, revokeSession, verifyPassword,
} from '../auth.js';
import { asyncH, audit, badRequest, clientIp, conflict, parse, unauthorized } from '../http.js';
import { getSettings } from '../settings.js';
import { normaliseUsername, usernameIssue } from '../lib/username.js';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or library ID.'),
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean().optional(),
});

router.post('/login', asyncH(async (req, res) => {
  const data = parse(loginSchema, req.body);
  const rateKey = checkLoginRate(req, data.identifier);
  const identifier = data.identifier.trim();
  // Three ways in: the email address, the library ID, or the handle they chose.
  const user = await get<any>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR UPPER(library_id) = UPPER(?) OR username = ?',
    [identifier, identifier, normaliseUsername(identifier)]
  );
  if (!user || !verifyPassword(data.password, user.password_hash)) {
    recordFailedLogin(rateKey);
    await audit({
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      summary: `Failed sign-in for “${identifier}”`,
      ip: clientIp(req),
    });
    throw unauthorized('Those sign-in details are not correct. Please try again.');
  }
  if (user.status === 'suspended') {
    recordFailedLogin(rateKey);
    throw unauthorized('Your account has been suspended. Please contact the librarian.');
  }
  if (user.status !== 'active') {
    recordFailedLogin(rateKey);
    throw unauthorized(
      user.status === 'pending'
        ? 'Your account is awaiting activation by library staff.'
        : `Your account is marked “${user.status}”. Please contact the library.`
    );
  }
  clearLoginAttempts(rateKey);
  const token = await issueSession(req, res, user, Boolean(data.remember));
  await audit({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, summary: `${user.first_name} signed in`, ip: clientIp(req) });
  res.json({ user: publicUser(user), token, settings: getSettings() });
}));

router.post('/logout', asyncH(async (req, res) => {
  if (req.user) await audit({ userId: req.user.id, action: 'auth.logout', entityType: 'user', entityId: req.user.id, summary: `${req.user.firstName} signed out` });
  // Revoke every credential this request carried (cookie, bearer header, custom
  // header or query token) so the session cannot be replayed after sign-out.
  const revoked = (await Promise.all((req.authTokens ?? []).map((token) => revokeSession(token)))).filter(Boolean).length;
  clearSessionCookie(res);
  res.json({ ok: true, revoked });
}));

const registerSchema = z.object({
  firstName: z.string().trim().min(2, 'Enter your first name.'),
  lastName: z.string().trim().min(2, 'Enter your surname.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.'),
  className: z.string().trim().max(40).optional(),
  programme: z.string().trim().max(60).optional(),
});

/**
 * Readers create their own account and are issued a library ID straight away.
 * The ID is what they type at the kiosk and when signing in to read.
 */
router.post('/register', asyncH(async (req, res) => {
  const data = parse(registerSchema, req.body);
  const existing = await get<any>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [data.email]);
  if (existing) throw conflict('An account with that email already exists. Try signing in instead.');
  const stamp = nowIso();
  const libraryId = await nextLibraryId();
  // Everyone gets a handle as well, taken from the address they registered with;
  // they can change it later from their account page.
  const username = await uniqueUsername(data.email);
  const result = await run(
    `INSERT INTO users (school_id, library_id, username, email, password_hash, first_name, last_name, role, status, class_name, programme, avatar_hue, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'student', 'active', ?, ?, ?, ?, ?)`,
    [libraryId, libraryId, username, data.email.toLowerCase(), hashPassword(data.password), data.firstName, data.lastName,
      data.className ?? null, data.programme ?? null, Math.floor(Math.random() * 360), stamp, stamp]
  );
  await audit({ userId: result.lastInsertRowid, action: 'auth.register', entityType: 'user', entityId: result.lastInsertRowid, summary: `Registered reader ${data.firstName} ${data.lastName} (${libraryId})`, ip: clientIp(req) });
  const user = await get<any>('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
  const token = await issueSession(req, res, user, false);
  res.status(201).json({
    user: publicUser(user),
    token,
    settings: getSettings(),
    libraryId,
    username,
    message: `Your library ID is ${libraryId} and your username is ${username}. Keep both safe — you will use them to sign in, and your library ID at the kiosk.`,
  });
}));

const resetSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your library ID or email address.'),
  email: z.string().trim().email('Enter the email address on the account.'),
  password: z.string().min(8, 'Use at least 8 characters.').regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.'),
});

/**
 * Password recovery without an email server: the reader proves ownership by
 * giving both the library ID (or email) and the email address on the account,
 * then chooses a new password. Both must match, and attempts are throttled.
 */
router.post('/reset-password', asyncH(async (req, res) => {
  const data = parse(resetSchema, req.body);
  const rateKey = checkLoginRate(req, `reset:${data.identifier.toLowerCase()}`);
  const user = await get<any>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR UPPER(library_id) = UPPER(?) OR username = ?',
    [data.identifier, data.identifier, normaliseUsername(data.identifier)]
  );
  const matches = Boolean(user) && String(user.email ?? '').toLowerCase() === data.email.trim().toLowerCase();
  if (!matches) {
    recordFailedLogin(rateKey);
    throw badRequest('Those details do not match an account. Check your library ID and the email you registered with.');
  }
  if (user.status === 'suspended') throw badRequest('This account is suspended. Please speak to the library.');
  clearLoginAttempts(rateKey);
  await run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [hashPassword(data.password), nowIso(), user.id]);
  await audit({ userId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id, summary: 'Reset own password with library ID and email', ip: clientIp(req) });
  res.json({ ok: true, message: 'Your password has been changed. You can sign in now.' });
}));

router.get('/me', asyncH(async (req, res) => {
  if (!req.user) {
    res.json({ user: null, settings: getSettings() });
    return;
  }
  const row = await get<any>('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({
    user: { ...publicUser(row), mustChangePassword: false },
    settings: getSettings(),
    permissions: {
      manageLibrary: ['librarian', 'admin'].includes(req.user.role),
      administer: req.user.role === 'admin',
    },
  });
}));

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Enter your first name.'),
  lastName: z.string().trim().min(2, 'Enter your surname.'),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('Enter a valid email address.'),
  username: z.string().trim().max(40).optional(),
});
router.patch('/profile', requireAuth, asyncH(async (req, res) => {
  const data = parse(profileSchema, req.body);
  const clash = await get<any>('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?', [data.email, req.user!.id]);
  if (clash) throw conflict('That email address is already used by another account.');

  const current = await get<any>('SELECT username FROM users WHERE id = ?', [req.user!.id]);
  const username = data.username === undefined || data.username === ''
    ? current?.username ?? await uniqueUsername(data.email, req.user!.id)
    : normaliseUsername(data.username);
  if (data.username !== undefined && data.username !== '') {
    const issue = usernameIssue(username);
    if (issue) throw badRequest(issue, { username: issue });
    const taken = await get<any>('SELECT id FROM users WHERE username = ? AND id <> ?', [username, req.user!.id]);
    if (taken) throw conflict('That username is already taken. Try another one.', { username: 'That username is taken.' });
  }

  await run('UPDATE users SET first_name = ?, last_name = ?, phone = ?, email = ?, username = ?, updated_at = ? WHERE id = ?',
    [data.firstName, data.lastName, data.phone ?? null, data.email.toLowerCase(), username, nowIso(), req.user!.id]);
  await audit({ userId: req.user!.id, action: 'profile.update', entityType: 'user', entityId: req.user!.id, summary: 'Updated own profile' });
  res.json({ user: publicUser(await get<any>('SELECT * FROM users WHERE id = ?', [req.user!.id])) });
}));

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.'),
});
router.post('/change-password', requireAuth, asyncH(async (req, res) => {
  const data = parse(passwordSchema, req.body);
  const row = await get<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  if (!verifyPassword(data.currentPassword, row.password_hash)) throw badRequest('Your current password is not correct.', { currentPassword: 'Incorrect password.' });
  if (data.currentPassword === data.newPassword) throw badRequest('Choose a password you have not used before.');
  await run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [hashPassword(data.newPassword), nowIso(), req.user!.id]);
  const refreshed = await get<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  const token = await issueSession(req, res, refreshed, false);
  await audit({ userId: req.user!.id, action: 'auth.password_changed', entityType: 'user', entityId: req.user!.id, summary: 'Changed own password' });
  res.json({ ok: true, message: 'Password updated. Other devices have been signed out.', token });
}));

export default router;
