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
    <section aria-label="Executive Insight" className="grid gap-3 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = ICONS[card.key];
        return (
          <article key={card.key} className={`rounded-xl border px-4 py-3 ${TONES[card.tone] || TONES.unavailable}`}>
            <div className="flex items-center gap-2">
              <Icon className="size-4" strokeWidth={1.8} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{card.label}</span>
              <strong className="ml-auto text-xs">{card.title}</strong>
            </div>
            <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{card.summary}</p>
            {card.detail && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{card.detail}</p>}
            <p className="mt-2 border-t border-current/15 pt-2 text-[11px] font-medium">{card.contribution}</p>
          </article>
        );
      })}
    </section>
  );
}
