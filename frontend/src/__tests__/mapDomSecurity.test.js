/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

import { popupContent } from '../utils/safeMapDom.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('map DOM security', () => {
  it('renders hostile labels as text rather than executable markup', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.document = dom.window.document;
    const hostile = '<img src=x onerror="globalThis.pwned=true">';

    const node = popupContent([['Site', hostile]], 'site-popup');

    assert.equal(node.textContent.includes(hostile), true);
    assert.equal(node.querySelector('img'), null);
  });

  it('does not feed map data into HTML parsing sinks', () => {
    const map = src('components', 'MapboxMap.jsx');
    const rf = src('features', 'rf-tilt', 'RfTiltMap.jsx');

    for (const source of [map, rf]) {
      assert.doesNotMatch(source, /setHTML\(/);
      assert.doesNotMatch(source, /\.innerHTML\s*=/);
    }
    assert.doesNotMatch(map, /setDOMContent|mapboxgl\.Popup|safeMapDom/);
    assert.match(rf, /setDOMContent/);
  });
});
