import { test, expect } from '@playwright/test';

const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

test.use({
  channel: 'chrome'
});

async function authenticate(page, theme = 'dark') {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('nod_auth_token', 'test-token');
    localStorage.setItem('nod_theme', selectedTheme);
    localStorage.setItem('nod_last_activity', String(Date.now()));
  }, { selectedTheme: theme });
}

test('Dashboard loads and performs basic validations', async ({ page }) => {
  console.log('Navigating to http://127.0.0.1:5173/login ...');
  await page.goto('http://127.0.0.1:5173/login');

  console.log('Current page title:', await page.title());

  console.log('Filling login form...');
  await page.fill('input[placeholder="Enter username"]', 'admin');
  await page.fill('input[placeholder="Enter password"]', 'admin123');

  console.log('Submitting login form...');
  await page.click('button:has-text("Sign In")');

  console.log('Waiting for navigation to dashboard...');
  await page.waitForURL('**/dashboard');

  console.log('Verifying key dashboard components...');

  // Verify heading in uppercase
  await expect(page.locator('h1')).toContainText('NETWORK OPERATION DASHBOARD');
  console.log('OK Found Dashboard Heading!');

  // Check mapbox container
  const mapContainer = page.locator('.mapboxgl-map');
  await expect(mapContainer).toBeVisible({ timeout: 15000 });
  console.log('OK Found Mapbox Map Container!');

  // Check Summary Cards or general panels
  const panels = page.locator('.bg-slate-900, .bg-slate-800, .bg-white');
  const count = await panels.count();
  console.log(`OK Found ${count} dashboard panel/container elements!`);

  console.log('E2E testing completed successfully!');
});

test('Dashboard sidebar data settles without repeated summary refetches', async ({ page }) => {
  const requests = {
    summary: 0,
    worst: 0,
  };

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/availability/summary?')) requests.summary += 1;
    if (url.includes('/api/v1/availability/worst?')) requests.worst += 1;
  });

  await page.goto('http://127.0.0.1:5173/login');
  await page.fill('input[placeholder="Enter username"]', 'admin');
  await page.fill('input[placeholder="Enter password"]', 'admin123');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/dashboard');

  await page.locator('#filter-bulan').selectOption('4');
  await page.locator('#filter-tahun').selectOption('2026');
  await expect(page.getByText('Total Sites')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Top 10 Worst Sites')).toBeVisible();

  await page.waitForTimeout(2500);

  expect(requests.summary).toBeLessThanOrEqual(2);
  expect(requests.worst).toBeLessThanOrEqual(2);
});

test('Worst sites cards use light theme colors', async ({ page }) => {
  await authenticate(page, 'light');
  await page.goto('http://127.0.0.1:5173/dashboard');

  await page.locator('#filter-bulan').selectOption('4');
  await page.locator('#filter-tahun').selectOption('2026');
  await expect(page.getByText('Top 10 Worst Sites')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('SDA045', { exact: false })).toBeVisible({ timeout: 20000 });

  const firstWorstCard = page.locator('section:has-text("Top 10 Worst Sites") article').first();
  const backgroundColor = await firstWorstCard.evaluate((node) => getComputedStyle(node).backgroundColor);
  const channelValues = backgroundColor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  expect(channelValues.every((value) => value >= 240)).toBeTruthy();
});

test('Performance trend renders monthly availability line', async ({ page, request }) => {
  const trendResponse = await request.get('http://127.0.0.1:5173/api/v1/reporting/trend');
  expect(trendResponse.ok()).toBeTruthy();

  const trendData = await trendResponse.json();
  const availabilityPoints = trendData.filter((point) => point.avg_availability != null);
  expect(availabilityPoints.length).toBeGreaterThan(1);

  await authenticate(page, 'light');
  await page.goto('http://127.0.0.1:5173/reporting');
  await expect(page.getByText('Performance Trend')).toBeVisible({ timeout: 20000 });

  const availabilityPath = page.locator('path[stroke="#D97706"]').first();
  await expect(availabilityPath).toBeVisible({ timeout: 20000 });
  await expect(availabilityPath).toHaveAttribute('d', /[LC]/);
});

