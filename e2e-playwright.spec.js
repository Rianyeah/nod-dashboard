import { test, expect } from '@playwright/test';

test.use({
  channel: 'chrome'
});

async function authenticate(page, theme = 'dark') {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('nod_auth_token', 'test-token');
    localStorage.setItem('nod_theme', selectedTheme);
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
