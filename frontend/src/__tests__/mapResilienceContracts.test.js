/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  describeMapboxError,
  validateMapboxRuntime,
} from '../utils/mapboxRuntime.js';


const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('Mapbox runtime resilience contracts', () => {
  it('reports missing/invalid tokens, unavailable WebGL, and zero-size containers', () => {
    const validContainer = { getBoundingClientRect: () => ({ width: 800, height: 500 }) };
    const supportedMapbox = { supported: () => true };

    assert.match(validateMapboxRuntime({ token: '', mapbox: supportedMapbox, container: validContainer }).message, /belum dikonfigurasi/i);
    assert.match(validateMapboxRuntime({ token: 'sk.secret', mapbox: supportedMapbox, container: validContainer }).message, /public.*pk\./i);
    assert.match(validateMapboxRuntime({ token: 'pk.test', mapbox: { supported: () => false }, container: validContainer }).message, /WebGL/i);
    assert.match(validateMapboxRuntime({
      token: 'pk.test',
      mapbox: supportedMapbox,
      container: { getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    }).message, /ukuran/i);
    assert.equal(validateMapboxRuntime({ token: 'pk.test', mapbox: supportedMapbox, container: validContainer }), null);
  });

  it('maps authentication, restriction, rate-limit, and CSP failures to actionable messages', () => {
    assert.deepEqual(describeMapboxError({ error: { status: 401 } }).fatal, true);
    assert.match(describeMapboxError({ error: { status: 401 } }).message, /invalid/i);
    assert.match(describeMapboxError({ error: { status: 403 } }).message, /scope|restriction/i);
    assert.match(describeMapboxError({ error: { status: 429 } }).message, /rate limit/i);
    assert.match(describeMapboxError({ error: { message: 'blocked by Content Security Policy' } }).message, /CSP/i);
    assert.equal(describeMapboxError({ error: { message: 'one raster tile failed' } }).fatal, false);
  });

  it('uses shared preflight, guarded construction, error listeners, and independent error states', () => {
    const siteMap = src('components', 'MapboxMap.jsx');
    const rfMap = src('features', 'rf-tilt', 'RfTiltMap.jsx');
    const siteMapPage = src('pages', 'SiteMapPage.jsx');

    for (const mapSource of [siteMap, rfMap]) {
      assert.match(mapSource, /validateMapboxRuntime/);
      assert.match(mapSource, /describeMapboxError/);
      assert.match(mapSource, /mapInitError/);
      assert.match(mapSource, /try\s*\{[\s\S]*?new mapboxgl\.Map/);
      assert.match(mapSource, /\.on\('error'/);
      assert.match(mapSource, /\.off\('error'/);
      assert.match(mapSource, /\.remove\(\)/);
    }

    assert.match(siteMap, /Marker peta gagal dimuat/);
    assert.match(siteMap, /Basemap tidak tersedia/);
    assert.match(siteMap, /Belum ada data marker/);
    assert.match(siteMap, /map\.current = null/);
    assert.match(siteMapPage, /error:\s*mapDataError/);
    assert.match(rfMap, /Coverage Map tidak tersedia/);
    assert.match(rfMap, /mapRef\.current = null/);
  });

  it('aborts stale sector, popup, and selected-site detail requests', () => {
    const siteMap = src('components', 'MapboxMap.jsx');
    const page = src('pages', 'SiteMapPage.jsx');

    assert.match(siteMap, /fetchMapSectors\(\{[\s\S]*?signal:\s*controller\.signal/);
    assert.match(siteMap, /fetchSiteAvailability\([\s\S]*?controller\.signal/);
    assert.match(page, /siteDetailAbortRef/);
    assert.match(page, /siteDetailAbortRef\.current\?\.abort\(\)/);
    assert.match(page, /fetchSiteDetailBundle\(siteId,\s*\{[\s\S]*?signal:\s*controller\.signal/);
  });

  it('protects both lazy map routes with a retryable route error boundary', () => {
    const app = src('App.jsx');
    const boundary = src('components', 'MapRouteErrorBoundary.jsx');

    assert.match(app, /MapRouteErrorBoundary/);
    assert.match(app, /<MapRouteErrorBoundary>/);
    assert.match(boundary, /Terjadi kesalahan saat membuka halaman peta/);
    assert.match(boundary, /Coba lagi/);
    assert.match(boundary, /Kembali ke Home/);
  });
});
