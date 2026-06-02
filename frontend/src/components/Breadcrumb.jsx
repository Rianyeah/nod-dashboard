import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  reporting: 'Reporting',
  'impact-service': 'Impact Service',
  'transport-quality': 'Transport Quality',
  'ticketing': 'Ticketing',
};

export default function Breadcrumb() {
  const location = useLocation();

  // Split path into segments, filter empties
  const segments = location.pathname.split('/').filter(Boolean);

  // Don't render on login page or root
  if (segments.length === 0 || segments[0] === 'login') return null;

  const crumbs = segments.map((seg, index) => {
    const path = '/' + segments.slice(0, index + 1).join('/');
    const label = ROUTE_LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
    const isLast = index === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 px-6 py-1.5 text-[11px] bg-[var(--bg-surface)]/50 border-b border-[var(--border)]"
    >
      {/* Home */}
      <Link
        to="/dashboard"
        className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--primary-light)] transition-colors"
      >
        <Home className="w-3 h-3" />
        <span>Home</span>
      </Link>

      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-[var(--text-muted)] opacity-50" />
          {crumb.isLast ? (
            <span className="text-[var(--text-primary)] font-medium">
              {crumb.label}
            </span>
          ) : (
            <Link
              to={crumb.path}
              className="text-[var(--text-muted)] hover:text-[var(--primary-light)] transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
