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

function shiftIsoDate(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function chooseSelectOption(page, selector, optionName) {
  await page.locator(selector).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function expectSeriesTooltipColors(page, chartTestId, shapeSelector = 'path.recharts-rectangle') {
  const chart = page.getByTestId(chartTestId);
  await expect(chart).toBeVisible({ timeout: 20000 });
  const shape = chart.locator(shapeSelector).first();
  await expect(shape).toBeVisible();
  await shape.hover({ force: true });

  const seriesName = page.locator('[data-series-name]:visible').first();
  const seriesValue = page.locator('[data-series-value]:visible').first();
  await expect(seriesName).toBeVisible();
  await expect(seriesValue).toBeVisible();

  const [nameColor, valueColor] = await Promise.all([
    seriesName.evaluate((node) => getComputedStyle(node).color),
    seriesValue.evaluate((node) => getComputedStyle(node).color),
  ]);
  expect(nameColor).toBe(valueColor);
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

  await chooseSelectOption(page, '#filter-bulan', 'April');
  await chooseSelectOption(page, '#filter-tahun', '2026');
  await expect(page.getByText('Total Sites')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Top 10 Worst Sites')).toBeVisible();

  await page.waitForTimeout(2500);

  expect(requests.summary).toBeLessThanOrEqual(2);
  expect(requests.worst).toBeLessThanOrEqual(2);
});

test('Worst sites cards use light theme colors', async ({ page }) => {
  await authenticate(page, 'light');
  await page.goto('http://127.0.0.1:5173/dashboard');

  await chooseSelectOption(page, '#filter-bulan', 'April');
  await chooseSelectOption(page, '#filter-tahun', '2026');
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

  await page.locator('#reporting-nop').click();
  const nopOptions = page.getByRole('option');
  await expect.poll(() => nopOptions.count()).toBeGreaterThan(1);
  const nopLabel = await nopOptions.nth(1).textContent();
  const nopSearch = page.getByRole('dialog').getByRole('combobox');
  await nopSearch.fill('Semua NOP');
  await nopSearch.press('ArrowDown');
  await nopSearch.press('Enter');
  await expect(page.locator('#reporting-nop')).toContainText('Semua NOP');

  filteredRequests.clear();
  await page.locator('#reporting-nop').click();
  const reopenedNopSearch = page.getByRole('dialog').getByRole('combobox');
  await reopenedNopSearch.fill(nopLabel.trim());
  await reopenedNopSearch.press('ArrowDown');
  await reopenedNopSearch.press('Enter');
  await expect(page.locator('#reporting-nop')).toContainText(nopLabel.trim());

  await expect.poll(() => Array.from(filteredRequests).sort()).toEqual([
    'battery-by-kabupaten',
    'revenue-by-kabupaten',
    'scorecards',
    'site-class-by-kabupaten',
    'trend',
  ]);
});

test('Transport Quality charts preserve adaptive Popover behavior and responsive tooltips', async ({ page }) => {
  const requests = [];

  await page.route('**/api/v1/transport-quality/**', async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/api/v1/transport-quality/', '');
    requests.push({
      endpoint,
      thiStatus: url.searchParams.get('thi_status'),
    });

    const responses = {
      filters: {
        max_date: '2026-06-12',
        periods: [{ date: '2026-06-12', label: '12 Jun 2026' }],
        nops: ['SIDOARJO'],
        kabupaten: ['SIDOARJO'],
        transport_types: ['IP'],
        thi_statuses: ['FAIL', 'PASS'],
        distribution_pl: ['HIGH'],
        pl_status_0_1_pct: ['FAIL'],
        distribution_lat: ['HIGH'],
        jitter_statuses: ['FAIL'],
      },
      summary: {
        date: '2026-06-12',
        week: 24,
        total_records: 24,
        total_sites: 12,
        pl_over_1_sites: 4,
        latency_over_5_sites: 3,
        flag_pl_fail_sites: 2,
        thi_fail_sites: 2,
        p1_sites: 1,
        p2_sites: 2,
        priority_sites: 3,
        avg_packet_loss: 1.2,
        avg_latency: 4.8,
        avg_jitter: 2.1,
      },
      trend: [
        { date: '2026-05-29', week: 22, total_sites: 12, pl_over_1_sites: 3, latency_over_5_sites: 2, jitter_not_clear_sites: 1, thi_fail_sites: 2, p1_sites: 1 },
        { date: '2026-06-05', week: 23, total_sites: 12, pl_over_1_sites: 5, latency_over_5_sites: 4, jitter_not_clear_sites: 2, thi_fail_sites: 3, p1_sites: 2 },
        { date: '2026-06-12', week: 24, total_sites: 12, pl_over_1_sites: 4, latency_over_5_sites: 3, jitter_not_clear_sites: 1, thi_fail_sites: 2, p1_sites: 1 },
      ],
      distributions: {
        by_packet_loss: [
          { label: '0-1%', records: 18, sites: 9, bad_records: 0 },
          { label: '>1%', records: 6, sites: 4, bad_records: 6 },
        ],
        by_latency: [
          { label: '0-5ms', records: 20, sites: 10, bad_records: 0 },
          { label: '>5ms', records: 4, sites: 3, bad_records: 4 },
        ],
        by_jitter: [],
      },
      breakdowns: {
        by_nop: [
          { label: 'SIDOARJO', records: 12, sites: 6, p1_sites: 1, p2_sites: 2, pl_over_1_sites: 3, latency_over_5_sites: 2 },
          { label: 'SURABAYA', records: 12, sites: 6, p1_sites: 0, p2_sites: 1, pl_over_1_sites: 1, latency_over_5_sites: 1 },
        ],
        by_kabupaten: [
          { label: 'SIDOARJO', records: 12, sites: 6, p1_sites: 1, p2_sites: 2, pl_over_1_sites: 3, latency_over_5_sites: 2 },
          { label: 'GRESIK', records: 12, sites: 6, p1_sites: 0, p2_sites: 1, pl_over_1_sites: 1, latency_over_5_sites: 1 },
        ],
        by_transport_type: [],
      },
      'priority-sites': {
        items: [{
          site_id: 'SDA001',
          site_name: 'Sidoarjo Kota',
          nop: 'SIDOARJO',
          kabupaten: 'SIDOARJO',
          transport_type: 'IP',
          avg_packet_loss: 2.4,
          latency: 7.2,
          jitter: 3.1,
          pl_over_threshold: true,
          latency_over_threshold: true,
          priority_level: 'P1',
          priority_score: 4,
          action_hint: 'Investigate',
        }],
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
      },
    };

    await fulfillJson(route, responses[endpoint] ?? {});
  });

  await authenticate(page, 'dark');
  await page.goto(`${E2E_BASE_URL}/transport-quality`);
  await expect(page.getByTestId('transport-filter-sheet')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('transport-filter-sheet').click();
  await expect(page.locator('[data-slot="popover-content"]').filter({ hasText: 'Filter kualitas lanjutan' })).toBeVisible();
  await chooseSelectOption(page, '#transport-thi-status', 'FAIL');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot="popover-content"]').filter({ hasText: 'Filter kualitas lanjutan' })).toHaveCount(0);

  await page.getByTestId('transport-filter-sheet').click();
  await expect(page.locator('#transport-thi-status')).toContainText('Semua');
  await chooseSelectOption(page, '#transport-thi-status', 'FAIL');
  await page.locator('[data-slot="popover-content"]').filter({ hasText: 'Filter kualitas lanjutan' }).getByRole('button', { name: 'Batal' }).click();
  await expect(page.getByText('THI: FAIL', { exact: true })).toHaveCount(0);

  requests.length = 0;
  await page.getByTestId('transport-filter-sheet').click();
  await chooseSelectOption(page, '#transport-thi-status', 'FAIL');
  await page.locator('[data-slot="popover-content"]').filter({ hasText: 'Filter kualitas lanjutan' }).getByRole('button', { name: 'Terapkan' }).click();
  await expect(page.getByText('THI: FAIL', { exact: true })).toBeVisible();

  await expect.poll(() => [...new Set(
    requests.filter((entry) => entry.thiStatus === 'FAIL').map((entry) => entry.endpoint),
  )].sort()).toEqual([
    'breakdowns',
    'distributions',
    'priority-sites',
    'summary',
    'trend',
  ]);

  await page.getByRole('button', { name: 'Hapus filter THI' }).click();
  await expect(page.getByText('THI: FAIL', { exact: true })).toHaveCount(0);

  await expect(page.getByTestId('transport-packet-loss-chart').locator('[data-chart-value-label]')).toContainText(['18', '6']);
  await expectSeriesTooltipColors(page, 'transport-packet-loss-chart');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBeTruthy();
});

test('Activity ENOM charts render shadcn labels, colored tooltips, and mobile layout', async ({ page }) => {
  const requests = [];

  await page.route('**/api/v1/activity-enom/**', async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/api/v1/activity-enom/', '');
    requests.push({
      endpoint,
      sortBy: url.searchParams.get('sort_by'),
      sortDir: url.searchParams.get('sort_dir'),
    });
    const responses = {
      filters: {
        months: [
          { value: '2026-04-01', label: 'April 2026' },
          { value: '2026-03-01', label: 'Maret 2026' },
        ],
        nops: ['SIDOARJO', 'SURABAYA'],
        categories: ['Preventive', 'Corrective'],
        default_month: '2026-04-01',
      },
      summary: {
        month_date: '2026-04-01',
        total_activity: 30,
        impacted_sites: 18,
        open_activity: 12,
        close_activity: 18,
        completion_rate: 60,
      },
      trend: [
        { create_date: '2026-02-01', total: 20, open: 8, close: 12, sites: 11 },
        { create_date: '2026-03-01', total: 25, open: 10, close: 15, sites: 14 },
        { create_date: '2026-04-01', total: 30, open: 12, close: 18, sites: 18 },
      ],
      breakdowns: {
        breakdown_title: 'NOP Contribution',
        ranking_title: 'Ranking NOP',
        contribution: [
          { label: 'SIDOARJO', total: 18, open: 6, close: 12, sites: 10, completion_rate: 66.7 },
          { label: 'SURABAYA', total: 12, open: 6, close: 6, sites: 8, completion_rate: 50 },
        ],
        ranking: [
          { label: 'SIDOARJO', total: 18, open: 6, close: 12, sites: 10, completion_rate: 66.7 },
          { label: 'SURABAYA', total: 12, open: 6, close: 6, sites: 8, completion_rate: 50 },
        ],
        by_category: [
          { label: 'Preventive', total: 20, open: 6, close: 14, sites: 12, completion_rate: 70 },
          { label: 'Corrective', total: 10, open: 6, close: 4, sites: 6, completion_rate: 40 },
        ],
        by_status: [],
        by_week_done: [
          { label: 'W1', total: 8, open: 0, close: 8, sites: 6, completion_rate: 100 },
          { label: 'W2', total: 10, open: 2, close: 8, sites: 7, completion_rate: 80 },
        ],
      },
      'top-activities': [
        { activity: 'Battery Check', total: 12, open: 4, close: 8, sites: 8 },
      ],
      activities: { items: [], total: 0, page: 1, limit: 20, total_pages: 0 },
    };
    await fulfillJson(route, responses[endpoint] ?? {});
  });

  await authenticate(page, 'dark');
  await page.goto(`${E2E_BASE_URL}/activity-enom`);
  await expect(page.getByRole('heading', { name: 'Activity ENOM' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('activity-monthly-trend-chart').locator('[data-chart-value-label]')).toContainText(['8', '12']);
  await expectSeriesTooltipColors(page, 'activity-monthly-trend-chart');
  await expect(page.getByTestId('activity-dashboard-chart-grid').locator(':scope > *')).toHaveCount(6);

  const [
    trendPanel,
    rankingPanel,
    contributionPanel,
    categoryPanel,
    topActivityPanel,
    weekDonePanel,
  ] = await Promise.all([
    page.getByTestId('activity-monthly-trend-panel').boundingBox(),
    page.getByTestId('activity-ranking-panel').boundingBox(),
    page.getByTestId('activity-contribution-panel').boundingBox(),
    page.getByTestId('activity-category-panel').boundingBox(),
    page.getByTestId('activity-top-activity-panel').boundingBox(),
    page.getByTestId('activity-week-done-panel').boundingBox(),
  ]);

  expect(Math.abs(trendPanel.y - rankingPanel.y)).toBeLessThanOrEqual(4);
  expect(Math.abs(contributionPanel.y - categoryPanel.y)).toBeLessThanOrEqual(4);
  expect(categoryPanel.x).toBeGreaterThan(contributionPanel.x);
  expect(rankingPanel.y + rankingPanel.height).toBeGreaterThanOrEqual(categoryPanel.y + categoryPanel.height - 4);
  expect(Math.abs(topActivityPanel.y - weekDonePanel.y)).toBeLessThanOrEqual(4);
  expect(topActivityPanel.width).toBeGreaterThan(weekDonePanel.width);

  const toolbarControlsAreAligned = await page.getByTestId('activity-enom-table-toolbar').evaluate((toolbar) => {
    const controls = Array.from(toolbar.querySelector(':scope > div')?.children || []);
    if (controls.length < 2) return false;
    const tops = controls.map((control) => Math.round(control.getBoundingClientRect().top));
    return Math.max(...tops) - Math.min(...tops) <= 4;
  });
  expect(toolbarControlsAreAligned).toBeTruthy();

  const siteIdSort = page.getByTestId('activity-enom-sort-site_id');
  await expect(siteIdSort.locator('xpath=..')).toHaveAttribute('aria-sort', 'none');
  requests.length = 0;
  await siteIdSort.click();
  await expect(siteIdSort.locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => requests.some((request) => (
    request.endpoint === 'activities'
    && request.sortBy === 'site_id'
    && request.sortDir === 'asc'
  ))).toBeTruthy();
  expect(requests.every((request) => request.endpoint === 'activities')).toBeTruthy();

  requests.length = 0;
  await siteIdSort.click();
  await expect(siteIdSort.locator('xpath=..')).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => requests.some((request) => (
    request.endpoint === 'activities'
    && request.sortBy === 'site_id'
    && request.sortDir === 'desc'
  ))).toBeTruthy();
  expect(requests.every((request) => request.endpoint === 'activities')).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBeTruthy();
});

test('Ticketing charts render donut, true Pareto, colored tooltips, and mobile layout', async ({ page }) => {
  await page.route('**/api/v1/ticketing/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/ticketing/', '');
    const responses = {
      filters: {
        min_date: '2026-06-01',
        max_date: '2026-06-13',
        default_start_date: '2026-06-01',
        default_end_date: '2026-06-13',
        years: [2026],
        months: [6],
        nops: ['SIDOARJO'],
        clusters: ['SDA'],
        categories: ['BPS', 'TS'],
        sla_statuses: ['IN SLA', 'OUT SLA'],
        ticket_statuses: ['OPEN', 'CLOSED'],
        backup_sukses: ['YES', 'NO'],
        rc_categories: ['POWER', 'TRANSPORT'],
      },
      dashboard: {
        summary: {
          total_tickets: 24,
          total_tickets_mom_delta: 4,
          total_tickets_mom_rate: 20,
          ticket_category: { bps: 14, ts: 10, total: 24 },
          out_sla_tickets: 8,
          out_sla_rate: 33.3,
          median_mttr_hours: 2.5,
          visitation_tickets: 10,
          visitation_rate: 41.7,
          p90_response_minutes: 30,
          backup_sukses_tickets: 7,
          backup_sukses_rate: 70,
          escalated_tickets: 3,
          escalated_rate: 12.5,
          manual_takeover_tickets: 2,
          manual_takeover_rate: 8.3,
          closed_tickets: 16,
          closed_rate: 66.7,
          canceled_tickets: 1,
          last_created_at: '2026-06-13T08:00:00',
        },
        trend: [
          { day: '2026-06-11', label: '11 Jun', bps: 4, ts: 2, total: 6 },
          { day: '2026-06-12', label: '12 Jun', bps: 5, ts: 3, total: 8 },
          { day: '2026-06-13', label: '13 Jun', bps: 5, ts: 5, total: 10 },
        ],
        sla_distribution: [
          { label: 'IN SLA', tickets: 16, out_sla: 0, out_sla_rate: 0 },
          { label: 'OUT SLA', tickets: 8, out_sla: 8, out_sla_rate: 100 },
        ],
        backup_distribution: [],
        location_breakdown_title: 'Kabupaten/Kota Distribution',
        location_breakdown: [
          { label: 'SIDOARJO', tickets: 14, out_sla: 4, out_sla_rate: 28.6 },
          { label: 'SURABAYA', tickets: 10, out_sla: 4, out_sla_rate: 40 },
        ],
        visiting_backup_distribution: [
          { label: 'BPS', tickets: 14, visiting_site: 8, backup_genset: 5, backup_rate: 62.5 },
          { label: 'TS', tickets: 10, visiting_site: 4, backup_genset: 2, backup_rate: 50 },
        ],
        rc_category_pareto: [
          { label: 'POWER', tickets: 12, cumulative_rate: 50 },
          { label: 'TRANSPORT', tickets: 8, cumulative_rate: 83.3 },
          { label: 'OTHER', tickets: 4, cumulative_rate: 100 },
        ],
        top_sites: [],
      },
      tickets: { items: [], total: 0, page: 1, limit: 20, total_pages: 0 },
    };
    await fulfillJson(route, responses[endpoint] ?? {});
  });

  await authenticate(page, 'light');
  await page.goto(`${E2E_BASE_URL}/ticketing`);
  await expect(page.getByRole('heading', { name: 'Ticketing' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('ticketing-sla-donut-chart')).toContainText('24');
  await expect(page.getByTestId('ticketing-pareto-chart').locator('[data-chart-value-label]')).toContainText(['12', '8', '4']);
  await expectSeriesTooltipColors(page, 'ticketing-pareto-chart');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBeTruthy();
});

test('Impact Service shadcn flow keeps dashboard and table requests isolated', async ({ page }) => {
  const requests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes('/api/v1/impact-service/')) return;
    if (url.pathname.endsWith('/filters')) return;
    requests.push({
      endpoint: url.pathname.replace('/api/v1/impact-service/', ''),
      startDate: url.searchParams.get('start_date'),
      endDate: url.searchParams.get('end_date'),
      nop: url.searchParams.get('nop'),
      query: url.searchParams.get('q'),
      status: url.searchParams.get('status'),
      severity: url.searchParams.get('severity'),
      page: url.searchParams.get('page'),
      limit: url.searchParams.get('limit'),
      sortBy: url.searchParams.get('sort_by'),
      sortDir: url.searchParams.get('sort_dir'),
    });
  });

  await authenticate(page, 'light');
  const filterResponsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith('/api/v1/impact-service/filters')
  ));
  await page.goto(`${E2E_BASE_URL}/impact-service`);
  const filterResponse = await filterResponsePromise;
  expect(filterResponse.headers()['content-type'] || '').toContain('application/json');
  const filterBounds = await filterResponse.json();
  await expect(page.getByRole('heading', { name: 'Impact Service' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('impact-date-range-trigger')).toBeVisible();
  await expect(page.getByTestId('impact-nop')).toBeVisible();
  await expect(page.getByText('Alarm Detail Table')).toBeVisible({ timeout: 20000 });
  expect(filterBounds?.max_date).toBeTruthy();
  expect(filterBounds?.default_date).toBeTruthy();

  const expectedDefaultDate = filterBounds.default_date || filterBounds.max_date;
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'daily-trend'
    && entry.endDate === expectedDefaultDate
    && entry.startDate === shiftIsoDate(expectedDefaultDate, -6)
  ))).toBeTruthy();

  const rangeStart = shiftIsoDate(expectedDefaultDate, -1) >= filterBounds.min_date
    ? shiftIsoDate(expectedDefaultDate, -1)
    : expectedDefaultDate;
  const rangeEnd = rangeStart === expectedDefaultDate
    ? shiftIsoDate(expectedDefaultDate, 1)
    : expectedDefaultDate;
  const rangeStartLabel = await page.evaluate((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  }, rangeStart);
  const rangeEndLabel = await page.evaluate((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  }, rangeEnd);

  requests.length = 0;
  await page.getByTestId('impact-date-range-trigger').click();
  await expect(page.locator('[data-slot="calendar"] .rdp-month')).toHaveCount(2);
  await page.locator(`[data-day="${rangeStartLabel}"]:visible`).first().click();
  const applyRangeButton = page.getByTestId('impact-date-apply');
  if (
    await applyRangeButton.getAttribute('data-range-from') !== rangeStart
    || await applyRangeButton.getAttribute('data-range-to') !== rangeEnd
  ) {
    await page.locator(`[data-day="${rangeEndLabel}"]:visible`).first().click();
  }
  await expect(applyRangeButton).toHaveAttribute('data-range-from', rangeStart);
  await expect(applyRangeButton).toHaveAttribute('data-range-to', rangeEnd);
  await applyRangeButton.click();

  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'summary'
    && entry.startDate === rangeStart
    && entry.endDate === rangeEnd
  ))).toBeTruthy();
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'daily-trend'
    && entry.startDate === shiftIsoDate(rangeEnd, -6)
    && entry.endDate === rangeEnd
  ))).toBeTruthy();

  await page.getByTestId('impact-reset').click();
  await expect(page.getByTestId('impact-date-range-trigger')).toContainText('2026');

  requests.length = 0;
  await page.getByTestId('impact-nop').click();
  const nopOptions = page.getByRole('option');
  await expect.poll(() => nopOptions.count()).toBeGreaterThan(1);
  await nopOptions.nth(1).click();

  await expect.poll(() => [...new Set(
    requests.filter((entry) => entry.nop).map((entry) => entry.endpoint),
  )].sort()).toEqual([
    'alarms',
    'daily-trend',
    'distributions',
    'summary',
    'top-alarms',
    'top-sites',
  ]);

  requests.length = 0;
  await page.getByTestId('impact-search').fill('site');
  await expect.poll(() => requests.some((entry) => entry.endpoint === 'alarms' && entry.query === 'site')).toBeTruthy();
  expect(requests.every((entry) => entry.endpoint === 'alarms')).toBeTruthy();

  requests.length = 0;
  await page.getByTestId('impact-status').click();
  await page.getByRole('option', { name: 'OPEN', exact: true }).click();
  await expect.poll(() => requests.some((entry) => entry.endpoint === 'alarms' && entry.status === 'OPEN')).toBeTruthy();
  expect(requests.every((entry) => entry.endpoint === 'alarms')).toBeTruthy();

  const nextButton = page.getByTestId('impact-next-page');
  if (await nextButton.isEnabled()) {
    requests.length = 0;
    await nextButton.click();
    await expect.poll(() => requests.some((entry) => entry.endpoint === 'alarms' && entry.page === '2')).toBeTruthy();
    expect(requests.every((entry) => entry.endpoint === 'alarms')).toBeTruthy();
  }

  await page.getByTestId('impact-search').fill('');
  await page.getByTestId('impact-status').click();
  await page.getByRole('option', { name: 'Semua Status', exact: true }).click();
  requests.length = 0;

  await page.getByTestId('impact-sort-severity').click();
  await expect(page.getByTestId('impact-sort-severity').locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'alarms'
    && entry.sortBy === 'severity'
    && entry.sortDir === 'asc'
    && entry.page === '1'
  ))).toBeTruthy();
  expect(requests.every((entry) => entry.endpoint === 'alarms')).toBeTruthy();

  requests.length = 0;
  await page.getByTestId('impact-sort-severity').click();
  await expect(page.getByTestId('impact-sort-severity').locator('xpath=..')).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'alarms'
    && entry.sortBy === 'severity'
    && entry.sortDir === 'desc'
  ))).toBeTruthy();

  requests.length = 0;
  await page.getByRole('button', { name: 'Reset tabel', exact: true }).click();
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'alarms'
    && entry.query == null
    && entry.status == null
    && entry.severity == null
    && entry.sortBy === 'tanggal'
    && entry.sortDir === 'desc'
    && entry.page === '1'
  ))).toBeTruthy();
  expect(requests.every((entry) => entry.endpoint === 'alarms')).toBeTruthy();

  await page.evaluate(() => {
    window.print = () => {
      window.__impactServicePrinted = true;
    };
  });
  requests.length = 0;
  await page.getByTestId('impact-print').click();
  await expect.poll(() => requests.some((entry) => (
    entry.endpoint === 'alarms'
    && entry.status === 'OPEN'
    && entry.limit === '100'
    && entry.sortBy === 'severity'
    && entry.sortDir === 'asc'
    && entry.query == null
    && entry.severity == null
  ))).toBeTruthy();
  await expect.poll(
    () => page.evaluate(() => window.__impactServicePrinted === true),
    { timeout: 15000 },
  ).toBeTruthy();
  await expect(page.getByText('OPEN Alarm Prioritas')).toHaveCount(1);

  requests.length = 0;
  const firstRow = page.locator('[data-testid="impact-alarm-row"]').first();
  await expect(firstRow).toBeVisible({ timeout: 20000 });
  await firstRow.click();
  await expect(page.getByRole('dialog', { name: /Alarm Detail/ })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Alarm Detail/ })).toHaveCount(0);

  await expect.poll(() => requests.some((entry) => /^alarms\/\d+$/.test(entry.endpoint))).toBeTruthy();

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('impact-date-range-trigger').click();
  await expect(page.locator('[data-slot="calendar"] .rdp-month')).toHaveCount(1);
  await page.keyboard.press('Escape');
});
