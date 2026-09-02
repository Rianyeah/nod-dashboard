export default function ReportingMetricValue({
  value,
  delta,
  formatValue,
  digits = 1,
  valueClassName = '',
}) {
  const number = delta == null ? Number.NaN : Number(delta);
  const available = Number.isFinite(number);
  const tone = !available || number === 0
    ? 'text-[var(--text-muted)]'
    : number > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]';
  const sign = available && number > 0 ? '+' : '';

  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
      <strong className={`font-mono tabular-nums ${valueClassName}`}>{formatValue(value)}</strong>
      <small className={`font-mono text-[10px] tabular-nums ${tone}`}>
        {available ? `${sign}${number.toFixed(digits).replace('.', ',')}%` : '-'}
      </small>
    </span>
  );
}
