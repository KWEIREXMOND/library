import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { Badge, Button, EmptyState, PageHeader, Pagination, useToast } from '../../components/ui';
import { useState } from 'react';

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type InboxResponse = {
  rows: Notification[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  unread: number;
};

export function NotificationsPage() {
  useDocumentTitle('Inbox');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'inbox', page],
    queryFn: () => api<InboxResponse>(`/notifications?page=${page}&pageSize=20`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Inbox cleared', description: 'Every message is marked as read.' });
      refresh();
    },
    onError: (error: Error) => toast.push({ tone: 'error', title: 'Could not mark the inbox read', description: error.message }),
  });

  const openNotice = (notice: Notification) => {
    if (!notice.readAt) markRead.mutate(notice.id);
    if (notice.link) navigate(notice.link);
  };

  const unread = data?.unread ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your library"
        title="Inbox"
        description="Notices and reminders from the library. Broadcasts appear here at the same time as on the public notice board."
        actions={unread > 0 ? (
          <Button variant="secondary" icon={CheckCheck} onClick={() => markAll.mutate()} loading={markAll.isPending}>
            Mark all read
          </Button>
        ) : undefined}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((row) => <div key={row} className="h-24 animate-pulse rounded-2xl bg-ink/[0.04]" />)}
        </div>
      ) : data?.rows.length ? (
        <>
          <ul className="space-y-2.5">
            {data.rows.map((notice) => {
              const unreadNotice = !notice.readAt;
              return (
                <li
                  key={notice.id}
                  className={`relative rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${
                    unreadNotice ? 'border-forest-600/30 ring-1 ring-forest-600/10' : 'border-ink/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      notice.type === 'broadcast' ? 'bg-brass-300/30 text-brass-800' : 'bg-forest-50 text-forest-700'
                    }`}>
                      {notice.type === 'broadcast' ? <Megaphone className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[14px] font-semibold leading-snug text-ink">{notice.title}</h2>
                        {unreadNotice ? <Badge tone="green" dot>new</Badge> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-mute">{notice.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-ink/40">
                        <span>{timeAgo(notice.createdAt)}</span>
                        {notice.link ? (
                          <button
                            type="button"
                            onClick={() => openNotice(notice)}
                            className="font-semibold text-forest-700 transition hover:text-forest-900"
                          >
                            Open
                          </button>
                        ) : null}
                        {unreadNotice ? (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(notice.id)}
                            className="font-semibold text-ink/45 transition hover:text-ink"
                          >
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {data.pages > 1 ? (
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Inbox}
          title="Your inbox is empty"
          description="Broadcasts from the library and account notices will show up here."
        />
      )}
    </div>
  );
}
