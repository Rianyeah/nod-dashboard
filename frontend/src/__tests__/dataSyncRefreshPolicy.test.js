import assert from 'node:assert/strict';
import { describe, it } from 'node:test';


describe('data sync refresh policy', () => {
  it('keeps a selected date that remains inside the refreshed bounds', async () => {
    const { preserveDateFilter } = await import('../features/data-sync/dataSyncRefreshPolicy.js');

    assert.equal(preserveDateFilter('2026-09-05', {
      fallback: '2026-09-08',
      min: '2026-09-01',
      max: '2026-09-08',
    }), '2026-09-05');
  });

  it('falls back when a selected date is no longer available', async () => {
    const { preserveDateFilter } = await import('../features/data-sync/dataSyncRefreshPolicy.js');

    assert.equal(preserveDateFilter('2026-08-31', {
      fallback: '2026-09-08',
      min: '2026-09-01',
      max: '2026-09-08',
    }), '2026-09-08');
  });

  it('keeps valid options and replaces removed options with the fallback', async () => {
    const { preserveOptionFilter } = await import('../features/data-sync/dataSyncRefreshPolicy.js');

    assert.equal(preserveOptionFilter('NOP MALANG', ['NOP MALANG', 'NOP SURABAYA'], null), 'NOP MALANG');
    assert.equal(preserveOptionFilter('NOP KEDIRI', ['NOP MALANG', 'NOP SURABAYA'], null), null);
    assert.equal(preserveOptionFilter('', ['Open', 'Closed'], ''), '');
  });

  it('keeps a valid month range and falls back when either boundary disappears', async () => {
    const { preserveMonthRange } = await import('../features/data-sync/dataSyncRefreshPolicy.js');
    const fallback = { start: '2026-09', end: '2026-09' };
    const availableMonths = ['2026-07', '2026-08', '2026-09'];

    assert.deepEqual(
      preserveMonthRange({ start: '2026-07', end: '2026-09' }, fallback, availableMonths),
      { start: '2026-07', end: '2026-09' },
    );
    assert.deepEqual(
      preserveMonthRange({ start: '2026-06', end: '2026-09' }, fallback, availableMonths),
      fallback,
    );
  });
});
