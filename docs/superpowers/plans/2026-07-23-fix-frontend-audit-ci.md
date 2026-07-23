# Frontend Audit CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the GitHub Actions `verify` job by resolving production dependency versions that trigger high-severity npm audit findings.

**Architecture:** The workflow runs `npm ci`, so `frontend/package-lock.json`â€”not the locally drifted `node_modules` treeâ€”is the source of the failing versions. Add a small lockfile contract test, then use npm's non-breaking, lockfile-only audit remediation to refresh the resolved versions. Keep the existing CI audit policy of failing only high and critical findings.

**Tech Stack:** npm lockfile v3, Node.js test runner, GitHub Actions, Vite/React.

## Global Constraints

- Modify only `frontend/package-lock.json` and the dedicated dependency-audit contract test; `frontend/package.json` remains unchanged.
- Use `npm audit fix --package-lock-only --omit=dev --ignore-scripts --audit-level=high`; never use `--force`.
- Keep `.github/workflows/deploy.yml` audit policy unchanged: `npm audit --omit=dev --audit-level=high`.
- The resolved package floors are axios `1.18.0`, brace-expansion `5.0.7`, fast-uri `3.1.4`, and js-yaml `4.3.0`.
- Preserve unrelated untracked workspace files.

---

### Task 1: Guard the production audit resolution

**Files:**
- Create: `frontend/src/__tests__/dependencyAuditContracts.test.js`

**Interfaces:**
- Consumes: `frontend/package-lock.json` entries in `packages`.
- Produces: a Node test that fails when the lockfile resolves any of the four high-severity package versions below their fixed floor.

- [ ] **Step 1: Write the failing test**

```js
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
      assert.ok(versionAtLeast(installedVersion, minimumVersion), `${path} must be at least ${minimumVersion}; received ${installedVersion}`);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/__tests__/dependencyAuditContracts.test.js`

Expected: FAIL because the committed lock resolves axios `1.16.1`, brace-expansion `5.0.6`, fast-uri `3.1.2`, and js-yaml `4.2.0`.

### Task 2: Refresh only the frontend lockfile safely

**Files:**
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/__tests__/dependencyAuditContracts.test.js`

**Interfaces:**
- Consumes: existing semver ranges from `frontend/package.json`.
- Produces: a lockfile with no high or critical production audit findings and no manifest or workflow changes.

- [ ] **Step 1: Apply the non-breaking lockfile remediation**

Run from `frontend/`:

```bash
npm audit fix --package-lock-only --omit=dev --ignore-scripts --audit-level=high
```

Expected: package-lock-only changes; npm may report remaining moderate findings through the shadcn CLI chain, but it must not propose or install the breaking `shadcn@3.8.3` fix.

- [ ] **Step 2: Inspect scope**

Run:

```bash
git diff --check
git diff -- frontend/package.json frontend/package-lock.json .github/workflows/deploy.yml
```

Expected: no change to `frontend/package.json` or `.github/workflows/deploy.yml`; only generated resolution data in the lockfile changes.

- [ ] **Step 3: Run the contract test to verify it passes**

Run: `node --test src/__tests__/dependencyAuditContracts.test.js`

Expected: PASS with axios `1.18.1`, brace-expansion `5.0.7`, fast-uri `3.1.4`, and js-yaml `4.3.0` or newer.

### Task 3: Reproduce the CI frontend gate locally

**Files:**
- Modify: none
- Test: `frontend/src/__tests__/*.test.js`

**Interfaces:**
- Consumes: refreshed lockfile and frontend source tree.
- Produces: evidence that the same test, lint, audit, and build commands used by GitHub Actions succeed.

- [ ] **Step 1: Run the CI-equivalent frontend commands**

Run from `frontend/`:

```bash
npm ci
node --test src/__tests__/*.test.js
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
```

Expected: all commands exit 0. The audit report may retain moderate findings, but reports zero high and zero critical findings.

- [ ] **Step 2: Commit the scoped fix**

```bash
git add frontend/package-lock.json frontend/src/__tests__/dependencyAuditContracts.test.js docs/superpowers/plans/2026-07-23-fix-frontend-audit-ci.md
git commit -m "fix: resolve high frontend audit findings"
```

Expected: one commit containing only the audit remediation, its regression guard, and this plan.

