/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveSeriesColor,
  shouldRenderChartValue,
  sumChartValues,
} from '../components/dashboard-charts/dashboardChartUtils.js';
import {
  formatCompactParetoLabel,
  getSlaStatusColor,
  getTicketTypeColor,
} from '../features/ticketing/ticketingChartConfig.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('shared dashboard chart contracts', () => {
  it('resolves payload colors before static config colors', () => {
    const config = { tickets: { color: '#111111', tooltipColor: '#222222' } };
    assert.equal(resolveSeriesColor({ dataKey: 'tickets', color: '#333333', payload: { fill: '#444444' } }, config), '#444444');
    assert.equal(resolveSeriesColor({ dataKey: 'tickets', color: '#333333' }, config), '#333333');
    assert.equal(resolveSeriesColor({ dataKey: 'tickets' }, config), '#222222');
    assert.equal(resolveSeriesColor({ dataKey: 'missing' }, config), 'var(--foreground)');
  });

  it('hides zero labels and totals numeric chart values', () => {
    assert.equal(shouldRenderChartValue(0), false);
    assert.equal(shouldRenderChartValue('0'), false);
    assert.equal(shouldRenderChartValue(12), true);
    assert.equal(shouldRenderChartValue('invalid'), false);
    assert.equal(sumChartValues([{ total: 4 }, { total: '6' }, { total: null }], 'total'), 10);
  });

  it('maps SLA labels to stable semantic chart colors', () => {
    assert.equal(getSlaStatusColor('IN SLA'), 'var(--chart-success)');
    assert.equal(getSlaStatusColor('OUT SLA'), 'var(--chart-danger)');
    assert.equal(getSlaStatusColor('PENDING'), 'var(--chart-warning)');
    assert.equal(getSlaStatusColor('UNKNOWN'), 'var(--chart-neutral-2)');
  });

  it('maps ticket types to existing chart tokens', () => {
    assert.equal(getTicketTypeColor('Incident'), 'var(--chart-accent)');
    assert.equal(getTicketTypeColor(' EVENT '), 'var(--chart-neutral-1)');
    assert.equal(getTicketTypeColor('UNKNOWN'), 'var(--chart-neutral-2)');
  });

  it('compacts only long Pareto tick labels', () => {
    assert.equal(formatCompactParetoLabel('Power'), 'Power');
    assert.equal(formatCompactParetoLabel('Unclassified'), 'Unclassif…');
    assert.equal(formatCompactParetoLabel(null), '');
  });

  it('provides focused shadcn chart helpers without changing the generated primitive', () => {
    for (const file of ['dashboardChartUtils.js','DashboardChartTooltipContent.jsx','DashboardChartLegend.jsx','DashboardChartEmpty.jsx','DashboardChartError.jsx','DashboardChartLabels.jsx']) {
      assert.equal(existsSync(srcPath('components', 'dashboard-charts', file)), true, file);
    }
    const tooltip = src('components', 'dashboard-charts', 'DashboardChartTooltipContent.jsx');
    const legend = src('components', 'dashboard-charts', 'DashboardChartLegend.jsx');
    const empty = src('components', 'dashboard-charts', 'DashboardChartEmpty.jsx');
    const errorState = src('components', 'dashboard-charts', 'DashboardChartError.jsx');
    const labels = src('components', 'dashboard-charts', 'DashboardChartLabels.jsx');
    assert.match(tooltip, /ChartTooltipContent/);
    assert.match(tooltip, /resolveSeriesColor/);
    assert.match(tooltip, /data-series-name/);
    assert.match(tooltip, /data-series-value/);
    assert.match(legend, /ChartLegend/);
    assert.match(legend, /ChartLegendContent/);
    assert.match(empty, /<Empty/);
    assert.match(empty, /data-chart-state="empty"/);
    assert.match(empty, /border-\[var\(--border\)\]/);
    assert.match(errorState, /data-chart-state="error"/);
    assert.match(errorState, /role="status"/);
    assert.match(labels, /InsideBarValueLabel/);
    assert.match(labels, /TopBarValueLabel/);
    assert.match(labels, /EndBarValueLabel/);
    assert.equal((labels.match(/data-chart-value-label/g) || []).length, 3);
    assert.doesNotMatch(labels, /stroke=/);
  });

  it('exports one Operational Precision chart palette', () => {
    const utils = src('components', 'dashboard-charts', 'dashboardChartUtils.js');
    const configPaths = [
      ['features', 'activity-enom', 'activityEnomChartConfig.js'],
      ['features', 'transport-quality', 'transportQualityChartConfig.js'],
      ['features', 'ticketing', 'ticketingChartConfig.js'],
      ['features', 'impact-service', 'impactServiceChartConfig.js'],
      ['features', 'home', 'homeChartConfig.js'],
      ['features', 'reporting', 'reportingChartConfig.js'],
      ['features', 'data-potensi', 'dataPotensiChartConfig.js'],
    ];

    assert.match(utils, /export const DASHBOARD_CHART_COLORS/);
    for (const key of ['accent', 'neutral', 'neutralMuted', 'success', 'warning', 'danger', 'info']) {
      assert.match(utils, new RegExp(`${key}:`));
    }

    for (const path of configPaths) {
      assert.equal(existsSync(srcPath(...path)), true, path.join('/'));
      const config = src(...path);
      assert.match(config, /DASHBOARD_CHART_COLORS/);
      assert.doesNotMatch(config, /#22D3EE|#0EA5E9|#38BDF8/i);
    }
  });
});
