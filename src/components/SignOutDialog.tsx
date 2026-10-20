import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Field, Input, Modal, useToast } from './ui';
import type { Book } from '../lib/types';

export type SignOutVisit = {
  id: number;
  fullName: string;
  className?: string | null;
  house?: string | null;
  bookTaken?: string | null;
};

/**
 * Closing a visit is also when the books leave the building, so the staff member
 * at the desk picks the titles the visitor is taking. Anything not on the online
 * shelves can be typed in.
 */
export function SignOutDialog({ visit, open, onClose, onSignedOut }: {
  visit: SignOutVisit | null;
  open: boolean;
  onClose: () => void;
  onSignedOut?: (visitId: number) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setOther('');
    setSearch('');
  }, [open, visit?.id]);

  const booksQuery = useQuery({
    queryKey: ['books', 'sign-out'],
    queryFn: () => api<{ rows: Book[] }>('/books?pageSize=200'),
    enabled: open,
  });

  const books = useMemo(() => {
    const rows = booksQuery.data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((book) => `${book.title} ${book.author ?? ''}`.toLowerCase().includes(needle));
  }, [booksQuery.data, search]);

  const extra = other.trim();
  const total = selected.length + (extra ? 1 : 0);
  const firstName = visit?.fullName.split(' ')[0] ?? 'the visitor';

  const mutation = useMutation({
    mutationFn: async () => {
      const list = Array.from(new Set([...selected, ...(extra ? [extra] : [])]));
      const result = await api<{ visit: unknown }>(`/visits/${visit!.id}/sign-out`, {
        method: 'POST',
        body: { books: list },
      });
      return { ...result, count: list.length };
    },
    onSuccess: (result) => {
      toast.push({
        title: `${firstName} signed out`,
        description: result.count
          ? `${result.count} ${result.count === 1 ? 'book' : 'books'} recorded.`
          : 'No books recorded for this visit.',
        tone: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['visits'] });
      void queryClient.invalidateQueries({ queryKey: ['kiosk'] });
      if (visit) onSignedOut?.(visit.id);
      onClose();
    },
  });

  const toggle = (title: string) => {
    setSelected((current) => current.includes(title)
      ? current.filter((item) => item !== title)
      : [...current, title]);
  };

  return (
    <Modal
      open={open && Boolean(visit)}
      onClose={onClose}
      size="lg"
      title={`Sign out ${visit?.fullName ?? ''}?`}
      description="Pick the books they are taking with them. The visit closes and the register records the titles."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Sign out{total ? ` · ${total} ${total === 1 ? 'book' : 'books'}` : ''}
          </Button>
        </>
      }
    >
      {visit ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-[12.5px] text-ink-soft">
            <span className="font-semibold text-ink">{visit.fullName}</span>
            {visit.className ? <span className="text-ink-mute">· {visit.className}</span> : null}
            {visit.house ? <span className="text-ink-mute">· {visit.house}</span> : null}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="field-label mb-1.5">Books taken</p>
              <span className="text-[11px] text-ink-mute">
                {selected.length ? `${selected.length} selected` : 'None selected'}
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the online shelves…"
                aria-label="Search books"
                className="field-input pl-10"
              />
            </div>

            <div className="mt-2 max-h-[240px] overflow-y-auto rounded-xl border border-ink/10 bg-white/70">
              {booksQuery.isLoading ? (
                <p className="px-4 py-6 text-center text-[12px] text-ink-mute">Loading the shelves…</p>
              ) : books.length ? (
                <ul className="divide-y divide-ink/[0.06]">
                  {books.map((book) => {
                    const checked = selected.includes(book.title);
                    return (
                      <li key={book.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition hover:bg-forest-50/60">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-forest-700 bg-forest-700 text-parchment' : 'border-ink/25 bg-white'}`}>
                            {checked ? <Check className="h-3 w-3" /> : null}
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggle(book.title)}
                          />
                          <BookOpen className="h-3.5 w-3.5 shrink-0 text-ink/30" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-ink">{book.title}</span>
                            <span className="block truncate text-[10.5px] text-ink-mute">
                              {book.author ?? 'Library collection'}{book.category ? ` · ${book.category}` : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-[12px] text-ink-mute">No books match that search.</p>
              )}
            </div>
          </div>

          <Field label="Other book" hint="Not on the online shelves? Type the title exactly as it appears on the cover.">
            <Input
              value={other}
              onChange={(event) => setOther(event.target.value)}
              placeholder="e.g. Things Fall Apart"
            />
          </Field>

          <p className="text-[11.5px] text-ink-mute">
            Leave everything empty if the visitor is taking no books. The visit still closes.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
