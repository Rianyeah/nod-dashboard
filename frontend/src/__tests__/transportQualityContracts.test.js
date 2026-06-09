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
      assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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

  it('supports collapsing global filters and uses count series in weekly trend', () => {
    const page = src('pages', 'TransportQualityPage.jsx');

    assert.match(page, /filtersCollapsed/);
    assert.match(page, /setFiltersCollapsed/);
    assert.match(page, /aria-expanded={!filtersCollapsed}/);
    assert.match(page, /Collapse Filter/);
    assert.match(page, /Show Filter/);

    const trendSection = page.split('Weekly Quality Trend', 2)[1].split('High Priority Transport', 1)[0];
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
  });

  it('keeps threshold and priority semantics visible in the frontend', () => {
    const page = src('pages', 'TransportQualityPage.jsx');

    assert.match(page, /PL_THRESHOLD\s*=\s*1/);
    assert.match(page, /LATENCY_THRESHOLD\s*=\s*5/);
    assert.match(page, /packet_loss_bad|pl_over_threshold/);
    assert.match(page, /latency_bad|latency_over_threshold/);
    assert.match(page, /flag_pl_fail/);
    assert.match(page, /thi_fail/);
    assert.match(page, /priority_level/);
    assert.match(page, /P1/);
    assert.match(page, /P2/);
    assert.match(page, /ResponsiveContainer/);
    assert.match(page, /LineChart/);
    assert.match(page, /BarChart/);
  });
});
