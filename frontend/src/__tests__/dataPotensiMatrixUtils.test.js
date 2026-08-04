import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCellDistributionColumns,
  buildCellDistributionMatrix,
  buildReadinessColumns,
  buildTransportMatrix,
} from '../features/data-potensi/dataPotensiMatrixUtils.js';


describe('Data Potensi matrix shaping', () => {
  it('defines the approved readiness dimensions in display order', () => {
    assert.deepEqual(buildReadinessColumns()[0], {
      key: 'enva_ready_pct',
      countKey: 'enva_ready',
      label: 'ENVA',
    });
    assert.deepEqual(
      buildReadinessColumns().map((column) => column.label),
      ['ENVA', 'Dual EAS', 'BBLTI SW'],
    );
  });

  it('pivots jumper values under each Transport Type and Modem row', () => {
    const matrix = buildTransportMatrix([
      {
        transport_type: 'FO_TELKOM',
        modem_transport: 'ONT',
        jumper_modem: 'UTP',
        site_count: 8,
        percentage: 80,
      },
      {
        transport_type: 'FO_TELKOM',
        modem_transport: 'ONT',
        jumper_modem: 'FO',
        site_count: 2,
        percentage: 20,
      },
    ]);

    assert.equal(matrix.columns.includes('UTP'), true);
    assert.equal(matrix.columns.includes('FO'), true);
    assert.equal(matrix.cells['FO_TELKOM|ONT'].UTP.site_count, 8);
    assert.equal(matrix.rows[0].transport_type, 'FO_TELKOM');
    assert.equal(matrix.rows[0].modem_transport, 'ONT');
  });

  it('normalizes absent dimensions without dropping their counts', () => {
    const matrix = buildTransportMatrix([
      { transport_type: '', modem_transport: null, jumper_modem: '#N/A', site_count: 3, percentage: 30 },
    ]);

    assert.equal(matrix.rows[0].key, 'Tidak ada|Tidak ada');
    assert.equal(matrix.columns[0], 'Tidak ada');
    assert.equal(matrix.cells['Tidak ada|Tidak ada']['Tidak ada'].site_count, 3);
  });

  it('defines the approved cell technologies in display order', () => {
    assert.deepEqual(
      buildCellDistributionColumns().map(({ key, label }) => [key, label]),
      [
        ['gsm900', 'GSM900'],
        ['dcs1800', 'DCS1800'],
        ['l900', 'L900'],
        ['l1800', 'L1800'],
        ['l2100', 'L2100'],
        ['l2300', 'L2300'],
        ['lte_nb_iot', 'LTE NB-IoT'],
        ['nr2100', 'NR2100'],
        ['nr2300', 'NR2300'],
      ],
    );
  });

  it('normalizes cell totals and calculates maxima per technology', () => {
    const matrix = buildCellDistributionMatrix([
      { kabupaten: 'SIDOARJO', gsm900: 12, dcs1800: 4, nr2300: 0 },
      { kabupaten: 'PASURUAN', gsm900: 6, dcs1800: 10, nr2300: null },
    ]);

    assert.equal(matrix.rows[0].kabupaten, 'PASURUAN');
    assert.equal(matrix.maxima.gsm900, 12);
    assert.equal(matrix.maxima.dcs1800, 10);
    assert.equal(matrix.maxima.nr2300, 0);
    assert.equal(matrix.rows[0].nr2300, 0);
  });
});
