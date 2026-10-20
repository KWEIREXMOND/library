import { describe, expect, it } from 'vitest';
import { findNavContext, navForRole } from './nav';

const labels = (role: 'admin' | 'librarian' | 'teacher' | 'student') =>
  navForRole(role).flatMap((section) => section.items.map((item) => item.label));

describe('navForRole', () => {
  it('gives administrators the people, broadcast and activity tools', () => {
    const admin = labels('admin');
    expect(admin).toContain('People');
    expect(admin).toContain('Broadcast');
    expect(admin).toContain('Activity log');
    expect(admin).toContain('Site settings');
    expect(admin).toContain('Front desk sign-ins');
  });

  it('keeps administration out of the librarian sidebar', () => {
    const librarian = labels('librarian');
    expect(librarian).toContain('Front desk sign-ins');
    expect(librarian).not.toContain('People');
    expect(librarian).not.toContain('Broadcast');
  });

  it('gives readers the shelf and their inbox', () => {
    expect(labels('student')).toEqual(['Online library', 'My inbox']);
    expect(labels('teacher')).toEqual(['Online library', 'My inbox']);
  });

  it('names the new pages in the header', () => {
    expect(findNavContext('/app/people', 'admin')).toEqual({ title: 'People', section: 'Administration' });
    expect(findNavContext('/app/broadcast', 'admin')).toEqual({ title: 'Broadcast', section: 'Administration' });
    expect(findNavContext('/app/settings', 'admin')).toEqual({ title: 'Site settings', section: 'Administration' });
    expect(findNavContext('/app/notifications', 'student')).toEqual({ title: 'My inbox', section: 'Read' });
    expect(findNavContext('/app/notifications', 'admin')).toEqual({ title: 'Inbox', section: 'Library' });
  });
});
