/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const exists = (...parts) => existsSync(resolve(process.cwd(), 'src', ...parts));

describe('Site Map spatial explorer contracts', () => {
  it('composes one URL-backed state across every explorer surface', () => {
    const page = src('pages', 'SiteMapPage.jsx');

    assert.match(page, /useSearchParams/);
    assert.match(page, /useDebouncedValue/);
    assert.match(page, /parseSiteMapSearchParams/);
    assert.match(page, /writeSiteMapSearchParams/);
    assert.match(page, /<SiteMapToolbar/);
    assert.match(page, /<SiteMapContextStrip/);
    assert.match(page, /<SiteMapInspector/);
    assert.match(page, /<SiteMapResultsDrawer/);
    assert.match(page, /filters=\{mapFilters\}/g);
    assert.match(page, /nearbySites\(/);
    assert.doesNotMatch(page, /SummaryCards|isDraggingSidebar|isDraggingTable/);
  });

  it('provides focused explorer surfaces instead of duplicating summary cards', () => {
    for (const component of [
      'SiteMapToolbar.jsx',
      'SiteMapContextStrip.jsx',
      'SiteMapInspector.jsx',
      'SiteMapResultsDrawer.jsx',
    ]) {
      assert.equal(exists('features', 'site-map', component), true, component);
    }

    const contextStrip = src('features', 'site-map', 'SiteMapContextStrip.jsx');
    assert.doesNotMatch(contextStrip, /SummaryCards|DashboardKpiCard/);
    assert.match(contextStrip, /withCoordinates/);
    assert.match(contextStrip, /sectorStatus/);
  });

  it('keeps search page-controlled and describes its shared map scope', () => {
    const toolbar = src('features', 'site-map', 'SiteMapToolbar.jsx');
    const table = src('components', 'SiteTable.jsx');

    assert.match(toolbar, /DashboardSearchInput/);
    assert.match(toolbar, /value=\{q\}/);
    assert.match(toolbar, /onChange=\{onQueryChange\}/);
    assert.match(toolbar, /map, sector, dan hasil/i);
    assert.doesNotMatch(table, /DashboardSearchInput|useDebouncedValue/);
  });

  it('keeps inspector actions and bottom-sheet semantics available', () => {
    const inspector = src('features', 'site-map', 'SiteMapInspector.jsx');

    assert.match(inspector, /<aside/);
    assert.match(inspector, /<Sheet/);
    assert.match(inspector, /side="bottom"/);
    assert.match(inspector, /Full Site Detail/);
    assert.match(inspector, /\/data-potensi\?site=/);
    assert.match(inspector, /\/rf-tilt-analysis\?site=/);
    assert.match(inspector, /outsideFilters/);
  });

  it('uses a default-collapsed bounded results drawer and server-side sorting', () => {
    const drawer = src('features', 'site-map', 'SiteMapResultsDrawer.jsx');
    const table = src('components', 'SiteTable.jsx');

    assert.match(drawer, /useState\(false\)/);
    assert.match(drawer, /42px/);
    assert.match(drawer, /max-h-/);
    assert.match(drawer, /setPage\(1\)/);
    assert.match(table, /fetchSites\(\{[\s\S]*?sortBy,[\s\S]*?sortDir/);
    assert.match(table, /aria-sort/);
    assert.match(table, /Coba lagi/);
    assert.doesNotMatch(table, /const sorted =|\.sort\(/);
  });

  it('keeps Mapbox focused on layers, camera, and normalized selection only', () => {
    const map = src('components', 'MapboxMap.jsx');

    assert.match(map, /onSiteSelect/);
    assert.match(map, /onSectorStatusChange/);
    assert.match(map, /buildSectorViewportDescriptor\(map\.current, filters\)/);
    assert.match(map, /cluster:\s*true/);
    assert.match(map, /updateRadius/);
    assert.doesNotMatch(map, /createSitePopupContent|mapboxgl\.Popup|enablePopupDrag/);
    assert.doesNotMatch(map, /nod-neighbor-card|fetchSiteAvailability|safeMapDom/);
  });
});
