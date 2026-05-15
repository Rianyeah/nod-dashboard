import { useState, useCallback, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import SummaryCards from '../components/SummaryCards';
import MapboxMap from '../components/MapboxMap';
import AvailabilityChart from '../components/AvailabilityChart';
import SiteTable from '../components/SiteTable';
import FilterPanel from '../components/FilterPanel';
import SiteDetailModal from '../components/SiteDetailModal';
import { useMapData } from '../hooks/useMapData';
import { fetchSiteDetail } from '../services/api';
import { STATUS_COLORS } from '../utils/mapColors';

export default function DashboardPage() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [nop, setNop] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [siteDetail, setSiteDetail] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({});

  const { sites: rawSites, loading: mapLoading } = useMapData(bulan, tahun);

  // Filter sites by NOP if selected
  const sites = useMemo(() => {
    if (!nop) return rawSites;
    return rawSites.filter(s => s.nop === nop);
  }, [rawSites, nop]);

  const handleSiteClick = useCallback((siteId) => {
    setSelectedSiteId(siteId);
  }, []);

  const handleSiteSelect = useCallback(async (siteId) => {
    try {
      const detail = await fetchSiteDetail(siteId, bulan, tahun);
      setSiteDetail(detail);
      setShowModal(true);
      setSelectedSiteId(siteId);
    } catch (err) {
      console.error('Failed to load site detail:', err);
    }
  }, [bulan, tahun]);

  // Listen for custom event from Mapbox popup button
  useEffect(() => {
    const handler = (e) => handleSiteSelect(e.detail);
    window.addEventListener('open-site-detail', handler);
    return () => window.removeEventListener('open-site-detail', handler);
  }, [handleSiteSelect]);

  // Merge NOP into table filters
  const tableFilters = useMemo(() => {
    const f = { ...filters };
    if (nop) f.nop = nop;
    return f;
  }, [filters, nop]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <Header
        bulan={bulan}
        tahun={tahun}
        nop={nop}
        onBulanChange={setBulan}
        onTahunChange={setTahun}
        onNopChange={setNop}
      />

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-[280px] shrink-0 border-r border-white/[0.06] bg-[var(--bg-surface)]/50 flex flex-col overflow-hidden">
          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            <SummaryCards bulan={bulan} tahun={tahun} />
            <AvailabilityChart siteId={selectedSiteId} tahun={tahun} />

            {/* Legend */}
            <div className="glass-card p-3">
              <h4 className="text-[10px] font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-widest">Legenda</h4>
              <div className="space-y-1.5">
                {[
                  { color: STATUS_COLORS.excellent, label: 'Excellent ≥ 99.5%' },
                  { color: STATUS_COLORS.good, label: 'Good 95% – 99.4%' },
                  { color: STATUS_COLORS.critical, label: 'Critical < 95%' },
                  { color: STATUS_COLORS.noData, label: 'No Data' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: l.color, boxShadow: `0 0 6px ${l.color}40` }}
                    />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Map */}
          <div className="flex-1 p-3 pb-0">
            <MapboxMap
              sites={sites}
              loading={mapLoading}
              onSiteClick={handleSiteClick}
              selectedSiteId={selectedSiteId}
            />
          </div>

          {/* Bottom Table */}
          <div className="h-[38%] min-h-[240px] p-3 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {sites.length.toLocaleString()} sites{nop ? ` · ${nop}` : ''}
              </span>
              <FilterPanel filters={filters} onFilterChange={setFilters} />
            </div>
            <div className="flex-1 overflow-hidden">
              <SiteTable
                bulan={bulan}
                tahun={tahun}
                filters={tableFilters}
                onSiteSelect={handleSiteSelect}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Site Detail Modal */}
      {showModal && (
        <SiteDetailModal
          data={siteDetail}
          onClose={() => { setShowModal(false); setSiteDetail(null); }}
        />
      )}
    </div>
  );
}
