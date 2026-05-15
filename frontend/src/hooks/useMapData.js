import { useState, useEffect, useCallback } from 'react';
import { fetchMapSites } from '../services/api';

/**
 * Custom hook for fetching map site data.
 */
export function useMapData(bulan, tahun) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!bulan || !tahun) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMapSites(bulan, tahun);
      setSites(data);
    } catch (err) {
      setError(err.message || 'Gagal memuat data peta');
      console.error('useMapData error:', err);
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { sites, loading, error, refetch: loadData };
}
