import {
  ArrowLeftIcon,
  BellRingingIcon,
  CircleNotchIcon,
  PrinterIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { formatDateLabel } from './impactServiceDateRange';

export default function ImpactServiceHeader({
  startDate,
  endDate,
  onBack,
  onPrint,
  printLoading,
  children,
}) {
  return (
    <header className="relative border-b border-border bg-gradient-to-r from-background via-card to-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 flex flex-col gap-3 px-3 py-3 lg:px-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onBack}
            aria-label="Kembali ke dashboard"
            className="impact-service-no-print"
          >
            <ArrowLeftIcon />
          </Button>
          <div className="impact-service-no-print flex size-9 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
            <BellRingingIcon weight="duotone" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-tight">Impact Service</h1>
            <p className="text-xs text-muted-foreground">
              Alarm operational dashboard · {formatDateLabel(startDate)} sampai {formatDateLabel(endDate)}
            </p>
          </div>
        </div>
        <div className="impact-service-no-print flex w-full flex-wrap items-end justify-end gap-2 xl:w-auto xl:flex-nowrap">
          {children}
          <Button
            data-testid="impact-print"
            type="button"
            variant="outline"
            size="sm"
            disabled={printLoading}
            onClick={onPrint}
            aria-label="Cetak Impact Service ke PDF"
          >
            {printLoading ? (
              <CircleNotchIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <PrinterIcon data-icon="inline-start" />
            )}
            {printLoading ? 'Menyiapkan' : 'Print PDF'}
          </Button>
        </div>
      </div>
    </header>
  );
}
