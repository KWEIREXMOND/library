import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BookOpen, Check, CloudUpload, ExternalLink, FileText, ImagePlus, LibraryBig,
  Pencil, Plus, Search, Trash2, UploadCloud, X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fileSize, timeAgo } from '../../lib/format';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { BookCover } from '../../components/BookCover';
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Pagination,
  Select, Table, Tabs, Textarea, useConfirm, useToast,
} from '../../components/ui';
import type { Book, BookListResponse } from '../../lib/types';

const CATEGORIES = [
  'Textbooks', 'Literature', 'Past questions', 'Reference', 'Mathematics', 'Science',
  'English', 'Social studies', 'Fiction', 'Non-fiction',
];

type ManageResponse = BookListResponse & {
  summary: { total: number; published: number; drafts: number; views: number };
};

type FormState = {
  title: string;
  author: string;
  category: string;
  publishedYear: string;
  description: string;
  allowDownload: boolean;
};

const emptyForm: FormState = {
  title: '', author: '', category: '', publishedYear: '', description: '', allowDownload: true,
};

function FilePicker({ label, hint, accept, file, onChange, existing }: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  existing?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-ink/20 bg-white/60 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-700/10 text-forest-700">
          {accept.includes('image') ? <ImagePlus className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-ink">
            {file ? file.name : existing ?? 'No file chosen'}
          </p>
          <p className="text-[11px] text-ink-mute">{file ? fileSize(file.size) : hint}</p>
        </div>
        {file ? (
          <button type="button" onClick={() => { onChange(null); if (input.current) input.current.value = ''; }} className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label="Remove file">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}>
          {file || existing ? 'Replace' : 'Choose'}
        </Button>
        <input
          ref={input}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export function ManageBooksPage() {
  useDocumentTitle('Online books');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const creating = location.pathname.endsWith('/new');
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pdf, setPdf] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [status, setStatus] = useState<'all' | 'approved' | 'archived'>('all');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['books', 'manage', status, debounced, page],
    queryFn: () => api<ManageResponse>(`/books/manage?status=${status}&q=${encodeURIComponent(debounced)}&page=${page}&pageSize=20`),
  });

  const closeForm = () => {
    if (creating) navigate('/app/books');
    setEditing(null);
    setForm(emptyForm);
    setPdf(null);
    setCover(null);
    setFormError(null);
    setFieldErrors({});
  };

  const deleteBook = async (book: Book) => {
    const ok = await confirm({
      title: `Delete “${book.title}”?`,
      message: 'The PDF and its cover are removed permanently. Students will no longer be able to open it.',
      confirmLabel: 'Delete book',
      tone: 'danger',
    });
    if (ok) remove.mutate(book);
  };

  useEffect(() => {
    if (creating) {
      setForm(emptyForm);
      setPdf(null);
      setCover(null);
    }
  }, [creating]);

  const save = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append('title', form.title.trim());
      if (form.author.trim()) body.append('author', form.author.trim());
      if (form.category) body.append('category', form.category);
      if (form.publishedYear) body.append('publishedYear', form.publishedYear);
      if (form.description.trim()) body.append('description', form.description.trim());
      body.append('allowDownload', form.allowDownload ? 'true' : 'false');
      if (pdf) body.append('file', pdf);
      if (cover) body.append('cover', cover);
      if (editing) return api(`/books/${editing.id}`, { method: 'PATCH', body });
      return api('/books', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.push({
        title: editing ? 'Book updated' : 'Book added',
        description: editing ? 'Your changes are live.' : 'Students can read it now.',
        tone: 'success',
      });
      closeForm();
      void queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError('Could not save the book. Please try again.');
      }
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (book: Book) => api(`/books/${book.id}`, {
      method: 'PATCH',
      body: { status: book.status === 'approved' ? 'archived' : 'approved' },
    }),
    onSuccess: (_result, book) => {
      toast.push({
        title: book.status === 'approved' ? 'Removed from the shelves' : 'Published',
        description: book.status === 'approved' ? 'Students can no longer open it.' : 'Students can read it now.',
        tone: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  const remove = useMutation({
    mutationFn: (book: Book) => api(`/books/${book.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.push({ title: 'Book deleted', tone: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  const openEdit = (book: Book) => {
    setEditing(book);
    setForm({
      title: book.title,
      author: book.author ?? '',
      category: book.category ?? '',
      publishedYear: book.publishedYear ? String(book.publishedYear) : '',
      description: book.description ?? '',
      allowDownload: book.allowDownload,
    });
    setPdf(null);
    setCover(null);
    setFormError(null);
    setFieldErrors({});
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.title.trim().length < 2) next.title = 'Enter the book title.';
    if (!editing && !pdf) next.file = 'Choose the PDF to upload.';
    if (!editing && pdf && !/\.pdf$/i.test(pdf.name) && pdf.type !== 'application/pdf') {
      next.file = 'The book must be a PDF file.';
    }
    setFieldErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  const open = creating || Boolean(editing);
  const books = data?.rows ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Online books"
        title="Put a book on the shelf."
        description="Upload a PDF and a cover. Students sign in with their library ID and read it in the browser."
        actions={
          <>
            <Link to="/books"><Button variant="secondary" icon={ExternalLink}>See the shelves</Button></Link>
            <Button icon={Plus} onClick={() => navigate('/app/books/new')}>Add a book</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Books in the library', value: summary?.total ?? '—' },
          { label: 'On the shelves', value: summary?.published ?? '—' },
          { label: 'Not published', value: summary?.drafts ?? '—' },
          { label: 'Reads so far', value: summary?.views ?? '—' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-ink/10 bg-white px-5 py-4 shadow-sm">
            <p className="font-display text-3xl leading-none text-ink">{stat.value}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center">
          <Tabs
            value={status}
            onChange={(value) => { setStatus(value as typeof status); setPage(1); }}
            items={[
              { value: 'all', label: 'All books' },
              { value: 'approved', label: 'Published' },
              { value: 'archived', label: 'Not published' },
            ]}
          />
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search title or author…"
              aria-label="Search books"
              className="field-input h-9 pl-9 text-[12.5px]"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-ink/[0.04]" />)}
          </div>
        ) : books.length ? (
          <>
            <div className="divide-y divide-ink/[0.06] md:hidden">
              {books.map((book) => (
                <div key={book.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <BookCover title={book.title} author={book.author} color={book.coverColor} imageUrl={book.coverUrl} style={book.id} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{book.title}</p>
                      <p className="truncate text-[11px] text-ink-mute">
                        {book.author ?? 'Unknown author'}{book.category ? ` · ${book.category}` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {book.status === 'approved'
                          ? <Badge tone="green" dot>Published</Badge>
                          : <Badge tone="amber" dot>Not published</Badge>}
                        <span className="text-[11px] text-ink-mute">
                          {book.fileSize ? fileSize(book.fileSize) : '—'} · {book.viewCount} reads
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEdit(book)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={book.status === 'approved' ? X : Check}
                      onClick={() => toggleStatus.mutate(book)}
                    >
                      {book.status === 'approved' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      className="text-clay-600 hover:bg-clay-50 hover:text-clay-700"
                      onClick={() => void deleteBook(book)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <Table minWidth="min-w-[860px]">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Shelf</th>
                  <th>File</th>
                  <th>Reads</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <BookCover title={book.title} author={book.author} color={book.coverColor} imageUrl={book.coverUrl} style={book.id} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{book.title}</p>
                          <p className="truncate text-[11px] text-ink-mute">
                            {book.author ?? 'Unknown author'} · added {timeAgo(book.createdAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{book.category ?? <span className="text-ink/35">—</span>}</td>
                    <td>{book.fileSize ? fileSize(book.fileSize) : <span className="text-ink/35">—</span>}</td>
                    <td>{book.viewCount}</td>
                    <td>
                      {book.status === 'approved'
                        ? <Badge tone="green" dot>Published</Badge>
                        : <Badge tone="amber" dot>Not published</Badge>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(book)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={book.status === 'approved' ? X : Check}
                          onClick={() => toggleStatus.mutate(book)}
                          loading={toggleStatus.isPending && toggleStatus.variables?.id === book.id}
                        >
                          {book.status === 'approved' ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          className="text-clay-600 hover:bg-clay-50 hover:text-clay-700"
                          loading={remove.isPending && remove.variables?.id === book.id}
                          onClick={() => void deleteBook(book)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </div>
            {data && data.pages > 1 ? (
              <Pagination className="border-t border-ink/10" page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            ) : null}
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={LibraryBig}
              title={debounced ? 'No books match that search' : 'No books uploaded yet'}
              description={debounced ? 'Try a different title or author.' : 'Add the first PDF and it will appear on the online shelves instantly.'}
              action={!debounced ? <Button size="sm" icon={UploadCloud} onClick={() => navigate('/app/books/new')}>Add a book</Button> : undefined}
            />
          </div>
        )}
      </section>

      <Modal
        open={open}
        onClose={closeForm}
        size="lg"
        title={editing ? 'Edit book' : 'Add a book'}
        description={editing ? 'Update the details, or replace the PDF and cover.' : 'The PDF is what students read. Everything else helps them find it.'}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button type="submit" form="book-form" loading={save.isPending}>
              {editing ? 'Save changes' : 'Publish book'}
            </Button>
          </>
        }
      >
        <form id="book-form" className="space-y-5" onSubmit={submit}>
          {formError && !Object.keys(fieldErrors).length ? <Alert tone="danger">{formError}</Alert> : null}

          <Field label="Title" required error={fieldErrors.title}>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. Things Fall Apart"
              autoFocus
              invalid={Boolean(fieldErrors.title)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author">
              <Input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} placeholder="e.g. Chinua Achebe" />
            </Field>
            <Field label="Shelf">
              <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="">Choose a shelf</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </Select>
            </Field>
            <Field label="Year published">
              <Input
                type="number"
                inputMode="numeric"
                value={form.publishedYear}
                onChange={(event) => setForm({ ...form, publishedYear: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                placeholder="1958"
              />
            </Field>
            <Field label="Language">
              <Input value="English" disabled />
            </Field>
          </div>

          <Field label="Description" hint="A sentence or two to help students decide.">
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What is this book about?"
              rows={3}
            />
          </Field>

          <FilePicker
            label="Book PDF"
            hint="PDF only, up to 60 MB"
            accept="application/pdf,.pdf"
            file={pdf}
            onChange={setPdf}
            existing={editing?.fileName}
          />
          {fieldErrors.file ? <p className="-mt-3 text-[12px] font-medium text-clay-600">{fieldErrors.file}</p> : null}

          <FilePicker
            label="Cover image"
            hint="Optional — PNG, JPEG, WebP or GIF"
            accept="image/png,image/jpeg,image/webp,image/gif"
            file={cover}
            onChange={setCover}
            existing={editing?.coverUrl ? 'Current cover' : null}
          />

          <Checkbox
            checked={form.allowDownload}
            onChange={(event) => setForm({ ...form, allowDownload: event.target.checked })}
            label={
              <span>
                Allow downloads
                <span className="mt-0.5 block text-[11.5px] font-normal text-ink-mute">
                  Students can save a copy. Turn this off to keep the book read-only in the browser.
                </span>
              </span>
            }
          />
        </form>
      </Modal>
    </div>
  );
}

/** Small helper used by the public reader when a student is not signed in. */
export function BooksSignInNote() {
  return (
    <Alert tone="info" title="Your library ID opens the shelves">
      <Link to="/login" className="font-semibold text-forest-700 hover:underline">Sign in</Link> to read online.
    </Alert>
  );
}
