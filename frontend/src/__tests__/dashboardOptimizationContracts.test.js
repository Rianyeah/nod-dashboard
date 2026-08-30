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

  it('aborts stale map site requests when canonical filters change', () => {
    const hook = src('hooks', 'useMapData.js');
    const api = src('services', 'api.js');

    assert.match(hook, /new AbortController\(\)/);
    assert.match(hook, /fetchMapSites\(\{\s*bulan,\s*tahun,\s*filters,\s*signal:\s*controller\.signal/);
    assert.match(hook, /abortControllerRef\.current\?\.abort\(\)/);
    assert.match(hook, /withCoordinates/);
    assert.match(api, /export async function fetchMapSites\(\{ bulan, tahun, filters = \{\}, signal \} = \{\}\)/);
    assert.match(api, /signal/);
  });

  it('renders sector antenna polygon layers from backend GeoJSON', () => {
    const api = src('services', 'api.js');
    const map = src('components', 'MapboxMap.jsx');
    const dashboard = src('pages', 'DashboardPage.jsx');

    assert.match(api, /fetchMapSectors/);
    assert.match(api, /\/map\/sectors/);
    assert.match(map, /SECTOR_VIEWPORT_SOURCE_ID/);
    assert.match(map, /SECTOR_SELECTED_SOURCE_ID/);
    assert.match(map, /sector-viewport-fill/);
    assert.match(map, /sector-selected-fill/);
    assert.match(map, /SECTOR_MIN_ZOOM/);
    assert.match(map, /selectedSiteId/);
    assert.match(dashboard, /nop=\{nop\}/);
  });

  it('separates bounded viewport sectors from selected-site full detail', () => {
    const api = src('services', 'api.js');

    assert.match(api, /export async function fetchMapSectorViewport\(\{ bbox, zoom, filters = \{\}, signal \}\)/);
    assert.match(api, /api\.get\('\/map\/sectors\/viewport'/);
    assert.match(api, /params:\s*\{\s*bbox,\s*zoom,\s*\.\.\.filters\s*\}/);
    assert.match(api, /export async function fetchMapSectors\(\{ nop, siteId, signal \}\s*=\s*\{\}\)/);
    assert.match(api, /site_id:\s*siteId\s*\|\|\s*undefined/);
  });

  it('keeps selected-site radius below sector antenna polygons', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /radiusBeforeLayer/);
    assert.match(map, /map\.current\.getLayer\('sector-viewport-fill'\)/);
    assert.match(map, /map\.current\.moveLayer\(layerId,\s*radiusBeforeLayer\)/);
    assert.match(map, /map\.current\.addLayer\(\{[\s\S]*?id:\s*'site-radius-fill'[\s\S]*?\},\s*radiusBeforeLayer\)/);
  });

  it('loads bounded viewport sectors only while the default-off layer is active', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /const\s+\[showSectors,\s*setShowSectors\]\s*=\s*useState\(false\)/);
    assert.match(map, /buildSectorViewportDescriptor/);
    assert.match(map, /map\.current\.on\('(?:zoomend|moveend)'/);
    assert.match(map, /fetchMapSectorViewport\(\{[\s\S]*?bbox:\s*descriptor\.bbox[\s\S]*?zoom:\s*descriptor\.zoom[\s\S]*?signal:\s*controller\.signal/);
    assert.match(map, /if\s*\(!showSectors\s*\|\|\s*!selectedSiteId\)/);
    assert.match(map, /fetchMapSectors\(\{\s*nop:\s*normalizedNop,\s*siteId:\s*selectedSiteId,\s*signal:\s*controller\.signal\s*\}\)/);
    assert.doesNotMatch(map, /fetchMapSectors\(\{\s*nop:\s*[^,}]+,\s*signal:/);
  });

  it('aborts and clears both sector sources when the layer is disabled', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /const\s+handleToggleSectors\s*=\s*useCallback/);
    assert.match(map, /viewportAbortRef\.current\?\.abort\(\)/);
    assert.match(map, /selectedSectorAbortRef\.current\?\.abort\(\)/);
    assert.match(map, /setSectorViewport\(\{\s*key:\s*null,\s*geoJson:\s*EMPTY_GEOJSON\s*\}\)/);
    assert.match(map, /setSelectedSectors\(\{\s*siteId:\s*null,\s*geoJson:\s*EMPTY_GEOJSON\s*\}\)/);
    assert.match(map, /viewportRequestKeyRef\.current\s*===\s*descriptor\.key/);
    assert.doesNotMatch(map, /allSectorLoadNop|allSectorsLoadedRef|allLoaded/);
  });

  it('clusters site markers independently from sector polygon LOD', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /cluster:\s*true/);
    assert.match(map, /clusterRadius:\s*42/);
    assert.match(map, /clusterMaxZoom:\s*11/);
    assert.match(map, /id:\s*'site-cluster'/);
    assert.match(map, /id:\s*'site-cluster-count'/);
    assert.match(map, /UNCLUSTERED_SITE_FILTER\s*=\s*\['!',\s*\['has',\s*'point_count'\]\]/);
    assert.match(map, /filter:\s*UNCLUSTERED_SITE_FILTER/);
    assert.match(map, /getClusterExpansionZoom\(clusterId/);
    assert.match(map, /easeTo\(\{[\s\S]*?center:\s*coordinates[\s\S]*?zoom/);
  });

  it('renders sector status and hides the band legend for lite aggregate geometry', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /sectorStatusLabel\(sectorStatus\)/);
    assert.match(map, /shouldShowSectorBandLegend\(sectorStatus,\s*selectedSectors\.features\.length\)/);
    assert.match(map, /showBandLegend\s*&&/);
  });

  it('resizes Mapbox when the dashboard layout changes', () => {
    const dashboard = src('pages', 'DashboardPage.jsx');
    const map = src('components', 'MapboxMap.jsx');

    assert.match(dashboard, /layoutResizeKey/);
    assert.match(dashboard, /bumpLayoutResizeKey/);
    assert.match(dashboard, /layoutResizeKey=\{layoutResizeKey\}/);
    assert.match(map, /ResizeObserver/);
    assert.match(map, /layoutResizeKey/);
    assert.match(map, /requestAnimationFrame/);
    assert.match(map, /map\.current\?\.resize\(\)/);
  });

  it('keeps the main popup visible inside the map viewport', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /ensurePopupVisible/);
    assert.match(map, /getBoundingClientRect/);
    assert.match(map, /panBy/);
    assert.match(map, /POPUP_SAFE_PADDING/);
  });

  it('limits neighbor popup cards and avoids covering the main popup', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /MAX_NEIGHBOR_CARDS/);
    assert.match(map, /mainPopupRect/);
    assert.match(map, /rectsIntersect/);
    assert.match(map, /nod-neighbor-card/);
  });

  it('supports dragging the main site popup to an adjusted position', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /enablePopupDrag/);
    assert.match(map, /popupDragCleanup/);
    assert.match(map, /popupDragOffset/);
    assert.match(map, /nod-popup-drag-handle/);
    assert.match(map, /pointerdown/);
    assert.match(map, /pointermove/);
  });

  it('keeps the detail site modal compact and information dense', () => {
    const modal = src('components', 'SiteDetailModal.jsx');

    assert.match(modal, /max-w-\[1080px\]/);
    assert.match(modal, /CompactMetricCard/);
    assert.match(modal, /xl:grid-cols-\[minmax\(0,0\.92fr\)_minmax\(0,0\.92fr\)_320px\]/);
    assert.match(modal, /CHART_HEIGHT = 68/);
    assert.match(modal, /px-5 py-4/);
  });
});
