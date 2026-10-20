import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive, Eye, Megaphone, Pin, PinOff, Send, Trash2, Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import {
  Badge, Button, EmptyState, Modal, PageHeader, Tabs, Textarea, useConfirm, useToast,
} from '../../components/ui';

type Audience = 'all' | 'students' | 'teachers' | 'staff';

type Broadcast = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  pinned: boolean;
  status: 'draft' | 'published' | 'archived';
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  author: string | null;
  delivered: number;
  seen: number;
};

type HistoryResponse = {
  rows: Broadcast[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  audiences: Record<Audience, number>;
};

const AUDIENCES: Array<{ value: Audience; label: string; hint: string }> = [
  { value: 'all', label: 'Everyone', hint: 'Students, teachers and staff' },
  { value: 'students', label: 'Students', hint: 'Every active student account' },
  { value: 'teachers', label: 'Teachers', hint: 'Every active teacher account' },
  { value: 'staff', label: 'Staff', hint: 'Librarians and administrators' },
];

const audienceLabel = (audience: Audience) => AUDIENCES.find((entry) => entry.value === audience)?.label ?? audience;

const statusTone = { published: 'green', draft: 'amber', archived: 'neutral' } as const;

export function BroadcastPage() {
  useDocumentTitle('Broadcast');
  const [filter, setFilter] = useState<'all' | 'published' | 'archived'>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['broadcasts', filter],
    queryFn: () => api<HistoryResponse>(`/announcements/manage?status=${filter}&pageSize=50`),
  });

  const resetForm = () => {
    setTitle('');
    setBody('');
    setAudience('all');
    setPinned(false);
    setExpiresAt('');
    setError(null);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const send = useMutation({
    mutationFn: () => api('/announcements', {
      method: 'POST',
      body: {
        title: title.trim(),
        body: body.trim(),
        audience,
        pinned,
        expiresAt: expiresAt || null,
      },
    }),
    onSuccess: () => {
      toast.push({
        tone: 'success',
        title: 'Broadcast sent',
        description: 'It is in every recipient’s inbox and on the public notice board.',
      });
      setComposerOpen(false);
      resetForm();
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api(`/announcements/${id}`, { method: 'PATCH', body: payload }),
    onSuccess: refresh,
    onError: (err: Error) => toast.push({ tone: 'error', title: 'Could not update the broadcast', description: err.message }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Broadcast deleted' });
      refresh();
    },
    onError: (err: Error) => toast.push({ tone: 'error', title: 'Could not delete the broadcast', description: err.message }),
  });

  const archive = async (broadcast: Broadcast) => {
    const ok = await confirm({
      title: `Archive “${broadcast.title}”?`,
      message: 'It disappears from the public notice board and from new inboxes. The history stays here.',
      confirmLabel: 'Archive',
    });
    if (ok) update.mutate({ id: broadcast.id, payload: { status: 'archived' } });
  };

  const deleteBroadcast = async (broadcast: Broadcast) => {
    const ok = await confirm({
      title: `Delete “${broadcast.title}”?`,
      message: 'The notice and its inbox copies are removed for good. Archiving keeps the history instead.',
      confirmLabel: 'Delete for good',
      tone: 'danger',
    });
    if (ok) remove.mutate(broadcast.id);
  };

  const submit = () => {
    if (title.trim().length < 3) return setError('Give the notice a title of at least 3 characters.');
    if (body.trim().length < 3) return setError('Write the message before sending.');
    setError(null);
    send.mutate();
  };

  const counts = data?.audiences;
  const activeCount = counts?.[audience] ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Broadcast a message"
        description="Send a notice to everyone or to one group. It lands in their inbox inside the app and on the public notice board."
        actions={<Button icon={Megaphone} onClick={() => { resetForm(); setComposerOpen(true); }}>New broadcast</Button>}
      />

      <div className="rounded-2xl border border-forest-600/20 bg-forest-50/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-forest-900">
        Messages reach <strong>active member accounts</strong> and are shown to visitors on the public site.
        Walk-in guests have no account, so they only see public notices while they are on the site.
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl text-ink">Sent broadcasts</h2>
          <Tabs
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            items={[
              { value: 'all', label: 'All' },
              { value: 'published', label: 'Published' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((row) => <div key={row} className="h-28 animate-pulse rounded-2xl bg-ink/[0.04]" />)}
          </div>
        ) : data?.rows.length ? (
          <ul className="space-y-3">
            {data.rows.map((broadcast) => (
              <li key={broadcast.id} className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {broadcast.pinned ? <Badge tone="brass" dot>pinned</Badge> : null}
                      <Badge tone={statusTone[broadcast.status]}>{broadcast.status}</Badge>
                      <Badge tone="neutral">{audienceLabel(broadcast.audience)}</Badge>
                    </div>
                    <h3 className="mt-2 font-display text-[18px] leading-snug text-ink">{broadcast.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-mute line-clamp-3">{broadcast.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={broadcast.pinned ? PinOff : Pin}
                      onClick={() => update.mutate({ id: broadcast.id, payload: { pinned: !broadcast.pinned } })}
                    >
                      {broadcast.pinned ? 'Unpin' : 'Pin'}
                    </Button>
                    {broadcast.status !== 'archived' ? (
                      <Button size="sm" variant="ghost" icon={Archive} onClick={() => archive(broadcast)}>Archive</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => deleteBroadcast(broadcast)}>Delete</Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink/[0.07] pt-2.5 text-[11.5px] text-ink/45">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{broadcast.delivered} inbox{broadcast.delivered === 1 ? '' : 'es'}</span>
                  <span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />{broadcast.seen} read</span>
                  <span>{formatDate(broadcast.publishAt)} · {timeAgo(broadcast.publishAt)}</span>
                  {broadcast.author ? <span className="ml-auto">by {broadcast.author}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Megaphone}
            title={filter === 'all' ? 'No broadcasts yet' : 'Nothing in this view'}
            description={filter === 'all'
              ? 'Send the first notice and it will appear here with a delivery count.'
              : 'Try another filter, or send a new broadcast.'}
            action={<Button icon={Send} onClick={() => { resetForm(); setComposerOpen(true); }}>Write a broadcast</Button>}
          />
        )}
      </section>

      <Modal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New broadcast"
        description="Keep it short and useful: one notice, one clear action."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposerOpen(false)}>Cancel</Button>
            <Button icon={Send} onClick={submit} loading={send.isPending}>Send broadcast</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Library opens early during exams"
              maxLength={140}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Message</span>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="What do you need people to know?"
            />
            <span className="mt-1 block text-right text-[11px] text-ink/35">{body.length}/2000</span>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Audience</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AUDIENCES.map((entry) => (
                <label
                  key={entry.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                    audience === entry.value
                      ? 'border-forest-600/50 bg-forest-50 ring-1 ring-forest-600/20'
                      : 'border-ink/10 bg-white hover:border-ink/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={entry.value}
                    checked={audience === entry.value}
                    onChange={() => setAudience(entry.value)}
                    className="mt-0.5 accent-forest-700"
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">{entry.label}</span>
                      <span className="text-[11px] tabular-nums text-ink/40">{counts?.[entry.value] ?? '—'}</span>
                    </span>
                    <span className="block text-[11px] leading-snug text-ink-mute">{entry.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink/40">{activeCount} active account{activeCount === 1 ? '' : 's'} will receive this in their inbox.</p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.13em] text-ink/40">Remove after (optional)</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="field-input"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 self-end rounded-xl border border-ink/10 bg-white px-3 py-2.5">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) => setPinned(event.target.checked)}
                className="mt-0.5 accent-forest-700"
              />
              <span className="text-[12px] leading-snug text-ink-soft">
                <span className="font-semibold text-ink">Pin to the top</span>
                <span className="block text-[11px] text-ink-mute">Stays above other notices until unpinned.</span>
              </span>
            </label>
          </div>

          {error ? <p className="rounded-lg bg-clay-50 px-3 py-2 text-[12px] font-medium text-clay-700">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
