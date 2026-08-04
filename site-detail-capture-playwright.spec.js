import { expect, test } from '@playwright/test';


const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';

const captureBundle = {
  site_id: 'BGL002',
  detail: {
    Siteid: 'BGL002',
    'Site Name': 'Taman Dayu Toll TBG',
    tahun: 2026,
    bulan: 6,
    avg_availability: 99.89,
    total_outage_menit: 1033,
    jumlah_cell: 22,
    rca_dominan: 'power',
    Kabupaten: 'Pasuruan',
    Kecamatan: 'Pandaan',
    Desa: 'Karangjati',
    NOP: 'NOP Sidoarjo',
    'New Cluster': 'TO Pasuruan',
    Latitude: '-7.665227',
    Longitude: '112.700443',
    Alamat: 'Dusun Jati Anom RT 001 RW 006, Desa Karang Jati, Kecamatan Pandaan, Kabupaten Pasuruan',
    'Site Class': 'Gold',
    'Type Site': 'Outdoor',
    'Category Site': 'End Site',
    'Status Site': 'Active',
    'OA DATE': '2021-12-21',
    TP: 'TBG',
    'Brand Type': '2G-4G',
    'Band NE': '(3)GSM900-(3)DCS1800-(3)L900-(3)L1800-(3)L2100-(3)L2300',
    DCS1800: 3,
    GSM900: 3,
    L900: 3,
    L1800: 3,
    L2100: 3,
    L2300: 7,
    'BACKUP POWER BY': 'ENOM 2.0',
    'Backup Time Battery': '1 Hours < X < 2 Hours',
    'Type Battery': 'Lithium',
    'Jumlah Battery': 1,
    'Umur Battery (Tahun)': '4.13',
    'Jalur Pemadaman': 'JP Winongan',
    'Transport Type': 'FO_TELKOM',
    'Jenis Infra': 'Permanent',
    'Kriteria PM Site': '8. TT Outdoor',
    modem_transport: 'ONT',
    jumper_modem: 'UTP',
    custom_capture_field: 'final detail row',
  },
  trend_data: [
    { bulan: 1, tahun: 2026, avg_availability: 99.91 },
    { bulan: 2, tahun: 2026, avg_availability: 99.93 },
    { bulan: 3, tahun: 2026, avg_availability: 99.87 },
    { bulan: 4, tahun: 2026, avg_availability: 99.9 },
    { bulan: 5, tahun: 2026, avg_availability: 99.94 },
    { bulan: 6, tahun: 2026, avg_availability: 99.89 },
  ],
  performance_data: {
    total_revenue: 108800000,
    revenue_mom_pct: 5.3,
    total_payload: 33400,
    payload_mom_pct: 2.3,
    trx_month: '2026-07',
  },
};


test('capture route reaches ready without session bootstrap and exposes full modal height', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/api/v1/integrations/n8n/site-detail-capture/BGL002', async (route) => {
    expect(await route.request().headerValue('authorization')).toBe('Bearer capture-test-token');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(captureBundle) });
  });

  await page.goto(`${baseUrl}/capture/site-detail/BGL002#token=capture-test-token`);

  const root = page.locator('[data-capture-site-id="BGL002"]');
  await expect(root).toHaveAttribute('data-capture-state', 'ready');
  await expect(page.locator('[data-capture-title]')).toHaveText('BGL002');
  await expect(page.locator('text=Periode Data')).toBeVisible();
  await expect(page.locator('text=Kualitas Data')).toBeVisible();
  await expect(page.locator('text=final detail row')).toBeVisible();
  await expect(page).toHaveURL(/\/capture\/site-detail\/BGL002$/);

  const captureLayout = await page.locator('.site-detail-modal').evaluate((modal) => {
    const scroll = modal.querySelector('.site-detail-scroll');
    const modalStyle = window.getComputedStyle(modal);
    const scrollStyle = window.getComputedStyle(scroll);
    return {
      height: modal.getBoundingClientRect().height,
      scrollHeight: scroll.scrollHeight,
      overflowY: scrollStyle.overflowY,
      maskImage: scrollStyle.maskImage,
      maxHeight: modalStyle.maxHeight,
    };
  });

  expect(captureLayout.height).toBeGreaterThan(1000);
  expect(captureLayout.scrollHeight).toBeGreaterThan(720);
  expect(captureLayout.overflowY).toBe('visible');
  expect(captureLayout.maskImage).toBe('none');
  expect(captureLayout.maxHeight).toBe('none');
  expect(requests.some((url) => url.includes('/api/v1/auth/session'))).toBeFalsy();
});
