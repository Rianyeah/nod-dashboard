/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = (...parts) => resolve(process.cwd(), ...parts);
const src = (...parts) => readFileSync(root('src', ...parts), 'utf8');

describe('Data Potensi dashboard contracts', () => {
  it('extracts an Impact Service style shadcn site table', () => {
    const tablePath = root('src', 'features', 'data-potensi', 'DataPotensiSiteTable.jsx');
    assert.equal(existsSync(tablePath), true);
    const table = readFileSync(tablePath, 'utf8');
    const dashboardFilters = src('components', 'dashboard-filters', 'DashboardFilters.jsx');

    for (const contract of [
      'DashboardTableToolbar',
      'DashboardSearchInput',
      'DashboardFilterPopover',
      'DashboardFilterChips',
      'DashboardPagination',
      'TableHeader',
      'TableBody',
      'Skeleton',
      'Empty',
      'Tooltip',
      'aria-sort',
      'onSortChange',
      'onResetTable',
      'onSelectSite',
    ]) {
      assert.match(table, new RegExp(contract));
    }

    assert.match(table, /Filter lanjutan/);
    assert.match(table + dashboardFilters, /Bersihkan/);
    assert.match(table, /\? 'Tidak ada'/);
    assert.match(table, /tabIndex=\{0\}/);
    assert.match(table, /event\.key === 'Enter' \|\| event\.key === ' '/);
    assert.match(table, /event\.preventDefault\(\)/);
    assert.doesNotMatch(table, /group-hover:block/);
  });

  it('applies advanced filters to dashboard and table requests', () => {
    const page = src('pages', 'DataPotensiPage.jsx');
    const api = src('services', 'api.js');

    for (const contract of [
      'advancedFilters',
      'dashboardParams',
      'tableParams',
      'fetchDataPotensiFilterOptions',
      'useDeferredValue',
      'sort_by: sortBy',
      'sort_dir: sortDir',
      'cluster: advancedFilters.cluster',
      'kabupaten: advancedFilters.kabupaten',
      'site_class: advancedFilters.site_class',
      'type_site: advancedFilters.type_site',
      'transport_type: advancedFilters.transport_type',
      'type_battery: advancedFilters.type_battery',
      'tp: advancedFilters.tp',
      'bblti_software',
    ]) {
      assert.match(page + api, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(api, /\/data-potensi\/filter-options/);
    assert.doesNotMatch(page, /displaySites/);
    assert.doesNotMatch(page, /chipOptions/);
  });

  it('resets pagination for every filter, search, and sort change', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    for (const handler of [
      'handleNopChange',
      'handleStatusChange',
      'handleAdvancedFiltersApply',
      'handleSearchChange',
      'handleSortChange',
      'handleResetTable',
    ]) {
      const section = page.split(`const ${handler}`, 2)[1]?.split('}, [', 1)[0]
        || page.split(`const ${handler}`, 2)[1]?.split('}, []', 1)[0]
        || '';
      assert.match(section, /setPage\(1\)/, handler);
    }
  });

  it('uses responsive KPI layout and explicit loading/error states', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    assert.match(page, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6/);
    assert.match(page, /InsideBarValueLabel/);
    assert.match(page, /dataKey=\{cat\}/);
    assert.match(page, /Alert/);
    assert.match(page, /Skeleton/);
    assert.match(page, /dashboardError/);
    assert.match(page, /tableError/);
    assert.doesNotMatch(page, /useDashboardThemeTokens/);
  });
});
