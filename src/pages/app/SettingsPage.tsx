import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, RotateCcw, Save, Trash2, UploadCloud } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import type { Settings } from '../../lib/types';
import { LogoMark } from '../../components/Brand';
import {
  Button, PageHeader, Spinner, useConfirm, useToast,
} from '../../components/ui';

type Form = {
  siteName: string;
  schoolName: string;
  schoolShortName: string;
  siteDescription: string;
  motto: string;
};

const fromSettings = (settings?: Settings | null): Form => ({
  siteName: settings?.siteName ?? 'Libra',
  schoolName: settings?.schoolName ?? 'Tema Secondary School',
  schoolShortName: settings?.schoolShortName ?? 'Tema SHS',
  siteDescription: settings?.siteDescription ?? '',
  motto: settings?.motto ?? '',
});

type BrandingResponse = { settings: Settings };

/**
 * Administration → Site settings.
 *
 * One place to rename the site, change the description and replace the crest.
 * The crest is uploaded immediately (and reused as the favicon); the text is
 * saved as one form so a half-typed name never reaches the public site.
 */
export function SettingsPage() {
  useDocumentTitle('Site settings');
  const { settings, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Form | null>(() => (settings ? fromSettings(settings) : null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  // The auth payload arrives after the first render on a hard refresh.
  useEffect(() => {
    if (!form && settings) setForm(fromSettings(settings));
  }, [form, settings]);

  const current = form ?? fromSettings(settings);
  const baseline = fromSettings(settings);
  const dirty = form !== null && (Object.keys(baseline) as (keyof Form)[]).some((key) => current[key] !== baseline[key]);
  const logo = settings?.logoUrl?.trim() || '';

  const update = (key: keyof Form, value: string) => {
    setForm({ ...current, [key]: value });
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: (payload: Form) => api<BrandingResponse>('/settings', {
      method: 'PATCH',
      body: { ...payload, motto: payload.motto.trim() },
    }),
    onSuccess: async ({ settings: saved }) => {
      setForm(fromSettings(saved));
      setErrors({});
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.push({
        tone: 'success',
        title: 'Site branding saved',
        description: 'The header, tab title, favicon and description now use the new values.',
      });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.push({ tone: 'error', title: 'Could not save the branding', description: error.message });
    },
  });

  const onPickFile = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      toast.push({ tone: 'error', title: 'That file is not an image', description: 'Choose a PNG, JPEG, WebP or GIF file.' });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.push({ tone: 'error', title: 'That image is too large', description: 'Keep the crest under 4 MB.' });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      await api<BrandingResponse>('/settings/logo', { method: 'POST', body });
      await refresh();
      toast.push({ tone: 'success', title: 'Crest updated', description: 'It is now the site icon and the favicon.' });
    } catch (error) {
      toast.push({ tone: 'error', title: 'Could not upload the image', description: (error as Error).message });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeLogo = async () => {
    const ok = await confirm({
      title: 'Remove the site crest?',
      message: 'The default Libra mark comes back in the header and the browser tab.',
      confirmLabel: 'Remove image',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await api('/settings/logo', { method: 'DELETE' });
      await refresh();
      toast.push({ tone: 'success', title: 'Crest removed', description: 'The default mark is back.' });
    } catch (error) {
      toast.push({ tone: 'error', title: 'Could not remove the image', description: (error as Error).message });
    } finally {
      setRemoving(false);
    }
  };

  const tabTitle = `${current.siteName.trim() || 'Libra'} · ${current.schoolShortName.trim() || 'Tema SHS'} Library`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Site name & branding"
        description="Rename the site, write the description that search engines and the footer show, and upload a crest. The crest doubles as the favicon."
        actions={
          <Button
            icon={Save}
            onClick={() => save.mutate(current)}
            loading={save.isPending}
            disabled={!dirty}
          >
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <h2 className="font-display text-xl text-ink">Name & description</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
              The site name is the wordmark in the header and the start of the browser tab. The description
              appears under the footer and in search results.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Site name</span>
                <input
                  value={current.siteName}
                  onChange={(event) => update('siteName', event.target.value)}
                  maxLength={40}
                  className={`field-input ${errors.siteName ? 'border-clay-500' : ''}`}
                  aria-invalid={Boolean(errors.siteName)}
                  placeholder="Libra"
                />
                {errors.siteName
                  ? <span className="mt-1 block text-[12px] font-medium text-clay-600">{errors.siteName}</span>
                  : <span className="mt-1 block text-[11.5px] text-ink/40">Shown in the header and tab title. Max 40 characters.</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Short name</span>
                <input
                  value={current.schoolShortName}
                  onChange={(event) => update('schoolShortName', event.target.value)}
                  maxLength={24}
                  className={`field-input ${errors.schoolShortName ? 'border-clay-500' : ''}`}
                  aria-invalid={Boolean(errors.schoolShortName)}
                  placeholder="Tema SHS"
                />
                {errors.schoolShortName
                  ? <span className="mt-1 block text-[12px] font-medium text-clay-600">{errors.schoolShortName}</span>
                  : <span className="mt-1 block text-[11.5px] text-ink/40">Used as “{current.schoolShortName || 'Tema SHS'} Library”.</span>}
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">School name</span>
                <input
                  value={current.schoolName}
                  onChange={(event) => update('schoolName', event.target.value)}
                  maxLength={80}
                  className={`field-input ${errors.schoolName ? 'border-clay-500' : ''}`}
                  aria-invalid={Boolean(errors.schoolName)}
                  placeholder="Tema Secondary School"
                />
                {errors.schoolName
                  ? <span className="mt-1 block text-[12px] font-medium text-clay-600">{errors.schoolName}</span>
                  : <span className="mt-1 block text-[11.5px] text-ink/40">Shown in the footer, on the kiosk and on printed book covers.</span>}
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-baseline justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">
                  Description
                  <span className="font-medium normal-case tracking-normal text-ink/35">{current.siteDescription.length}/220</span>
                </span>
                <textarea
                  value={current.siteDescription}
                  onChange={(event) => update('siteDescription', event.target.value)}
                  maxLength={220}
                  rows={3}
                  className={`field-input min-h-[92px] resize-y ${errors.siteDescription ? 'border-clay-500' : ''}`}
                  aria-invalid={Boolean(errors.siteDescription)}
                  placeholder="A sentence about the library…"
                />
                {errors.siteDescription ? (
                  <span className="mt-1 block text-[12px] font-medium text-clay-600">{errors.siteDescription}</span>
                ) : (
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-ink/40">
                    One or two sentences for the footer and the page’s meta description.
                  </span>
                )}
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Motto (optional)</span>
                <input
                  value={current.motto}
                  onChange={(event) => update('motto', event.target.value)}
                  maxLength={80}
                  className="field-input"
                  placeholder="Knowledge, Integrity, Service"
                />
                {errors.motto ? <span className="mt-1 block text-[12px] font-medium text-clay-600">{errors.motto}</span> : null}
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <h2 className="font-display text-xl text-ink">Crest & favicon</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
              A square image works best. It appears beside the site name in the header and as the little icon
              on the browser tab, bookmarks and phones.
            </p>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-parchment">
                {logo
                  ? <img src={logo} alt="Current site crest" className="h-full w-full object-contain" />
                  : <LogoMark className="h-14 w-14" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => onPickFile(event.target.files?.[0])}
                  />
                  <Button
                    variant="secondary"
                    icon={ImagePlus}
                    onClick={() => fileInput.current?.click()}
                    loading={uploading}
                  >
                    {logo ? 'Replace image' : 'Upload image'}
                  </Button>
                  {logo ? (
                    <Button variant="ghost" icon={Trash2} onClick={removeLogo} loading={removing}>
                      Remove
                    </Button>
                  ) : null}
                  {uploading ? <span className="inline-flex items-center gap-2 text-[12px] text-ink-mute"><Spinner /> Uploading…</span> : null}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink/40">
                  PNG, JPEG, WebP or GIF · up to 4 MB · square, at least 128 × 128 px. SVG uploads are disabled for safety.
                </p>
              </div>
            </div>
          </section>

          {dirty ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brass-400/40 bg-brass-50 px-4 py-3">
              <p className="mr-auto text-[12.5px] text-brass-900">You have unsaved changes.</p>
              <Button variant="ghost" icon={RotateCcw} onClick={() => { setForm(fromSettings(settings)); setErrors({}); }}>
                Discard
              </Button>
              <Button icon={Save} onClick={() => save.mutate(current)} loading={save.isPending}>Save changes</Button>
            </div>
          ) : null}
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-ink/10 bg-parchment/70 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink/40">Preview</p>
              <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink-mute">live</span>
            </div>

            {/* Browser tab */}
            <div className="bg-ink/[0.06] px-3 pt-3">
              <div className="flex max-w-full items-center gap-2 rounded-t-lg bg-white px-3 py-2 shadow-sm">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-parchment">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <LogoMark className="h-4 w-4" />}
                </span>
                <span className="min-w-0 truncate text-[11px] font-medium text-ink-soft">{tabTitle}</span>
              </div>
            </div>

            {/* Page header */}
            <div className="bg-parchment-light px-4 py-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <LogoMark className="h-10 w-10" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[20px] font-semibold leading-none text-ink">
                    {current.siteName.trim() || 'Libra'}
                  </p>
                  <p className="mt-1 truncate text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                    {current.schoolShortName.trim() || 'Tema SHS'} Library
                  </p>
                </div>
              </div>
              {current.siteDescription.trim() ? (
                <p className="mt-4 line-clamp-4 text-[12px] leading-relaxed text-ink-mute">{current.siteDescription}</p>
              ) : null}
              {current.motto.trim() ? (
                <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-ink/35">{current.motto}</p>
              ) : null}
            </div>

            <div className="border-t border-ink/10 px-4 py-3 text-[11px] leading-relaxed text-ink/40">
              The crest also becomes the favicon, the icon on bookmarks and the home-screen icon on phones.
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 text-[11.5px] leading-relaxed text-ink-mute">
            Changes apply to every page — public site, staff dashboard, kiosk and printed book covers — as soon
            as you save.
          </div>
        </aside>
      </div>
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink/40">
        <UploadCloud className="h-3.5 w-3.5" />
        Branding is stored in the database; uploaded images live in the data volume so they survive a restart.
      </p>
    </div>
  );
}
