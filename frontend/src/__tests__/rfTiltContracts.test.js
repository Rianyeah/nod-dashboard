/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  inferAntennaSeries,
  inferFrequencyFromBand,
  inferFrequencyFromAntennaBands,
} from '../features/rf-tilt/rfTiltSiteUtils.js';

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

  it('renders Antenna Specification immediately above Result Summary', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');
    const panel = src('features', 'rf-tilt', 'RfTiltAntennaSpecPanel.jsx');

    assert.match(page, /<RfTiltAntennaSpecPanel[\s\S]*<RfTiltResultPanel/);
    assert.match(panel, /<h2>Antenna Specification<\/h2>/);
  });

  it('aligns Terrain and Coverage Map in the shared main grid column', () => {
    const page = src('pages', 'RfTiltAnalysisPage.jsx');

    assert.match(page, /<RfTiltChart result=\{result\} \/>[\s\S]*<RfTiltAntennaSpecPanel/);
    assert.match(page, /<RfTiltMap[\s\S]*<RfTiltResultPanel/);
    assert.match(page, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(280px,1fr\)\]/);
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
    assert.match(form, /Click the Coverage Map to place or drag the target pin/);
  });

  it('clears the Mapbox ref during cleanup so StrictMode can recreate the map', () => {
    const map = src('features', 'rf-tilt', 'RfTiltMap.jsx');
    assert.match(map, /mapRef\.current\.remove\(\);[\s\S]*mapRef\.current = null;/);
  });
});
