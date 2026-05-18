import { Globe, ChevronDown, MapPin } from 'lucide-react';

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
        className={`appearance-none bg-white/[0.06] text-white border border-white/10 rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer hover:bg-white/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]/40 backdrop-blur-sm ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
    </div>
  );
}

export default function Header({ bulan, tahun, nop, nopOptions = [], onBulanChange, onTahunChange, onNopChange }) {
  return (
    <header className="relative bg-gradient-to-r from-[#0A0E1A] via-[#111827] to-[#0A0E1A] border-b border-white/[0.06]">
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Accent glow */}
      <div className="absolute top-0 left-1/4 w-96 h-1 bg-gradient-to-r from-transparent via-[var(--primary)]/30 to-transparent blur-sm" />

      <div className="relative z-10 px-6 py-3 flex items-center justify-between">
        {/* Left — Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[var(--primary)]/15 rounded-xl flex items-center justify-center border border-[var(--primary)]/20">
            <Globe className="w-5 h-5 text-[var(--primary-light)]" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              NETWORK OPERATION DASHBOARD
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
              Jawa Timur — Monitoring Availability Site
            </p>
          </div>
        </div>

        {/* Right — Filters */}
        <div className="flex items-center gap-2">
          {/* NOP Filter */}
          <div className="flex items-center gap-1.5 mr-2">
            <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <SelectDropdown
              id="filter-nop"
              value={nop || ''}
              onChange={(e) => onNopChange?.(e.target.value || null)}
              className="min-w-[140px]"
            >
              <option value="">Semua NOP</option>
              {nopOptions.map((n) => (
                <option key={n} value={n}>{n.replace('NOP ', '')}</option>
              ))}
            </SelectDropdown>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Month */}
          <SelectDropdown
            id="filter-bulan"
            value={bulan}
            onChange={(e) => onBulanChange(Number(e.target.value))}
          >
            {BULAN_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </SelectDropdown>

          {/* Year */}
          <SelectDropdown
            id="filter-tahun"
            value={tahun}
            onChange={(e) => onTahunChange(Number(e.target.value))}
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
