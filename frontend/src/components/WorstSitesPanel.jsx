import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchWorstSites } from '../services/api';

const CLASS_STYLES = {
  diamond: {
    color: '#7DD3FC',
    background: 'rgba(30, 64, 175, 0.22)',
    border: 'rgba(125, 211, 252, 0.35)',
  },
  platinum: {
    color: '#5EEAD4',
    background: 'rgba(20, 184, 166, 0.16)',
    border: 'rgba(94, 234, 212, 0.32)',
  },
  gold: {
    color: '#FBBF24',
    background: 'rgba(251, 191, 36, 0.15)',
    border: 'rgba(251, 191, 36, 0.34)',
  },
  silver: {
    color: '#CBD5E1',
    background: 'rgba(148, 163, 184, 0.14)',
    border: 'rgba(203, 213, 225, 0.28)',
  },
  bronze: {
    color: '#D6A05D',
    background: 'rgba(146, 91, 38, 0.18)',
    border: 'rgba(214, 160, 93, 0.34)',
  },
};

function getClassStyle(siteClass) {
  return CLASS_STYLES[String(siteClass || '').toLowerCase()] || {
    color: 'var(--text-secondary)',
    background: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.24)',
  };
}

function getAvailabilityColor(value) {
  if (value == null) return 'var(--text-muted)';
  if (value < 95) return 'var(--danger)';
  if (value < 99.5) return 'var(--warning)';
  return 'var(--success)';
}

function formatHours(minutes) {
  if (minutes == null) return '-';
  return `${Math.round(minutes / 60).toLocaleString()}h`;
}

function formatSiteLabel(site) {
  const namePart = String(site.site_name || '').split('_').filter(Boolean).pop();
  const label = namePart ? `${site.site_id}_${namePart}` : site.site_id;
  return String(label || '-').replace(/\s+/g, '_').toUpperCase();
}

export default function WorstSitesPanel({ bulan, tahun, filters = {} }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!bulan || !tahun) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setSites([]);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return fetchWorstSites(bulan, tahun, 10, filters);
      })
      .then((nextSites) => {
        if (!cancelled) setSites(nextSites);
      })
      .catch((err) => {
        console.error('Failed to load worst sites:', err);
        if (!cancelled) setSites([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bulan, tahun, filters]);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-glass)]/80 overflow-hidden flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger)]" />
        <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
          Top 10 Worst Sites
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-[78px] rounded-lg" />
          ))
        ) : sites.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[var(--text-muted)]">
            Tidak ada data
          </div>
        ) : (
          sites.map((site) => {
            const classStyle = getClassStyle(site.site_class);
            const availabilityColor = getAvailabilityColor(site.avg_availability);

            return (
              <article
                key={site.site_id}
                className="rounded-lg border bg-[var(--bg-surface)] p-3 shadow-sm"
                style={{
                  borderColor: classStyle.border,
                  boxShadow: `inset 3px 0 0 ${classStyle.color}66`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-[12px] font-bold text-[var(--text-primary)] truncate">
                      {formatSiteLabel(site)}
                    </h4>
                    <span
                      className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        color: classStyle.color,
                        backgroundColor: classStyle.background,
                        border: `1px solid ${classStyle.border}`,
                      }}
                    >
                      {site.site_class || '-'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Availability
                    </p>
                    <p className="text-base font-bold font-mono" style={{ color: availabilityColor }}>
                      {site.avg_availability == null ? '-' : `${Number(site.avg_availability).toFixed(2)}%`}
                    </p>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Outage Jam
                    </p>
                    <p className="text-[11px] font-bold font-mono text-[var(--text-secondary)]">
                      {formatHours(site.total_outage_menit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Jumlah Cell
                    </p>
                    <p className="text-[11px] font-bold font-mono text-[var(--text-secondary)]">
                      {site.jumlah_cell?.toLocaleString() ?? '-'}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
