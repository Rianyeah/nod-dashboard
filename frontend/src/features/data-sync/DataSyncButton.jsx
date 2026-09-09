import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, XCircle } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useDataSync } from './DataSyncProvider';
import { getDataSyncButtonPresentation, isActiveDataSyncStatus } from './dataSyncState';
import { DataSyncCancelDialog } from './DataSyncCancelDialog';


export function DataSyncButton({ dataset, className }) {
  const {
    enabled,
    job,
    start,
    terminalObservedAt,
    actionPending,
    canCancel,
    cancel,
    cancelPending,
  } = useDataSync(dataset);
  const [nowMs, setNowMs] = useState(0);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const shouldTick = isActiveDataSyncStatus(job?.status)
    || (terminalObservedAt != null && nowMs - terminalObservedAt < 5000);

  useEffect(() => {
    if (!shouldTick) return undefined;
    const initialTick = window.setTimeout(() => setNowMs(Date.now()), 0);
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, [shouldTick]);

  const presentation = getDataSyncButtonPresentation({
    enabled,
    actionPending,
    cancelPending,
    job,
    terminalObservedAt,
    nowMs,
  });
  if (presentation.hidden) return null;

  const Icon = presentation.spinning ? LoaderCircle : RefreshCw;
  const cancelableActive = canCancel
    && isActiveDataSyncStatus(job?.status)
    && !cancelPending;
  const handleClick = () => {
    if (cancelableActive) {
      setCancelDialogOpen(true);
      return;
    }
    void start();
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'group min-w-32 tabular-nums',
          cancelableActive
            && 'hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/50 focus-visible:text-destructive',
          className,
        )}
        disabled={presentation.disabled && !cancelableActive}
        aria-label={cancelableActive ? 'Batalkan sinkronisasi data' : presentation.label}
        aria-live="off"
        onClick={handleClick}
      >
        <Icon
          className={cn(
            presentation.spinning && 'animate-spin',
            cancelableActive && 'group-hover:hidden group-focus-visible:hidden',
          )}
          aria-hidden="true"
        />
        <span className={cn(cancelableActive && 'group-hover:hidden group-focus-visible:hidden')}>
          {presentation.label}
        </span>
        {cancelableActive ? (
          <>
            <XCircle
              className="hidden group-hover:block group-focus-visible:block"
              aria-hidden="true"
            />
            <span className="hidden group-hover:inline group-focus-visible:inline">
              Cancel Sync
            </span>
          </>
        ) : null}
      </Button>
      <DataSyncCancelDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={cancel}
        pending={cancelPending}
      />
    </>
  );
}
