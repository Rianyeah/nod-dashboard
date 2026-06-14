import { BellRingingIcon } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateLabel } from './impactServiceDateRange';
import { ImpactServiceAlert } from './ImpactServiceStates';

function asDisplay(value) {
  return value == null || value === '' ? '-' : String(value);
}

const detailFields = [
  ['Tanggal', 'tanggal', (value) => formatDateLabel(value)],
  ['Site ID', 'site_id'],
  ['Site Name', 'site_name'],
  ['NOP', 'nop'],
  ['Alarm Name', 'alarm_name'],
  ['Alarm Type', 'alarm_type'],
  ['Category', 'category'],
  ['Severity', 'severity'],
  ['Status', 'status'],
  ['SOW', 'sow'],
  ['Aging', 'aging', (value) => (value == null ? '-' : `${value} hari`)],
  ['Aging Range', 'aging_range'],
  ['Ticket No', 'ticket_no'],
  ['Plan Action', 'plan_action'],
  ['PIC Officer', 'pic_officer'],
  ['PIC Onsite', 'pic_onsite'],
  ['Priority', 'priority'],
  ['Location Information', 'location_information'],
  ['MO Name', 'mo_name'],
  ['Last Occurred', 'last_occurred_nt'],
  ['Date Cleared', 'date_cleared'],
  ['Root Cause Analyst', 'root_cause_analyst'],
  ['Carrier', 'carrier'],
  ['Longitude', 'longitude'],
  ['Latitude', 'latitude'],
  ['Comment', 'comment'],
  ['Remarks', 'remarks'],
  ['Remarks 2', 'remarks2'],
];

export default function ImpactServiceAlarmDialog({
  open,
  detail,
  loading,
  error,
  onOpenChange,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <BellRingingIcon className="size-5" weight="duotone" />
            </div>
            <div>
              <DialogTitle>Alarm Detail</DialogTitle>
              <DialogDescription className="mt-1">
                {detail?.site_id || 'Memuat site'} · {detail?.alarm_name || 'Impact Service'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-112px)]">
          <div className="p-6">
            {error && (
              <ImpactServiceAlert title="Detail alarm gagal dimuat">{error}</ImpactServiceAlert>
            )}

            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 12 }, (_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : detail ? (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant={String(detail.status).toUpperCase() === 'OPEN' ? 'destructive' : 'outline'}>
                    {asDisplay(detail.status)}
                  </Badge>
                  <Badge variant="outline">{asDisplay(detail.severity)}</Badge>
                  <Badge variant="outline">{asDisplay(detail.nop)}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {detailFields.map(([label, key, formatter]) => (
                    <div key={key} className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words text-sm">
                        {formatter ? formatter(detail[key]) : asDisplay(detail[key])}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : !error ? (
              <p className="text-sm text-muted-foreground">Pilih alarm untuk melihat detail.</p>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
