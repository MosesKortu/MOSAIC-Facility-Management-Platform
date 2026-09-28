import type { Notification } from '@mosaic/contracts';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { EmptyState, ErrorState, PageLoading } from '../../components/ui/states.tsx';
import { cn } from '../../lib/cn.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from './api.ts';
import { describeNotification } from './messages.ts';

const LIMIT = 20;
const FILTERS = [{ value: null, label: 'All' }, { value: 'true', label: 'Unread' }] as const;

/** /notifications — the caller's own notifications, newest first (08 §28). */
export function NotificationsPage() {
  const { params, update, offset } = useUrlFilters();
  const unreadOnly = params.get('unread_only') === 'true';
  const notifications = useNotifications({ unread_only: unreadOnly ? 'true' : undefined, limit: LIMIT, offset });
  const unread = useUnreadCount().data ?? 0;
  const markAll = useMarkAllRead();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Notifications" description="Changes that affect your bookings, certifications and funding."
        actions={unread > 0 && <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>} />
      <FilterChips label="Show" options={FILTERS} value={unreadOnly ? 'true' : null} onChange={(value) => update({ unread_only: value })} />
      {markAll.error && <Alert tone="danger" title="Your notifications were not marked as read">{markAll.error.message}</Alert>}

      {notifications.isPending ? <PageLoading label="Loading notifications" />
        : notifications.isError ? <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
        : notifications.data.items.length === 0 ? (
          unreadOnly
            ? <EmptyState title="You're all caught up">You have no unread notifications.</EmptyState>
            : <EmptyState title="No notifications yet">You'll be told here when an instrument you've booked changes status, a certification is decided, or your group's funding changes.</EmptyState>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
              {notifications.data.items.map((n) => <NotificationItem key={n.notification_id} notification={n} />)}
            </ul>
            <Pagination total={notifications.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
    </div>
  );
}

function NotificationItem({ notification }: { notification: Notification }) {
  const markRead = useMarkRead();
  const { title, detail, link } = describeNotification(notification);
  const unread = notification.read_at === null;
  const read = () => { if (unread) markRead.mutate(notification.notification_id); };

  return (
    <li className="flex gap-3 p-4">
      <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-pix-blue' : 'bg-transparent')} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className={cn('text-body text-ink', unread && 'font-semibold')}>{title}</p>
          {unread && <span className="text-caption font-semibold text-pix-blue">Unread</span>}
        </div>
        <p className="text-body-sm text-ink-muted">{detail}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
          <time dateTime={notification.created_at} className="font-mono text-caption text-ink-muted">{formatDateTime(notification.created_at)}</time>
          {link && <Link to={link.to} onClick={read} className="font-semibold text-pix-blue hover:underline">{link.label}</Link>}
          {markRead.error && <span role="alert" className="text-danger">Could not mark as read: {markRead.error.message}</span>}
        </div>
      </div>
      {unread && <Button variant="ghost" size="sm" className="self-start" loading={markRead.isPending} onClick={read}>Mark as read</Button>}
    </li>
  );
}
