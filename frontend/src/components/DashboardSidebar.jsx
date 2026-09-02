import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  DatabaseZap,
  Home,
  LogOut,
  Map,
  Moon,
  Radio,
  Sun,
  TicketCheck,
  TowerControl,
  Wrench,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../auth/AuthContext';
import { DashboardSidebarContext } from '../hooks/useDashboardSidebar';

const SIDEBAR_STORAGE_KEY = 'nod_sidebar_collapsed';

const NAV_ITEMS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/site-map', label: 'Site Map', icon: Map },
  { to: '/reporting', label: 'Network Reporting', icon: BarChart3 },
  { to: '/impact-service', label: 'Impact Service', icon: AlertTriangle },
  { to: '/activity-enom', label: 'Activity ENOM', icon: ClipboardList },
  { to: '/transport-quality', label: 'Transport Quality', icon: Activity },
  { to: '/ticketing', label: 'Ticketing', icon: TicketCheck },
  { to: '/data-potensi', label: 'Data Potensi', icon: Database },
];

const TOOL_ITEMS = [
  { to: '/management-data', label: 'Management Data', icon: DatabaseZap, permission: 'management_data:write' },
  { to: '/rf-tilt-analysis', label: 'RF Tilt Analysis', icon: Radio },
  { to: '/tower-plan-generator', label: 'Tower Visualizer', icon: TowerControl },
];

function SidebarNavItem({ item, collapsed }) {
  const Icon = item.icon;
  const baseClass = 'group relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors';

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => [
        baseClass,
        isActive
          ? 'border-y-[var(--border)] border-r-[var(--border)] border-l-[3px] border-l-[var(--primary)] bg-[var(--sidebar-active)] text-[var(--text-primary)]'
          : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
        collapsed ? 'justify-center px-2' : '',
      ].join(' ')}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function LastUpdatePanel({ collapsed, rows }) {
  const visibleRows = rows?.length ? rows : [{ label: 'Data', value: '-' }];
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/45 ${collapsed ? 'p-2' : 'p-3'}`}>
      {collapsed ? (
        <div className="mx-auto size-2 rounded-full bg-[var(--primary-light)]" title="Last data update" />
      ) : (
        <>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Last data update
          </p>
          <div className="mt-2 space-y-1.5">
            {visibleRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-[var(--text-muted)]">{row.label}</span>
                <span className="shrink-0 font-mono text-[var(--text-secondary)]">{row.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardSidebar({ collapsed, onToggle, lastUpdates }) {
  const { theme, toggleTheme } = useTheme();
  const { logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside
      data-testid="dashboard-sidebar"
      className={[
        'dashboard-sidebar',
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--border)] backdrop-blur-xl transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      ].join(' ')}
    >
      <div className="flex min-h-16 items-center gap-3 border-b border-[var(--border)] px-3">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--primary)]/20 bg-[var(--bg-surface)] shadow-sm">
          <img src="/brand/telkomsel-seeklogo.png" alt="Telkomsel" className="size-7 object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[var(--text-primary)]">NETWORK OPERATION</p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">Dashboard</p>
          </div>
        )}
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={onToggle}
          className={[
            'ml-auto flex size-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
            collapsed ? 'mx-auto' : '',
          ].join(' ')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <div className="space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>

        {/* Tools section */}
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          {!collapsed ? (
            <div className="flex items-center gap-2 px-3 pb-2">
              <Wrench className="size-3 text-[var(--text-muted)]" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Tools</span>
            </div>
          ) : (
            <div className="flex justify-center pb-2" title="Tools">
              <Wrench className="size-3 text-[var(--text-muted)]" />
            </div>
          )}
          <div className="space-y-1.5">
            {TOOL_ITEMS.filter((item) => !item.permission || hasPermission(item.permission)).map((item) => (
              <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>
      </nav>

      <div className="space-y-2 border-t border-[var(--border)] px-2.5 py-3">
        <LastUpdatePanel collapsed={collapsed} rows={lastUpdates} />
        <button
          type="button"
          onClick={toggleTheme}
          className={[
            'flex min-h-10 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
            collapsed ? 'justify-center px-2' : '',
          ].join(' ')}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className={[
            'flex min-h-10 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300',
            collapsed ? 'justify-center px-2' : '',
          ].join(' ')}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut className="size-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}

export function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
  const [lastUpdates, setLastUpdates] = useState([]);
  const [isSmallViewport, setIsSmallViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const syncViewport = (event) => setIsSmallViewport(event.matches);
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  const handleToggle = () => {
    setCollapsed((value) => {
      const nextValue = !value;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue));
      return nextValue;
    });
  };

  const contextValue = useMemo(() => ({ setLastUpdates }), []);
  const effectiveCollapsed = collapsed || isSmallViewport;

  return (
    <DashboardSidebarContext.Provider value={contextValue}>
      <div className="dashboard-canvas min-h-screen text-[var(--text-primary)]">
        <DashboardSidebar collapsed={effectiveCollapsed} onToggle={handleToggle} lastUpdates={lastUpdates} />
        <div className={`dashboard-shell-content min-h-screen transition-[padding] duration-200 ${effectiveCollapsed ? 'pl-[68px]' : 'pl-[260px]'}`}>
          {children}
        </div>
      </div>
    </DashboardSidebarContext.Provider>
  );
}
