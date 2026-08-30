import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMapSites } from '../services/api';

/**
 * Custom hook for fetching map site data.
 */
export function useMapData(bulan, tahun, filters = {}) {
  const [sites, setSites] = useState([]);
  const [total, setTotal] = useState(0);
  const [withCoordinates, setWithCoordinates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const loadData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!bulan || !tahun) {
      setSites([]);
      setTotal(0);
      setWithCoordinates(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMapSites({
        bulan,
        tahun,
        filters,
        signal: controller.signal,
      });
      if (requestId !== requestIdRef.current) return;
      setSites(payload?.data || []);
      setTotal(Number(payload?.total) || 0);
      setWithCoordinates(Number(payload?.with_coordinates) || 0);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return;
      if (requestId !== requestIdRef.current) return;
      setError(err.message || 'Gagal memuat data peta');
      console.error('useMapData error:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [bulan, tahun, filters]);

  useEffect(() => {
    Promise.resolve().then(loadData);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadData]);

  return { sites, total, withCoordinates, loading, error, refetch: loadData };
}
