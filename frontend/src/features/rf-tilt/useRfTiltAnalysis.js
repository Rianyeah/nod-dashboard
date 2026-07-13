import { useState, useCallback, useEffect, useRef } from 'react';
import { analyzeRfTilt, searchRfTiltSites, getAntennaSpec, searchAntennaModels as searchAntennaModelsApi } from '../../services/api';
import { DEFAULT_PARAMS } from './rfTiltChartConfig';
import {
  inferAntennaSeries,
  inferFrequencyFromAntennaBands,
  inferFrequencyFromBand,
  formatRfTiltApiError,
  hasValidTiltAnalysisResult,
  resolveAntennaInputs,
  validateRfTiltInputs,
} from './rfTiltSiteUtils';

export function useRfTiltAnalysis() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [targetMode, setTargetMode] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [siteSearchResults, setSiteSearchResults] = useState([]);
  const [siteSearchLoading, setSiteSearchLoading] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [antennaSpec, setAntennaSpec] = useState(null);
  const [antennaSpecLoading, setAntennaSpecLoading] = useState(false);
  const [antennaModelResults, setAntennaModelResults] = useState([]);
  const [antennaModelLoading, setAntennaModelLoading] = useState(false);
  const [antennaModelError, setAntennaModelError] = useState(null);
  const [inputSources, setInputSources] = useState({
    verticalBeamwidth: 'Standard fallback (6°)',
    horizontalBeamwidth: 'Manual',
  });
  const [compatibilityWarning, setCompatibilityWarning] = useState(null);
  const searchTimerRef = useRef(null);
  const modelSearchTimerRef = useRef(null);
  const modelSearchRequestRef = useRef(0);
  const antennaSpecRequestRef = useRef(0);
  const paramsRef = useRef(DEFAULT_PARAMS);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (modelSearchTimerRef.current) clearTimeout(modelSearchTimerRef.current);
    modelSearchRequestRef.current += 1;
  }, []);

  const set = useCallback((key) => (val) => {
    setParams((p) => ({ ...p, [key]: val }));
    if (key === 'vertical_beamwidth') {
      setInputSources((sources) => ({ ...sources, verticalBeamwidth: 'Manual' }));
    }
  }, []);

  const setMultiple = useCallback((updates) => {
    setParams((p) => ({ ...p, ...updates }));
  }, []);

  const applyResolvedSpecInputs = useCallback((spec, {
    frequencyMhz = paramsRef.current.frequency_mhz,
    site = selectedSite,
    electricalTilt = paramsRef.current.electrical_tilt,
  } = {}) => {
    const resolved = resolveAntennaInputs({
      antennaSpec: spec,
      frequencyMhz,
      siteBeamwidth: site?.beamwidth,
      hasSelectedSite: Boolean(site),
      electricalTilt,
    });

    setParams((current) => ({
      ...current,
      vertical_beamwidth: resolved.verticalBeamwidth,
      ...(resolved.horizontalBeamwidth ? { horizontal_beamwidth: resolved.horizontalBeamwidth } : {}),
    }));
    setInputSources((sources) => ({
      ...sources,
      verticalBeamwidth: resolved.verticalBeamwidthSource,
      ...(resolved.horizontalBeamwidthSource ? { horizontalBeamwidth: resolved.horizontalBeamwidthSource } : {}),
    }));
    setCompatibilityWarning(resolved.electricalTiltWarning);
  }, [selectedSite]);

  const searchSites = useCallback((q) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q || q.trim().length < 2) {
      setSiteSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSiteSearchLoading(true);
      try {
        const data = await searchRfTiltSites(q);
        setSiteSearchResults(data.items || []);
      } catch {
        setSiteSearchResults([]);
      } finally {
        setSiteSearchLoading(false);
      }
    }, 300);
  }, []);

  const selectSite = useCallback((site) => {
    setSelectedSiteId(site.site_id);
    setSelectedSite(site);
    const frequency = inferFrequencyFromBand(site.band);
    setMultiple({
      latitude: site.latitude,
      longitude: site.longitude,
      azimuth: site.azimuth ?? DEFAULT_PARAMS.azimuth,
      antenna_height: site.antenna_height ?? DEFAULT_PARAMS.antenna_height,
      mechanical_tilt: site.mechanical_tilt ?? DEFAULT_PARAMS.mechanical_tilt,
      electrical_tilt: site.electrical_tilt ?? DEFAULT_PARAMS.electrical_tilt,
      ...(Number(site.beamwidth) > 0 ? { horizontal_beamwidth: Number(site.beamwidth) } : {}),
      frequency_mhz: frequency ?? DEFAULT_PARAMS.frequency_mhz,
      antenna_series: inferAntennaSeries(site.antenna_type) ?? DEFAULT_PARAMS.antenna_series,
      antenna_type: site.antenna_type ?? null,
    });

    setInputSources((sources) => ({
      ...sources,
      horizontalBeamwidth: Number(site.beamwidth) > 0 ? 'Site data' : sources.horizontalBeamwidth,
    }));

    const requestId = ++antennaSpecRequestRef.current;
    if (site.antenna_type) {
      setAntennaSpecLoading(true);
      getAntennaSpec(site.antenna_type)
        .then((spec) => {
          if (requestId !== antennaSpecRequestRef.current) return;
          setAntennaSpec(spec);
          applyResolvedSpecInputs(spec, {
            frequencyMhz: frequency ?? DEFAULT_PARAMS.frequency_mhz,
            site,
            electricalTilt: site.electrical_tilt ?? DEFAULT_PARAMS.electrical_tilt,
          });
        })
        .catch(() => {
          if (requestId !== antennaSpecRequestRef.current) return;
          setAntennaSpec(null);
          applyResolvedSpecInputs(null, {
            frequencyMhz: frequency ?? DEFAULT_PARAMS.frequency_mhz,
            site,
            electricalTilt: site.electrical_tilt ?? DEFAULT_PARAMS.electrical_tilt,
          });
        })
        .finally(() => {
          if (requestId === antennaSpecRequestRef.current) setAntennaSpecLoading(false);
        });
    } else {
      setAntennaSpec(null);
      applyResolvedSpecInputs(null, {
        frequencyMhz: frequency ?? DEFAULT_PARAMS.frequency_mhz,
        site,
        electricalTilt: site.electrical_tilt ?? DEFAULT_PARAMS.electrical_tilt,
      });
    }
  }, [applyResolvedSpecInputs, setMultiple]);

  const searchAntennaModels = useCallback((q) => {
    if (modelSearchTimerRef.current) clearTimeout(modelSearchTimerRef.current);
    const requestId = ++modelSearchRequestRef.current;
    setAntennaModelLoading(true);
    setAntennaModelError(null);
    modelSearchTimerRef.current = setTimeout(async () => {
      try {
        const data = await searchAntennaModelsApi(q);
        if (requestId === modelSearchRequestRef.current) {
          setAntennaModelResults(data.items || []);
        }
      } catch (err) {
        if (requestId === modelSearchRequestRef.current) {
          setAntennaModelResults([]);
          setAntennaModelError(
            err.response?.status === 404
              ? 'Antenna search service is unavailable. Restart the backend with the latest RF Tilt routes.'
              : 'Unable to load antenna models. Check the backend connection and try again.',
          );
        }
      } finally {
        if (requestId === modelSearchRequestRef.current) {
          setAntennaModelLoading(false);
        }
      }
    }, 250);
  }, []);

  const selectAntennaModel = useCallback((model) => {
    const updates = {
      antenna_type: model.antenna_model,
    };
    const nearestFreq = inferFrequencyFromAntennaBands(model.frequency_bands);
    // The selected site's band stays authoritative; infer a model band only
    // when the operator is working without an installed-site configuration.
    if (nearestFreq && !selectedSite) {
      updates.frequency_mhz = nearestFreq;
    }
    // The backend only accepts known Huawei series. Catalog entries such as
    // A12 or AAU must not be forwarded as antenna_series.
    updates.antenna_series = inferAntennaSeries(model.series) ?? inferAntennaSeries(model.antenna_model);
    setMultiple(updates);

    const requestId = ++antennaSpecRequestRef.current;
    setAntennaSpecLoading(true);
    getAntennaSpec(model.antenna_model)
      .then((spec) => {
        if (requestId !== antennaSpecRequestRef.current) return;
        setAntennaSpec(spec);
        applyResolvedSpecInputs(spec, {
          frequencyMhz: selectedSite ? paramsRef.current.frequency_mhz : nearestFreq ?? paramsRef.current.frequency_mhz,
          site: selectedSite,
        });
      })
      .catch(() => {
        if (requestId !== antennaSpecRequestRef.current) return;
        setAntennaSpec(null);
        applyResolvedSpecInputs(null, {
          frequencyMhz: selectedSite ? paramsRef.current.frequency_mhz : nearestFreq ?? paramsRef.current.frequency_mhz,
          site: selectedSite,
        });
      })
      .finally(() => {
        if (requestId === antennaSpecRequestRef.current) setAntennaSpecLoading(false);
      });
  }, [applyResolvedSpecInputs, selectedSite, setMultiple]);

  const selectFrequency = useCallback((frequencyMhz) => {
    setParams((current) => ({ ...current, frequency_mhz: frequencyMhz }));
    applyResolvedSpecInputs(antennaSpec, { frequencyMhz, site: selectedSite });
  }, [antennaSpec, applyResolvedSpecInputs, selectedSite]);

  const runAnalysis = useCallback(async () => {
    const validationError = validateRfTiltInputs(params, targetMode);
    if (validationError) {
      setError(`Periksa input: ${validationError}`);
      setStatusMsg('');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setStatusMsg('Fetching terrain and running analysis...');
      const body = {
        ...params,
        antenna_type: params.antenna_type ?? null,
        target_latitude: targetMode ? params.target_latitude : null,
        target_longitude: targetMode ? params.target_longitude : null,
      };
      const data = await analyzeRfTilt(body);
      if (!hasValidTiltAnalysisResult(data)) {
        throw new Error('Hasil analisis tidak lengkap. Ubah input lalu jalankan analisis kembali.');
      }
      setResult(data);
      setStatusMsg('');
    } catch (err) {
      setError(formatRfTiltApiError(err));
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  }, [params, targetMode]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setStatusMsg('');
    setSelectedSiteId(null);
    setSelectedSite(null);
    setAntennaSpec(null);
    setCompatibilityWarning(null);
    setInputSources({ verticalBeamwidth: 'Standard fallback (6°)', horizontalBeamwidth: 'Manual' });
  }, []);

  return {
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
    reset,
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
  };
}
