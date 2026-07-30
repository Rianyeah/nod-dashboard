import { MapPin as MapPinIcon } from 'lucide-react';

import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardFilterSelect,
  DashboardMonthRangePicker,
} from './dashboard-filters/DashboardFilters';

const BULAN_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const currentYear = new Date().getFullYear();
const TAHUN_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function Header({
  bulan,
  tahun,
  period,
  defaultPeriod,
  availableMonths = [],
  nop,
  nopOptions = [],
  onBulanChange,
  onTahunChange,
  onPeriodApply,
  onNopChange,
}) {
  return (
    <header className="relative border-b border-[var(--border-strong)] bg-[var(--bg-header)]">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]">
            <img
              src="/brand/telkomsel-seeklogo.png"
              alt="Telkomsel"
              className="size-7 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-[var(--text-primary)]">
              NETWORK OPERATION DASHBOARD
            </h1>
            <p className="truncate text-[11px] tracking-wide text-[var(--text-muted)]">
              Jawa Timur - Monitoring Availability Site
            </p>
          </div>
        </div>

        <DashboardFilterBar className="w-full border-0 bg-transparent p-0 shadow-none md:w-auto">
          <div className="flex items-end gap-1.5">
            <MapPinIcon className="mb-2 text-muted-foreground" />
            <DashboardCombobox
              id="filter-nop"
              label="NOP"
              value={nop || ''}
              onChange={(nextValue) => onNopChange?.(nextValue || null)}
              options={nopOptions.map((option) => ({
                value: option,
                label: String(option).replace(/^NOP\s+/i, ''),
              }))}
              allLabel="Semua NOP"
              className="min-w-[150px]"
            />
          </div>

          {period ? (
            <DashboardMonthRangePicker
              id="filter-period"
              label="Periode"
              value={period}
              defaultValue={defaultPeriod}
              availableMonths={availableMonths}
              onApply={onPeriodApply}
              onReset={onPeriodApply}
            />
          ) : (
            <>
              <DashboardFilterSelect
                id="filter-bulan"
                label="Bulan"
                value={bulan}
                onChange={(nextValue) => onBulanChange(Number(nextValue))}
                options={BULAN_OPTIONS}
                includeAll={false}
                className="min-w-[120px]"
              />

              <DashboardFilterSelect
                id="filter-tahun"
                label="Tahun"
                value={tahun}
                onChange={(nextValue) => onTahunChange(Number(nextValue))}
                options={TAHUN_OPTIONS}
                includeAll={false}
                className="min-w-[96px]"
              />
            </>
          )}
        </DashboardFilterBar>
      </div>
    </header>
  );
}
