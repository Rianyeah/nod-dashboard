import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';

export default function FilterPanel({ filters, onFilterChange, options = { kabupaten: [], cluster: [], kelas: [] } }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState({ right: 12, bottom: 72, maxHeight: 320 });

  const updatePanelPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 12;
    const panelWidth = 256;
    const right = Math.min(
      Math.max(margin, window.innerWidth - rect.right),
      Math.max(margin, window.innerWidth - panelWidth - margin),
    );
    const maxHeight = Math.min(352, Math.max(180, rect.top - margin));
    const bottom = Math.max(margin, window.innerHeight - rect.top + 8);

    setPanelPosition({ right, bottom, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

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
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all cursor-pointer"
      >
        <SlidersHorizontal className="w-3 h-3" />
        Filter
        {activeCount > 0 && (
          <span className="ml-1 w-4 h-4 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-[9px] font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          className="fixed w-64 max-h-[min(22rem,calc(100vh-8rem))] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 z-50 animate-fade-in-scale shadow-xl backdrop-blur-md"
          style={{
            right: panelPosition.right,
            bottom: panelPosition.bottom,
            maxHeight: panelPosition.maxHeight,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">Filter</span>
            <button onClick={() => setOpen(false)} className="hover:bg-[var(--bg-hover)] rounded-md p-1 cursor-pointer">
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
                  className="w-full text-[11px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/40 cursor-pointer"
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
        </div>,
        document.body,
      )}
    </div>
  );
}
