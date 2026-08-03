import {
  fetchSiteDetail,
  fetchSitePerformance,
  fetchTrend,
} from './api.js';


function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
}


export async function fetchSiteDetailBundle(
  siteId,
  { bulan, tahun, signal } = {},
  requests = {},
) {
  const fetchDetail = requests.fetchDetail || fetchSiteDetail;
  const fetchTrendData = requests.fetchTrendData || fetchTrend;
  const fetchPerformance = requests.fetchPerformance || fetchSitePerformance;

  const detail = await fetchDetail(siteId, bulan, tahun, signal);
  const resolvedBulan = detail?.bulan ?? bulan;
  const resolvedTahun = detail?.tahun ?? tahun;

  const [trendResult, performanceResult] = await Promise.allSettled([
    fetchTrendData(siteId, resolvedTahun, resolvedBulan, signal),
    fetchPerformance(siteId, signal),
  ]);

  for (const result of [trendResult, performanceResult]) {
    if (result.status === 'rejected' && isAbortError(result.reason)) {
      throw result.reason;
    }
  }

  return {
    detail,
    trendData: trendResult.status === 'fulfilled' ? trendResult.value : [],
    performanceData: performanceResult.status === 'fulfilled' ? performanceResult.value : null,
    trendError: trendResult.status === 'rejected' ? trendResult.reason : null,
    performanceError: performanceResult.status === 'rejected' ? performanceResult.reason : null,
  };
}
