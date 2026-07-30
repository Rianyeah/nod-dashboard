import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchWorstSites } from '../services/api';

const CLASS_STYLES = {
  diamond: {
    color: 'var(--text-primary)',
    background: 'var(--surface-muted)',
    border: 'var(--border-strong)',
  },
  platinum: {
    color: 'var(--text-secondary)',
    background: 'var(--surface-soft)',
    border: 'var(--border-strong)',
  },
  gold: {
    color: 'var(--warning)',
    background: 'var(--badge-warning-bg)',
    border: 'color-mix(in srgb, var(--warning) 34%, var(--border-strong))',
  },
  silver: {
    color: 'var(--chart-neutral-1)',
    background: 'var(--surface-soft)',
    border: 'var(--border-strong)',
  },
  bronze: {
    color: 'var(--chart-neutral-2)',
    background: 'var(--surface-soft)',
    border: 'var(--border-strong)',
  },
};

function getClassStyle(siteClass) {
  return CLASS_STYLES[String(siteClass || '').toLowerCase()] || {
    color: 'var(--text-secondary)',
    background: 'var(--surface-soft)',
    border: 'var(--border-strong)',
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
    <section className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-strong)] px-4 py-3">
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
                className="rounded-lg border border-l-[3px] bg-[var(--surface-soft)] p-3 shadow-[var(--shadow-sm)]"
                style={{
                  borderColor: classStyle.border,
                  borderLeftColor: classStyle.color,
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