test('Reporting NOP filter is sent to scorecards chart and tables', async ({ page }) => {
  const filteredRequests = new Set();

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/api/v1/reporting/') && url.searchParams.get('nop')) {
      filteredRequests.add(url.pathname.replace('/api/v1/reporting/', ''));
    }
  });

  await authenticate(page, 'light');
  await page.goto('http://127.0.0.1:5173/reporting');
  await expect(page.locator('#reporting-nop')).toBeVisible({ timeout: 20000 });

  await page.waitForFunction(() => {
    const select = document.querySelector('#reporting-nop');
    return select && select.options.length > 1;
  });

  await page.locator('#reporting-nop').selectOption({ index: 1 });

  await expect.poll(() => Array.from(filteredRequests).sort()).toEqual([
    'battery-by-kabupaten',
    'revenue-by-kabupaten',
    'scorecards',
    'site-class-by-kabupaten',
    'trend',
  ]);
});

test('Impact Service filters are sent to scorecards charts table and modal', async ({ page }) => {
  const filteredRequests = new Set();
  let filterBounds = null;

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes('/api/v1/impact-service/')) return;
    if (url.pathname.endsWith('/filters')) return;
    if (url.searchParams.get('start_date') && url.searchParams.get('end_date')) {
      filteredRequests.add(url.pathname.replace('/api/v1/impact-service/', ''));
    }
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith('/api/v1/impact-service/filters')) return;
    expect(response.headers()['content-type'] || '').toContain('application/json');
    filterBounds = await response.json();
  });

  await authenticate(page, 'light');
  await page.goto(`${E2E_BASE_URL}/impact-service`);
  await expect(page.getByRole('heading', { name: 'Impact Service' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#impact-start-date')).toBeVisible();
  await expect(page.locator('#impact-end-date')).toBeVisible();
  await expect(page.locator('#impact-nop')).toBeVisible();

  await page.waitForFunction(() => {
    const select = document.querySelector('#impact-nop');
    return select && select.options.length > 1;
  });
  await expect.poll(() => filterBounds?.max_date).toBeTruthy();
  await expect.poll(() => filterBounds?.default_date).toBeTruthy();
  const expectedDefaultDate = filterBounds.default_date || filterBounds.max_date;
  await expect(page.locator('#impact-start-date')).toHaveValue(expectedDefaultDate);
  await expect(page.locator('#impact-end-date')).toHaveValue(expectedDefaultDate);
  await expect(page.locator('#impact-start-date')).not.toHaveAttribute('max', filterBounds.max_date);
  await expect(page.locator('#impact-end-date')).not.toHaveAttribute('max', filterBounds.max_date);

  await page.locator('#impact-end-date').fill(filterBounds.min_date);
  await expect(page.locator('#impact-start-date')).toHaveValue(filterBounds.min_date);
  await expect(page.locator('#impact-end-date')).toHaveValue(filterBounds.min_date);
  await expect(page.getByText('Rentang tanggal tidak valid')).toHaveCount(0);

  await page.locator('#impact-end-date').fill('2026-06-02');
  await expect(page.locator('#impact-end-date')).toHaveValue('2026-06-02');
  await expect(page.getByText('Rentang tanggal tidak valid')).toHaveCount(0);

  await page.locator('#impact-nop').selectOption({ index: 1 });
  await expect(page.getByText('Alarm Detail Table')).toBeVisible({ timeout: 20000 });

  await expect.poll(() => Array.from(filteredRequests).sort()).toEqual([
    'alarms',
    'daily-trend',
    'distributions',
    'summary',
    'top-alarms',
    'top-sites',
  ]);

  const firstRow = page.locator('[data-testid="impact-alarm-row"]').first();
  await expect(firstRow).toBeVisible({ timeout: 20000 });
  await firstRow.click();
  await expect(page.getByRole('dialog', { name: /Alarm Detail/ })).toBeVisible({ timeout: 20000 });

  await expect.poll(() => Array.from(filteredRequests).some((path) => /^alarms\/\d+$/.test(path))).toBeTruthy();
});
