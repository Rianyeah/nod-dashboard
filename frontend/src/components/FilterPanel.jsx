import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export default function FilterPanel({ filters, onFilterChange, options = { kabupaten: [], cluster: [], kelas: [] } }) {
  const [open, setOpen] = useState(false);

  const set = (key, val) => {
    const next = { ...filters };
    if (val) next[key] = val;
    else delete next[key];
    onFilterChange(next);
  };

  const activeCount = Object.keys(filters).filter(k => filters[k]).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-secondary)] transition-all cursor-pointer"
      >
        <SlidersHorizontal className="w-3 h-3" />
        Filter
        {activeCount > 0 && (
          <span className="ml-1 w-4 h-4 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-[9px] font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 glass-card p-3 z-30 animate-fade-in-scale border border-white/[0.1]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">Filter</span>
            <button onClick={() => setOpen(false)} className="hover:bg-white/[0.08] rounded-md p-1 cursor-pointer">
              <X className="w-3 h-3 text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="space-y-2.5">
            {[
              { key: 'kabupaten', label: 'Kabupaten', list: options.kabupaten },
              { key: 'cluster', label: 'Cluster', list: options.cluster },
              { key: 'kelas', label: 'Kelas Site', list: options.kelas },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{f.label}</label>
                <select
                  value={filters[f.key] || ''}
                  onChange={e => set(f.key, e.target.value)}
                  className="w-full text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/40 cursor-pointer"
                >
                  <option value="">Semua</option>
                  {f.list?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            ))}
          </div>
          {activeCount > 0 && (
            <button
              onClick={() => onFilterChange({})}
              className="mt-3 w-full text-[10px] py-1.5 text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-lg transition-colors cursor-pointer"
            >
              Reset semua filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
