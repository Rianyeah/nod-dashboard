import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSiteMapFilters,
  parseSiteMapSearchParams,
  writeSiteMapSearchParams,
} from '../features/site-map/siteMapState.js';


describe('Site Map canonical state', () => {
  it('normalizes supported URL values', () => {
    const parsed = parseSiteMapSearchParams(new URLSearchParams(
      'bulan=8&tahun=2026&nop=PASURUAN&kabupaten=KOTA+PASURUAN&q=%20PSR%20&site=psr001&tab=ops',
    ));

    assert.deepEqual(parsed, {
      bulan: 8,
      tahun: 2026,
      nop: 'PASURUAN',
      kabupaten: 'KOTA PASURUAN',
      q: 'PSR',
      site: 'PSR001',
    });
  });

  it('ignores invalid periods and empty or all-sentinel values', () => {
    const parsed = parseSiteMapSearchParams(new URLSearchParams(
      'bulan=18&tahun=2019&nop=__all__&cluster=%20&q=%20&site=%20',
    ));

    assert.deepEqual(parsed, {});
  });

  it('writes canonical values while preserving unknown keys', () => {
    const written = writeSiteMapSearchParams(
      new URLSearchParams('tab=ops&bulan=1&site=OLD'),
      {
        bulan: 8,
        tahun: 2026,
        nop: 'PASURUAN',
        kabupaten: null,
        cluster: 'PASURUAN',
        kelas: '',
        q: ' PSR ',
        site: 'psr001',
      },
    );

    assert.equal(
      written.toString(),
      'tab=ops&bulan=8&tahun=2026&nop=PASURUAN&cluster=PASURUAN&q=PSR&site=PSR001',
    );
  });

  it('creates API filters without period or selected-site state', () => {
    assert.deepEqual(normalizeSiteMapFilters({
      nop: ' PASURUAN ',
      kabupaten: '__all__',
      cluster: 'PASURUAN',
      kelas: '',
      q: ' PSR ',
      site: 'PSR001',
      bulan: 8,
      tahun: 2026,
    }), {
      nop: 'PASURUAN',
      cluster: 'PASURUAN',
      q: 'PSR',
    });
  });
});
