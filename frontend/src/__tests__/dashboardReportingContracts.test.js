/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const publicFile = (...parts) => resolve(process.cwd(), 'public', ...parts);
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('dashboard and reporting visual/data contracts', () => {
  it('uses the Telkomsel logo asset in the dashboard header', () => {
    const header = src('components', 'Header.jsx');

    assert.equal(existsSync(publicFile('brand', 'telkomsel-seeklogo.png')), true);
    assert.match(header, /src="\/brand\/telkomsel-seeklogo\.png"/);
    assert.match(header, /alt="Telkomsel"/);
    assert.match(header, /object-contain/);
  });

  it('uses theme-aware classes for map surrounding-site cards and sector legend', () => {
    const map = src('components', 'MapboxMap.jsx');
    const css = src('index.css');

    assert.match(map, /nod-neighbor-card-shell/);
    assert.match(map, /nod-neighbor-card-label/);
    assert.match(map, /nod-sector-legend/);
    assert.match(css, /\.nod-neighbor-card-shell/);
    assert.match(css, /\[data-theme="light"\]\s+\.nod-neighbor-card-shell/);
    assert.match(css, /\.nod-sector-legend/);
    assert.match(css, /\[data-theme="light"\]\s+\.nod-sector-legend/);
    assert.doesNotMatch(map, /background:rgba\(15,23,42,0\.72\)/);
    assert.doesNotMatch(map, /bg-\[#0F172A\]/);
  });

  it('keeps the bottom table filter popover inside the viewport', () => {
    const filterPanel = src('components', 'FilterPanel.jsx');

    assert.match(filterPanel, /buttonRef/);
    assert.match(filterPanel, /panelPosition/);
    assert.match(filterPanel, /createPortal/);
    assert.match(filterPanel, /document\.body/);
    assert.match(filterPanel, /className="fixed/);
    assert.match(filterPanel, /bottom:\s*panelPosition\.bottom/);
    assert.match(filterPanel, /max-h-\[min\(.*100vh/);
    assert.match(filterPanel, /overflow-y-auto/);
    assert.match(filterPanel, /bg-\[var\(--bg-surface\)\]/);
    assert.match(filterPanel, /border-\[var\(--border\)\]/);
  });

  it('wires reporting NOP filter through scorecards, chart, and tables', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const api = src('services', 'api.js');

    assert.match(page, /fetchFilterOptions/);
    assert.match(page, /selectedNop/);
    assert.match(page, /id="reporting-nop"/);
    assert.match(page, /fetchReportingScorecards\(selectedMonth,\s*selectedNop\)/);
    assert.match(page, /fetchRevenueByKabupaten\(selectedMonth,\s*selectedNop\)/);
    assert.match(page, /fetchSiteClassByKabupaten\(selectedMonth,\s*selectedNop\)/);
    assert.match(page, /fetchBatteryByKabupaten\(selectedNop\)/);
    assert.match(page, /fetchRevenueTrend\(selectedNop\)/);
    assert.match(api, /fetchReportingScorecards\(trxMonth,\s*nop/);
    assert.match(api, /fetchRevenueTrend\(nop/);
    assert.match(api, /params:\s*\{[\s\S]*nop:\s*nop\s*\|\|\s*undefined/);
  });

  it('renames the chart and uses dynamic revenue and payload domains', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /Performance Chart|Performance Trend/);
    assert.doesNotMatch(page, />Revenue Trend</);
    assert.match(page, /getPaddedDomain/);
    assert.match(page, /revenueDomain/);
    assert.match(page, /payloadDomain/);
    assert.match(page, /domain=\{revenueDomain\}/);
    assert.match(page, /domain=\{payloadDomain\}/);
  });

  it('uses Rupiah-friendly reporting icons and compact right-side chart axes', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /Banknote/);
    assert.doesNotMatch(page, /DollarSign/);
    assert.match(page, /formatPayloadAxisTick/);
    assert.match(page, /formatAvailabilityAxisTick/);
    assert.match(page, /tickFormatter=\{formatPayloadAxisTick\}/);
    assert.match(page, /tickFormatter=\{formatAvailabilityAxisTick\}/);
  });

  it('shows previous-month deltas on scorecards and key revenue table metrics', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /previousMonth/);
    assert.match(page, /fetchReportingScorecards\(previousMonth,\s*selectedNop\)/);
    assert.match(page, /fetchRevenueByKabupaten\(previousMonth,\s*selectedNop\)/);
    assert.match(page, /DeltaValue/);
    assert.match(page, /getDelta/);
    assert.match(page, /getRelativeChange/);
    assert.match(page, /formatter=\{formatRevenueShort\}/);
    assert.match(page, /formatter=\{formatPayload\}/);
    assert.match(page, /formatter=\{formatPercent\}/);
  });

  it('defaults Reporting to SIDOARJO and renders site composition, relative MoM, and YTD metadata', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /relative z-10 px-3 py-3 flex flex-col gap-3 xl:px-6 xl:flex-row xl:items-center xl:justify-between/);
    assert.match(page, /reporting-header-controls flex w-full flex-wrap/);
    assert.match(page, /REPORTING_DEFAULT_NOP\s*=\s*'SIDOARJO'/);
    assert.match(page, /normalizeReportingNop/);
    assert.match(page, /setSelectedNop/);
    assert.match(page, /const \[filtersReady, setFiltersReady\] = useState\(false\)/);
    assert.match(page, /if \(!filtersReady\) return/);
    assert.match(page, /if \(!selectedMonth \|\| !filtersReady\) return/);
    assert.match(page, /epm_sites/);
    assert.match(page, /non_epm_sites/);
    assert.match(page, /revenue_ytd/);
    assert.match(page, /payload_ytd/);
    assert.match(page, /getRelativeChange/);
    assert.match(page, /formatRelativePercent/);
    assert.match(page, /EPM/);
    assert.match(page, /Site \(non EPM\)/);
    assert.match(page, /YTD/);
    assert.doesNotMatch(page, /site dengan data traktor/);
    assert.doesNotMatch(page, /subtitle="total data usage"/);
    assert.doesNotMatch(page, /subtitle="rata-rata availability jaringan"/);
  });

  it('keeps revenue detail columns collapsed behind a table toggle after availability', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /showRevenueDetails/);
    assert.match(page, /setShowRevenueDetails/);
    assert.match(page, /aria-expanded=\{showRevenueDetails\}/);
    assert.match(page, /Detail Revenue/);
    assert.match(page, /showRevenueDetails\s*&&[\s\S]*Rev Voice/);
    assert.match(page, /Availability[\s\S]*showRevenueDetails\s*&&[\s\S]*Rev Voice/);
  });

  it('renames reporting revenue table to Performance Table and adds ticket/proker columns', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const api = src('services', 'api.js');

    assert.match(page, /Performance Table/);
    assert.doesNotMatch(page, /Revenue & Payload by Kabupaten\/Kota/);
    assert.match(page, /Ticket SWFM/);
    assert.match(page, /Proker Activity/);
    assert.match(page, /ticket_swfm_bps/);
    assert.match(page, /ticket_swfm_ts/);
    assert.match(page, /proker_open/);
    assert.match(page, /proker_closed/);
    assert.match(api, /fetchRevenueByKabupaten/);
  });

  it('adds an executive insight band above the performance chart', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');

    assert.match(page, /Executive Insight/);
    assert.match(page, /performanceInsights/);
    assert.match(page, /reporting-executive-insight/);
    assert.match(page, /insight-card-grid/);
    assert.match(page, /<ExecutiveInsightPanel insights=\{performanceInsights\} \/>[\s\S]*\{\/\* Performance Trend Chart \*\/\}/);
    assert.doesNotMatch(page, /<h2[^>]*>Performance Trend<\/h2>[\s\S]*<ExecutiveInsightPanel insights=\{performanceInsights\} \/>/);
    assert.doesNotMatch(page, /lg:grid-cols-\[3fr_1fr\]/);
    assert.match(page, /InsightCard/);
    assert.match(page, /Auto-generated dari data/);
    assert.match(page, /Revenue melampaui target|Revenue di bawah target/);
    assert.match(page, /Availability turun/);
    assert.match(page, /Payload.*tertinggi/);
    assert.match(page, /getRevenueContributorInsight/);
    assert.match(page, /getAvailabilityTrendInsight/);
    assert.match(page, /getPayloadPeakInsight/);
    assert.match(page, /REVENUE_TARGET/);
    assert.match(page, /summary/);
    assert.match(page, /detail/);
    assert.match(page, /summaryText: 'text-slate-900'/);
    assert.match(page, /detailText: 'text-slate-700'/);
    assert.match(page, /labelText: 'text-slate-600'/);
  });

  it('adds a print-to-PDF export action for the reporting page', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const css = src('index.css');

    assert.match(page, /FileDown/);
    assert.match(page, /handleExportPdf/);
    assert.match(page, /window\.print\(\)/);
    assert.match(page, /aria-label="Export reporting to PDF"/);
    assert.match(page, /Export PDF/);
    assert.match(page, /reporting-export-root/);
    assert.match(css, /@media print/);
    assert.match(css, /\.reporting-no-print/);
    assert.match(css, /\.reporting-export-root/);
  });

  it('wires the Impact Service route, navigation, global filters, and API params', () => {
    const app = src('App.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const impactPagePath = srcPath('pages', 'ImpactServicePage.jsx');
    assert.equal(existsSync(impactPagePath), true);
    const page = readFileSync(impactPagePath, 'utf8');
    const api = src('services', 'api.js');

    assert.match(app, /ImpactServicePage/);
    assert.match(app, /path="\/impact-service"/);
    assert.match(sidebar, /to: '\/impact-service'/);
    assert.match(sidebar, /Impact Service/);

    assert.match(page, /id="impact-start-date"/);
    assert.match(page, /id="impact-end-date"/);
    assert.match(page, /id="impact-nop"/);
    assert.match(page, /default_date:\s*filters\?\.default_date\s*\|\|\s*null/);
    assert.match(page, /has_today_data:\s*Boolean\(filters\?\.has_today_data\)/);
    assert.match(page, /const defaultDate = [a-zA-Z0-9_]+\.default_date \|\| [a-zA-Z0-9_]+\.max_date/);
    assert.match(page, /setStartDate\(defaultDate\)/);
    assert.match(page, /setEndDate\(defaultDate\)/);
    assert.doesNotMatch(page, /max=\{filterOptions\.max_date \|\| undefined\}/);
    assert.match(page, /handleStartDateChange/);
    assert.match(page, /handleEndDateChange/);
    assert.match(page, /ImpactServiceErrorBoundary/);
    assert.match(page, /componentDidCatch/);
    assert.match(page, /fetchImpactServiceSummary\(queryParams\)/);
    assert.match(page, /fetchImpactServiceDailyTrend\(queryParams\)/);
    assert.match(page, /fetchImpactServiceDistributions\(queryParams\)/);
    assert.match(page, /fetchImpactServiceTopAlarms\(queryParams\)/);
    assert.match(page, /fetchImpactServiceTopSites\(queryParams\)/);
    assert.match(page, /fetchImpactServiceAlarms\(queryParams\)/);
    assert.match(page, /fetchImpactServiceAlarmDetail\(selectedAlarmId,\s*queryParams\)/);

    for (const fn of [
      'fetchImpactServiceFilters',
      'fetchImpactServiceSummary',
      'fetchImpactServiceDailyTrend',
      'fetchImpactServiceDistributions',
      'fetchImpactServiceTopAlarms',
      'fetchImpactServiceTopSites',
      'fetchImpactServiceAlarms',
      'fetchImpactServiceAlarmDetail',
    ]) {
      assert.match(api, new RegExp(`export async function ${fn}`));
    }

    assert.match(api, /\/impact-service\/summary/);
    assert.match(api, /\/impact-service\/filters',\s*\{/);
    assert.match(api, /Date\.now\(\)/);
    assert.match(api, /Cache-Control': 'no-cache'/);
    assert.match(api, /params:\s*params/);
  });

  it('renders the Impact Service operational dashboard sections', () => {
    const impactPagePath = srcPath('pages', 'ImpactServicePage.jsx');
    assert.equal(existsSync(impactPagePath), true);
    const page = readFileSync(impactPagePath, 'utf8');

    for (const label of [
      'Alarm Impact Service',
      'Impacted Site',
      'OPEN Alarm',
      'CLEAR Alarm',
      'SOW TSEL',
      'Last 7 Days Trend',
      'Status by Severity',
      'Category Distribution',
      'Aging Range',
      'NOP Contribution',
      'Top Impacted Sites',
      'Top Alarm Names',
      'Alarm Detail Table',
    ]) {
      assert.match(page, new RegExp(label));
    }

    assert.match(page, /ResponsiveContainer/);
    assert.match(page, /ComposedChart/);
    assert.match(page, /fetchImpactServiceLast7DaysTrend\(last7DaysParams\)/);
    assert.match(page, /row\.id/);
    assert.match(page, /setSelectedAlarmId/);

    const chartSection = page.split('Last 7 Days Trend', 2)[1].split('Category Distribution', 1)[0];
    assert.ok(chartSection.indexOf('NOP Contribution') < chartSection.indexOf('Status by Severity'));

    const tableHeaders = page.split('Alarm Detail Table', 2)[1].split('<tbody', 1)[0];
    assert.match(tableHeaders, /Comment/);
    assert.doesNotMatch(tableHeaders, /Ticket/);
    assert.doesNotMatch(tableHeaders, /PIC/);
  });

  it('shows equal-period delta and percentage on every Impact Service scorecard', () => {
    const page = src('pages', 'ImpactServicePage.jsx');

    for (const contract of [
      'getImpactDelta',
      'formatImpactDelta',
      'isSingleDayRange',
      'previous_total_alarms',
      'previous_impacted_sites',
      'previous_open_alarms',
      'previous_clear_alarms',
      'previous_sow_tsel',
      'vs hari sebelumnya',
      'vs periode sebelumnya',
    ]) {
      assert.match(page, new RegExp(contract));
    }

    assert.match(page, /previousValue === 0 \? null/);
    assert.match(page, /rate == null \? '-'/);
    assert.match(page, /text-emerald-400/);
    assert.match(page, /text-red-400/);
    assert.match(page, /text-\[var\(--text-muted\)\]/);
    assert.match(page, /xl:grid-cols-3 2xl:grid-cols-5/);
    assert.doesNotMatch(page, /whitespace-nowrap text-\[11px\] font-semibold leading-snug/);

    for (const oldSubtitle of [
      'total data alarm',
      'distinct site_id terdampak',
      'status OPEN',
      'status CLEAR',
      'kolom SOW = TSEL',
    ]) {
      assert.doesNotMatch(page, new RegExp(oldSubtitle));
    }
  });
});
