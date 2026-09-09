import { expect, test } from '@playwright/test';


const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const DATASETS = ['impact_service', 'data_master', 'activity_enom'];

test.use({ channel: 'chrome' });

function emptyJobs() {
  return Object.fromEntries(DATASETS.map((dataset) => [dataset, null]));
}

function publicJob(dataset, status, id = `${dataset}-job`) {
  const terminal = ['succeeded', 'failed', 'timed_out'].includes(status);
  const resultCode = status === 'succeeded'
    ? 'completed'
    : status === 'failed' ? 'workflow_failed' : status === 'timed_out' ? 'timed_out' : null;
  return {
    id,
    dataset,
    status,
    started_at: new Date(Date.now() - 2_000).toISOString(),
    finished_at: terminal ? new Date().toISOString() : null,
    rows_processed: status === 'succeeded' ? 25 : null,
    result_code: resultCode,
    public_message: status === 'succeeded'
      ? 'Sinkronisasi selesai.'
      : status === 'timed_out' ? 'Sinkronisasi melewati batas waktu.' : terminal ? 'Sinkronisasi gagal.' : null,
  };
}

async function json(route, body, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installMockApi(page, { enabled = true } = {}) {
  const control = {
    authenticated: true,
    enabled,
    jobs: emptyJobs(),
    starts: [],
    requests: new Map(),
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    control.requests.set(path, (control.requests.get(path) || 0) + 1);

    if (path === '/auth/session') {
      return json(route, control.authenticated ? {
        authenticated: true,
        username: 'viewer-e2e',
        role: 'viewer',
        permissions: ['dashboard:view', 'data_sync:trigger'],
      } : { authenticated: false });
    }
    if (path === '/auth/logout') {
      control.authenticated = false;
      return json(route, { authenticated: false });
    }
    if (path === '/data-sync/status') {
      return json(route, { enabled: control.enabled, jobs: control.jobs });
    }
    if (request.method() === 'POST' && path.startsWith('/data-sync/')) {
      const dataset = decodeURIComponent(path.split('/').at(-1));
      control.starts.push(dataset);
      const joined = dataset === 'data_master';
      const job = publicJob(dataset, 'running');
      control.jobs[dataset] = job;
      return json(route, { job, already_running: joined });
    }

    if (path === '/impact-service/filters') {
      return json(route, {
        min_date: '2026-09-01',
        max_date: '2026-09-08',
        today: '2026-09-08',
        default_date: '2026-09-08',
        has_today_data: true,
        nops: ['NOP MALANG', 'NOP SURABAYA'],
      });
    }
    if (path === '/impact-service/distributions') {
      return json(route, { by_severity: [], by_category: [], by_aging_range: [], by_sow: [], by_nop: [] });
    }
    if (path === '/impact-service/alarms') {
      return json(route, { items: [], total: 0, page: 1, limit: 20, total_pages: 0 });
    }
    if (path.startsWith('/impact-service/')) {
      return json(route, path.endsWith('/summary') ? {} : []);
    }

    if (path === '/sites/filters/options') return json(route, { nop: ['NOP MALANG', 'NOP SURABAYA'] });
    if (path === '/data-potensi/status-options') return json(route, ['Active', 'Inactive']);
    if (path === '/data-potensi/filter-options') {
      return json(route, {
        clusters: [], kabupaten: [], site_classes: [], type_sites: [],
        transport_types: [], battery_types: [], tower_providers: [],
      });
    }
    if (path === '/data-potensi/dashboard') return json(route, { scorecard: {} });
    if (path === '/data-potensi/sites') {
      return json(route, { data: [], total: 0, page: 1, limit: 20, total_pages: 0 });
    }

    if (path === '/activity-enom/filters') {
      return json(route, {
        years: [2026],
        months: [{ value: '2026-09', label: 'September 2026' }],
        nops: ['NOP MALANG'],
        categories: ['Preventive'],
        default_year: 2026,
        default_month: '2026-09',
        available_months: ['2026-09'],
      });
    }
    if (path === '/activity-enom/breakdowns') {
      return json(route, {
        breakdown_title: 'NOP Contribution', ranking_title: 'Ranking NOP',
        contribution: [], ranking: [], by_category: [], by_status: [], by_week_done: [],
      });
    }
    if (path === '/activity-enom/activities') {
      return json(route, { items: [], total: 0, page: 1, limit: 20, total_pages: 0 });
    }
    if (path.startsWith('/activity-enom/')) {
      return json(route, path.endsWith('/summary') ? {} : []);
    }

    return json(route, {});
  });

  return control;
}

