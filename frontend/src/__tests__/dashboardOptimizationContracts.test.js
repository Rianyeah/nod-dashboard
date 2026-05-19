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

  it('renders sector antenna polygon layers from backend GeoJSON', () => {
    const api = src('services', 'api.js');
    const map = src('components', 'MapboxMap.jsx');
    const dashboard = src('pages', 'DashboardPage.jsx');

    assert.match(api, /fetchMapSectors/);
    assert.match(api, /\/map\/sectors/);
    assert.match(map, /SECTOR_SOURCE_ID/);
    assert.match(map, /sector-fill/);
    assert.match(map, /sector-selected-fill/);
    assert.match(map, /minzoom:\s*12/);
    assert.match(map, /selectedSiteId/);
    assert.match(map, /setFilter\('sector-selected-fill'/);
    assert.match(dashboard, /nop=\{nop\}/);
  });

  it('lazy-loads all sector polygons only after zoom threshold or selected-site focus', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.doesNotMatch(
      map,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?fetchMapSectors\(\{\s*nop\s*\}\)[\s\S]*?\},\s*\[\s*nop\s*\]\s*\)/,
    );
    assert.match(map, /const\s+\[sectorState,\s*setSectorState\]\s*=\s*useState\(\{/);
    assert.match(map, /getZoom\(\)\s*>=\s*SECTOR_MIN_ZOOM/);
    assert.match(map, /map\.current\.on\('(?:zoomend|moveend)'/);
    assert.match(map, /fetchMapSectors\(\{\s*nop:\s*allSectorLoadNop\.nop\s*\}\)/);
    assert.match(map, /fetchMapSectors\(\{\s*nop:\s*normalizedNop,\s*siteId:\s*selectedSiteId\s*\}\)/);
    assert.match(map, /sectorState\.nop\s*===\s*normalizedNop\s*\?\s*sectorState\.geoJson\s*:\s*EMPTY_GEOJSON/);
  });

  it('scopes full-sector lazy loading to the NOP that crossed the zoom threshold', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.doesNotMatch(
      map,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(!shouldLoadAllSectors\)\s*return;[\s\S]*?fetchMapSectors\(\{\s*nop\s*\}\)[\s\S]*?\},\s*\[\s*nop,\s*shouldLoadAllSectors\s*\]\s*\)/,
    );
    assert.match(map, /const\s+\[allSectorLoadNop,\s*setAllSectorLoadNop\]\s*=\s*useState\(null\)/);
    assert.match(map, /const\s+normalizedNop\s*=\s*nop\s*\|\|\s*null/);
    assert.match(map, /setAllSectorLoadNop\(\{\s*nop:\s*normalizedNop\s*\}\)/);
    assert.match(map, /if\s*\(!allSectorLoadNop\)\s*return/);
    assert.match(map, /fetchMapSectors\(\{\s*nop:\s*allSectorLoadNop\.nop\s*\}\)/);
    assert.match(map, /setSectorState\(\{\s*nop:\s*allSectorLoadNop\.nop/);
    assert.match(map, /allSectorsLoadedRef\.current\s*=\s*true/);
    assert.match(map, /setSectorState\(prev\s*=>\s*\{[\s\S]*?prev\.nop\s*===\s*normalizedNop\s*&&\s*prev\.allLoaded/);
  });
});
