import { Activity, Banknote, HardDrive } from 'lucide-react';

import { buildReportingInsights } from './reportingInsights.js';


const ICONS = { revenue: Banknote, availability: Activity, payload: HardDrive };
const TONES = {
  success: 'border-[var(--success)]/25 bg-[var(--success)]/7 text-[var(--success)]',
  warning: 'border-[var(--warning)]/30 bg-[var(--warning)]/8 text-[var(--warning)]',
  info: 'border-[var(--primary)]/25 bg-[var(--primary)]/7 text-[var(--primary-light)]',
  unavailable: 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]',
};


export default function ReportingExecutiveInsights({ overview, comparisonLabel }) {
  const cards = buildReportingInsights(overview, comparisonLabel);
  return (
    <section aria-label="Executive Insight" className="glass-card p-3 sm:p-4">
      <header className="mb-3 flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">Executive Insight</h2>
        <p className="text-[10px] text-[var(--text-muted)]">{overview.scope_label}</p>
      </header>
      <div className="grid gap-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = ICONS[card.key];
          return (
            <article key={card.key} className={`min-w-0 rounded-xl border px-4 py-3 ${TONES[card.tone] || TONES.unavailable}`}>
              <div className="flex items-center gap-2">
                <Icon className="size-3.5" strokeWidth={1.8} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">{card.label}</span>
              </div>
              <h3 className="mt-1.5 text-xs font-semibold">{card.title}</h3>
              <p className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{card.summary}</p>
              {card.detail ? <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{card.detail}</p> : null}
              {card.contribution ? <p className="mt-2 border-t border-current/15 pt-2 text-[11px] font-medium leading-relaxed">{card.contribution}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
