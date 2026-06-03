import { useEffect, useRef, useId, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import {
  X,
  MapPin,
  Radio,
  Zap,
  Wifi,
  Server,
  Battery,
  Eye,
  Shield,
  Database,
  CalendarDays,
} from 'lucide-react';

const EMPTY_VALUES = new Set(['', '#N/A', 'N/A', '#REF!', null, undefined]);
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const CHART_HEIGHT = 68;

const FIELD_GROUPS = [
  {
    title: 'Lokasi',
    icon: MapPin,
    fields: [
      ['Kabupaten', ['Kabupaten/KOTA', 'kabupaten', 'Kabupaten']],
      ['Kecamatan', ['Kecamatan']],
      ['Desa', ['Desa']],
      ['NOP', ['NOP']],
      ['Cluster', ['New Cluster', 'cluster']],
      ['Latitude', ['Latitude', 'latitude']],
      ['Longitude', ['Longitude', 'longitude']],
      ['Alamat', ['Alamat']],
    ],
  },
  {
    title: 'Info Site',
    icon: Radio,
    fields: [
      ['Class', ['Site Class', 'site_class']],
      ['Type', ['Type Site', 'type_site']],
      ['Category', ['Category Site']],
      ['Status', ['Status Site', 'status_site']],
      ['TP', ['TP']],
      ['Brand Type', ['Brand Type', 'Brand']],
      ['Band NE', ['Band NE']],
      ['Jumlah Cell', ['jumlah_cell']],
      // RCA Dominan intentionally removed — shown in "Kualitas Data" section instead
    ],
  },
  {
    title: 'Teknologi',
    icon: Wifi,
    renderMode: 'bands', // Special rendering for band/tech counts
    fields: [
      ['DCS1800', ['DCS1800']],
      ['GSM900', ['GSM900']],
      ['L900', ['L900']],
      ['L1800', ['L1800']],
      ['L2100', ['L2100']],
      ['L2300', ['L2300']],
      ['N2100', ['N2100']],
      ['N2300', ['N2300']],
      ['LTE NB-IoT', ['LTE NB-IoT']],
    ],
  },
  {
    title: 'Power',
    icon: Zap,
    fields: [
      ['Backup Power', ['BACKUP POWER BY']],
      ['Backup Time Battery', ['Backup Time Battery']],
      ['Type Battery', ['Type Battery']],
      ['Jumlah Battery', ['Jumlah Battery']],
      ['Umur Battery', ['Umur Battery (Tahun)']],
      ['Garansi Battery', ['Status Garansi Battery']],
      ['Rectifier', ['Jenis Rectifier']],
      ['Total Load Rectifier', ['Total Load Rectifier']],
      ['Jumlah Modul', ['Jumlah Modul']],
      ['ID PLN', ['ID PLN']],
      ['Kapasitas PLN', ['Kap PLN (VA)']],
    ],
  },
  {
    title: 'Genset',
    icon: Battery,
    fields: [
      ['Genset Fix', ['Genset Fix']],
      ['Status Genset', ['Status Genset']],
      ['Kapasitas Genset', ['Kapasitas Genset']],
      ['Tahun Pembuatan', ['Tahun Pembuatan']],
      ['Merk Genset', ['Merk Genset']],
      ['SN Genset', ['SN Genset']],
      ['Jalur Pemadaman', ['Jalur Pemadaman']],
    ],
  },
  {
    title: 'Transport',
    icon: Server,
    fields: [
      ['Transport Type', ['Transport Type']],
      ['List Far End', ['List Far End']],
      ['Jenis Infra', ['Jenis Infra']],
      ['Kriteria PM Site', ['Kriteria PM Site']],
      ['BBLTI', ['BBLTI']],
    ],
  },
  {
    title: 'Monitoring',
    icon: Eye,
    fields: [
      ['WDM', ['WDM STATUS', 'WDM']],
      ['NMS Rectifier', ['NMS RECTI STATUS', 'NMS']],
      ['EMU', ['EMU STATUS', 'EMU']],
      ['ENVA', ['ENVA STATUS', 'ENVA']],
      ['Relokasi Battery', ['Relokasi Batt']],
      ['Remark', ['REMARK']],
    ],
  },
];

/* ── Helpers ────────────────────────────────────────── */

function isEmptyValue(value) {
  if (EMPTY_VALUES.has(value)) return true;
  if (typeof value === 'string' && EMPTY_VALUES.has(value.trim())) return true;
  return false;
}

function getFirstValue(data, keys) {
  for (const key of keys) {
    if (!isEmptyValue(data[key])) return data[key];
  }
  return null;
}

function formatValue(value) {
  if (value == null) return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(value);
}

function minutesLabel(value) {
  if (isEmptyValue(value)) return 'N/A';
  const minutes = Number(value);
  if (Number.isNaN(minutes)) return formatValue(value);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60).toLocaleString()} jam ${Math.round(minutes % 60)} min`;
}

function averageValue(rows, valueKey) {
  const values = rows
    .map(row => Number(row[valueKey]))
    .filter(Number.isFinite);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAvailColor(v) {
  if (v == null || Number.isNaN(v)) return 'var(--text-muted)';
  if (v >= 99.5) return 'var(--success)';
  if (v >= 95) return 'var(--warning)';
  return 'var(--danger)';
}

function getStatusLabel(v) {
  if (v == null || Number.isNaN(v)) return 'No Data';
  if (v >= 99.5) return 'Healthy';
  if (v >= 95) return 'Warning';
  return 'Critical';
}

/* ── Chart Tooltip ──────────────────────────────────── */

function ChartTooltip({ active, payload, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const label = labelFormatter ? labelFormatter(payload[0]?.payload) : payload[0]?.payload?.label || '';
  return (
    <div className="min-w-[90px] rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 whitespace-nowrap text-[10px] text-[var(--text-muted)]">{label}</p>
      <p
        className="whitespace-nowrap font-mono text-sm font-bold leading-none"
        style={{ color: val != null ? (val >= 99.5 ? 'var(--success)' : val >= 95 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)' }}
      >
        {val != null ? `${Number(val).toFixed(2)}%` : 'N/A'}
      </p>
    </div>
  );
}

/* ── TrendCard (Recharts-based) ─────────────────────── */

function TrendCard({ title, chartData, accent = '#34D399', headlineValue = null, headlinePrefix = '', labelFormatter }) {
  const gradientId = useId();
  const displayValue = headlineValue;
  const hasData = chartData.length >= 2;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <h3 className="min-w-0 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">{title}</h3>
        <span className="whitespace-nowrap font-mono text-xs font-black" style={{ color: accent }}>
          {Number.isFinite(displayValue) ? `${headlinePrefix}${displayValue.toFixed(2)}%` : 'N/A'}
        </span>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              domain={[
                (dataMin) => Math.min(90, Math.max(0, Math.floor(dataMin) - 2)),
                100,
              ]}
              unit="%"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip labelFormatter={labelFormatter} />}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ outline: 'none', zIndex: 60 }}
              cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '4 4', strokeOpacity: 0.4 }}
            />
            <ReferenceLine y={99.5} stroke="var(--success)" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={95} stroke="var(--warning)" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={accent}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: accent, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: accent, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[68px] items-center justify-center text-xs text-[var(--text-muted)]">
          Data trend tidak tersedia
        </div>
      )}
    </div>
  );
}

/* ── InfoRow ────────────────────────────────────────── */

function InfoRow({ label, value }) {
  if (isEmptyValue(value)) return null;
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-[var(--border)] py-1.5 last:border-0">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[11px] font-semibold leading-snug text-[var(--text-primary)] break-words">
        {formatValue(value)}
      </span>
    </div>
  );
}

/* ── BandPill (for Teknologi section) ───────────────── */

function BandPill({ label, count }) {
  if (isEmptyValue(count) || Number(count) === 0) return null;
  const num = Number(count);
  const maxBar = 8; // Scale relative to typical max cells per band
  const barWidth = Math.min(100, (num / maxBar) * 100);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-[72px] shrink-0 text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
      <div className="relative flex-1 h-[18px] rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${barWidth}%`,
            background: 'linear-gradient(90deg, var(--primary), var(--primary-light))',
            minWidth: '18px',
          }}
        />
      </div>
      <span className="w-[24px] shrink-0 text-right font-mono text-[11px] font-bold text-[var(--text-primary)]">{num}</span>
    </div>
  );
}

