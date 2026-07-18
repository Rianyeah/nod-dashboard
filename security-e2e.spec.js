import { test, expect } from '@playwright/test';

const E2E_BASE_URL = process.env.E2E_BASE_URL;
const E2E_DASHBOARD_USER = requiredEnvironment('E2E_DASHBOARD_USER');
const E2E_DASHBOARD_PASSWORD = requiredEnvironment('E2E_DASHBOARD_PASSWORD');

if (!E2E_BASE_URL) {
  throw new Error('E2E_BASE_URL must be set to the HTTPS dashboard URL before running security E2E tests.');
}

test.use({ channel: 'chrome' });

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set before running browser tests.`);
  return value;
}

async function login(page) {
  await page.goto(`${E2E_BASE_URL}/login`);
  await page.getByPlaceholder('Enter username').fill(E2E_DASHBOARD_USER);
  await page.getByPlaceholder('Enter password').fill(E2E_DASHBOARD_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/home');
}

test('session is HttpOnly, survives reload, and never enters Web Storage', async ({ page, context }) => {
  await login(page);

  const cookie = (await context.cookies()).find((item) => item.name === 'nod_session');
  expect(cookie).toBeDefined();
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe('Strict');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nod_auth_token'))).toBeNull();
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
});

test('logout invalidates browser access', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  const status = await page.evaluate(async () => (
    fetch('/api/v1/overview', { credentials: 'include' }).then((response) => response.status)
  ));
  expect(status).toBe(401);
});

test('anonymous users cannot access the dashboard', async ({ page }) => {
  await page.goto(`${E2E_BASE_URL}/home`);
  await expect(page).toHaveURL(/\/login$/);
});

test('production API rejects cross-origin credentials and hides documentation', async ({ request }) => {
  const [overview, docs, preflight, health] = await Promise.all([
    request.get(`${E2E_BASE_URL}/api/v1/overview`),
    request.get(`${E2E_BASE_URL}/docs`),
    request.fetch(`${E2E_BASE_URL}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    }),
    request.get(`${E2E_BASE_URL}/api/v1/health`),
  ]);

  expect(overview.status()).toBe(401);
  expect(docs.status()).toBe(404);
  expect(preflight.headers()['access-control-allow-origin']).toBeUndefined();
  expect(health.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['x-frame-options']).toBe('DENY');
});

test('core dashboard routes emit no CSP violations', async ({ page }) => {
  const cspViolations = [];
  page.on('console', (message) => {
    if (/content security policy|csp/i.test(message.text())) cspViolations.push(message.text());
  });

  await login(page);
  for (const route of ['/home', '/site-map', '/rf-tilt-analysis']) {
    await page.goto(`${E2E_BASE_URL}${route}`);
    await page.waitForLoadState('domcontentloaded');
  }

  expect(cspViolations).toEqual([]);
});
