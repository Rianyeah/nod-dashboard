/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('global dashboard theme redesign contracts', () => {
  it('keeps the UI/UX guideline colors as the global token source of truth', () => {
    const css = src('index.css');

    for (const token of [
      '--bg-base: #12141C',
      '--bg-surface: #1A1D26',
      '--text-primary: #F8FAFC',
      '--text-secondary: #94A3B8',
      '--primary: #0EA5E9',
      '--success: #10B981',
      '--warning: #F59E0B',
      '--danger: #EF4444',
      '[data-theme="light"]',
      '--bg-base: #F8FAFC',
      '--bg-surface: #FFFFFF',
      '--text-primary: #0F172A',
      '--text-secondary: #64748B',
      '--primary: #0284C7',
      '--chart-grid',
      '--chart-tooltip-bg',
      '--table-row-hover',
      '--control-bg',
      '--badge-critical-bg',
      '--overlay-scrim',
    ]) {
      assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('exposes dashboard theme tokens and shared dashboard UI primitives', () => {
    const hookPath = srcPath('hooks', 'useDashboardThemeTokens.js');
    const primitivePath = srcPath('components', 'ui', 'DashboardPrimitives.jsx');

    assert.equal(existsSync(hookPath), true);
    assert.equal(existsSync(primitivePath), true);

    const hook = readFileSync(hookPath, 'utf8');
    const primitives = readFileSync(primitivePath, 'utf8');

    for (const name of ['useDashboardThemeTokens', 'chartGrid', 'axisTick', 'tooltipBg', 'tableRowHover']) {
      assert.match(hook, new RegExp(name));
    }

    for (const name of [
      'DashboardKpiCard',
      'DashboardChartPanel',
      'DashboardStatusBadge',
      'DashboardSelect',
      'DashboardInput',
      'DashboardPageHeader',
      'DashboardTableShell',
      'DashboardChartTooltip',
    ]) {
      assert.match(primitives, new RegExp(`export function ${name}`));
    }
  });

  it('migrates authenticated dashboard surfaces to shared primitives and theme-aware charts', () => {
    for (const pageName of [
      'HomePage.jsx',
      'NetworkReportingPage.jsx',
      'ImpactServicePage.jsx',
      'TransportQualityPage.jsx',
      'TicketingPage.jsx',
    ]) {
      const page = src('pages', pageName);
      assert.match(page, /DashboardKpiCard|DashboardChartPanel|DashboardStatusBadge|DashboardChartTooltip/, pageName);
      assert.match(page, /useDashboardThemeTokens/, pageName);
      assert.doesNotMatch(page, /stroke="rgba\(148,163,184,0\.16\)"/, pageName);
      assert.doesNotMatch(page, /tick=\{\{\s*fontSize:\s*10,\s*fill:\s*'#94A3B8'\s*\}\}/, pageName);
    }

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
});
