import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { filenameFromDisposition } from '../utils/downloadFile.js';


describe('file download headers', () => {
  it('uses the server XLSX filename and safely falls back when absent', () => {
    assert.equal(
      filenameFromDisposition('attachment; filename="network-reporting-sidoarjo.xlsx"', 'fallback.xlsx'),
      'network-reporting-sidoarjo.xlsx',
    );
    assert.equal(filenameFromDisposition('', 'fallback.xlsx'), 'fallback.xlsx');
  });
});
