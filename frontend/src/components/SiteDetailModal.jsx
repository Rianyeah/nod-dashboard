import { X, MapPin, Radio, Activity, Zap, Wifi, Server, Battery, Eye, Shield } from 'lucide-react';

function InfoRow({ label, value }) {
  if (!value || value === '#N/A' || value === 'N/A') return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] text-[var(--text-primary)] font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-[var(--primary-light)]" />
        <h4 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{title}</h4>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SiteDetailModal({ data, onClose }) {
  if (!data) return null;

  const avail = data.avg_availability != null ? Number(data.avg_availability) : null;
  const getAvailColor = (v) => {
    if (v == null) return 'var(--text-muted)';
    if (v >= 99.5) return 'var(--success)';
    if (v >= 95) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg max-h-[85vh] bg-[var(--bg-surface)] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-elevated)]">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>

          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getAvailColor(avail), boxShadow: `0 0 10px ${getAvailColor(avail)}` }}
            />
            <div>
              <h2 className="text-base font-bold text-white font-mono">{data.Siteid || data.site_id || '—'}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-[320px]">{data['Site Name'] || data.site_name || ''}</p>
            </div>
          </div>

          {/* Availability badge */}
          <div className="mt-3 flex items-center gap-3">
            <div className="glass-card px-3 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-muted)] mb-0.5">Availability</div>
              <div className="text-sm font-bold font-mono" style={{ color: getAvailColor(avail) }}>
                {avail != null ? `${avail.toFixed(2)}%` : 'N/A'}
              </div>
            </div>
            <div className="glass-card px-3 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-muted)] mb-0.5">Outage</div>
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {data.total_outage_menit != null ? `${Math.round(data.total_outage_menit)} min` : 'N/A'}
              </div>
            </div>
            <div className="glass-card px-3 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-muted)] mb-0.5">Hari Data</div>
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {data.jumlah_hari_data || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Section icon={MapPin} title="Lokasi">
            <InfoRow label="Kabupaten" value={data.kabupaten || data.Kabupaten} />
            <InfoRow label="Kecamatan" value={data.Kecamatan} />
            <InfoRow label="NOP" value={data.NOP} />
            <InfoRow label="Cluster" value={data.cluster} />
            <InfoRow label="Latitude" value={data.latitude || data.Latitude} />
            <InfoRow label="Longitude" value={data.longitude || data.Longitude} />
          </Section>

          <Section icon={Radio} title="Info Site">
            <InfoRow label="Class" value={data['Site Class']} />
            <InfoRow label="Type" value={data['Type Site']} />
            <InfoRow label="Status" value={data['Status Site']} />
            <InfoRow label="Brand" value={data['Brand']} />
          </Section>

          <Section icon={Wifi} title="Teknologi">
            <InfoRow label="2G" value={data['2G Bands']} />
            <InfoRow label="4G" value={data['4G Bands']} />
            <InfoRow label="5G" value={data['5G Bands']} />
          </Section>

          <Section icon={Zap} title="Power">
            <InfoRow label="PLN" value={data['PLN']} />
            <InfoRow label="Genset" value={data['Genset']} />
            <InfoRow label="Battery" value={data['Battery']} />
            <InfoRow label="Solar Panel" value={data['Solar Panel']} />
          </Section>

          <Section icon={Eye} title="Monitoring">
            <InfoRow label="WDM" value={data['WDM']} />
            <InfoRow label="NMS" value={data['NMS']} />
            <InfoRow label="EMU" value={data['EMU']} />
            <InfoRow label="ENVA" value={data['ENVA']} />
          </Section>
        </div>
      </div>
    </div>
  );
}
