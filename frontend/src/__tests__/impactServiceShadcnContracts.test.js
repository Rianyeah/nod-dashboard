/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = (...parts) => resolve(process.cwd(), ...parts);
const src = (...parts) => readFileSync(root('src', ...parts), 'utf8');

describe('Impact Service shadcn migration contracts', () => {
  it('configures shadcn for the JavaScript Vite application', () => {
    const config = JSON.parse(readFileSync(root('components.json'), 'utf8'));
    const vite = readFileSync(root('vite.config.js'), 'utf8');
    const jsconfig = JSON.parse(readFileSync(root('jsconfig.json'), 'utf8'));

    assert.equal(config.rsc, false);
    assert.equal(config.tsx, false);
    assert.equal(config.tailwind.css, 'src/index.css');
    assert.equal(config.iconLibrary, 'phosphor');
    assert.deepEqual(jsconfig.compilerOptions.paths['@/*'], ['./src/*']);
    assert.match(vite, /alias:\s*\{[\s\S]*'@':\s*path\.resolve/);
  });

  it('provides the required shadcn primitives and NOC semantic tokens', () => {
    for (const component of [
      'alert',
      'badge',
      'button',
      'calendar',
      'card',
      'chart',
      'dialog',
      'empty',
      'field',
      'input-group',
      'pagination',
      'popover',
      'scroll-area',
      'select',
      'separator',
      'skeleton',
      'table',
      'tooltip',
    ]) {
      assert.equal(existsSync(root('src', 'components', 'ui', `${component}.jsx`)), true, component);
    }

    const css = src('index.css');
    for (const contract of [
      '@custom-variant dark (&:is([data-theme="dark"] *))',
      '--noc-radius-lg',
      '--background: var(--bg-base)',
      '--card: var(--bg-surface)',
      '--chart-1: var(--primary-light)',
      '--chart-2: var(--danger)',
      '--chart-3: var(--success)',
      '--chart-4: var(--warning)',
    ]) {
      assert.match(css, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('splits Impact Service into focused feature modules', () => {
    for (const file of [
      'ImpactServiceHeader.jsx',
      'ImpactServiceFilters.jsx',
      'ImpactServiceKpiGrid.jsx',
      'ImpactServiceCharts.jsx',
      'ImpactServiceTopAlarms.jsx',
      'ImpactServiceAlarmTable.jsx',
      'ImpactServiceAlarmDialog.jsx',
      'ImpactServiceStates.jsx',
      'impactServiceChartConfig.js',
      'impactServiceDateRange.js',
    ]) {
      assert.equal(existsSync(root('src', 'features', 'impact-service', file)), true, file);
    }
  });

  it('uses shadcn chart composition and the approved chart types', () => {
    const charts = src('features', 'impact-service', 'ImpactServiceCharts.jsx');

    for (const contract of [
      'ChartContainer',
      'ChartTooltip',
      'ChartTooltipContent',
      'ChartLegend',
      'ChartLegendContent',
      'accessibilityLayer',
      'Last 7 Days Trend',
      'NOP Contribution',
      'Top Impacted Sites',
      'Status by Severity',
      'Category Distribution',
      'Aging Range',
    ]) {
      assert.match(charts, new RegExp(contract));
    }

    assert.match(charts, /BarChart[\s\S]*layout="vertical"[\s\S]*dataKey="open"[\s\S]*dataKey="clear"/);
    assert.match(charts, /by_category\.slice\(0,\s*8\)/);
    assert.match(charts, /PieChart/);
    assert.match(charts, /<Pie[\s\S]*dataKey="total"[\s\S]*nameKey="label"/);
    assert.match(charts, /sm:grid-cols-\[214px_minmax\(0,1fr\)\]/);
    assert.match(charts, /h-\[214px\][^"]*max-w-\[214px\]/);
    assert.match(charts, /innerRadius=\{60\}/);
    assert.match(charts, /outerRadius=\{90\}/);
    assert.match(charts, /aria-label="Category values"[^>]*sm:pl-6/);
    assert.match(charts, /categoryTotal/);
    assert.match(charts, /Cell/);
  });

  it('uses the approved KPI hierarchy and readable chart value labels', () => {
    const kpis = src('features', 'impact-service', 'ImpactServiceKpiGrid.jsx');
    const charts = src('features', 'impact-service', 'ImpactServiceCharts.jsx');
    const segmentLabel = charts.split('function SegmentValueLabel', 2)[1].split('function BarValueLabel', 1)[0];
    const barLabel = charts.split('function BarValueLabel', 2)[1].split('function DonutCenterLabel', 1)[0];

    assert.match(kpis, /flex items-center gap-2[\s\S]*<Icon[\s\S]*<CardTitle/);
    assert.match(kpis, /text-\[38px\]/);

    assert.match(charts, /function SegmentValueLabel/);
    assert.match(charts, /fontSize=\{13\}/);
    assert.match(charts, /dataKey="open"[\s\S]*<LabelList/);
    assert.match(charts, /dataKey="clear"[\s\S]*<LabelList/);
    assert.match(charts, /interval=\{0\}/);
    assert.match(charts, /site\.site_id \|\| site\.site_name/);
    assert.match(charts, /radius=\{\[8,\s*8,\s*8,\s*8\]\}/);
    assert.doesNotMatch(charts, /dataKey="total"\s+position="top"/);
    assert.doesNotMatch(segmentLabel, /\bstroke=/);
    assert.doesNotMatch(segmentLabel, /\bstrokeWidth=/);
    assert.doesNotMatch(segmentLabel, /\bpaintOrder=/);
    assert.doesNotMatch(barLabel, /\bstroke=/);
    assert.doesNotMatch(barLabel, /\bstrokeWidth=/);
    assert.doesNotMatch(barLabel, /\bpaintOrder=/);
  });

  it('uses shadcn controls, table states, pagination, and dialog semantics', () => {
    const filters = src('features', 'impact-service', 'ImpactServiceFilters.jsx');
    const table = src('features', 'impact-service', 'ImpactServiceAlarmTable.jsx');
    const dialog = src('features', 'impact-service', 'ImpactServiceAlarmDialog.jsx');

    assert.match(filters, /DashboardFilterBar/);
    assert.match(filters, /DashboardDateRangePicker/);
    assert.match(filters, /DashboardCombobox/);
    assert.match(filters, /triggerTestId="impact-date-range-trigger"/);
    assert.match(filters, /applyTestId="impact-date-apply"/);
    assert.match(filters, /minDate=\{minDate\}/);
    assert.match(filters, /Reset/);
    assert.doesNotMatch(filters, /ALL_NOPS_VALUE/);
    assert.doesNotMatch(filters, /@\/components\/ui\/select/);
    assert.doesNotMatch(filters, /@\/components\/ui\/calendar/);
    assert.match(table, /DashboardTableToolbar/);
    assert.match(table, /DashboardSearchInput/);
    assert.match(table, /DashboardFilterSelect/);
    assert.match(table, /DashboardPagination/);
    assert.match(table, /testId="impact-status"/);
    assert.match(table, /previousTestId="impact-prev-page"/);
    assert.match(table, /onResetTable/);
    assert.match(table, /Reset tabel/);
    assert.doesNotMatch(table, /@\/components\/ui\/select/);
    assert.doesNotMatch(table, /@\/components\/ui\/input-group/);
    assert.match(table, /Empty/);
    assert.match(table, /Skeleton/);
    assert.match(dialog, /DialogTitle/);
    assert.match(dialog, /ScrollArea/);
  });

  it('separates dashboard, trend, table, and detail request parameters', () => {
    const page = src('pages', 'ImpactServicePage.jsx');

    for (const contract of [
      'dashboardParams',
      'trendParams',
      'tableParams',
      'detailParams',
      'getSevenDayWindow',
      'fetchImpactServiceDailyTrend(trendParams)',
      'React.lazy',
    ]) {
      assert.match(page + src('App.jsx'), new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.doesNotMatch(page, /fetchImpactServiceLast7DaysTrend/);
  });

  it('supports compact reporting, server sorting, and an isolated print dataset', () => {
    const page = src('pages', 'ImpactServicePage.jsx');
    const table = src('features', 'impact-service', 'ImpactServiceAlarmTable.jsx');
    const charts = src('features', 'impact-service', 'ImpactServiceCharts.jsx');
    const printTable = src('features', 'impact-service', 'ImpactServicePrintAlarmTable.jsx');
    const css = src('index.css');

    assert.match(page, /const \[sortBy,\s*setSortBy\]\s*=\s*useState\('tanggal'\)/);
    assert.match(page, /const \[sortDir,\s*setSortDir\]\s*=\s*useState\('desc'\)/);
    assert.match(page, /sort_by:\s*sortBy/);
    assert.match(page, /sort_dir:\s*sortDir/);
    assert.match(page, /status:\s*'OPEN'/);
    assert.match(page, /sort_by:\s*'severity'/);
    assert.match(page, /sort_dir:\s*'asc'/);
    assert.match(page, /limit:\s*100/);
    assert.match(page, /window\.print\(\)/);
    assert.match(page, /impact-service-report-root/);
    assert.match(page, /space-y-3/);

    assert.match(table, /sortKey:\s*'tanggal'/);
    assert.match(table, /sortKey:\s*'severity'/);
    assert.match(table, /aria-sort=/);
    assert.match(table, /onSortChange/);
    assert.match(table, /impact-sort-/);

    assert.match(charts, /h-\[220px\]/);
    assert.match(printTable, /impact-service-print-only/);
    assert.match(printTable, /OPEN Alarm Prioritas/);
    assert.match(css, /@media print/);
    assert.match(css, /\.impact-service-no-print/);
    assert.match(css, /\.impact-service-print-only/);
    assert.match(css, /\.impact-service-report-root/);
  });
});
