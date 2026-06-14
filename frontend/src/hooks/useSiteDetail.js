import { useState, useCallback } from 'react';
import { fetchSiteDetail, fetchTrend } from '../services/api';

/**
 * Custom hook for fetching site detail and trend data.
 */
export function useSiteDetail() {
  const [detail, setDetail] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDetail = useCallback(async (siteId, bulan, tahun) => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSiteDetail(siteId, bulan, tahun);
      setDetail(data);
    } catch (err) {
      setError(err.message || 'Gagal memuat detail site');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrend = useCallback(async (siteId, tahun, bulan) => {
    if (!siteId) return;
    try {
      const data = await fetchTrend(siteId, tahun, bulan);
      setTrend(data);
    } catch (err) {
      console.error('Trend error:', err);
      setTrend([]);
    }
  }, []);

  const clearDetail = useCallback(() => {
    setDetail(null);
    setTrend([]);
    setError(null);
  }, []);

  return { detail, trend, loading, error, loadDetail, loadTrend, clearDetail };
}
