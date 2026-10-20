import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const viewport = (scale: number) => ({ width: 600 * scale, height: 800 * scale });
const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: () => {} }));
const getPage = vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => viewport(scale), render: renderPage }));
const destroy = vi.fn(async () => {});
const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: 3, getPage, destroy }) }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...(args as [])),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.mjs' }));

vi.mock('../lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return {
    ApiError,
    apiFileUrl: (path: string) => `/api${path}`,
    apiBlob: vi.fn(async () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' })),
  };
});

import { ApiError, apiBlob } from '../lib/api';
import { PdfReader } from './PdfReader';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    save: () => {}, restore: () => {}, clearRect: () => {},
  } as unknown as CanvasRenderingContext2D);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PdfReader', () => {
  it('draws the first page and turns to the next one', async () => {
    render(
      <MemoryRouter>
        <PdfReader bookId={37} title="Social Studies take home" />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Page 1 of 3/)).toBeTruthy();
    expect(getDocument).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeTruthy());
    expect(getPage).toHaveBeenCalledWith(2);
  });

  it('saves the file from the bytes it already fetched', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:book');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <PdfReader
          bookId={37}
          title="Social Studies take home"
          fileName="Social_Studies_Answers.pdf"
          allowDownload
        />
      </MemoryRouter>
    );

    await screen.findByText(/Page 1 of 3/);
    await userEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(click).toHaveBeenCalled();

    click.mockRestore();
  });

  it('explains an expired session instead of showing a blank frame', async () => {
    vi.mocked(apiBlob).mockRejectedValueOnce(new ApiError('Sign in to continue.', 401));

    render(
      <MemoryRouter>
        <PdfReader bookId={37} title="Social Studies take home" />
      </MemoryRouter>
    );

    expect(await screen.findByText('This book cannot be opened')).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in to read/i })).toBeTruthy();
  });
});
