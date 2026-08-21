import { Link, useLocation } from 'react-router-dom';

const ITEMS = [
  { to: '/ticketing', label: 'Fault Center', exact: true },
  { to: '/ticketing/toti', label: 'Ticket TOTI', exact: false },
];

export default function TicketingSectionNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Halaman Ticketing" className="w-full sm:w-auto">
      <div className="inline-grid w-full grid-cols-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/55 p-1 sm:w-auto">
        {ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'rounded-md px-4 py-1.5 text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/45',
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
