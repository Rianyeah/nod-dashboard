/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveTransportTrendAxes,
  TRANSPORT_TREND_SERIES,
} from '../features/transport-quality/transportQualityTrendAxes.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('Transport Quality dashboard contracts', () => {
  it('keeps PL on the right axis and smaller issue series on the left axis', () => {
    const rows = [
      { pl_over_1_sites: 12, latency_over_5_sites: 1000, jitter_not_clear_sites: 4, thi_fail_sites: 9 },
      { pl_over_1_sites: 48, latency_over_5_sites: 1420, jitter_not_clear_sites: 17, thi_fail_sites: 50 },
    ];

    assert.deepEqual(resolveTransportTrendAxes(rows), {
      axisBySeries: {
        pl_over_1_sites: 'large',
        latency_over_5_sites: 'small',
        jitter_not_clear_sites: 'small',
        thi_fail_sites: 'small',
      },
      hasLargeSeries: true,
    });
    assert.equal(rows[1].latency_over_5_sites, 1420);
  });

  it('uses stable axes regardless of data magnitude', () => {
    const expected = {
      axisBySeries: {
        pl_over_1_sites: 'large',
        latency_over_5_sites: 'small',
        jitter_not_clear_sites: 'small',
        thi_fail_sites: 'small',
      },
      hasLargeSeries: true,
    };

    assert.deepEqual(resolveTransportTrendAxes([
      { pl_over_1_sites: 1, latency_over_5_sites: 2, jitter_not_clear_sites: 3, thi_fail_sites: 50 },
    ]), expected);
    assert.deepEqual(resolveTransportTrendAxes([
      { pl_over_1_sites: 51, latency_over_5_sites: 52, jitter_not_clear_sites: 53, thi_fail_sites: 54 },
    ]), expected);
  });

  it('keeps stable axes for invalid and sparse values', () => {
    const invalidValues = [null, '', '   ', NaN, Infinity, -1];
    const invalidRows = invalidValues.map((value) => ({
      pl_over_1_sites: value,
      latency_over_5_sites: value,
      jitter_not_clear_sites: value,
      thi_fail_sites: value,
    }));

    assert.deepEqual(resolveTransportTrendAxes(invalidRows), {
      axisBySeries: {
        pl_over_1_sites: 'large',
        latency_over_5_sites: 'small',
        jitter_not_clear_sites: 'small',
        thi_fail_sites: 'small',
      },
      hasLargeSeries: true,
    });
  });

  it('defaults empty or undefined trend rows to four stable axis keys', () => {
    const expected = {
      axisBySeries: {
        pl_over_1_sites: 'large',
        latency_over_5_sites: 'small',
        jitter_not_clear_sites: 'small',
        thi_fail_sites: 'small',
      },
      hasLargeSeries: true,
    };

    assert.deepEqual(TRANSPORT_TREND_SERIES, [
      'pl_over_1_sites',
      'latency_over_5_sites',
      'jitter_not_clear_sites',
      'thi_fail_sites',
    ]);
    assert.deepEqual(resolveTransportTrendAxes([]), expected);
    assert.deepEqual(resolveTransportTrendAxes(), expected);
  });

  it('wires the route, navigation, breadcrumb label, and API functions', () => {
    const app = src('App.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const breadcrumb = src('components', 'Breadcrumb.jsx');
    const api = src('services', 'api.js');
    const pagePath = srcPath('pages', 'TransportQualityPage.jsx');

    assert.equal(existsSync(pagePath), true);
    assert.match(app, /TransportQualityPage/);
    assert.match(app, /path="\/transport-quality"/);
    assert.match(sidebar, /to: '\/transport-quality'/);
    assert.match(sidebar, /Transport Quality/);
    assert.match(breadcrumb, /'transport-quality': 'Transport Quality'/);

    for (const fn of [
      'fetchTransportQualityFilters',
      'fetchTransportQualitySummary',
      'fetchTransportQualityTrend',
      'fetchTransportQualityDistributions',
      'fetchTransportQualityBreakdowns',
      'fetchTransportQualityPrioritySites',
    ]) {
      assert.match(api, new RegExp(`export async function ${fn}`));
    }

    assert.match(api, /\/transport-quality\/filters/);
    assert.match(api, /\/transport-quality\/summary/);
    assert.match(api, /\/transport-quality\/priority-sites/);
    assert.match(api, /Date\.now\(\)/);
    assert.match(api, /Cache-Control': 'no-cache'/);
  });

  it('renders the required dense NOC sections and global filters', () => {
    const page = src('pages', 'TransportQualityPage.jsx');
    const charts = src('features', 'transport-quality', 'TransportQualityCharts.jsx');
    const feature = `${page}\n${charts}`;

    for (const label of [
      'Transport Quality',
      'Date / Week',
      'NOP',
      'Kabupaten',
      'Transport Type',
      'THI Status',
      'Distribution PL',
      'PL Status 0.1%',
      'Distribution Lat',
      'Jitter Status',
      'Total Sites',
      'PL > 1%',
      'Latency > 5ms',
      'FLAG PL FAIL',
      'THI FAIL',
      'P1 Sites',
      'Weekly Quality Trend',
      'High Priority Transport',
      'PL & Latency Distribution',
      'Issue Breakdown',
      'Priority Site List',
    ]) {
      assert.match(feature, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(page, /id="transport-date"/);
    assert.match(page, /id="transport-nop"/);
    assert.match(page, /id="transport-kabupaten"/);
    assert.match(page, /id="transport-type"/);
    assert.match(page, /id="transport-thi-status"/);
    assert.match(page, /id="transport-distribution-pl"/);
    assert.match(page, /id="transport-pl-status"/);
    assert.match(page, /id="transport-distribution-lat"/);
    assert.match(page, /id="transport-jitter-status"/);
  });

  it('uses a horizontal header toolbar, advanced filter popover, and count series in weekly trend', () => {
    const page = src('pages', 'TransportQualityPage.jsx');
    const charts = src('features', 'transport-quality', 'TransportQualityCharts.jsx');
    const header = page.split('</header>', 1)[0];

    for (const component of [
      'DashboardFilterBar',
      'DashboardPeriodPicker',
      'DashboardCombobox',
      'DashboardFilterPopover',
      'DashboardFilterChips',
      'DashboardFilterSelect',
      'DashboardPagination',
    ]) {
      assert.match(page, new RegExp(component));
    }
    assert.match(header, /DashboardFilterBar/);
    assert.match(header, /DashboardFilterPopover/);
    assert.match(header, /lg:flex-nowrap/);
    assert.doesNotMatch(page, /DashboardFilterSheet/);
    assert.doesNotMatch(page, /function SelectFilter/);
    assert.doesNotMatch(page, /filtersCollapsed/);
    assert.doesNotMatch(page, /<select/);

    const trendSection = charts.split('Weekly Quality Trend', 2)[1].split('High Priority Transport', 1)[0];
    for (const series of [
      'pl_over_1_sites',
      'latency_over_5_sites',
      'jitter_not_clear_sites',
      'thi_fail_sites',
    ]) {
      assert.match(trendSection, new RegExp(series));
    }
    assert.doesNotMatch(trendSection, /avg_packet_loss/);
    assert.doesNotMatch(trendSection, /avg_latency/);
    assert.doesNotMatch(trendSection, /avg_jitter/);
    assert.match(page, /TransportQualityCharts/);
    assert.doesNotMatch(page, /ResponsiveContainer/);
    assert.match(charts, /ChartContainer/g);
    assert.match(charts, /DashboardChartTooltipContent/);
    assert.match(charts, /accessibilityLayer/g);
    assert.match(charts, /p1_sites/);
    assert.match(charts, /p2_sites/);
    assert.match(charts, /radius=\{DASHBOARD_BAR_RADIUS\}/);
  });

  it('uses resolved dual axes for the weekly quality trend', () => {
    const charts = src('features', 'transport-quality', 'TransportQualityCharts.jsx');
    const trendSection = charts.split('Weekly Quality Trend', 2)[1].split('High Priority Transport', 1)[0];

    assert.match(charts, /import\s*\{\s*resolveTransportTrendAxes\s*\}\s*from\s*['"]\.\/transportQualityTrendAxes['"]/);
    assert.match(charts, /const\s+trendAxes\s*=\s*resolveTransportTrendAxes\(trend\)/);
    assert.match(trendSection, /<CartesianGrid\b(?=[^>]*\byAxisId="small")[^>]*\/>/);
    assert.match(trendSection, /<YAxis\s+[^>]*yAxisId="small"[^>]*domain=\{\[0,\s*50\]\}[^>]*tickCount=\{6\}[^>]*tickLine=\{false\}[^>]*axisLine=\{false\}[^>]*width=\{36\}[^>]*tick=\{\{ fill: 'var\(--chart-axis\)', fontSize: 10 \}\}/);
    assert.match(trendSection, /<YAxis\s+[^>]*yAxisId="large"[^>]*orientation="right"[^>]*domain=\{\[0,\s*'auto'\]\}[^>]*tickLine=\{false\}[^>]*axisLine=\{false\}[^>]*width=\{42\}[^>]*tick=\{\{ fill: 'var\(--danger\)', fontSize: 10 \}\}/);

    assert.match(trendSection, /<ComposedChart/);
    assert.match(trendSection, /<Area[^>]*dataKey="pl_over_1_sites"[^>]*yAxisId=\{trendAxes\.axisBySeries\.pl_over_1_sites\}[^>]*fill="url\(#transport-pl-area\)"/);
    assert.match(trendSection, /<linearGradient\s+id="transport-pl-area"/);
    for (const series of ['latency_over_5_sites', 'jitter_not_clear_sites', 'thi_fail_sites']) {
      assert.match(trendSection, new RegExp(`<Line[^>]*dataKey="${series}"[^>]*yAxisId=\\{trendAxes\\.axisBySeries\\.${series}\\}`));
    }
  });

  it('isolates priority table pagination from dashboard requests', () => {
    const page = src('pages', 'TransportQualityPage.jsx');

    assert.match(page, /const dashboardParams = useMemo/);
    assert.match(page, /const tableParams = useMemo/);
    assert.match(page, /dashboardLoading/);
    assert.match(page, /tableLoading/);
    assert.match(page, /fetchTransportQualityPrioritySites\(tableParams\)/);

    const dashboardRequestBlock = page.split('Promise.all([', 2)[1].split('])', 1)[0];
    assert.doesNotMatch(dashboardRequestBlock, /fetchTransportQualityPrioritySites/);
  });

  it('keeps threshold and priority semantics visible in the frontend', () => {
    const page = src('pages', 'TransportQualityPage.jsx');
    const charts = src('features', 'transport-quality', 'TransportQualityCharts.jsx');
    const feature = `${page}\n${charts}`;

    assert.match(feature, /PL_THRESHOLD\s*=\s*1/);
    assert.match(feature, /LATENCY_THRESHOLD\s*=\s*5/);
    assert.match(feature, /packet_loss_bad|pl_over_threshold/);
    assert.match(feature, /latency_bad|latency_over_threshold/);
    assert.match(feature, /flag_pl_fail/);
    assert.match(feature, /thi_fail/);
    assert.match(feature, /priority_level/);
    assert.match(feature, /P1/);
    assert.match(feature, /P2/);
    assert.match(charts, /ComposedChart/);
    assert.match(charts, /BarChart/);
  });

  it('uses shared operational chart panels and states', () => {
    const page = src('pages', 'TransportQualityPage.jsx');
    const charts = src('features', 'transport-quality', 'TransportQualityCharts.jsx');
    const surface = `${page}\n${charts}`;

    assert.doesNotMatch(surface, /#22D3EE|#0EA5E9|#38BDF8|text-cyan-|bg-cyan-/i);
    assert.match(surface, /DashboardChartPanel/);
    assert.match(surface, /DashboardChartTooltipContent/);
    assert.match(surface, /DashboardChartEmpty|ChartEmptyState/);
    assert.doesNotMatch(charts, /strokeDasharray="3 3"/);
    assert.match(charts, /var\(--chart-axis\)/);
    assert.doesNotMatch(surface, /box-shadow:\s*0 0|shadow-\[0_0_/i);
  });
});
