/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = resolve(process.cwd(), 'src', 'features', 'ticket-toti', 'ticketTotiUtils.js');

describe('Ticket TOTI presentation utilities', () => {
  it('formats closed and open durations in compact Indonesian units', async () => {
    assert.equal(existsSync(modulePath), true, 'Ticket TOTI utilities must exist');
    const { formatDuration } = await import(pathToFileURL(modulePath));

    assert.equal(formatDuration(16_320), '4j 32m');
    assert.equal(formatDuration(198_000), '2h 7j');
    assert.equal(formatDuration(3_600), '1j');
    assert.equal(formatDuration(null, { isOpen: true }), 'Belum close');
    assert.equal(formatDuration(null), '-');
    assert.equal(formatDuration(-1), '-');
  });

  it('formats signed equal-period comparison without inventing a zero baseline rate', async () => {
    const { formatPeriodComparison } = await import(pathToFileURL(modulePath));

    assert.equal(formatPeriodComparison(21, 13.82), '+21 (+13,8%) vs periode sebelumnya');
    assert.equal(formatPeriodComparison(-5, -4), '-5 (-4,0%) vs periode sebelumnya');
    assert.equal(formatPeriodComparison(4, null), '+4 (persentase tidak tersedia) vs periode sebelumnya');
    assert.equal(formatPeriodComparison(null, null), 'Perbandingan belum tersedia');
  });

  it('formats provider/category and vandalism KPI subtitles', async () => {
    const { formatRankSubtitle, formatShareSubtitle } = await import(pathToFileURL(modulePath));

    assert.equal(formatRankSubtitle(92, 53.18), '92 ticket • 53,2% dari total');
    assert.equal(formatShareSubtitle(8.09), '8,1% dari total ticket');
    assert.equal(formatShareSubtitle(null), '0,0% dari total ticket');
  });
});
