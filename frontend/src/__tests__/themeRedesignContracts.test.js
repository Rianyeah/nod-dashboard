/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('global dashboard theme redesign contracts', () => {
  it('uses Matte Graphite and Telkomsel Red Edge as the global token source', () => {
    const css = src('index.css');

    for (const token of [
      '--brand-red: #E60012',
      '--bg-base: #0D1015',
      '--bg-surface: #171B23',
      '--bg-elevated: #1D222B',
      '--text-primary: #EEF2F7',
      '--border-strong: rgba(255, 255, 255, 0.10)',
      '--chart-accent: var(--brand-red)',
      '--chart-neutral-1',
      '--chart-neutral-2',
      '--sidebar-active',
      '--canvas-background',
      '[data-theme="light"]',
      '--bg-base: #D9DEE5',
      '--bg-sidebar: #CBD1D9',
      '--bg-surface: #F8FAFC',
      '--border: #C2C9D2',
      '--border-strong: #AEB7C3',
      '--chart-grid',
      '--chart-tooltip-bg',
      '--table-row-hover',
      '--control-bg',
      '--badge-critical-bg',
      '--overlay-scrim',
    ]) {
      assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.doesNotMatch(css, /--primary:\s*#0EA5E9/i);
    assert.doesNotMatch(css, /--shadow-glow:\s*0 0 24px rgba\(14,\s*165,\s*233/);
  });

  it('exposes dashboard theme tokens and shared dashboard UI primitives', () => {
    const hookPath = srcPath('hooks', 'useDashboardThemeTokens.js');
    const primitivePath = srcPath('components', 'ui', 'DashboardPrimitives.jsx');

    assert.equal(existsSync(hookPath), true);
    assert.equal(existsSync(primitivePath), true);

    const hook = readFileSync(hookPath, 'utf8');
    const primitives = readFileSync(primitivePath, 'utf8');

    for (const name of [
      'useDashboardThemeTokens',
      'chartGrid',
      'axisTick',
      'tooltipBg',
      'tableRowHover',
      'chartAccent',
      'chartNeutral1',
      'chartNeutral2',
      'borderStrong',
      'surfaceElevated',
    ]) {
      assert.match(hook, new RegExp(name));
    }

    for (const name of [
      'DashboardKpiCard',
      'DashboardChartPanel',
      'DashboardStatusBadge',
      'DashboardPageHeader',
      'DashboardTableShell',
      'DashboardChartTooltip',
    ]) {
      assert.match(primitives, new RegExp(`export function ${name}`));
    }
  });

  it('uses compact shared headers and restrained operational icon chrome', () => {
    const primitives = src('components', 'ui', 'DashboardPrimitives.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');

    assert.match(primitives, /export function DashboardPanelHeader/);
    assert.match(primitives, /data-density=\{description \? 'normal' : 'compact'\}/);
    assert.match(primitives, /rounded-lg border border-\[var\(--border\)\] bg-\[var\(--surface-soft\)\]/);
    assert.doesNotMatch(primitives, /boxShadow:\s*`0 0 18px/);
    assert.doesNotMatch(primitives, /rounded-full border border-\[var\(--border-light\)\]/);

    assert.match(sidebar, /dashboard-canvas/);
    assert.match(sidebar, /border-l-\[3px\]/);
    assert.match(sidebar, /var\(--sidebar-active\)/);
    assert.doesNotMatch(sidebar, /hover:bg-\[var\(--primary\)\]\/10/);
  });

  it('uses Lucide as the single dashboard icon family', () => {
    const sourceFiles = [
      'components/Header.jsx',
      'components/dashboard-filters/DashboardFilters.jsx',
      'components/ui/calendar.jsx',
      'components/ui/checkbox.jsx',
      'components/ui/command.jsx',
      'components/ui/dialog.jsx',
      'components/ui/pagination.jsx',
      'components/ui/select.jsx',
      'components/ui/sheet.jsx',
      'features/data-potensi/DataPotensiSiteTable.jsx',
      'features/impact-service/ImpactServiceAlarmDialog.jsx',
      'features/impact-service/ImpactServiceAlarmTable.jsx',
      'features/impact-service/ImpactServiceCharts.jsx',
      'features/impact-service/ImpactServiceFilters.jsx',
      'features/impact-service/ImpactServiceHeader.jsx',
      'features/impact-service/ImpactServiceKpiGrid.jsx',
      'features/impact-service/ImpactServiceStates.jsx',
      'features/impact-service/ImpactServiceTopAlarms.jsx',
      'features/rf-tilt/RfTiltAntennaSpecPanel.jsx',
      'features/rf-tilt/RfTiltExportButton.jsx',
      'features/rf-tilt/RfTiltParamForm.jsx',
      'pages/ActivityEnomPage.jsx',
      'pages/TicketingPage.jsx',
      'pages/TransportQualityPage.jsx',
    ];

    for (const file of sourceFiles) {
      const source = src(...file.split('/'));
      assert.doesNotMatch(source, /@phosphor-icons\/react/, file);
    }

    const componentsConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'components.json'), 'utf8'),
    );
    assert.equal(componentsConfig.iconLibrary, 'lucide');

    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    const legacyIconPackage = ['@phosphor-icons', 'react'].join('/');
    assert.equal(legacyIconPackage in packageJson.dependencies, false);
  });

  it('migrates authenticated dashboard surfaces to shared primitives and theme-aware charts', () => {
    for (const pageName of [
      'HomePage.jsx',
      'NetworkReportingPage.jsx',
    ]) {
      const page = src('pages', pageName);
      assert.match(page, /DashboardKpiCard|DashboardChartPanel|DashboardStatusBadge|DashboardChartTooltip/, pageName);
      assert.match(page, /useDashboardThemeTokens/, pageName);
      assert.doesNotMatch(page, /stroke="rgba\(148,163,184,0\.16\)"/, pageName);
      assert.doesNotMatch(page, /tick=\{\{\s*fontSize:\s*10,\s*fill:\s*'#94A3B8'\s*\}\}/, pageName);
    }

    for (const [pageName, featureDirectory, chartModule] of [
      ['ActivityEnomPage.jsx', 'activity-enom', 'ActivityEnomCharts.jsx'],
      ['TransportQualityPage.jsx', 'transport-quality', 'TransportQualityCharts.jsx'],
      ['TicketingPage.jsx', 'ticketing', 'TicketingCharts.jsx'],
    ]) {
      const page = src('pages', pageName);
      const charts = src('features', featureDirectory, chartModule);
      const chartConfig = src(
        'features',
        featureDirectory,
        `${featureDirectory.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}ChartConfig.js`,
      );
      const surface = page + charts + chartConfig;

      assert.match(page, /DashboardKpiCard|DashboardStatusBadge/, pageName);
      assert.match(charts, /ChartContainer/, chartModule);
      assert.match(charts, /DashboardChartTooltipContent/, chartModule);
      assert.match(surface, /var\(--chart-/, chartModule);
      assert.doesNotMatch(surface, /ResponsiveContainer/, chartModule);
      assert.doesNotMatch(surface, /useDashboardThemeTokens/, chartModule);
      assert.doesNotMatch(surface, /stroke="rgba\(148,163,184,0\.16\)"/, chartModule);
      assert.doesNotMatch(surface, /tick=\{\{\s*fontSize:\s*10,\s*fill:\s*'#94A3B8'\s*\}\}/, chartModule);
    }

    const impactPage = src('pages', 'ImpactServicePage.jsx');
    const impactCharts = src('features', 'impact-service', 'ImpactServiceCharts.jsx');
    const impactKpis = src('features', 'impact-service', 'ImpactServiceKpiGrid.jsx');
    assert.match(impactPage, /ImpactServiceCharts/);
    assert.match(impactCharts, /ChartContainer/);
    assert.match(impactKpis, /Card/);
    assert.doesNotMatch(impactPage + impactCharts, /useDashboardThemeTokens/);
    assert.doesNotMatch(impactCharts, /stroke="rgba\(148,163,184,0\.16\)"/);

    for (const componentName of [
      'DashboardSidebar.jsx',
      'Header.jsx',
      'Breadcrumb.jsx',
      'SiteTable.jsx',
      'AvailabilityChart.jsx',
      'SiteDetailModal.jsx',
      'WorstSitesPanel.jsx',
      'SummaryCards.jsx',
    ]) {
      const component = src('components', componentName);
      assert.doesNotMatch(component, /border-white\/\[|bg-white\/\[|hover:bg-white\/\[|bg-\[#0F172A\]/, componentName);
    }
  });

  it('keeps Site Map chrome graphite while preserving the Mapbox core', () => {
    const mapPages = [
      src('pages', 'SiteMapPage.jsx'),
      src('pages', 'DashboardPage.jsx'),
    ].join('\n');

    assert.match(mapPages, /dashboard-canvas/);
    assert.match(mapPages, /border-\[var\(--border-strong\)\]/);
    assert.match(mapPages, /nod-map-toggle/);

    for (const componentName of [
      'Header.jsx',
      'Breadcrumb.jsx',
      'AvailabilityChart.jsx',
      'SiteDetailModal.jsx',
      'SiteTable.jsx',
      'SummaryCards.jsx',
      'WorstSitesPanel.jsx',
      'FilterPanel.jsx',
    ]) {
      const component = src('components', componentName);
      assert.doesNotMatch(
        component,
        /#22D3EE|#0EA5E9|#38BDF8|rgba\(125,\s*211,\s*252|rgba\(94,\s*234,\s*212|shadow-\[0_0_/i,
        componentName,
      );
    }

    const header = src('components', 'Header.jsx');
    const breadcrumb = src('components', 'Breadcrumb.jsx');
    assert.match(header, /var\(--border-strong\)/);
    assert.doesNotMatch(header + breadcrumb, /backdrop-blur|blur-sm/);

    const availabilityChart = src('components', 'AvailabilityChart.jsx');
    assert.match(availabilityChart, /DashboardChartPanel/);
    assert.match(availabilityChart, /ChartContainer/);
    assert.match(availabilityChart, /DashboardChartTooltipContent/);
    assert.doesNotMatch(availabilityChart, /ResponsiveContainer|useDashboardThemeTokens/);

    const summary = src('components', 'SummaryCards.jsx');
    assert.doesNotMatch(summary, /glow:|glow=\{/);
  });
});
