import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, it } from 'node:test';


const frontendRoot = basename(cwd()).toLowerCase() === 'frontend'
  ? cwd()
  : resolve(cwd(), 'frontend');
const src = (...parts) => readFileSync(resolve(frontendRoot, 'src', ...parts), 'utf8');


describe('data sync cancellation UI contracts', () => {
  it('provides an explicit destructive confirmation dialog', () => {
    const path = resolve(
      frontendRoot,
      'src',
      'features',
      'data-sync',
      'DataSyncCancelDialog.jsx',
    );

    assert.equal(existsSync(path), true);
    const dialog = readFileSync(path, 'utf8');
    assert.match(dialog, /Lanjutkan Sync/);
    assert.match(dialog, /Batalkan Sync/);
    assert.match(dialog, /sudah ditulis/);
    assert.match(dialog, /variant="destructive"/);
  });

  it('turns only a cancelable active button into the cancel action', () => {
    const button = src('features', 'data-sync', 'DataSyncButton.jsx');

    assert.match(button, /canCancel/);
    assert.match(button, /cancelPending/);
    assert.match(button, /Cancel Sync/);
    assert.match(button, /group-hover/);
    assert.match(button, /setCancelDialogOpen\(true\)/);
  });

  it('keeps the sync action last in every page header', () => {
    const header = src('features', 'impact-service', 'ImpactServiceHeader.jsx');
    const impact = src('pages', 'ImpactServicePage.jsx');
    const dataPotensi = src('pages', 'DataPotensiPage.jsx');
    const activity = src('pages', 'ActivityEnomPage.jsx');

    assert.ok(header.indexOf('data-testid="impact-print"') < header.indexOf('{syncAction}'));
    assert.match(impact, /syncAction=\{<DataSyncButton dataset="impact_service" \/>\}/);
    assert.ok(
      dataPotensi.indexOf('</DashboardFilterBar>')
        < dataPotensi.indexOf('<DataSyncButton dataset="data_master" />'),
    );
    assert.ok(
      activity.indexOf('</DashboardFilterBar>')
        < activity.indexOf('<DataSyncButton dataset="activity_enom" />'),
    );
  });
});
