/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ALLOWED_PRODUCTION_ADVISORY,
  evaluateProductionAudit,
} from '../../scripts/audit-production.mjs';

const workflowSource = readFileSync(
  resolve(process.cwd(), '../.github/workflows/deploy.yml'),
  'utf8',
);
const packageSource = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
);

function auditReport(vulnerabilities) {
  return { vulnerabilities };
}

describe('frontend production audit policy', () => {
  it('allows only the reviewed React Router RSC advisory and its dependent package', () => {
    const result = evaluateProductionAudit(
      auditReport({
        'react-router': {
          name: 'react-router',
          severity: 'high',
          via: [
            {
              title: 'React Router RSC Mode CSRF Bypass',
              url: `https://github.com/advisories/${ALLOWED_PRODUCTION_ADVISORY}`,
              severity: 'high',
            },
          ],
        },
        'react-router-dom': {
          name: 'react-router-dom',
          severity: 'high',
          via: ['react-router'],
        },
      }),
    );

    assert.deepEqual(result.blockingPackages, []);
    assert.deepEqual(result.allowedPackages, ['react-router', 'react-router-dom']);
  });

  it('blocks every unrelated high or critical advisory', () => {
    const result = evaluateProductionAudit(
      auditReport({
        'react-router': {
          name: 'react-router',
          severity: 'high',
          via: [
            {
              title: 'Different React Router advisory',
              url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
              severity: 'high',
            },
          ],
        },
        axios: {
          name: 'axios',
          severity: 'critical',
          via: [
            {
              title: 'Critical Axios advisory',
              url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
              severity: 'critical',
            },
          ],
        },
      }),
    );

    assert.deepEqual(result.allowedPackages, []);
    assert.deepEqual(result.blockingPackages, ['axios', 'react-router']);
  });

  it('does not allow the advisory id when reported for another package', () => {
    const result = evaluateProductionAudit(
      auditReport({
        'unexpected-package': {
          name: 'unexpected-package',
          severity: 'high',
          via: [
            {
              title: 'Unexpected package advisory',
              url: `https://github.com/advisories/${ALLOWED_PRODUCTION_ADVISORY}`,
              severity: 'high',
            },
          ],
        },
      }),
    );

    assert.deepEqual(result.blockingPackages, ['unexpected-package']);
  });

  it('wires the strict audit policy into the GitHub verify job', () => {
    assert.equal(
      packageSource.scripts['audit:production'],
      'node scripts/audit-production.mjs',
    );
    assert.match(workflowSource, /npm run audit:production/);
    assert.doesNotMatch(
      workflowSource,
      /npm audit --omit=dev --audit-level=high/,
    );
  });
});
