import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ALLOWED_PRODUCTION_ADVISORY = 'GHSA-qwww-vcr4-c8h2';
const ALLOWED_PRODUCTION_PACKAGE = 'react-router';
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function advisoryId(entry) {
  const match = String(entry?.url || '').match(/GHSA-[a-z0-9-]+/i);
  return match?.[0]?.toUpperCase() || '';
}

export function evaluateProductionAudit(report) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    return {
      allowedPackages: [],
      blockingPackages: ['invalid-audit-report'],
    };
  }

  const allowedCache = new Map();

  function isAllowedPackage(packageName, trail = new Set()) {
    if (allowedCache.has(packageName)) return allowedCache.get(packageName);
    if (trail.has(packageName)) return false;

    const vulnerability = vulnerabilities[packageName];
    if (
      !vulnerability ||
      !BLOCKING_SEVERITIES.has(String(vulnerability.severity).toLowerCase())
    ) {
      return false;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(packageName);
    const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
    const allowed =
      via.length > 0 &&
      via.every((entry) => {
        if (typeof entry === 'string') {
          return isAllowedPackage(entry, nextTrail);
        }
        return (
          packageName === ALLOWED_PRODUCTION_PACKAGE &&
          advisoryId(entry) === ALLOWED_PRODUCTION_ADVISORY.toUpperCase()
        );
      });

    allowedCache.set(packageName, allowed);
    return allowed;
  }

  const blockingPackages = [];
  const allowedPackages = [];
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (
      !BLOCKING_SEVERITIES.has(String(vulnerability?.severity).toLowerCase())
    ) {
      continue;
    }
    if (isAllowedPackage(packageName)) {
      allowedPackages.push(packageName);
    } else {
      blockingPackages.push(packageName);
    }
  }

  return {
    allowedPackages: allowedPackages.sort(),
    blockingPackages: blockingPackages.sort(),
  };
}

function runProductionAudit() {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = isWindows
    ? ['/d', '/s', '/c', 'npm audit --omit=dev --json']
    : ['audit', '--omit=dev', '--json'];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    console.error(`Production audit could not start: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = JSON.parse(result.stdout || '');
  } catch {
    console.error('Production audit returned an unreadable report.');
    if (result.stderr) console.error(result.stderr.trim());
    process.exitCode = 1;
    return;
  }

  const { allowedPackages, blockingPackages } =
    evaluateProductionAudit(report);

  if (allowedPackages.length > 0) {
    console.warn(
      `Temporarily allowing ${ALLOWED_PRODUCTION_ADVISORY} for ` +
        `${allowedPackages.join(', ')}. NOD Dashboard uses declarative ` +
        'BrowserRouter, not the affected unstable RSC APIs. Remove this ' +
        'exception when React Router 8.3.0 or a patched 7.x release is available.',
    );
  }

  if (blockingPackages.length > 0) {
    console.error(
      `Production audit failed for: ${blockingPackages.join(', ')}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Production audit passed with no unreviewed high or critical findings.');
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  runProductionAudit();
}
