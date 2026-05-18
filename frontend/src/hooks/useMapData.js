import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMapSites } from '../services/api';

/**
 * Custom hook for fetching map site data.
 */
export function useMapData(bulan, tahun, nop) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!bulan || !tahun) {
      setSites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMapSites(bulan, tahun, nop);
      if (requestId !== requestIdRef.current) return;
      setSites(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message || 'Gagal memuat data peta');
      console.error('useMapData error:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [bulan, tahun, nop]);

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [loadData]);

  return { sites, loading, error, refetch: loadData };
}
