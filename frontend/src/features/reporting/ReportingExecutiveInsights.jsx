import { Activity, Banknote, HardDrive } from 'lucide-react';

import { buildReportingInsights } from './reportingInsights.js';


const ICONS = { revenue: Banknote, availability: Activity, payload: HardDrive };
const TONES = {
  positive: 'border-emerald-500/25 bg-emerald-500/[0.055] text-emerald-400',
  negative: 'border-rose-500/25 bg-rose-500/[0.055] text-rose-400',
  neutral: 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]',
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
              {card.driver ? <p className="mt-2 text-[11px] font-medium leading-relaxed text-[var(--text-secondary)]">{card.driver}</p> : null}
              {card.contribution ? <p className="mt-1.5 text-[11px] font-medium leading-relaxed">{card.contribution}</p> : null}
              {card.recommendation ? <p className="mt-2 line-clamp-2 border-t border-current/15 pt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">{card.recommendation}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
