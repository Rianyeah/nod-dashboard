import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fetchSiteDetailBundle } from '../services/siteDetailBundle.js';


describe('site detail bundle', () => {
  it('uses the resolved detail period for trend and keeps site performance independent', async () => {
    const calls = [];
    const result = await fetchSiteDetailBundle('PSN003', {}, {
      fetchDetail: async () => ({ site_id: 'PSN003', bulan: 6, tahun: 2026 }),
      fetchTrendData: async (siteId, tahun, bulan) => {
        calls.push({ siteId, tahun, bulan });
        return [{ tahun, bulan }];
      },
      fetchPerformance: async () => ({ total_revenue: 10 }),
    });

    assert.deepEqual(calls, [{ siteId: 'PSN003', tahun: 2026, bulan: 6 }]);
    assert.deepEqual(result.trendData, [{ tahun: 2026, bulan: 6 }]);
    assert.equal(result.performanceData.total_revenue, 10);
    assert.equal(result.trendError, null);
    assert.equal(result.performanceError, null);
  });

  it('keeps complete explicit periods authoritative', async () => {
    let trendPeriod;
    await fetchSiteDetailBundle('PSN003', { bulan: 5, tahun: 2025 }, {
      fetchDetail: async () => ({ site_id: 'PSN003', bulan: 5, tahun: 2025 }),
      fetchTrendData: async (_siteId, tahun, bulan) => {
        trendPeriod = { tahun, bulan };
        return [];
      },
      fetchPerformance: async () => ({}),
    });

    assert.deepEqual(trendPeriod, { tahun: 2025, bulan: 5 });
  });

  it('retains required detail when optional trend and performance fail', async () => {
    const result = await fetchSiteDetailBundle('PSN003', {}, {
      fetchDetail: async () => ({ site_id: 'PSN003', bulan: 6, tahun: 2026 }),
      fetchTrendData: async () => { throw new Error('trend unavailable'); },
      fetchPerformance: async () => { throw new Error('performance unavailable'); },
    });

    assert.equal(result.detail.site_id, 'PSN003');
    assert.deepEqual(result.trendData, []);
    assert.equal(result.performanceData, null);
    assert.match(result.trendError.message, /trend unavailable/);
    assert.match(result.performanceError.message, /performance unavailable/);
  });

  it('does not swallow cancellation from an optional request', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' });

    await assert.rejects(
      fetchSiteDetailBundle('PSN003', {}, {
        fetchDetail: async () => ({ site_id: 'PSN003', bulan: 6, tahun: 2026 }),
        fetchTrendData: async () => { throw cancelled; },
        fetchPerformance: async () => ({}),
      }),
      (error) => error === cancelled,
    );
  });
});
