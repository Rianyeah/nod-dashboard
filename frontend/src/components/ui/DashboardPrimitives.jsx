const TONE_CLASS = {
  critical: {
    text: 'text-[var(--danger)]',
    border: 'border-[var(--danger)]/25',
    bg: 'bg-[var(--danger)]/10',
    varBg: 'var(--badge-critical-bg)',
    varColor: 'var(--danger)',
  },
  danger: {
    text: 'text-[var(--danger)]',
    border: 'border-[var(--danger)]/25',
    bg: 'bg-[var(--danger)]/10',
    varBg: 'var(--badge-critical-bg)',
    varColor: 'var(--danger)',
  },
  warning: {
    text: 'text-[var(--warning)]',
    border: 'border-[var(--warning)]/25',
    bg: 'bg-[var(--warning)]/10',
    varBg: 'var(--badge-warning-bg)',
    varColor: 'var(--warning)',
  },
  success: {
    text: 'text-[var(--success)]',
    border: 'border-[var(--success)]/25',
    bg: 'bg-[var(--success)]/10',
    varBg: 'var(--badge-success-bg)',
    varColor: 'var(--success)',
  },
  info: {
    text: 'text-[var(--primary)]',
    border: 'border-[var(--primary)]/25',
    bg: 'bg-[var(--primary)]/10',
    varBg: 'var(--badge-info-bg)',
    varColor: 'var(--primary)',
  },
  neutral: {
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--border)]',
    bg: 'bg-[var(--surface-soft)]',
    varBg: 'var(--surface-soft)',
    varColor: 'var(--text-secondary)',
  },
};

function getTone(tone = 'info') {
  return TONE_CLASS[tone] || TONE_CLASS.info;
}

export function DashboardKpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'info',
  accent,
  children,
  className = '',
  style,
}) {
  const colors = getTone(tone);
  const iconColor = accent || colors.varColor;

  return (
    <article className={`glass-card min-w-0 p-5 ${className}`} style={style}>
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
            <Icon className="size-[18px]" strokeWidth={1.8} style={{ color: iconColor }} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-widest text-[var(--text-secondary)]">
            {title}
          </p>
          {children || (
            <p className="mt-2 truncate font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: iconColor }}>
              {value}
            </p>
          )}
          {subtitle && <p className="mt-2 truncate text-[11px] leading-snug text-[var(--text-muted)]">{subtitle}</p>}
        </div>
      </div>
    </article>
  );
}

export function DashboardPanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className = '',
}) {
  return (
    <div
      data-density={description ? 'normal' : 'compact'}
      className={[
        'flex min-w-0 flex-wrap items-start justify-between gap-3',
        description ? 'pb-4' : 'pb-3',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]">
            <Icon className="size-4" strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-[0.01em] text-[var(--text-primary)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function DashboardChartPanel({
  title,
  description,
  icon,
  children,
  action,
  className = '',
  style,
}) {
  return (
    <section className={`glass-card min-w-0 p-5 ${className}`} style={style}>
      <DashboardPanelHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />
      {children}
    </section>
  );
}

export function DashboardStatusBadge({ children, tone = 'neutral', pulse = false, className = '' }) {
  const colors = getTone(tone);

  return (
    <span
      className={`inline-flex min-w-10 items-center justify-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${colors.border} ${colors.text} ${pulse ? 'animate-pulse-ring' : ''} ${className}`}
      style={{ backgroundColor: colors.varBg }}
    >
      {children}
    </span>
  );
}

export function DashboardPageHeader({ title, subtitle, icon: Icon, action, backButton, meta }) {
  return (
    <header
      data-density={subtitle ? 'normal' : 'compact'}
      className={[
        'border-b border-[var(--border)] bg-[var(--bg-header)] px-4 backdrop-blur-lg sm:px-6',
        subtitle ? 'py-4' : 'py-3',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backButton}
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-2 text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
              {Icon && <Icon className="size-5 shrink-0 text-[var(--primary-light)]" />}
              <span className="truncate">{title}</span>
            </h1>
            {subtitle && <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{subtitle}</p>}
          </div>
        </div>
        {action || meta}
      </div>
    </header>
  );
}

export function DashboardTableShell({
  title,
  description,
  icon,
  count,
  action,
  children,
  className = '',
}) {
  const countAction = (
    <div className="flex items-center gap-2">
      {count != null && (
        <span className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      )}
      {action}
    </div>
  );

  return (
    <section className={`glass-card overflow-hidden ${className}`}>
      {(title || action || count != null) && (
        <div className="border-b border-[var(--border)] px-5 pt-4">
          <DashboardPanelHeader
            title={title}
            description={description}
            icon={icon}
            action={countAction}
          />
        </div>
      )}
      {children}
    </section>
  );
}

export function DashboardChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  const formattedLabel = labelFormatter ? labelFormatter(label) : label;

  return (
    <div className="min-w-[110px] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 whitespace-nowrap font-semibold text-[var(--text-primary)]">{formattedLabel}</p>
      {payload.map((item) => (
        <p key={item.dataKey || item.name} className="whitespace-nowrap font-medium" style={{ color: item.color }}>
          {item.name}: {valueFormatter ? valueFormatter(item.value, item) : item.value}
        </p>
      ))}
    </div>
  );
}
