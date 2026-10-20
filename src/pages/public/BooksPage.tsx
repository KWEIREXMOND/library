import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, BookOpen, FileText, LibraryBig, Lock, Search, Sparkles, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { fileSize } from '../../lib/format';
import { AccountMenu } from '../../components/AccountMenu';
import { BookCover } from '../../components/BookCover';
// pdf.js is heavy; it is only fetched when someone actually opens a book.
const PdfReader = lazy(() => import('../../components/PdfReader').then((m) => ({ default: m.PdfReader })));
import { PageIntro } from '../../components/PublicLayout';
import { Badge, Button, EmptyState, Pagination, Skeleton } from '../../components/ui';
import type { Book, BookListResponse } from '../../lib/types';

export function BooksPage() {
  useDocumentTitle('Online books');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const debounced = useDebounced(query, 250);
  const category = params.get('category') ?? '';
  const page = Number(params.get('page') ?? 1);

  const { data, isLoading } = useQuery({
    queryKey: ['books', debounced, category, page],
    queryFn: () => api<BookListResponse>(`/books?q=${encodeURIComponent(debounced)}&category=${encodeURIComponent(category)}&page=${page}&pageSize=15`),
  });

  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || (key === 'page' && value === 1)) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  const books = data?.rows ?? [];
  const categories = data?.summary?.categories ?? [];

  const open = (book: Book) => {
    if (user) navigate(`/books/${book.id}`);
    else navigate('/login', { state: { from: `/books/${book.id}` } });
  };

  return (
    <div>
      <PageIntro
        eyebrow="Read anywhere"
        title="The library, online."
        description="Every book the library has put online, free to read in your browser. Sign in with your library ID and pick up where you left off."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green" dot>{data?.summary?.total ?? 0} books available</Badge>
            {!user ? (
              <Link to="/login"><Button size="sm" icon={Lock}>Sign in to read</Button></Link>
            ) : null}
          </div>
        }
      >
        <form
          className="relative max-w-xl"
          role="search"
          onSubmit={(event) => { event.preventDefault(); update({ q: query.trim() || null }); }}
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); update({ q: event.target.value || null, page: 1 }); }}
            placeholder="Search by title, author or subject…"
            aria-label="Search books"
            className="field-input h-12 pl-11 pr-10 text-[14.5px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); update({ q: null, page: 1 }); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </form>

        {categories.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => update({ category: null, page: 1 })}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                !category ? 'bg-forest-700 text-parchment' : 'bg-white text-ink-soft ring-1 ring-inset ring-ink/10 hover:bg-forest-50'
              }`}
            >
              All shelves
            </button>
            {categories.map((item) => (
              <button
                key={item.name}
                onClick={() => update({ category: item.name, page: 1 })}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                  category === item.name ? 'bg-forest-700 text-parchment' : 'bg-white text-ink-soft ring-1 ring-inset ring-ink/10 hover:bg-forest-50'
                }`}
              >
                {item.name} <span className="opacity-60">{item.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </PageIntro>

      <section className="container-x py-10">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44 w-full" />)}
          </div>
        ) : books.length ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <article
                  key={book.id}
                  className="group flex cursor-pointer gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-forest-600/25 hover:shadow-md"
                  onClick={() => open(book)}
                  onKeyDown={(event) => { if (event.key === 'Enter') open(book); }}
                  role="button"
                  tabIndex={0}
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    color={book.coverColor}
                    imageUrl={book.coverUrl}
                    size="md"
                    style={book.id}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    {book.category ? <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-brass-700">{book.category}</p> : null}
                    <h2 className="mt-1 line-clamp-2 font-display text-[17px] leading-snug text-ink">{book.title}</h2>
                    <p className="mt-0.5 truncate text-[12px] text-ink-mute">{book.author ?? 'Library collection'}</p>
                    {book.description ? (
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-mute">{book.description}</p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink/45">
                        <FileText className="h-3.5 w-3.5" /> PDF{book.fileSize ? ` · ${fileSize(book.fileSize)}` : ''}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest-700">
                        {user ? 'Read' : 'Sign in'} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {data && data.pages > 1 ? (
              <Pagination
                className="mt-8"
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={data.pageSize}
                onPage={(next) => update({ page: next })}
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={LibraryBig}
            title={query || category ? 'No books match that search' : 'The online shelves are empty'}
            description={query || category
              ? 'Try a different title, author or shelf.'
              : 'Library staff have not uploaded any books yet. Check back soon.'}
            action={query || category ? (
              <Button variant="secondary" onClick={() => { setQuery(''); update({ q: null, category: null, page: 1 }); }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        )}
      </section>
    </div>
  );
}

function ReaderShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-screen bg-parchment">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-forest-950 text-parchment">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <Link to="/books" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-parchment/65 transition hover:bg-parchment/10 hover:text-parchment">
            <ArrowLeft className="h-3.5 w-3.5" /> Shelves
          </Link>
          <span className="h-4 w-px bg-parchment/15" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-parchment/85">{title}</p>
          <AccountMenu tone="dark" />
        </div>
      </header>
      {children}
    </div>
  );
}

export function BookReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['book', id],
    queryFn: () => api<{ book: Book }>(`/books/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  const book = data?.book;
  useDocumentTitle(book?.title ?? 'Reading');

  if (isLoading) {
    return (
      <ReaderShell title="Opening the book…">
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-ink-mute">
            <Sparkles className="h-6 w-6 animate-pulse text-brass-500" />
            <p className="text-[13px]">Fetching the pages…</p>
          </div>
        </div>
      </ReaderShell>
    );
  }

  if (isError || !book) {
    return (
      <ReaderShell title="Book unavailable">
        <div className="container-x flex min-h-[60vh] flex-col items-center justify-center text-center">
          <BookOpen className="h-10 w-10 text-ink/25" />
          <h1 className="mt-4 font-display text-3xl text-ink">This book cannot be opened</h1>
          <p className="mt-2 max-w-md text-[13.5px] text-ink-mute">
            {(error as Error)?.message ?? 'It may have been removed from the shelves.'}
          </p>
          <Button className="mt-6" onClick={() => navigate('/books')}>Back to the shelves</Button>
        </div>
      </ReaderShell>
    );
  }

  return (
    <ReaderShell title={`${book.title}${book.author ? ` · ${book.author}` : ''}`}>
      <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl text-ink">{book.title}</h1>
            <p className="truncate text-[12px] text-ink-mute">
              {book.author ?? 'Library collection'}{book.category ? ` · ${book.category}` : ''}
            </p>
          </div>
          {!book.allowDownload ? <Badge tone="neutral">Read online only</Badge> : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <Suspense
            fallback={
              <div className="flex h-[70vh] items-center justify-center text-[13px] text-ink-mute">
                Opening the reader…
              </div>
            }
          >
            <PdfReader
              bookId={book.id}
              title={book.title}
              fileName={book.fileName}
              allowDownload={book.allowDownload}
            />
          </Suspense>
        </div>
      </div>
    </ReaderShell>
  );
}
