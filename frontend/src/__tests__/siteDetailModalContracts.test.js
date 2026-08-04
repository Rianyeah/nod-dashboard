/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';


const modal = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'SiteDetailModal.jsx'),
  'utf8',
);


describe('SiteDetailModal performance and master-field contracts', () => {
  it('replaces Daily Availability with Revenue and Payload MoM scorecards', () => {
    assert.doesNotMatch(modal, /Daily Availability/);
    assert.doesNotMatch(modal, /dailyData/);
    assert.match(modal, /PerformanceMetricCard/);
    assert.match(modal, /Revenue/);
    assert.match(modal, /Payload/);
    assert.match(modal, /revenue_mom_pct/);
    assert.match(modal, /payload_mom_pct/);
    assert.match(modal, /formatRevenue/);
    assert.match(modal, /formatPayload/);
    assert.match(modal, /MoM/);
    assert.match(modal, /trx_month/);
  });

  it('groups the approved technology fields together', () => {
    const technology = modal.split("title: 'Teknologi'", 2)[1].split("title: 'Power'", 1)[0];

    for (const field of ['Band NE', 'NR2100', 'NR2300', 'NE Type', 'Software Version']) {
      assert.match(technology, new RegExp(field));
    }
    assert.match(technology, /ne_type/);
    assert.match(technology, /software_version/);
  });

  it('groups approved Power, Transport, and Monitoring additions', () => {
    const power = modal.split("title: 'Power'", 2)[1].split("title: 'Genset'", 1)[0];
    const transport = modal.split("title: 'Transport'", 2)[1].split("title: 'Monitoring'", 1)[0];
    const monitoring = modal.split("title: 'Monitoring'", 2)[1].split('];', 1)[0];

    assert.match(power, /Tgl Install Battery/);
    assert.match(power, /Belting Battery/);
    assert.match(power, /idpel_name/);
    assert.match(transport, /modem_transport/);
    assert.match(transport, /jumper_modem/);
    assert.match(monitoring, /Dual EAS/);
    assert.match(monitoring, /dual_eas/);
    assert.match(monitoring, /BBLTI Software/);
    assert.match(monitoring, /bblti_software/);
  });

  it('suppresses prefixed spreadsheet error values from grouped and remaining data', () => {
    assert.match(modal, /startsWith\('#N\/A'\)/);
    assert.match(modal, /startsWith\('#REF!'\)/);
  });
});
