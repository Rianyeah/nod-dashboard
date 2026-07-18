/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('cookie session authentication contracts', () => {
  it('never stores or sends a bearer token', () => {
    const api = src('services', 'api.js');
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');

    for (const source of [api, app]) {
      assert.doesNotMatch(source, /nod_auth_token|Authorization\s*=|Bearer /);
    }
    assert.doesNotMatch(api, /interceptors\.request/);
    assert.match(api, /withCredentials:\s*true/);
    assert.match(api, /authSession/);
    assert.match(api, /authLogout/);
    assert.match(auth, /removeItem\('nod_auth_token'\)/);
    assert.match(auth, /removeItem\('nod_last_activity'\)/);
  });

  it('waits for the server session before routing', () => {
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');

    assert.match(app, /status === 'loading'/);
    assert.match(app, /status === 'authenticated'/);
    assert.match(auth, /authSession\(\)/);
    assert.match(auth, /setUnauthorizedHandler/);
  });
});
