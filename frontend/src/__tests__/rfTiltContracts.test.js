/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as rfTiltSiteUtils from '../features/rf-tilt/rfTiltSiteUtils.js';

import {
  inferAntennaSeries,
  inferFrequencyFromBand,
  inferFrequencyFromAntennaBands,
  resolveAntennaInputs,
  STANDARD_VERTICAL_BEAMWIDTH,
  formatRfTiltApiError,
  hasValidTiltAnalysisResult,
  validateRfTiltInputs,
} from '../features/rf-tilt/rfTiltSiteUtils.js';
import { DEFAULT_PARAMS } from '../features/rf-tilt/rfTiltChartConfig.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('RF Tilt site selection contracts', () => {
  it('infers Huawei antenna series from prefixed antenna type labels', () => {
    assert.equal(inferAntennaSeries('AQU4518R21v06'), 'AQU');
    assert.equal(inferAntennaSeries('Antenna Sectoral AQU4518R21v06 Huawei'), 'AQU');
    assert.equal(inferAntennaSeries('Antenna RF ADU4517R6V06 Huawei'), 'ADU');
    assert.equal(inferAntennaSeries('KATHREIN 80020217'), null);
  });

  it('infers supported RF Tilt frequency from ransys band labels', () => {
    assert.equal(inferFrequencyFromBand('L900'), 900);
    assert.equal(inferFrequencyFromBand('L1800'), 1800);
    assert.equal(inferFrequencyFromBand('L2100'), 2100);
    assert.equal(inferFrequencyFromBand('L2300'), 2300);
    assert.equal(inferFrequencyFromBand('UNKNOWN'), null);
  });

  it('snaps scraped antenna frequency bands to the nearest supported RF Tilt band', () => {
    assert.equal(inferFrequencyFromAntennaBands('806-960/1710-2170'), 900);
    assert.equal(inferFrequencyFromAntennaBands('1710-1880/1920-2170'), 1800);
    assert.equal(inferFrequencyFromAntennaBands('2200-2490'), 2300);
    assert.equal(inferFrequencyFromAntennaBands('invalid'), null);
    assert.equal(inferFrequencyFromAntennaBands(null), null);
  });

  it('resolves Vertical BW from the matched antenna specification at the active frequency', () => {
    const resolved = resolveAntennaInputs({
      antennaSpec: {
        matched: true,
        vertical_beamwidth_by_band: { 1800: 7.3, 2100: 6.5 },
        horizontal_beamwidth: 65,
        electrical_tilt_min: 0,
        electrical_tilt_max: 12,
      },
      frequencyMhz: 1800,
      electricalTilt: 8,
    });

    assert.equal(resolved.verticalBeamwidth, 7.3);
    assert.equal(resolved.verticalBeamwidthSource, 'Antenna spec');
    assert.equal(resolved.horizontalBeamwidth, 65);
    assert.equal(resolved.electricalTiltWarning, null);
  });

  it('uses the standard 6° fallback for unmatched, absent, or invalid Vertical BW values', () => {
    for (const antennaSpec of [
      null,
      { matched: false, vertical_beamwidth_by_band: { 1800: 7.3 } },
      { matched: true, vertical_beamwidth_by_band: { 1800: 0 } },
      { matched: true, vertical_beamwidth_by_band: { 1800: 'unknown' } },
      { matched: true, vertical_beamwidth_by_band: {} },
    ]) {
      const resolved = resolveAntennaInputs({ antennaSpec, frequencyMhz: 1800 });
      assert.equal(resolved.verticalBeamwidth, STANDARD_VERTICAL_BEAMWIDTH);
      assert.equal(resolved.verticalBeamwidthSource, 'Standard fallback (6°)');
    }
  });

  it('rejects incomplete numeric input before analysis and accepts the configured defaults', () => {
    assert.equal(validateRfTiltInputs(DEFAULT_PARAMS), null);
    assert.equal(validateRfTiltInputs({ ...DEFAULT_PARAMS, azimuth: null }), 'Azimuth harus diisi dengan angka yang valid.');
    assert.equal(validateRfTiltInputs({ ...DEFAULT_PARAMS, horizontal_beamwidth: Number.NaN }), 'Horizontal BW harus diisi dengan angka yang valid.');
    assert.equal(validateRfTiltInputs({ ...DEFAULT_PARAMS, target_latitude: null }, true), 'Target Latitude harus diisi dengan angka yang valid untuk mode Point-to-Point.');
  });

  it('requires complete analysis data before chart and map rendering', () => {
    const validResult = {
      terrain_profile: [{}],
      main_beam: { profile: [{}] },
      upper_beam: { profile: [{}] },
      lower_beam: { profile: [{}] },
    };
    assert.equal(hasValidTiltAnalysisResult(validResult), true);
    assert.equal(hasValidTiltAnalysisResult({ ...validResult, main_beam: null }), false);
  });

  it('turns API validation details into safe error text instead of rendering objects', () => {
    const error = {
      response: {
        data: {
          detail: [{ loc: ['body', 'antenna_series'], msg: "Input should be 'AQU'" }],
        },
      },
    };
    assert.equal(formatRfTiltApiError(error), "antenna_series: Input should be 'AQU'");
  });

  it('keeps site Horizontal BW authoritative and warns when electrical tilt is unsupported', () => {
    const resolved = resolveAntennaInputs({
      antennaSpec: {
        matched: true,
        vertical_beamwidth_by_band: { 1800: 7.3 },
        horizontal_beamwidth: 65,
        electrical_tilt_min: 0,
        electrical_tilt_max: 6,
      },
      frequencyMhz: 1800,
      siteBeamwidth: 30,
      hasSelectedSite: true,
      electricalTilt: 8,
    });

    assert.equal(resolved.horizontalBeamwidth, 30);
    assert.equal(resolved.horizontalBeamwidthSource, 'Site data');
    assert.match(resolved.electricalTiltWarning, /outside the antenna-supported range/);
  });

  it('uses the canonical antenna spec model as the model combobox label', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');

    assert.match(page, /antennaSpec=\{antennaSpec\}/);
    assert.match(form, /antennaSpec\?\.antenna_model \|\| params\.antenna_type/);
  });

  it('exposes antenna search failures and a hover or focus specification preview', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');
    const hook = src('features', 'rf-tilt', 'useRfTiltAnalysis.js');

    assert.match(page, /antennaModelError=\{antennaModelError\}/);
    assert.match(form, /onMouseEnter=\{\(\) => setPreviewedAntennaModelId/);
    assert.match(form, /<AntennaModelPreview model=\{previewedAntennaModel\}/);
    assert.match(hook, /Antenna search service is unavailable/);
  });

  it('shows site azimuth in search results and provides shared hover help for every RF Tilt input', () => {
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');

    assert.match(form, /function formatSiteLabel\(site\)/);
    assert.match(form, /\$\{site\?\.site_id\} - \$\{site\?\.cell_name \|\| site\?\.sector_base/);
    assert.match(form, /Az \$\{hasAzimuth/);
    assert.match(form, /<TooltipProvider>/);
    assert.match(form, /function FieldLabel/);
    assert.match(form, /Bantuan: \$\{label\}/);
    assert.match(form, /Cari konfigurasi site terpasang/);
    for (const label of ['Latitude', 'Longitude', 'Azimuth', 'Antenna Height', 'Mechanical Tilt', 'Electrical Tilt', 'Vertical BW', 'Horizontal BW', 'Max Distance', 'Sample Interval', 'Frequency', 'Antenna Model', 'Fresnel Clearance Required', 'DEM Source']) {
      assert.match(form, new RegExp(`label="${label}"`));
    }
  });

  it('connects selection and frequency flows to the shared antenna-input resolver and source indicators', () => {
    const hook = src('features', 'rf-tilt', 'useRfTiltAnalysis.js');
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');

    assert.match(hook, /resolveAntennaInputs/);
    assert.match(hook, /const selectFrequency/);
    assert.match(hook, /if \(nearestFreq && !selectedSite\)/);
    assert.match(hook, /verticalBeamwidth: 'Manual'/);
    assert.match(page, /selectFrequency=\{selectFrequency\}/);
    assert.match(form, /source=\{inputSources\?\.verticalBeamwidth\}/);
    assert.match(form, /compatibilityWarning/);
  });

  it('primes Site Map handoff search without auto-selecting a sector', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');

    assert.match(page, /useSearchParams/);
    assert.match(page, /normalizedDeepLinkSite/);
    assert.match(page, /key=\{deepLinkedSite \|\| 'rf-tilt-form'\}/);
    assert.match(page, /initialSiteQuery=\{deepLinkedSite\}/);
    assert.match(form, /useState\(Boolean\(initialSiteQuery\)\)/);
    assert.match(form, /useState\(initialSiteQuery \|\| ''\)/);
    assert.match(form, /searchSites\(initialSiteQuery\)/);
    assert.doesNotMatch(form, /selectSite\(initialSiteQuery\)/);
    assert.doesNotMatch(form, /lastInitialSiteQueryRef/);
  });

  it('renders Antenna Specification immediately above Result Summary', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const panel = src('features', 'rf-tilt', 'RfTiltAntennaSpecPanel.jsx');

    assert.match(page, /<RfTiltAntennaSpecPanel[\s\S]*<RfTiltResultPanel/);
    assert.match(panel, /<h2>Antenna Specification<\/h2>/);
  });

  it('contains numeric and result guards so malformed edits cannot blank the full page', () => {
    const hook = src('features', 'rf-tilt', 'useRfTiltAnalysis.js');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');
    const page = src('pages', 'RfTiltAnalysisPage.jsx');

    assert.match(form, /rawValue === '' \? null : Number\(rawValue\)/);
    assert.match(hook, /validateRfTiltInputs\(params, targetMode\)/);
    assert.match(hook, /hasValidTiltAnalysisResult\(data\)/);
    assert.match(hook, /updates\.antenna_series = inferAntennaSeries/);
    assert.match(hook, /setError\(formatRfTiltApiError\(err\)\)/);
    assert.match(page, /<RfTiltResultErrorBoundary resetKey=\{result\}>/);
  });

  it('aligns Terrain and Coverage Map in the shared main grid column', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');

    assert.match(page, /<RfTiltChart result=\{result\} \/>[\s\S]*<RfTiltAntennaSpecPanel/);
    assert.match(page, /<RfTiltMap[\s\S]*<RfTiltResultPanel/);
    assert.match(page, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(280px,1fr\)\]/);
  });

  it('uses a flat All Sectors map fed by the selected site sector API', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const map = src('features', 'rf-tilt', 'RfTiltMap.jsx');

    assert.match(page, /RF Tilt Analysis/);
    assert.doesNotMatch(page, /RF Vertical Tilt Analysis/);
    assert.match(map, /id: 'buildings',\s+label: '3D Buildings'/);
    assert.match(map, /id: 'sectors',\s+label: 'All Sectors',\s+url: 'mapbox:\/\/styles\/mapbox\/satellite-streets-v12'/);
    assert.match(map, /fetchMapSectors\(\{ siteId: selectedSiteId \}\)/);
    assert.match(map, /const isAllSectorsStyle = styleId === 'sectors'/);
    assert.match(map, /if \(isAllSectorsStyle\) setIs3D\(false\)/);
    assert.match(map, /isAllSectorsStyle[\s\S]*pitch: 0[\s\S]*bearing: 0/);
    assert.doesNotMatch(map, /if \(!map \|\| !map\.isStyleLoaded\(\)\) return/);
  });

  it('keeps all sector records and separates exact visual overlaps', () => {
    const polygon = (radius) => [[
      [112.95, -7.94],
      [112.95 + radius, -7.94],
      [112.95, -7.94 + radius],
      [112.95, -7.94],
    ]];
    const source = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { site_id: 'PSN003', azimuth: 255, beamwidth: 70, render_radius_m: 450 }, geometry: { type: 'Polygon', coordinates: polygon(0.004) } },
        { type: 'Feature', properties: { site_id: 'PSN003', azimuth: 255, beamwidth: 70, render_radius_m: 450 }, geometry: { type: 'Polygon', coordinates: polygon(0.004) } },
        { type: 'Feature', properties: { site_id: 'PSN003', azimuth: 125, beamwidth: 30, render_radius_m: 800 }, geometry: { type: 'Polygon', coordinates: polygon(0.007) } },
      ],
    };

    assert.equal(typeof rfTiltSiteUtils.prepareSiteSectorDisplayGeoJson, 'function');
    const prepared = rfTiltSiteUtils.prepareSiteSectorDisplayGeoJson(source);
    assert.equal(prepared.features.length, 3);
    assert.equal(prepared.features[0].properties.overlap_count, 2);
    assert.equal(prepared.features[1].properties.overlap_count, 2);
    assert.notDeepEqual(prepared.features[0].geometry.coordinates, prepared.features[1].geometry.coordinates);
    assert.deepEqual(prepared.features[2].geometry.coordinates, source.features[2].geometry.coordinates);
  });

  it('exports the complete RF Tilt page, including the Mapbox canvas', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const map = src('features', 'rf-tilt', 'RfTiltMap.jsx');
    const exporter = src('features', 'rf-tilt', 'RfTiltExportButton.jsx');

    assert.match(page, /data-export="rf-tilt-analysis"/);
    assert.doesNotMatch(page, /rf-map-skip-export/);
    assert.match(map, /preserveDrawingBuffer: true/);
    assert.match(exporter, /rf-export-control/);
  });

  it('supports click-and-drag P2P target pins and Vertical BW-driven 3D envelopes', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const map = src('features', 'rf-tilt', 'RfTiltMap.jsx');
    const form = src('features', 'rf-tilt', 'RfTiltParamForm.jsx');

    assert.match(page, /targetMode=\{targetMode\}/);
    assert.match(map, /draggable: true/);
    assert.match(map, /P2P target mode: click the map to pin a target/);
    assert.match(map, /verticalBeamEnvelopeHeight/);
    assert.match(map, /fill-extrusion-height.*cfg\.extrusionHeight/);
    assert.match(form, /Klik Coverage Map untuk menempatkan atau menyeret pin target/);
  });

  it('clears the Mapbox ref during cleanup so StrictMode can recreate the map', () => {
    const map = src('features', 'rf-tilt', 'RfTiltMap.jsx');
    assert.match(map, /mapInstance\.remove\(\);[\s\S]*mapRef\.current = null;/);
  });

  it('uses graphite chrome without changing RF engineering output', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const chrome = [
      page,
      src('features', 'rf-tilt', 'RfTiltAntennaSpecPanel.jsx'),
      src('features', 'rf-tilt', 'RfTiltExportButton.jsx'),
      src('features', 'rf-tilt', 'RfTiltParamForm.jsx'),
      src('features', 'rf-tilt', 'RfTiltResultPanel.jsx'),
    ].join('\n');

    assert.doesNotMatch(chrome, /#22D3EE|#0EA5E9|#38BDF8|shadow-\[0_0_|backdrop-blur/i);
    assert.match(page, /dashboard-canvas/);
    assert.match(chrome, /var\(--border-strong\)|DashboardPanelHeader|DashboardPageHeader/);
  });
});
