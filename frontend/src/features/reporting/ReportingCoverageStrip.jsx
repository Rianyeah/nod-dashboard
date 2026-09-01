import { CheckCircle2, Clock3, Database, TriangleAlert } from 'lucide-react';


const STATUS = {
  complete: { label: 'Lengkap', className: 'text-[var(--success)]' },
  partial: { label: 'Parsial', className: 'text-[var(--warning)]' },
  missing: { label: 'Kosong', className: 'text-[var(--danger)]' },
  untracked: { label: 'Belum terlacak', className: 'text-[var(--text-muted)]' },
};


function formatRefresh(value) {
  if (!value) return 'Refresh belum terlacak';
  return `Refresh ${new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export default function ReportingCoverageStrip({ sources = [] }) {
  const hasGap = sources.some((source) => source.status === 'partial' || source.status === 'missing');
  const StatusIcon = hasGap ? TriangleAlert : CheckCircle2;

  return (
    <details className="group glass-card reporting-no-print overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-xs marker:content-none">
        <StatusIcon className={`size-4 shrink-0 ${hasGap ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`} />
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          {sources.map((source) => {
            const status = STATUS[source.status] || STATUS.untracked;
            return (
              <span key={source.source_key} className="shrink-0 whitespace-nowrap text-[var(--text-muted)]">
                <strong className="font-semibold text-[var(--text-secondary)]">{source.label}</strong>
                {' · '}
                <span className={status.className}>{status.label}</span>
                {source.latest_data_period ? ` · s.d. ${source.latest_data_period}` : ''}
              </span>
            );
          })}
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-[var(--primary-light)] group-open:hidden">Detail</span>
        <span className="hidden shrink-0 text-[10px] font-semibold text-[var(--primary-light)] group-open:inline">Tutup</span>
      </summary>
      <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <div key={source.source_key} className="bg-[var(--bg-surface)] px-4 py-3 text-[11px] leading-5 text-[var(--text-muted)]">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-xs text-[var(--text-primary)]">{source.label}</strong>
              <span>{source.record_count == null ? '-' : Number(source.record_count).toLocaleString('id-ID')} baris</span>
            </div>
            {source.total_sites != null && (
              <p><Database className="mr-1 inline size-3" />Mapping {Number(source.mapped_sites || 0).toLocaleString('id-ID')} / {Number(source.total_sites).toLocaleString('id-ID')} site</p>
            )}
            <p><Clock3 className="mr-1 inline size-3" />{formatRefresh(source.last_refreshed_at)}</p>
            {source.missing_periods?.length > 0 && <p className="text-[var(--warning)]">Kurang: {source.missing_periods.join(', ')}</p>}
          </div>
        ))}
      </div>
    </details>
  );
}
