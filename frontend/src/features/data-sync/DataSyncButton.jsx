import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useDataSync } from './DataSyncProvider';
import { getDataSyncButtonPresentation, isActiveDataSyncStatus } from './dataSyncState';


export function DataSyncButton({ dataset, className }) {
  const {
    enabled,
    job,
    start,
    terminalObservedAt,
    actionPending,
  } = useDataSync(dataset);
  const [nowMs, setNowMs] = useState(0);
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
    job,
    terminalObservedAt,
    nowMs,
  });
  if (presentation.hidden) return null;

  const Icon = presentation.spinning ? LoaderCircle : RefreshCw;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('min-w-32 tabular-nums', className)}
      disabled={presentation.disabled}
      aria-live="off"
      onClick={() => void start()}
    >
      <Icon className={presentation.spinning ? 'animate-spin' : ''} aria-hidden="true" />
      <span>{presentation.label}</span>
    </Button>
  );
}
