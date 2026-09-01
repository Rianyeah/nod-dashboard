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

  it('uses a theme-aware sector legend without floating surrounding-site cards', () => {
    const map = src('components', 'MapboxMap.jsx');
    const css = src('index.css');

    assert.doesNotMatch(map, /nod-neighbor-card-shell|nod-neighbor-card-label/);
    assert.match(map, /nod-sector-legend/);
    assert.match(css, /\.nod-sector-legend/);
    assert.match(css, /\[data-theme="light"\]\s+\.nod-sector-legend/);
    assert.doesNotMatch(map, /background:rgba\(15,23,42,0\.72\)/);
    assert.doesNotMatch(map, /bg-\[#0F172A\]/);
  });

  it('uses the adaptive shadcn sheet for bottom table filters', () => {
    const filterPanel = src('components', 'FilterPanel.jsx');

    assert.match(filterPanel, /DashboardFilterSheet/);
    assert.match(filterPanel, /DashboardCombobox/);
    assert.match(filterPanel, /DashboardFilterChips/);
    assert.match(filterPanel, /onApply=\{onFilterChange\}/);
    assert.doesNotMatch(filterPanel, /createPortal/);
    assert.doesNotMatch(filterPanel, /<select/);
  });

  it('uses consolidated reporting endpoints and the Regional Jatim scope', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const api = src('services', 'api.js');

    assert.match(page, /fetchReportingOverview\(selectedPeriod, selectedNop/);
    assert.match(page, /fetchReportingAreas\(selectedPeriod, selectedNop/);
    assert.match(page, /allLabel="Regional Jatim"/);
    assert.doesNotMatch(page, /fetchSiteClassByKabupaten/);
    for (const endpoint of ['/reporting/overview', '/reporting/areas', '/reporting/pivot']) {
      assert.match(api, new RegExp(endpoint));
    }
  });

  it('keeps the reporting overview compact and separates reusable analysis surfaces', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const chartConfig = src('features', 'reporting', 'reportingChartConfig.js');

    for (const component of ['ReportingScorecards', 'ReportingCoverageStrip', 'ReportingExecutiveInsights', 'ReportingPerformanceTrend', 'ReportingAreaTable', 'ReportingPivot', 'ReportingSiteDrilldown']) {
      assert.match(page, new RegExp(component));
    }
    assert.match(chartConfig, /Revenue/);
    assert.match(chartConfig, /Payload/);
    assert.match(chartConfig, /Availability/);
    assert.doesNotMatch(page, /Site Class by Kabupaten|fetchSiteClassByKabupaten/);
  });

  it('shows coverage, source refresh, target status, and numeric contribution without AI filler', () => {
    const coverage = src('features', 'reporting', 'ReportingCoverageStrip.jsx');
    const insights = src('features', 'reporting', 'reportingInsights.js');
    const feature = `${coverage}\n${insights}`;

    for (const contract of ['last_refreshed_at', 'latest_data_period', 'missing_periods', 'Revenue', 'Availability', 'Payload', 'contribution_pct', 'difference_pp', 'outage']) {
      assert.match(feature, new RegExp(contract));
    }
    assert.doesNotMatch(feature, /Auto-generated|\bAI\b|kapasitas|headroom|saturation/i);
    assert.doesNotMatch(feature, /REVENUE_TARGET/);
  });

  it('supports Kabupaten to site drill-down, ranking, SLA, site class, and mobile cards', () => {
    const areaTable = src('features', 'reporting', 'ReportingAreaTable.jsx');
    const drilldown = src('features', 'reporting', 'ReportingSiteDrilldown.jsx');

    assert.match(areaTable, /Top 10/);
    assert.match(areaTable, /Bottom 10/);
    assert.match(areaTable, /md:hidden/);
    assert.match(drilldown, /reporting-site-class/);
    assert.match(drilldown, /data-\[side=right\]:w-full data-\[side=right\]:sm:max-w-4xl/);
    assert.match(drilldown, /site_class/);
    assert.match(drilldown, /sla_status/);
    assert.match(drilldown, /md:hidden/);
    assert.match(drilldown, /fetchReportingSites/);
  });

  it('provides a guarded dynamic pivot with two rows, one column, and three values', () => {
    const pivot = src('features', 'reporting', 'ReportingPivot.jsx');
    const state = src('features', 'reporting', 'reportingPivotState.js');

    assert.match(pivot, /pivot-row-primary/);
    assert.match(pivot, /pivot-row-secondary/);
    assert.match(pivot, /pivot-column/);
    assert.match(pivot, /Nilai \(maks\. 3\)/);
    assert.match(pivot, /Terapkan Pivot/);
    assert.match(state, /Maksimal 2 baris, 1 kolom, dan 3 nilai/);
    assert.match(pivot, /pivot_too_large/);
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
    assert.match(page, /reporting-print-meta/);
    assert.match(page, /Waktu cetak/);
    assert.match(page, /Perbandingan/);
    assert.match(page, /Coverage/);
    assert.match(css, /\.reporting-print-meta/);
  });

  it('applies a canonical month range to every reporting surface', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const api = src('services', 'api.js');

    assert.match(page, /DashboardMonthRangePicker/);
    assert.match(page, /buildMonthRange/);
    assert.match(page, /formatMonthRangeLabel/);
    assert.match(page, /comparisonLabel/);
    assert.match(page, /ReportingCoverageStrip/);
    assert.match(page, /ReportingSiteDrilldown/);
    assert.match(page, /ReportingPivot/);
    assert.match(api, /period_start:\s*period\?\.start/);
    assert.match(api, /period_end:\s*period\?\.end/);
  });

  it('wires the Impact Service route, navigation, global filters, and API params', () => {
    const app = src('App.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const impactPagePath = srcPath('pages', 'ImpactServicePage.jsx');
    assert.equal(existsSync(impactPagePath), true);
    const page = readFileSync(impactPagePath, 'utf8');
    const filters = src('features', 'impact-service', 'ImpactServiceFilters.jsx');
    const states = src('features', 'impact-service', 'ImpactServiceStates.jsx');
    const api = src('services', 'api.js');

    assert.match(app, /ImpactServicePage/);
    assert.match(app, /React\.lazy/);
    assert.match(app, /path="\/impact-service"/);
    assert.match(sidebar, /to: '\/impact-service'/);
    assert.match(sidebar, /Impact Service/);

    assert.match(filters, /id="impact-date-range"/);
    assert.match(filters, /id="impact-nop"/);
    assert.match(filters, /DashboardDateRangePicker/);
    assert.match(filters, /DashboardCombobox/);
    assert.match(filters, /Reset/);
    assert.doesNotMatch(filters, /max=/);
    assert.match(page, /default_date:\s*filters\?\.default_date\s*\|\|\s*null/);
    assert.match(page, /has_today_data:\s*Boolean\(filters\?\.has_today_data\)/);
    assert.match(page, /const defaultDate = [a-zA-Z0-9_]+\.default_date \|\| [a-zA-Z0-9_]+\.max_date/);
    assert.match(page, /setStartDate\(defaultDate\)/);
    assert.match(page, /setEndDate\(defaultDate\)/);
    assert.match(page, /handleApplyRange/);
    assert.match(page, /handleReset/);
    assert.match(page, /ImpactServiceErrorBoundary/);
    assert.match(states, /componentDidCatch/);
    assert.match(page, /fetchImpactServiceSummary\(dashboardParams\)/);
    assert.match(page, /fetchImpactServiceDailyTrend\(trendParams\)/);
    assert.match(page, /fetchImpactServiceDistributions\(dashboardParams\)/);
    assert.match(page, /fetchImpactServiceTopAlarms\(dashboardParams\)/);
    assert.match(page, /fetchImpactServiceTopSites\(dashboardParams\)/);
    assert.match(page, /fetchImpactServiceAlarms\(tableParams\)/);
    assert.match(page, /fetchImpactServiceAlarmDetail\(selectedAlarmId,\s*detailParams\)/);
    assert.match(page, /getSevenDayWindow\(endDate\)/);
    assert.doesNotMatch(page, /fetchImpactServiceLast7DaysTrend/);

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
    const charts = src('features', 'impact-service', 'ImpactServiceCharts.jsx');
    const kpis = src('features', 'impact-service', 'ImpactServiceKpiGrid.jsx');
    const topAlarms = src('features', 'impact-service', 'ImpactServiceTopAlarms.jsx');
    const table = src('features', 'impact-service', 'ImpactServiceAlarmTable.jsx');
    const dialog = src('features', 'impact-service', 'ImpactServiceAlarmDialog.jsx');
    const feature = [page, charts, kpis, topAlarms, table, dialog].join('\n');

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
      assert.match(feature, new RegExp(label));
    }

    assert.match(charts, /ChartContainer/);
    assert.match(charts, /ComposedChart/);
    assert.match(charts, /accessibilityLayer/);
    assert.doesNotMatch(page, /fetchImpactServiceLast7DaysTrend/);
    assert.match(table, /row\.id/);
    assert.match(page, /setSelectedAlarmId/);

    assert.ok(charts.indexOf('NOP Contribution') < charts.indexOf('Status by Severity'));
    assert.match(table, /'Comment'/);
    assert.doesNotMatch(table.split('const headers', 2)[1].split('];', 1)[0], /Ticket|PIC/);
    assert.match(dialog, /DialogTitle/);
  });

  it('shows equal-period delta and percentage on every Impact Service scorecard', () => {
    const page = src('pages', 'ImpactServicePage.jsx');
    const kpis = src('features', 'impact-service', 'ImpactServiceKpiGrid.jsx');
    const feature = `${page}\n${kpis}`;

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
      assert.match(feature, new RegExp(contract));
    }

    assert.match(kpis, /previousValue === 0 \? null/);
    assert.match(kpis, /rate == null/);
    assert.match(kpis, /text-emerald-400/);
    assert.match(kpis, /text-red-400/);
    assert.match(kpis, /text-\[var\(--text-muted\)\]/);
    assert.match(kpis, /xl:grid-cols-3 2xl:grid-cols-5/);
    assert.doesNotMatch(kpis, /whitespace-nowrap text-\[11px\] font-semibold leading-snug/);

    for (const oldSubtitle of [
      'total data alarm',
      'distinct site_id terdampak',
      'status OPEN',
      'status CLEAR',
      'kolom SOW = TSEL',
    ]) {
      assert.doesNotMatch(feature, new RegExp(oldSubtitle));
    }
  });

  it('uses the graphite reporting chart language', () => {
    const page = src('pages', 'NetworkReportingPage.jsx');
    const trend = src('features', 'reporting', 'ReportingPerformanceTrend.jsx');
    const chartConfig = src('features', 'reporting', 'reportingChartConfig.js');

    assert.doesNotMatch(`${page}\n${trend}`, /text-cyan-|bg-cyan-|border-cyan-|#22D3EE|#0EA5E9|#38BDF8/i);
    assert.doesNotMatch(`${page}\n${trend}`, /shadow-\[0_0_|blur-sm/);
    assert.match(trend, /DashboardChartPanel/);
    assert.match(`${trend}\n${chartConfig}`, /reportingChartConfig/);
  });

  it('restores the approved scorecard hierarchy, insight panel, and smooth trend', () => {
    const scorecards = src('features', 'reporting', 'ReportingScorecards.jsx');
    const insights = src('features', 'reporting', 'ReportingExecutiveInsights.jsx');
    const trend = src('features', 'reporting', 'ReportingPerformanceTrend.jsx');

    assert.match(scorecards, /EPM/);
    assert.match(scorecards, /Site \(non EPM\)/);
    assert.match(scorecards, /YTD/);
    assert.match(scorecards, /Kontribusi NOP/);
    assert.match(insights, /Executive Insight/);
    assert.doesNotMatch(insights, /Auto-generated|AI generated/i);
    assert.match(trend, /type="monotone"/);
    assert.match(trend, /linearGradient/);
  });
});
