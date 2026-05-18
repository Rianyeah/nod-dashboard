/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('dashboard loading optimization contracts', () => {
  it('fetches filter options in DashboardPage instead of Header and FilterPanel', () => {
    const dashboard = src('pages', 'DashboardPage.jsx');
    const header = src('components', 'Header.jsx');
    const filterPanel = src('components', 'FilterPanel.jsx');

    assert.match(dashboard, /fetchFilterOptions/);
    assert.doesNotMatch(header, /fetchFilterOptions/);
    assert.doesNotMatch(filterPanel, /fetchFilterOptions/);
  });

  it('debounces SiteTable search before fetching paged data', () => {
    const table = src('components', 'SiteTable.jsx');

    assert.match(table, /useDebouncedValue/);
    assert.match(table, /300/);
    assert.match(table, /debouncedSearchTerm/);
    assert.match(table, /q: debouncedSearchTerm \|\| undefined/);
  });

  it('memoizes map GeoJSON and caches popup daily availability', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /useMemo/);
    assert.match(map, /sitesGeoJson/);
    assert.match(map, /dailyAvailabilityCache/);
    assert.match(map, /source\.setData\(sitesGeoJson\)/);
  });
});
