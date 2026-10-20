import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, FileWarning, Loader2, Minus, Plus, RotateCcw,
} from 'lucide-react';
import { ApiError, apiBlob, apiFileUrl } from '../lib/api';
import { Button } from './ui';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Props = { bookId: number; title: string; fileName?: string | null; allowDownload?: boolean };

/**
 * In-app PDF reader.
 *
 * The book is rendered to a canvas with pdf.js instead of being handed to the
 * browser's PDF plugin through an <iframe>. Phone browsers refuse to display a
 * PDF inside a frame, and sandboxed previews block the plugin outright, so a
 * canvas is the only way a student can turn pages everywhere.
 */
export function PdfReader({ bookId, title, fileName, allowDownload = false }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<{ cancel: () => void } | null>(null);

  // Fetch the file once, with the session token in the header (previews often
  // drop cookies) and the query token as a fallback.
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);
    setNote(null);
    setUnauthorized(false);
    setDoc(null);
    bytesRef.current = null;
    setPage(1);
    setPageInput('1');
    setZoom(1);

    (async () => {
      try {
        const blob = await apiBlob(`/books/${bookId}/file`);
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength === 0) throw new Error('This book file is empty. Ask the library to upload it again.');
        // Keep a copy for the Download button: pdf.js takes ownership of the
        // array it parses and detaches the underlying buffer.
        bytesRef.current = buffer.slice(0);
        loaded = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        if (err instanceof ApiError && err.status === 401) setUnauthorized(true);
        setError(err instanceof Error ? err.message : 'The book could not be opened.');
      }
    })();

    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [bookId, attempt]);

  // Follow the available width so a page always fits the column on phones.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    renderRef.current?.cancel();
    let cancelled = false;
    renderRef.current = { cancel: () => { cancelled = true; } };

    try {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const available = width > 24 ? width - 24 : base.width;
      const fit = Math.min(1.75, Math.max(0.3, available / base.width));
      let scale = fit * zoom;
      // Browsers cap canvas dimensions (roughly 16k px); keep huge pages safe.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const MAX_EDGE = 8192;
      if (base.width * scale * dpr > MAX_EDGE) scale = MAX_EDGE / (base.width * dpr);
      if (base.height * scale * dpr > MAX_EDGE) scale = Math.min(scale, MAX_EDGE / (base.height * dpr));
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot draw this book.');
      const task = pdfPage.render({
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      renderRef.current = { cancel: () => { cancelled = true; task.cancel(); } };
      await task.promise;
    } catch (err) {
      if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
      setError('This page could not be drawn. Try the next page or reload the book.');
    }
  }, [doc, page, zoom, width]);

  useEffect(() => {
    void render();
  }, [render]);

  const go = (next: number) => {
    if (!doc) return;
    const target = Math.min(doc.numPages, Math.max(1, next));
    setPage(target);
    setPageInput(String(target));
    frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Save the PDF the reader already holds, through a Blob link.
   *
   * Downloading by navigating to `/books/:id/file?mode=download` depends on the
   * browser honouring `Content-Disposition` inside an embedded preview, which
   * several browsers refuse to do. A Blob link is a normal same-page download
   * and works wherever downloads are allowed at all.
   */
  const download = () => {
    const bytes = bytesRef.current;
    if (!bytes || bytes.byteLength === 0) {
      window.open(apiFileUrl(`/books/${bookId}/file?mode=download`), '_blank', 'noopener');
      return;
    }
    const name = (fileName || title || 'book').replace(/[\\/:*?"<>|]+/g, '-');
    const safeName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNote(`Saving “${safeName}”. If nothing happened, use “Open in a new tab” beside it.`);
    window.setTimeout(() => setNote(null), 9000);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <FileWarning className="mx-auto h-9 w-9 text-ink/30" />
        <h2 className="mt-4 font-display text-2xl text-ink">This book cannot be opened</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-mute">{error}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {unauthorized ? (
            <Link to="/login" state={{ from: `/books/${bookId}` }}>
              <Button>Sign in to read</Button>
            </Link>
          ) : (
            <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          )}
          {allowDownload ? (
            <a href={apiFileUrl(`/books/${bookId}/file`)} target="_blank" rel="noreferrer">
              <Button variant="secondary">Open the PDF directly</Button>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading || !doc) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-mute">
          <Loader2 className="h-6 w-6 animate-spin text-brass-500" />
          <p className="text-[13px]">Fetching the pages of “{title}”…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-ink/10 bg-parchment/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-2 px-3 py-2 sm:px-6">
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              icon={ChevronLeft}
              aria-label="Previous page"
            >
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => go(page + 1)}
              disabled={page >= doc.numPages}
              aria-label="Next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <form
            className="flex items-center gap-1.5 px-2 text-[12.5px] text-ink-mute"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(pageInput);
              if (Number.isFinite(parsed)) go(Math.round(parsed));
            }}
          >
            <span className="hidden sm:inline">Page</span>
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => setPageInput(String(page))}
              inputMode="numeric"
              aria-label="Page number"
              className="field-input h-9 w-14 px-2 text-center text-[12.5px]"
            />
            <span>of {doc.numPages}</span>
          </form>

          <div className="hidden items-center gap-1 sm:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
              disabled={zoom <= 0.5}
              aria-label="Zoom out"
              icon={Minus}
            />
            <span className="w-11 text-center text-[12px] font-semibold text-ink-soft">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
              disabled={zoom >= 3}
              aria-label="Zoom in"
              icon={Plus}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(1)}
              aria-label="Fit the page to the screen"
              icon={RotateCcw}
            />
          </div>

          <div className="flex items-center gap-1 border-l border-ink/10 pl-2">
            {allowDownload ? (
              <Button variant="secondary" size="sm" onClick={download} icon={Download}>
                <span className="hidden sm:inline">Download</span>
              </Button>
            ) : null}
            {/* A plain anchor, not a button inside a link: nested interactive
                elements swallow the click in some browsers. Books marked
                “read online only” get no raw-PDF link at all. */}
            {allowDownload ? (
              <a
                href={apiFileUrl(`/books/${bookId}/file`)}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the PDF in a new tab"
                className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-ink/[0.055] hover:text-ink"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Open</span>
              </a>
            ) : null}
          </div>
        </div>
        {note ? (
          <p className="border-t border-ink/5 bg-brass-50/70 px-4 py-1.5 text-center text-[11.5px] text-ink-mute">
            {note}
          </p>
        ) : null}
      </div>

      <div
        ref={frameRef}
        className="mx-auto flex max-w-[1100px] justify-center px-3 py-5 sm:px-6"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(page + 1);
          if (event.key === 'ArrowLeft') go(page - 1);
        }}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          className="h-auto max-w-full rounded-lg bg-white shadow-card ring-1 ring-ink/10"
          aria-label={`${title} — page ${page} of ${doc.numPages}`}
          role="img"
        />
      </div>

      <p className="pb-8 text-center text-[11px] text-ink/35">
        Page {page} of {doc.numPages}
        {allowDownload ? (
          <>
            {' '}· Trouble reading?{' '}
            <a className="underline hover:text-ink" href={apiFileUrl(`/books/${bookId}/file`)} target="_blank" rel="noreferrer">
              open the PDF in a new tab
            </a>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
