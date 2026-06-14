/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('Activity ENOM dashboard contracts', () => {
  it('wires route, sidebar navigation, and API service functions', () => {
    const app = src('App.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const api = src('services', 'api.js');
    const pagePath = srcPath('pages', 'ActivityEnomPage.jsx');

    assert.equal(existsSync(pagePath), true);
    assert.match(app, /ActivityEnomPage/);
    assert.match(app, /path="\/activity-enom"/);
    assert.match(sidebar, /to: '\/activity-enom'/);
    assert.match(sidebar, /Activity ENOM/);

    for (const fn of [
      'fetchActivityEnomFilters',
      'fetchActivityEnomSummary',
      'fetchActivityEnomTrend',
      'fetchActivityEnomBreakdowns',
      'fetchActivityEnomTopActivities',
      'fetchActivityEnomActivities',
      'fetchActivityEnomActivityDetail',
    ]) {
      assert.match(api, new RegExp(`export async function ${fn}`));
    }

    assert.match(api, /\/activity-enom\/filters/);
    assert.match(api, /Date\.now\(\)/);
    assert.match(api, /Cache-Control': 'no-cache'/);
  });

  it('renders global filters, chart sections, NOP ranking, and sortable table', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');
    const charts = src('features', 'activity-enom', 'ActivityEnomCharts.jsx');
    const config = src('features', 'activity-enom', 'activityEnomChartConfig.js');
    const feature = `${page}\n${charts}\n${config}`;

    for (const label of [
      'Activity ENOM',
      'Bulan',
      'NOP',
      'Kategori',
      'Total Activity',
      'Impacted Site',
      'OPEN Activity',
      'CLOSE Activity',
      'Completion Rate',
      'Monthly Activity Trend',
      'NOP Contribution',
      'Kabupaten Contribution',
      'Kategori Distribution',
      'Top Activity',
      'Week Done Progress',
      'Ranking NOP',
      'Ranking Kabupaten',
      'Activity Detail Table',
    ]) {
      assert.match(feature, new RegExp(label));
    }

    assert.match(page, /Intl\.DateTimeFormat\('id-ID',\s*\{\s*month:\s*'long'/);
    assert.match(page, /selectedNop\s*\?\s*'Kabupaten Contribution'\s*:\s*'NOP Contribution'/);
    assert.match(page, /selectedNop\s*\?\s*'Ranking Kabupaten'\s*:\s*'Ranking NOP'/);
    assert.match(page, /ActivityEnomCharts/);
    assert.doesNotMatch(page, /ResponsiveContainer/);
    assert.match(charts, /ChartContainer/g);
    assert.match(charts, /DashboardChartTooltipContent/);
    assert.match(charts, /DashboardChartLegend/);
    assert.match(charts, /accessibilityLayer/g);
    assert.match(charts, /radius=\{DASHBOARD_BAR_RADIUS\}/);
    assert.match(charts, /ComposedChart/);
    assert.match(charts, /<Line[\s\S]*dataKey="total"/);
    assert.match(charts, /dataKey="open"/);
    assert.match(charts, /dataKey="close"/);
    assert.match(charts, /dataKey="total"/);
    assert.match(charts, /layout="vertical"/);
    assert.match(charts, /breakdowns\.ranking/);
    assert.match(page, /fetchActivityEnomActivityDetail\(selectedActivityId/);
    assert.match(page, /sort_by:\s*sortBy/);
    assert.match(page, /sort_dir:\s*sortDir/);
    assert.doesNotMatch(page, /Activity Breakdown/);
    assert.doesNotMatch(page, /setActivityCategory/);
    assert.doesNotMatch(page, /activity_category/);
  });

  it('uses a compact dashboard grid with tall ranking and aligned activity panels', () => {
    const charts = src('features', 'activity-enom', 'ActivityEnomCharts.jsx');
    const page = src('pages', 'ActivityEnomPage.jsx');

    assert.match(charts, /data-testid="activity-dashboard-chart-grid"/);
    assert.match(charts, /xl:grid-cols-3/);
    assert.match(charts, /data-testid="activity-monthly-trend-panel"[\s\S]*xl:col-span-2/);
    assert.match(charts, /data-testid="activity-ranking-panel"[\s\S]*xl:row-span-2/);
    assert.match(charts, /h-\[260px\]\s+xl:h-\[608px\]/);
    assert.match(charts, /data-testid="activity-top-activity-panel"[\s\S]*xl:col-span-2/);
    assert.match(charts, /data-testid="activity-top-activity-table"[\s\S]*h-\[260px\]/);
    assert.match(charts, /topActivities/);

    const contributionIndex = charts.indexOf('data-testid="activity-contribution-panel"');
    const categoryIndex = charts.indexOf('data-testid="activity-category-panel"');
    const topActivityIndex = charts.indexOf('data-testid="activity-top-activity-panel"');
    const weekDoneIndex = charts.indexOf('data-testid="activity-week-done-panel"');

    assert.ok(contributionIndex >= 0);
    assert.ok(categoryIndex > contributionIndex);
    assert.ok(topActivityIndex > categoryIndex);
    assert.ok(weekDoneIndex > topActivityIndex);
    assert.match(page, /topActivities=\{topActivities\}/);
    assert.doesNotMatch(page, /DashboardChartPanel title="Top Activity"/);
  });

  it('uses a compact table toolbar and sortable headers for every backend-supported column', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');

    assert.match(page, /const ACTIVITY_TABLE_COLUMNS = \[/);
    for (const sortKey of [
      'create_date',
      'site_id',
      'site_name',
      'nop',
      'kabupaten',
      'part',
      'activity',
      'status',
      'week_done',
      'date_done',
    ]) {
      assert.match(page, new RegExp(`sortKey: '${sortKey}'`));
    }

    assert.match(page, /const handleTableSort = useCallback/);
    assert.match(page, /onClick=\{\(\) => handleTableSort\(column\.sortKey\)\}/);
    assert.match(page, /aria-sort=\{/);
    assert.match(page, /data-testid=\{`activity-enom-sort-\$\{column\.sortKey\}`\}/);
    assert.match(page, /CaretUpIcon/);
    assert.match(page, /CaretDownIcon/);
    assert.match(page, /data-testid="activity-enom-table-toolbar"/);
    assert.doesNotMatch(page, /id="activity-enom-sort-by"/);
    assert.doesNotMatch(page, /id="activity-enom-sort-dir"/);
  });

  it('uses shared shadcn controls and isolates table requests from dashboard requests', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');

    for (const component of [
      'DashboardFilterBar',
      'DashboardPeriodPicker',
      'DashboardCombobox',
      'DashboardSearchInput',
      'DashboardFilterSelect',
      'DashboardTableToolbar',
      'DashboardPagination',
    ]) {
      assert.match(page, new RegExp(component));
    }

    assert.match(page, /useDebouncedValue\(search,\s*300\)/);
    assert.match(page, /const dashboardParams = useMemo/);
    assert.match(page, /const tableParams = useMemo/);
    assert.match(page, /fetchActivityEnomActivities\(tableParams\)/);
    assert.match(page, /dashboardLoading/);
    assert.match(page, /tableLoading/);
    assert.match(page, /resetTableFilters/);
    assert.match(page, /Reset tabel/);
    assert.match(page, /AlertTitle/);
    assert.match(page, /AlertDescription/);
    assert.doesNotMatch(page, /DashboardSelect/);
    assert.doesNotMatch(page, /DashboardInput/);
    assert.doesNotMatch(page, /<select/);
    assert.doesNotMatch(page, /<input/);

    const dashboardRequestBlock = page.split('Promise.all([', 2)[1].split('])', 1)[0];
    assert.doesNotMatch(dashboardRequestBlock, /fetchActivityEnomActivities/);
  });

  it('keeps XCEK and Workshop out of the visible table columns while retaining detail data', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');
    const columnConfig = page.split('const ACTIVITY_TABLE_COLUMNS = [', 2)[1].split('];', 1)[0];
    const tableSection = page.split('Activity Detail Table', 2)[1].split('ActivityDetailModal', 1)[0];

    for (const column of [
      'Bulan',
      'Site ID',
      'Site Name',
      'NOP',
      'Kabupaten',
      'Kategori',
      'Activity',
      'Status',
      'Week Done',
      'Date Done',
    ]) {
      assert.match(columnConfig, new RegExp(column));
    }

    assert.doesNotMatch(tableSection, /XCEK/);
    assert.doesNotMatch(tableSection, /Workshop/);
    assert.match(page, /detail\?\.xcek/);
    assert.match(page, /detail\?\.workshop/);
    assert.match(page, /onClick=\{onClose\}/);
    assert.match(page, /stopPropagation/);
  });

  it('removes scorecard sub-labels from Activity ENOM KPI cards', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');
    const scorecardSection = page.split('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5', 2)[1].split('</section>', 1)[0];

    assert.match(scorecardSection, /DashboardKpiCard title="Total Activity"/);
    assert.match(scorecardSection, /DashboardKpiCard title="Completion Rate"/);
    assert.doesNotMatch(scorecardSection, /subtitle=/);
  });
});
