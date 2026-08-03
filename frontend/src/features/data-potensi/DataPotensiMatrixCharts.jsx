import { CheckCircle2, Network } from 'lucide-react';

import { DashboardChartEmpty } from '../../components/dashboard-charts/DashboardChartEmpty';
import { DashboardChartPanel } from '../../components/ui/DashboardPrimitives';
import {
  buildReadinessColumns,
  buildTransportMatrix,
} from './dataPotensiMatrixUtils';


function heatStyle(percentage, color) {
  const intensity = Math.max(0, Math.min(100, Number(percentage) || 0));
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${Math.round(8 + intensity * 0.52)}%, var(--surface-soft))`,
  };
}


function HeatLegend({ color }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-[var(--text-muted)]" aria-label="Legenda intensitas rendah ke tinggi">
      <span>Rendah</span>
      {[16, 30, 44, 58].map((intensity) => (
        <span
          key={intensity}
          className="size-3 rounded-[3px] border border-[var(--border)]"
          style={{ backgroundColor: `color-mix(in srgb, ${color} ${intensity}%, var(--surface-soft))` }}
        />
      ))}
      <span>Tinggi</span>
    </div>
  );
}


export function OperationalReadinessHeatmap({ data = [] }) {
  const columns = buildReadinessColumns();

  return (
    <DashboardChartPanel
      title="Operational Readiness Heatmap"
      description="Persentase site siap per Kabupaten berdasarkan status monitoring."
      icon={CheckCircle2}
      className="h-full"
    >
      {!data.length ? (
        <DashboardChartEmpty label="Data readiness belum tersedia untuk filter ini." className="h-[280px]" />
      ) : (
        <>
          <div className="max-h-[360px] overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[560px] border-collapse text-xs" aria-label="Operational readiness per Kabupaten">
              <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="border-b border-[var(--border)] px-3 py-2.5 text-left font-semibold">Kabupaten</th>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className="border-b border-l border-[var(--border)] px-3 py-2.5 text-center font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.kabupaten}>
                    <th scope="row" className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-left font-medium text-[var(--text-primary)]">
                      {row.kabupaten}
                    </th>
                    {columns.map((column) => {
                      const percentage = Number(row[column.key]) || 0;
                      const ready = Number(row[column.countKey]) || 0;
                      const total = Number(row.total_sites) || 0;
                      const label = `${row.kabupaten}, ${column.label}: ${percentage.toFixed(1)}%, ${ready} dari ${total} site siap`;
                      return (
                        <td
                          key={column.key}
                          className="border-b border-l border-[var(--border)] px-3 py-2 text-center tabular-nums"
                          style={heatStyle(percentage, 'var(--chart-success)')}
                          title={label}
                          aria-label={label}
                        >
                          <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">{percentage.toFixed(1)}%</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">{ready}/{total}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HeatLegend color="var(--chart-success)" />
        </>
      )}
    </DashboardChartPanel>
  );
}


export function TransportConfigurationMatrix({ data = [] }) {
  const matrix = buildTransportMatrix(data);

  return (
    <DashboardChartPanel
      title="Transport Configuration Matrix"
      description="Jumlah site untuk kombinasi Transport Type, Modem, dan Jumper."
      icon={Network}
      className="h-full"
    >
      {!matrix.rows.length ? (
        <DashboardChartEmpty label="Data konfigurasi transport belum tersedia untuk filter ini." className="h-[280px]" />
      ) : (
        <>
          <div className="max-h-[360px] overflow-x-auto overflow-y-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[640px] border-collapse text-xs" aria-label="Matrix konfigurasi transport berdasarkan jumper">
              <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="border-b border-[var(--border)] px-3 py-2.5 text-left font-semibold">Transport</th>
                  <th scope="col" className="border-b border-l border-[var(--border)] px-3 py-2.5 text-left font-semibold">Modem</th>
                  {matrix.columns.map((column) => (
                    <th key={column} scope="col" className="border-b border-l border-[var(--border)] px-3 py-2.5 text-center font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-left font-medium text-[var(--text-primary)]">
                      {row.transport_type}
                    </th>
                    <td className="border-b border-l border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-left text-[var(--text-secondary)]">
                      {row.modem_transport}
                    </td>
                    {matrix.columns.map((column) => {
                      const cell = matrix.cells[row.key]?.[column];
                      const count = Number(cell?.site_count) || 0;
                      const percentage = Number(cell?.percentage) || 0;
                      const label = `${row.transport_type}, ${row.modem_transport}, jumper ${column}: ${count} site, ${percentage.toFixed(1)}% dari site terfilter`;
                      return (
                        <td
                          key={column}
                          className="border-b border-l border-[var(--border)] px-3 py-2 text-center tabular-nums"
                          style={heatStyle(percentage, 'var(--primary)')}
                          title={label}
                          aria-label={label}
                        >
                          <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">{count}</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">{percentage.toFixed(1)}%</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HeatLegend color="var(--primary)" />
        </>
      )}
    </DashboardChartPanel>
  );
}


export default function DataPotensiMatrixCharts({ readinessData = [], transportData = [] }) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <OperationalReadinessHeatmap data={readinessData} />
      <TransportConfigurationMatrix data={transportData} />
    </section>
  );
}
