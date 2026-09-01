import { Activity, Banknote, HardDrive, Radio } from 'lucide-react';

import { formatNumber, formatPayload, formatPercent, formatRevenue } from '../../utils/formatters.js';


function formatSigned(value, digits = 1, suffix = '%') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${Math.abs(number).toFixed(digits).replace('.', ',')}${suffix}`;
}


function contributionPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1).replace('.', ',')}%` : '-';
}


function normalizedScope(scopeLabel) {
  return String(scopeLabel || '').trim().replace(/^NOP\s+/i, '').toUpperCase();
}


function metricContribution(scopeLabel, value, percentage, formatter) {
  if (!scopeLabel || scopeLabel === 'Regional Jatim') return null;
  return `Kontribusi NOP ${normalizedScope(scopeLabel)} ${formatter(value)} / ${contributionPercent(percentage)} pada Regional Jatim.`;
}


function availabilityContribution(scopeLabel, fact = {}) {
  if (!scopeLabel || scopeLabel === 'Regional Jatim') return null;
  return `NOP ${normalizedScope(scopeLabel)} ${formatPercent(fact.value)}, ${formatSigned(fact.contribution?.difference_pp, 2, ' pp')} terhadap Regional Jatim; outage ${contributionPercent(fact.contribution?.contribution_pct)}.`;
}


function deltaTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 'text-[var(--text-muted)]';
  return number > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]';
}


function Scorecard({ title, icon: Icon, value, tone, delta, detail, contribution }) {
  return (
    <article className="glass-card min-w-0 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
          <Icon className={`size-4 ${tone}`} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{title}</p>
          <p className={`mt-1.5 font-mono text-[26px] font-bold leading-none tabular-nums tracking-tight ${tone}`}>{value}</p>
          {delta ? <p className={`mt-1.5 text-[10px] font-semibold ${deltaTone(delta.value)}`}>{delta.label}</p> : null}
          {detail ? <p className="mt-1 text-[10px] leading-snug text-[var(--text-muted)]">{detail}</p> : null}
          {contribution ? <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-secondary)]">{contribution}</p> : null}
        </div>
      </div>
    </article>
  );
}


export default function ReportingScorecards({ overview, comparisonLabel, loading = false }) {
  if (loading && !overview) {
    return (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Scorecard Reporting">
        {[1, 2, 3, 4].map((key) => <div key={key} className="skeleton h-[132px] rounded-xl" />)}
      </section>
    );
  }

  const scorecards = overview?.scorecards || {};
  const scopeLabel = overview?.scope_label || 'Regional Jatim';
  const revenue = overview?.revenue || {};
  const payload = overview?.payload || {};
  const availability = overview?.availability || {};

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Scorecard Reporting">
      <Scorecard
        title="Total Site"
        icon={Radio}
        tone="text-[var(--danger)]"
        value={formatNumber(scorecards.total_sites)}
        detail={`EPM: ${formatNumber(scorecards.epm_sites)} | Site (non EPM): ${formatNumber(scorecards.non_epm_sites)}`}
      />
      <Scorecard
        title="Total Revenue"
        icon={Banknote}
        tone="text-[var(--success)]"
        value={formatRevenue(scorecards.total_revenue)}
        delta={{ value: revenue.delta_pct, label: `${formatSigned(revenue.delta_pct)} ${comparisonLabel}` }}
        detail={`YTD: ${formatRevenue(scorecards.revenue_ytd)}`}
        contribution={metricContribution(scopeLabel, revenue.value, revenue.contribution?.contribution_pct, formatRevenue)}
      />
      <Scorecard
        title="Total Payload"
        icon={HardDrive}
        tone="text-[var(--text-secondary)]"
        value={formatPayload(scorecards.total_payload)}
        delta={{ value: payload.delta_pct, label: `${formatSigned(payload.delta_pct)} ${comparisonLabel}` }}
        detail={`YTD: ${formatPayload(scorecards.payload_ytd)}`}
        contribution={metricContribution(scopeLabel, payload.value, payload.contribution?.contribution_pct, formatPayload)}
      />
      <Scorecard
        title="Availability"
        icon={Activity}
        tone={scorecards.avg_availability == null ? 'text-[var(--text-secondary)]' : availability.severity === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--success)]'}
        value={formatPercent(scorecards.avg_availability)}
        delta={{ value: availability.delta_pct, label: `${formatSigned(availability.delta_pct, 2, ' pp')} ${comparisonLabel}` }}
        detail={availabilityContribution(scopeLabel, availability)}
      />
    </section>
  );
}
