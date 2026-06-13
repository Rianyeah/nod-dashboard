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

  it('provides focused shadcn chart helpers without changing the generated primitive', () => {
    for (const file of ['dashboardChartUtils.js','DashboardChartTooltipContent.jsx','DashboardChartLegend.jsx','DashboardChartEmpty.jsx','DashboardChartLabels.jsx']) {
      assert.equal(existsSync(srcPath('components', 'dashboard-charts', file)), true, file);
    }
    const tooltip = src('components', 'dashboard-charts', 'DashboardChartTooltipContent.jsx');
    const legend = src('components', 'dashboard-charts', 'DashboardChartLegend.jsx');
    const empty = src('components', 'dashboard-charts', 'DashboardChartEmpty.jsx');
    const labels = src('components', 'dashboard-charts', 'DashboardChartLabels.jsx');
    assert.match(tooltip, /ChartTooltipContent/);
    assert.match(tooltip, /resolveSeriesColor/);
    assert.match(tooltip, /data-series-name/);
    assert.match(tooltip, /data-series-value/);
    assert.match(legend, /ChartLegend/);
    assert.match(legend, /ChartLegendContent/);
    assert.match(empty, /<Empty/);
    assert.match(labels, /InsideBarValueLabel/);
    assert.match(labels, /TopBarValueLabel/);
    assert.match(labels, /EndBarValueLabel/);
    assert.doesNotMatch(labels, /stroke=/);
  });
});
