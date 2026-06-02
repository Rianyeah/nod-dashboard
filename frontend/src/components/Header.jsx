import { ChevronDown, MapPin, BarChart3, AlertTriangle, Activity, TicketCheck, Sun, Moon, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { authLogout } from '../services/api';

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
        className={`appearance-none bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-light)] rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]/40 backdrop-blur-sm ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
    </div>
  );
}

export default function Header({ bulan, tahun, nop, nopOptions = [], onBulanChange, onTahunChange, onNopChange }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    authLogout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="relative bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] border-b border-[var(--border)]">
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
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--primary)]/20 bg-white/90 overflow-hidden shadow-sm">
            <img
              src="/brand/telkomsel-seeklogo.png"
              alt="Telkomsel"
              className="h-7 w-7 object-contain"
            />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              NETWORK OPERATION DASHBOARD
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
              Jawa Timur — Monitoring Availability Site
            </p>
          </div>
          {/* Nav Link to Reporting */}
          <Link
            to="/reporting"
            className="ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-light)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all duration-200"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Reporting
          </Link>
          <Link
            to="/impact-service"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-light)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all duration-200"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Impact Service
          </Link>
          <Link
            to="/transport-quality"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-light)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all duration-200"
          >
            <Activity className="w-3.5 h-3.5" />
            Transport Quality
          </Link>
          <Link
            to="/ticketing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary-light)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all duration-200"
          >
            <TicketCheck className="w-3.5 h-3.5" />
            Ticketing
          </Link>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary-light)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all duration-200"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
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
          <div className="w-px h-6 bg-[var(--border-light)] mx-1" />

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

          {/* Divider */}
          <div className="w-px h-6 bg-[var(--border-light)] mx-1" />

          {/* Logout */}
          <button
            id="header-logout"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
