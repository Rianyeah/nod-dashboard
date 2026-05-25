/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const publicFile = (...parts) => resolve(process.cwd(), 'public', ...parts);

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
});
