import { useState, useCallback, useEffect, useRef } from 'react';
import { analyzeRfTilt, searchRfTiltSites, getAntennaSpec, searchAntennaModels as searchAntennaModelsApi } from '../../services/api';
import { DEFAULT_PARAMS } from './rfTiltChartConfig';
import { inferAntennaSeries, inferFrequencyFromAntennaBands, inferFrequencyFromBand } from './rfTiltSiteUtils';

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
  const [antennaSpec, setAntennaSpec] = useState(null);
  const [antennaSpecLoading, setAntennaSpecLoading] = useState(false);
  const [antennaModelResults, setAntennaModelResults] = useState([]);
  const [antennaModelLoading, setAntennaModelLoading] = useState(false);
  const [antennaModelError, setAntennaModelError] = useState(null);
  const searchTimerRef = useRef(null);
  const modelSearchTimerRef = useRef(null);
  const modelSearchRequestRef = useRef(0);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (modelSearchTimerRef.current) clearTimeout(modelSearchTimerRef.current);
    modelSearchRequestRef.current += 1;
  }, []);

  const set = useCallback((key) => (val) => {
    setParams((p) => ({ ...p, [key]: val }));
  }, []);

  const setMultiple = useCallback((updates) => {
    setParams((p) => ({ ...p, ...updates }));
  }, []);

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
    const hbw = site.beamwidth ?? DEFAULT_PARAMS.horizontal_beamwidth;
    const frequency = inferFrequencyFromBand(site.band);
    setMultiple({
      latitude: site.latitude,
      longitude: site.longitude,
      azimuth: site.azimuth ?? DEFAULT_PARAMS.azimuth,
      antenna_height: site.antenna_height ?? DEFAULT_PARAMS.antenna_height,
      mechanical_tilt: site.mechanical_tilt ?? DEFAULT_PARAMS.mechanical_tilt,
      electrical_tilt: site.electrical_tilt ?? DEFAULT_PARAMS.electrical_tilt,
      horizontal_beamwidth: hbw,
      frequency_mhz: frequency ?? DEFAULT_PARAMS.frequency_mhz,
      antenna_series: inferAntennaSeries(site.antenna_type) ?? DEFAULT_PARAMS.antenna_series,
      antenna_type: site.antenna_type ?? null,
    });

    // Fetch antenna spec from backend
    if (site.antenna_type) {
      setAntennaSpecLoading(true);
      getAntennaSpec(site.antenna_type)
        .then((spec) => setAntennaSpec(spec))
        .catch(() => setAntennaSpec(null))
        .finally(() => setAntennaSpecLoading(false));
    } else {
      setAntennaSpec(null);
    }
  }, [setMultiple]);

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
    if (nearestFreq) {
      updates.frequency_mhz = nearestFreq;
    }
    const series = model.series || inferAntennaSeries(model.antenna_model);
    if (series) {
      updates.antenna_series = series;
    }
    setMultiple(updates);

    setAntennaSpecLoading(true);
    getAntennaSpec(model.antenna_model)
      .then((spec) => setAntennaSpec(spec))
      .catch(() => setAntennaSpec(null))
      .finally(() => setAntennaSpecLoading(false));
  }, [setMultiple]);

  const runAnalysis = useCallback(async () => {
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
      setResult(data);
      setStatusMsg('');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Analysis failed');
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
    setAntennaSpec(null);
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
  };
}
