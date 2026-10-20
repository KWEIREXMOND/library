import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const settings = vi.hoisted(() => ({
  siteName: 'Grace Library',
  schoolShortName: 'GHS',
  siteDescription: 'Grace Library — reading for every student, every day.',
  logoUrl: '/api/media/branding/crest-test.png',
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ settings }),
}));

import { FaviconSync } from './Branding';

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"], meta[name="description"], meta[property^="og:"]')
    .forEach((node) => node.remove());
  document.title = '';
});

describe('FaviconSync', () => {
  it('turns the uploaded crest into the favicon and updates the description', async () => {
    render(<FaviconSync />);

    await waitFor(() => {
      expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/api/media/branding/crest-test.png');
      expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/api/media/branding/crest-test.png');
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
        .toBe('Grace Library — reading for every student, every day.');
      expect(document.title).toBe('Grace Library · GHS Library');
    });
  });
});
