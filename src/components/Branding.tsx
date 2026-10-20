import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { DEFAULT_SITE_DESCRIPTION, runtimeSiteName, setRuntimeBranding, siteTabTitle } from '../lib/branding';

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

/**
 * Keeps the browser tab in sync with Administration → Site settings: the crest
 * uploaded there becomes the favicon, the site name becomes the tab title and
 * the description becomes the page description. Falls back to the bundled
 * Libra mark and copy when nothing has been customised.
 */
export function FaviconSync() {
  const { settings } = useAuth();
  const logo = settings?.logoUrl?.trim() || '';
  const siteName = settings?.siteName?.trim() || 'Libra';
  const shortName = settings?.schoolShortName?.trim() || 'Tema SHS';
  const description = settings?.siteDescription?.trim() || DEFAULT_SITE_DESCRIPTION;

  useEffect(() => {
    const previous = runtimeSiteName();
    const current = document.title;
    setRuntimeBranding({ siteName, schoolShortName: shortName });

    // Renaming the site should not strand the current page on the old name.
    if (previous !== siteName && current.endsWith(` · ${previous}`)) {
      document.title = `${current.slice(0, -(previous.length + 3))} · ${siteName}`;
    } else if (!current || /^.* · .* Library$/.test(current)) {
      document.title = siteTabTitle(shortName);
    }
  }, [siteName, shortName]);

  useEffect(() => {
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', siteTabTitle(shortName));
    setMeta('property', 'og:description', description);
  }, [description, shortName]);

  useEffect(() => {
    const href = logo || '/favicon.svg';
    const type = logo ? undefined : 'image/svg+xml';

    const apply = (rel: string, extra?: Record<string, string>) => {
      let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      if (type) link.type = type;
      else link.removeAttribute('type');
      for (const [key, value] of Object.entries(extra ?? {})) link.setAttribute(key, value);
    };

    apply('icon', { sizes: 'any' });
    apply('apple-touch-icon');
    apply('shortcut icon');
  }, [logo]);

  return null;
}
