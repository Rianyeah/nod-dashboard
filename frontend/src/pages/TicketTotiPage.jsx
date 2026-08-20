import Breadcrumb from '../components/Breadcrumb';
import TicketingSectionNav from '../components/TicketingSectionNav';

export default function TicketTotiPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Ticketing
        </p>
        <h1 className="mt-1 text-xl font-bold text-[var(--text-primary)]">Ticket TOTI</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Tower Operations Ticket Insight</p>
      </header>
      <Breadcrumb />
      <main className="flex-1 space-y-4 p-5">
        <TicketingSectionNav />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-muted)]">
          Menyiapkan ringkasan Ticket TOTI...
        </div>
      </main>
    </div>
  );
}