/* ── Section ────────────────────────────────────────── */

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-[var(--primary-light)]" />
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{title}</h4>
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

/* ── Compact Metric Cards ───────────────────────────── */

function HeroMetricCard({ label, value, color }) {
  return (
    <div className="flex min-h-[72px] flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="text-[11px] leading-tight text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-lg font-bold leading-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function CompactMetricCard({ label, value, color }) {
  return (
    <div className="flex min-h-[54px] flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
      <div className="text-[10px] leading-tight text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-sm font-bold leading-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ── Main Modal ─────────────────────────────────────── */

export default function SiteDetailModal({ data, trendData = [], dailyData = [], onClose }) {
  const closeBtnRef = useRef(null);
  const modalId = useId();

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-focus close button on mount
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // Handle Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sixMonthTrend = [...trendData].slice(-6);
  const sixMonthAverage = averageValue(sixMonthTrend, 'avg_availability');
  const dailyTrend = [...dailyData]
    .filter(row => row.availability != null)
    .sort((a, b) => Number(a.tgl) - Number(b.tgl));

  // Prepare chart data for Recharts
  const sixMonthChartData = useMemo(() =>
    sixMonthTrend
      .map(row => ({
        label: MONTH_LABELS[(Number(row.bulan) || 1) - 1] || row.bulan,
        value: Number(row.avg_availability),
        bulan: row.bulan,
        tahun: row.tahun,
      }))
      .filter(d => Number.isFinite(d.value)),
    [sixMonthTrend],
  );

  const dailyChartData = useMemo(() =>
    dailyTrend
      .map(row => ({
        label: String(row.tgl).padStart(2, '0'),
        value: Number(row.availability),
        tgl: row.tgl,
      }))
      .filter(d => Number.isFinite(d.value)),
    [dailyTrend],
  );

  if (!data) return null;

  const siteId = data.Siteid || data.site_id || '-';
  const siteName = data['Site Name'] || data.site_name || '';
  const avail = data.avg_availability != null ? Number(data.avg_availability) : null;
  const availColor = getAvailColor(avail);
  const statusLabel = getStatusLabel(avail);
  const isCritical = avail != null && avail < 95;

  const usedKeys = new Set([
    'Siteid',
    'site_id',
    'Site Name',
    'site_name',
    'avg_availability',
    'total_outage_menit',
    'jumlah_hari_data',
    'Bulan',
    'bulan',
    'Tahun',
    'tahun',
    'OA DATE',
    'cek',
  ]);
  FIELD_GROUPS.forEach(group => group.fields.forEach(([, keys]) => keys.forEach(key => usedKeys.add(key))));
  // Also exclude rca_dominan since it is shown in Kualitas Data
  usedKeys.add('rca_dominan');

  const remainingRows = Object.entries(data)
    .filter(([key, value]) => !usedKeys.has(key) && !isEmptyValue(value))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
    >
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-sm" />

      <div
        className="site-detail-modal relative flex max-h-[calc(100vh-48px)] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent stripe at top */}
        <div className="h-[3px] w-full shrink-0" style={{ background: `linear-gradient(90deg, ${availColor}, var(--primary-light))` }} />

        {/* Header */}
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="absolute right-3 top-4 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            aria-label="Tutup detail site"
          >
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>

          <div className="flex min-w-0 items-center gap-3 pr-10">
            <div
              className={`h-3.5 w-3.5 shrink-0 rounded-full ${isCritical ? 'animate-pulse-ring' : ''}`}
              style={{ backgroundColor: availColor, boxShadow: `0 0 12px ${availColor}` }}
            />
            <div className="min-w-0">
              <h2 id={`${modalId}-title`} className="font-mono text-lg font-black leading-tight text-[var(--text-primary)]">{siteId}</h2>
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{siteName}</p>
            </div>
            <span
              className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: availColor,
                backgroundColor: `color-mix(in srgb, ${availColor} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${availColor} 25%, transparent)`,
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Scrollable content with fade mask indicator */}
        <div className="site-detail-scroll flex-1 overflow-y-auto px-5 py-4">
          {/* ── Charts Row ─── */}
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <TrendCard
              title="Avg Avail 6 Month"
              chartData={sixMonthChartData}
              accent={avail != null && avail < 95 ? '#EF4444' : '#34D399'}
              headlineValue={sixMonthAverage}
              labelFormatter={(d) => `${MONTH_LABELS[(Number(d?.bulan) || 1) - 1]} ${d?.tahun || ''}`}
            />
            <TrendCard
              title="Daily Availability"
              chartData={dailyChartData}
              accent="#60A5FA"
              headlineValue={avail}
              headlinePrefix="Month Avg "
              labelFormatter={(d) => `Tgl ${d?.tgl || ''}`}
            />
          </div>

          {/* ── Monthly Scorecard ─── */}
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">Monthly Scorecard</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <HeroMetricCard label="Availability" value={avail != null && !Number.isNaN(avail) ? `${avail.toFixed(2)}%` : 'N/A'} color={availColor} />
              <HeroMetricCard label="Total Outage" value={minutesLabel(data.total_outage_menit)} color="var(--danger)" />
              <CompactMetricCard label="Total Cell" value={data.jumlah_cell ?? '-'} color="var(--primary-light)" />
              <CompactMetricCard label="RCA Dominan" value={data.rca_dominan ?? '-'} color="var(--warning)" />
            </div>
          </div>

          {/* ── Info Sections Grid ─── */}
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)_320px]">
            {FIELD_GROUPS.map((group) => {
              const rows = group.fields
                .map(([label, keys]) => [label, getFirstValue(data, keys)])
                .filter(([, value]) => !isEmptyValue(value));

              if (!rows.length) return null;

              // Special rendering for Teknologi section — horizontal bar pills
              if (group.renderMode === 'bands') {
                return (
                  <Section key={group.title} icon={group.icon} title={group.title}>
                    {rows.map(([label, value]) => (
                      <BandPill key={label} label={label} count={value} />
                    ))}
                  </Section>
                );
              }

              return (
                <Section key={group.title} icon={group.icon} title={group.title}>
                  {rows.map(([label, value]) => (
                    <InfoRow key={label} label={label} value={value} />
                  ))}
                </Section>
              );
            })}

            {remainingRows.length > 0 && (
              <Section icon={Database} title="Data Lainnya">
                {remainingRows.map(([key, value]) => (
                  <InfoRow key={key} label={key} value={value} />
                ))}
              </Section>
            )}

            <Section icon={CalendarDays} title="Periode Data">
              <InfoRow label="Bulan" value={data.Bulan || data.bulan} />
              <InfoRow label="Tahun" value={data.Tahun || data.tahun} />
              <InfoRow label="OA Date" value={data['OA DATE']} />
            </Section>

            <Section icon={Shield} title="Kualitas Data">
              <InfoRow label="RCA Dominan" value={data.rca_dominan} />
              <InfoRow label="Cek" value={data.cek} />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
