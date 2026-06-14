/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('Transport Quality dashboard contracts', () => {
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
    assert.match(charts, /LineChart/);
    assert.match(charts, /BarChart/);
  });
});
