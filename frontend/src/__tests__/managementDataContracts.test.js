/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('Management Data contracts', () => {
  it('guards the route and sidebar using server-provided permissions', () => {
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');

    assert.match(app, /path="\/management-data"/);
    assert.match(app, /permission="management_data:write"/);
    assert.match(auth, /session\.permissions/);
    assert.match(auth, /hasPermission/);
    assert.match(sidebar, /Management Data/);
    assert.match(sidebar, /management_data:write/);
  });

  it('implements target selection, preview, commit, aliases, and sysadmin users', () => {
    const path = resolve(process.cwd(), 'src', 'pages', 'ManagementDataPage.jsx');
    assert.equal(existsSync(path), true);
    const page = readFileSync(path, 'utf8');
    const api = src('services', 'api.js');

    for (const label of [
      'Management Data', 'Tabel tujuan', 'Upload file', 'Validasi dan preview',
      'Commit ke NeonDB', 'Riwayat import', 'PIC Aliases', 'Users & Roles',
    ]) {
      assert.match(page, new RegExp(label));
    }
    for (const functionName of [
      'fetchManagementTargets', 'validateManagementImport', 'commitManagementImport',
      'fetchManagementImports', 'fetchPicAliases', 'savePicAlias',
      'fetchDashboardUsers', 'createDashboardUser', 'updateDashboardUser',
    ]) {
      assert.match(api, new RegExp(`export async function ${functionName}`));
    }
    assert.match(api, /FormData/);
    assert.match(page, /users:manage/);
  });

  it('provides effective-dated Reporting threshold and NOP revenue target editors', () => {
    const page = src('pages', 'ManagementDataPage.jsx');
    const editor = src('features', 'management-data', 'ReportingThresholdConfiguration.jsx');
    const api = src('services', 'api.js');

    assert.match(page, /Threshold Configuration/);
    assert.match(page, /ReportingThresholdConfiguration/);
    for (const label of [
      'Bulan efektif', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze',
      'U30', 'U60', 'Payload', 'NOP', 'Target revenue',
    ]) {
      assert.match(editor, new RegExp(label));
    }
    for (const functionName of [
      'fetchReportingThresholds', 'saveReportingThresholds',
      'fetchReportingRevenueTargets', 'saveReportingRevenueTarget',
    ]) {
      assert.match(api, new RegExp(`export async function ${functionName}`));
    }
  });
});
