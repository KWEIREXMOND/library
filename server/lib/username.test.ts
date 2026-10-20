import { describe, expect, it } from 'vitest';
import {
  normaliseUsername, USERNAME_MAX, usernameBase, usernameCandidate, usernameIssue,
} from './username.js';

describe('username rules', () => {
  it('accepts ordinary handles', () => {
    for (const name of ['kofi', 'ama.mensah', 'reader_01', 'kwame-2', 'kofi.mensah']) {
      expect(usernameIssue(name)).toBeNull();
    }
  });

  it('rejects handles people could not type at the sign-in screen', () => {
    expect(usernameIssue('')).toBe('Choose a username.');
    expect(usernameIssue('ab')).toContain('at least 3');
    expect(usernameIssue('a'.repeat(USERNAME_MAX + 1))).toContain('at most 24');
    expect(usernameIssue('ama mensah')).toContain('letters, numbers');
    expect(usernameIssue('ama@school.edu.gh')).toContain('letters, numbers');
    expect(usernameIssue('9lives')).toContain('Start the username with a letter');
    expect(usernameIssue('LIB-2026-0004')).toContain('looks like a library ID');
  });

  it('treats a handle case-insensitively', () => {
    expect(normaliseUsername('  Kofi.Mensah ')).toBe('kofi.mensah');
    expect(usernameIssue('Kofi.Mensah')).toBeNull();
  });

  it('derives a starting handle from an email or a name', () => {
    expect(usernameBase('admin@tema.edu.gh')).toBe('admin');
    expect(usernameBase('Kofi.Mensah@tema.edu.gh')).toBe('kofi.mensah');
    expect(usernameBase('ama')).toBe('ama');
    expect(usernameBase('')).toBe('reader');
    expect(usernameBase('2kofi')).toBe('kofi');
    expect(usernameBase('LIB-2026-0004')).toMatch(/^reader\./);
  });

  it('numbers a clash without exceeding the maximum length', () => {
    expect(usernameCandidate('kofi', 0)).toBe('kofi');
    expect(usernameCandidate('kofi', 1)).toBe('kofi2');
    const long = usernameCandidate('a'.repeat(USERNAME_MAX), 12);
    expect(long.length).toBeLessThanOrEqual(USERNAME_MAX);
    expect(long.endsWith('13')).toBe(true);
  });
});
