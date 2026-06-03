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
      'Sort By',
    ]) {
      assert.match(page, new RegExp(label));
    }

    assert.match(page, /Intl\.DateTimeFormat\('id-ID',\s*\{\s*month:\s*'long'/);
    assert.match(page, /selectedNop\s*\?\s*'Kabupaten Contribution'\s*:\s*'NOP Contribution'/);
    assert.match(page, /selectedNop\s*\?\s*'Ranking Kabupaten'\s*:\s*'Ranking NOP'/);
    assert.match(page, /ComposedChart/);
    assert.match(page, /<Line[\s\S]*dataKey="total"/);
    assert.match(page, /breakdowns\.ranking/);
    assert.match(page, /fetchActivityEnomActivityDetail\(selectedActivityId/);
    assert.match(page, /sort_by:\s*sortBy/);
    assert.match(page, /sort_dir:\s*sortDir/);
    assert.doesNotMatch(page, /Activity Breakdown/);
    assert.doesNotMatch(page, /setActivityCategory/);
    assert.doesNotMatch(page, /activity_category/);
  });

  it('keeps XCEK and Workshop out of the visible table columns while retaining detail data', () => {
    const page = src('pages', 'ActivityEnomPage.jsx');
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
      assert.match(tableSection, new RegExp(column));
    }

    assert.doesNotMatch(tableSection, /XCEK/);
    assert.doesNotMatch(tableSection, /Workshop/);
    assert.match(page, /detail\?\.xcek/);
    assert.match(page, /detail\?\.workshop/);
    assert.match(page, /onClick=\{onClose\}/);
    assert.match(page, /stopPropagation/);
  });
});
