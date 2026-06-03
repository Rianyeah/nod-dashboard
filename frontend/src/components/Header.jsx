import { ChevronDown, MapPin } from 'lucide-react';

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

function SelectDropdown({ id, value, onChange, children, className = '' }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value ?? ''}
        onChange={onChange}
        className={`dashboard-control appearance-none rounded-lg py-2 pl-3 pr-8 text-sm backdrop-blur-sm transition-all duration-200 focus:border-[var(--primary)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 opacity-50" />
    </div>
  );
}

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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-2 flex items-center gap-1.5">
            <MapPin className="size-3.5 text-[var(--text-muted)]" />
            <SelectDropdown
              id="filter-nop"
              value={nop || ''}
              onChange={(event) => onNopChange?.(event.target.value || null)}
              className="min-w-[150px]"
            >
              <option value="">Semua NOP</option>
              {nopOptions.map((n) => (
                <option key={n} value={n}>{String(n).replace('NOP ', '')}</option>
              ))}
            </SelectDropdown>
          </div>

          <div className="mx-1 h-6 w-px bg-[var(--border-light)]" />

          <SelectDropdown
            id="filter-bulan"
            value={bulan}
            onChange={(event) => onBulanChange(Number(event.target.value))}
          >
            {BULAN_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </SelectDropdown>

          <SelectDropdown
            id="filter-tahun"
            value={tahun}
            onChange={(event) => onTahunChange(Number(event.target.value))}
          >
            {TAHUN_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </SelectDropdown>
        </div>
      </div>
    </header>
  );
}
