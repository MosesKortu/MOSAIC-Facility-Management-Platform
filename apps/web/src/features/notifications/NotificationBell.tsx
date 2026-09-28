import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { useUnreadCount } from './api.ts';

/**
 * Top-bar entry to /notifications with the unread count. It is chrome, not a page: while loading
 * or on error it shows the plain bell rather than an error state.
 */
export function NotificationBell() {
  const unread = useUnreadCount().data ?? 0;
  return (
    <Link to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex rounded-lg p-2 text-ink-muted hover:bg-surface-sunken hover:text-ink">
      <Bell aria-hidden className="h-5 w-5" />
      {unread > 0 && (
        <span aria-hidden className="absolute top-0.5 right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-pix-yellow px-1 font-mono text-[10px] font-medium text-pix-blue">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
