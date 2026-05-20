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
      ['RCA Dominan', ['rca_dominan']],
    ],
  },
  {
    title: 'Teknologi',
    icon: Wifi,
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
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60).toLocaleString()} jam ${Math.round(minutes % 60)} min`;
}

const CHART_WIDTH = 250;
const CHART_HEIGHT = 68;
const CHART_PADDING_X = 20;
const CHART_PADDING_Y = 10;

function buildSparklinePoints(
  rows,
  valueKey,
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
  paddingX = CHART_PADDING_X,
  paddingY = CHART_PADDING_Y,
) {
  const points = rows
    .map((row, index) => ({ value: Number(row[valueKey]), index }))
    .filter(point => Number.isFinite(point.value));

  if (points.length < 2) return [];

  const min = Math.min(90, ...points.map(point => point.value));
  const max = Math.max(100, ...points.map(point => point.value));
  const range = Math.max(max - min, 1);
  const step = (width - paddingX * 2) / Math.max(points.length - 1, 1);

  return points.map((point, visibleIndex) => {
    const x = paddingX + visibleIndex * step;
    const y = height - paddingY - ((point.value - min) / range) * (height - paddingY * 2);
    return { x, y, value: point.value };
  });
}

function averageValue(rows, valueKey) {
  const values = rows
    .map(row => Number(row[valueKey]))
    .filter(Number.isFinite);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function TrendCard({ title, rows, valueKey, labelKey, accent = '#34D399', headlineValue = null, headlinePrefix = '' }) {
  const points = buildSparklinePoints(rows, valueKey);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = firstPoint && lastPoint
    ? `${path} L${lastPoint.x.toFixed(1)},${(CHART_HEIGHT - 4).toFixed(1)} L${firstPoint.x.toFixed(1)},${(CHART_HEIGHT - 4).toFixed(1)} Z`
    : '';
  const fallbackLatest = rows.length ? Number(rows[rows.length - 1]?.[valueKey]) : null;
  const displayValue = headlineValue ?? fallbackLatest;
  const labelRows = rows.length > 12
    ? rows.filter((_, index) => index === 0 || index === rows.length - 1 || index % 7 === 0)
    : rows;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <h3 className="min-w-0 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">{title}</h3>
        <span className="whitespace-nowrap font-mono text-xs font-black" style={{ color: accent }}>
          {Number.isFinite(displayValue) ? `${headlinePrefix}${displayValue.toFixed(2)}%` : 'N/A'}
        </span>
      </div>

      {path ? (
        <>
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-[62px] w-full">
            <defs>
              <linearGradient id={`trend-fill-${title.replace(/\s+/g, '-')}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.36" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#trend-fill-${title.replace(/\s+/g, '-')})`} />
            <path d={path} fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {points.map((point, index) => (
              <circle
                key={`${title}-point-${index}`}
                cx={point.x}
                cy={point.y}
                r={index === points.length - 1 ? 4 : 2.4}
                fill={accent}
                opacity={index === points.length - 1 ? 1 : 0.75}
              />
            ))}
          </svg>
          <div className="mt-1 flex justify-between gap-2 px-1 text-[9px] font-semibold text-[var(--text-muted)]">
            {labelRows.map((row, index) => (
              <span key={`${title}-${index}`} className="truncate">
                {labelKey(row)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-[80px] items-center justify-center text-xs text-[var(--text-muted)]">
          Data trend tidak tersedia
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (isEmptyValue(value)) return null;
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-white/[0.05] py-1 last:border-0">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[10px] font-semibold leading-snug text-[var(--text-primary)] break-words">
        {formatValue(value)}
      </span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
        <Icon className="h-3 w-3 text-[var(--primary-light)]" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{title}</h4>
      </div>
      <div className="px-3 py-1.5">{children}</div>
    </section>
  );
}

function CompactMetricCard({ label, value, color }) {
  return (
    <div className="flex min-h-[58px] flex-col justify-between rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
      <div className="text-[10px] leading-tight text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-sm font-bold leading-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export default function SiteDetailModal({ data, trendData = [], dailyData = [], onClose }) {
  if (!data) return null;

  const siteId = data.Siteid || data.site_id || '-';
  const siteName = data['Site Name'] || data.site_name || '';
  const avail = data.avg_availability != null ? Number(data.avg_availability) : null;
  const getAvailColor = (v) => {
    if (v == null || Number.isNaN(v)) return 'var(--text-muted)';
    if (v >= 99.5) return 'var(--success)';
    if (v >= 95) return 'var(--warning)';
    return 'var(--danger)';
  };
  const availColor = getAvailColor(avail);

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

  const remainingRows = Object.entries(data)
    .filter(([key, value]) => !usedKeys.has(key) && !isEmptyValue(value))
    .sort(([a], [b]) => a.localeCompare(b));
  const sixMonthTrend = [...trendData].slice(-6);
  const sixMonthAverage = averageValue(sixMonthTrend, 'avg_availability');
  const dailyTrend = [...dailyData]
    .filter(row => row.availability != null)
    .sort((a, b) => Number(a.tgl) - Number(b.tgl));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/72 backdrop-blur-sm" />

      <div
        className="relative flex max-h-[calc(100vh-48px)] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/[0.08] bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-elevated)] px-5 py-4">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
            aria-label="Tutup detail site"
          >
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>

          <div className="flex min-w-0 items-start gap-3 pr-10">
            <div
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: availColor, boxShadow: `0 0 12px ${availColor}` }}
            />
            <div className="min-w-0">
              <h2 className="font-mono text-lg font-black leading-tight text-white">{siteId}</h2>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{siteName}</p>
            </div>
          </div>

        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)_320px]">
            <TrendCard
              title="Avg Avail 6 Month"
              rows={sixMonthTrend}
              valueKey="avg_availability"
              labelKey={(row) => MONTH_LABELS[(Number(row.bulan) || 1) - 1] || row.bulan}
              accent={avail != null && avail < 95 ? '#EF4444' : '#34D399'}
              headlineValue={sixMonthAverage}
            />
            <TrendCard
              title="Daily Availability"
              rows={dailyTrend}
              valueKey="availability"
              labelKey={(row) => String(row.tgl).padStart(2, '0')}
              accent="#60A5FA"
              headlineValue={avail}
              headlinePrefix="Month Avg "
            />
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">Monthly Scorecard</h3>
              <div className="grid grid-cols-2 gap-2">
                <CompactMetricCard label="Availability" value={avail != null && !Number.isNaN(avail) ? `${avail.toFixed(2)}%` : 'N/A'} color={availColor} />
                <CompactMetricCard label="Total Outage" value={minutesLabel(data.total_outage_menit)} color="var(--danger)" />
                <CompactMetricCard label="Total Cell" value={data.jumlah_cell ?? '-'} color="var(--primary-light)" />
                <CompactMetricCard label="Hari Data" value={data.jumlah_hari_data ?? '-'} color="var(--text-primary)" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {FIELD_GROUPS.map((group) => {
              const rows = group.fields
                .map(([label, keys]) => [label, getFirstValue(data, keys)])
                .filter(([, value]) => !isEmptyValue(value));

              if (!rows.length) return null;

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
