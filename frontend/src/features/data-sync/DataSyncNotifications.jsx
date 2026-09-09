import { useEffect } from 'react';
import { Ban, CheckCircle2, CircleAlert, Clock3, X } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useDataSyncNotifications } from './DataSyncProvider';


function NotificationIcon({ status }) {
  if (status === 'succeeded') return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === 'timed_out') return <Clock3 className="size-4 text-amber-500" />;
  if (status === 'canceled') return <Ban className="size-4 text-amber-500" />;
  return <CircleAlert className="size-4 text-destructive" />;
}

export function DataSyncNotifications() {
  const { notifications, dismissNotification } = useDataSyncNotifications();

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onDismiss }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(notification.id), 8000);
    return () => window.clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-xl border border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur',
        notification.status === 'succeeded' && 'border-emerald-500/30',
        notification.status === 'timed_out' && 'border-amber-500/30',
        notification.status === 'canceled' && 'border-amber-500/30',
        notification.status === 'failed' && 'border-destructive/30',
      )}
    >
      <NotificationIcon status={notification.status} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {notification.datasetLabel}
        </p>
        <p className="mt-0.5 text-sm">{notification.message}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Tutup notifikasi"
        onClick={() => onDismiss(notification.id)}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
