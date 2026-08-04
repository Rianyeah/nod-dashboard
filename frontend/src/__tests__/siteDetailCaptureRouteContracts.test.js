/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';


const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');


describe('site detail capture route isolation', () => {
  it('keeps the capture route outside the dashboard session provider', () => {
    const app = src('App.jsx');

    const captureRoute = app.indexOf('path="/capture/site-detail/:siteId"');
    const authProvider = app.indexOf('<AuthProvider>');

    assert.ok(captureRoute >= 0, 'capture route should be registered');
    assert.ok(authProvider >= 0, 'dashboard routes should retain AuthProvider');
    assert.ok(
      captureRoute < authProvider,
      'capture route must not mount AuthProvider or request /auth/session',
    );
  });

  it('uses a standalone bearer client without dashboard cookies or global 401 handling', () => {
    const service = src('services', 'siteDetailCapture.js');

    assert.match(service, /Authorization:\s*'Bearer ' \+ token/);
    assert.match(service, /credentials:\s*'omit'/);
    assert.match(service, /cache:\s*'no-store'/);
    assert.doesNotMatch(service, /services\/api|setUnauthorizedHandler|withCredentials/);
  });

  it('forces the capture page to dark theme and exposes non-ready loading/error states', () => {
    const page = src('pages', 'SiteDetailCapturePage.jsx');

    assert.match(page, /document\.documentElement\.setAttribute\('data-theme', 'dark'\)/);
    assert.match(page, /data-capture-state=\{captureState\}/);
    assert.match(page, /captureState === 'loading'/);
    assert.match(page, /captureState === 'error'/);
  });
});
