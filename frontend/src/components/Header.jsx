import { MapPinIcon } from '@phosphor-icons/react';

import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardFilterSelect,
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

export default function Header({ bulan, tahun, nop, nopOptions = [], onBulanChange, onTahunChange, onNopChange }) {
  return (
    <header className="relative border-b border-[var(--border)] bg-[var(--bg-header)] backdrop-blur-xl">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="absolute left-1/4 top-0 h-1 w-1/2 max-w-96 bg-gradient-to-r from-transparent via-[var(--primary)]/30 to-transparent blur-sm" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-xl border border-[var(--primary)]/20 bg-[var(--bg-surface)] shadow-sm">
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
        </DashboardFilterBar>
      </div>
    </header>
  );
}
