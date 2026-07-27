/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockfile = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));

function versionAtLeast(actual, minimum) {
  const currentParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < minimumParts.length; index += 1) {
    if (currentParts[index] > minimumParts[index]) return true;
    if (currentParts[index] < minimumParts[index]) return false;
  }
  return true;
}

describe('frontend production audit contract', () => {
  it('locks all high-severity production findings to fixed versions', () => {
    for (const [path, minimumVersion] of [
      ['node_modules/axios', '1.18.0'],
      ['node_modules/brace-expansion', '5.0.7'],
      ['node_modules/fast-uri', '3.1.4'],
      ['node_modules/js-yaml', '4.3.0'],
    ]) {
      const installedVersion = lockfile.packages[path]?.version;
      assert.ok(installedVersion, `${path} must be locked`);
      assert.ok(
        versionAtLeast(installedVersion, minimumVersion),
        `${path} must be at least ${minimumVersion}; received ${installedVersion}`,
      );
    }
  });
});
