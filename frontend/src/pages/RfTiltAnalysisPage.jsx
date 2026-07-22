import { useRef, useCallback } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import { useRfTiltAnalysis } from '../features/rf-tilt/useRfTiltAnalysis';
import RfTiltParamForm from '../features/rf-tilt/RfTiltParamForm';
import RfTiltChart from '../features/rf-tilt/RfTiltChart';
import RfTiltMap from '../features/rf-tilt/RfTiltMap';
import RfTiltResultPanel from '../features/rf-tilt/RfTiltResultPanel';
import RfTiltExportButton from '../features/rf-tilt/RfTiltExportButton';
import RfTiltAntennaSpecPanel from '../features/rf-tilt/RfTiltAntennaSpecPanel';
import RfTiltResultErrorBoundary from '../features/rf-tilt/RfTiltResultErrorBoundary';

export default function RfTiltAnalysisPage() {
  const hook = useRfTiltAnalysis();
  const {
    params,
    set,
    setMultiple,
    result,
    loading,
    error,
    statusMsg,
    targetMode,
    setTargetMode,
    manualMode,
    setManualMode,
    selectedSiteId,
    selectedSite,
    siteSearchResults,
    siteSearchLoading,
    searchSites,
    selectSite,
    runAnalysis,
    antennaSpec,
    antennaSpecLoading,
    antennaModelResults,
    antennaModelLoading,
    antennaModelError,
    searchAntennaModels,
    selectAntennaModel,
    selectFrequency,
    inputSources,
    compatibilityWarning,
  } = hook;

  const exportRef = useRef(null);

  const totalTilt = [params.mechanical_tilt, params.electrical_tilt]
    .reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0)
    .toFixed(1);

  const handleMapClick = useCallback((lat, lon) => {
    if (targetMode) {
      setMultiple({ target_latitude: lat, target_longitude: lon });
    }
  }, [targetMode, setMultiple]);

  return (
    <div ref={exportRef} data-export="rf-tilt-analysis" className="min-h-screen">
      <Breadcrumb />

      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Tower icon in header */}
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(34,211,238,0.05))' }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 15L8 4L11 15" stroke="#22d3ee" strokeWidth="1.3" fill="none"/>
              <line x1="6" y1="11" x2="10" y2="11" stroke="#22d3ee" strokeWidth="0.8"/>
              <line x1="6.5" y1="8" x2="9.5" y2="8" stroke="#22d3ee" strokeWidth="0.8"/>
              <rect x="6" y="1" width="4" height="4" rx="1" fill="#22d3ee" opacity="0.6"/>
              <circle cx="8" cy="1" r="1" fill="#ef4444" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-primary)]">
              RF Tilt Analysis
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              Terrain profile • Beam geometry • Coverage mapping
            </p>
          </div>
        </div>
        {result && (
          <RfTiltExportButton targetRef={exportRef} disabled={loading} />
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          {/* Left: form */}
          <div className="space-y-4">
            <RfTiltParamForm
              params={params}
              set={set}
              targetMode={targetMode}
              setTargetMode={setTargetMode}
              manualMode={manualMode}
              setManualMode={setManualMode}
              selectedSiteId={selectedSiteId}
              selectedSite={selectedSite}
              siteSearchResults={siteSearchResults}
              siteSearchLoading={siteSearchLoading}
              searchSites={searchSites}
              selectSite={selectSite}
              loading={loading}
              onRun={runAnalysis}
              totalTilt={totalTilt}
              antennaModelResults={antennaModelResults}
              antennaModelLoading={antennaModelLoading}
              antennaModelError={antennaModelError}
              searchAntennaModels={searchAntennaModels}
              selectAntennaModel={selectAntennaModel}
              selectFrequency={selectFrequency}
              antennaSpec={antennaSpec}
              inputSources={inputSources}
              compatibilityWarning={compatibilityWarning}
            />

            {/* Status messages */}
            {statusMsg && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5 rounded-md bg-muted/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary-light)] animate-pulse" />
                {statusMsg}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-xs text-destructive px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
                <span className="mt-0.5">⚠</span>
                {typeof error === 'string' ? error : 'Analisis tidak dapat dijalankan. Periksa kembali input Anda.'}
              </div>
            )}
          </div>

          {/* Right: chart + map + result */}
          <div className="space-y-4 min-w-0">
            {!result && (antennaSpec || antennaSpecLoading) && (
              <RfTiltAntennaSpecPanel antennaSpec={antennaSpec} loading={antennaSpecLoading} />
            )}

            {result && (
              <RfTiltResultErrorBoundary resetKey={result}>
                <div className="space-y-4 bg-[var(--bg-base)] p-3 rounded-lg">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
                    <div className="min-w-0">
                      <RfTiltChart result={result} />
                    </div>
                    <div className="min-w-0">
                      {(antennaSpec || antennaSpecLoading) && (
                        <RfTiltAntennaSpecPanel antennaSpec={antennaSpec} loading={antennaSpecLoading} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <RfTiltMap
                        result={result}
                        params={params}
                        onMapClick={handleMapClick}
                        targetMode={targetMode}
                        selectedSiteId={selectedSiteId}
                      />
                    </div>
                    <div className="min-w-0 space-y-4">
                      <RfTiltResultPanel result={result} clutterCount={0} selectedSiteId={selectedSiteId} />
                    </div>
                  </div>
                </div>
              </RfTiltResultErrorBoundary>
            )}

            {!result && !loading && !antennaSpec && !antennaSpecLoading && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.3">
                  <path d="M12 38L20 10L28 38" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <line x1="14" y1="28" x2="26" y2="28" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="15" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="16" y="4" width="8" height="8" rx="2" fill="currentColor" opacity="0.5"/>
                  <circle cx="20" cy="3" r="2" fill="currentColor" opacity="0.3"/>
                </svg>
                <span>Configure parameters and run an analysis to see results.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