async function openDashboard(page, path) {
  await page.goto(`${BASE_URL}${path}`);
  await expect(page.getByRole('button', { name: 'Sync Data' })).toBeVisible({ timeout: 20_000 });
}

async function finishJob(page, control, dataset, status) {
  control.jobs[dataset] = publicJob(dataset, status);
  const label = status === 'succeeded' ? 'Synced' : status === 'failed' ? 'Sync failed' : 'Timed out';
  await expect(page.getByRole('button', { name: label })).toBeVisible({ timeout: 8_000 });
}

test('viewer can sync all datasets, keep working, and refresh after success', async ({ page }) => {
  test.setTimeout(90_000);
  const control = await installMockApi(page);

  await openDashboard(page, '/impact-service');
  const impactSummaryBefore = control.requests.get('/impact-service/summary') || 0;
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await expect(page.getByRole('button', { name: /^Syncing \d{2}:\d{2}$/ })).toBeVisible();

  await page.getByRole('link', { name: 'Data Potensi' }).click();
  await expect(page).toHaveURL(/\/data-potensi$/);
  await page.locator('#data-potensi-status-filter').click();
  await expect(page.getByRole('option', { name: 'Inactive' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Impact Service' }).click();
  await expect(page.getByRole('button', { name: /^Syncing \d{2}:\d{2}$/ })).toBeVisible();

  await finishJob(page, control, 'impact_service', 'succeeded');
  await expect(page.getByText('Sinkronisasi selesai.')).toBeVisible();
  await expect.poll(() => control.requests.get('/impact-service/summary') || 0).toBeGreaterThan(impactSummaryBefore);

  await page.getByRole('link', { name: 'Data Potensi' }).click();
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await expect(page.getByRole('button', { name: /^Syncing \d{2}:\d{2}$/ })).toBeVisible();
  await finishJob(page, control, 'data_master', 'succeeded');

  await page.getByRole('link', { name: 'Activity ENOM' }).click();
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await expect(page.getByRole('button', { name: /^Syncing \d{2}:\d{2}$/ })).toBeVisible();
  await finishJob(page, control, 'activity_enom', 'succeeded');

  expect(control.starts).toEqual(DATASETS);
});

test('terminal failures, timeouts, logout cleanup, and disabled controls are safe', async ({ page }) => {
  test.setTimeout(60_000);
  const control = await installMockApi(page);

  await openDashboard(page, '/data-potensi');
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await finishJob(page, control, 'data_master', 'failed');
  await expect(page.getByText('Sinkronisasi gagal.')).toBeVisible();

  await page.getByRole('link', { name: 'Activity ENOM' }).click();
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await finishJob(page, control, 'activity_enom', 'timed_out');
  await expect(page.getByText('Sinkronisasi melewati batas waktu.')).toBeVisible();

  await page.getByRole('link', { name: 'Impact Service' }).click();
  await page.getByRole('button', { name: 'Sync Data' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /^Syncing/ })).toHaveCount(0);

  control.authenticated = true;
  control.enabled = false;
  control.jobs = emptyJobs();
  await page.goto(`${BASE_URL}/activity-enom`);
  await expect(page.getByRole('heading', { name: 'Activity ENOM' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync Data' })).toHaveCount(0);
});
