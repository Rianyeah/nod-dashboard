import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import api, * as apiModule from '../services/api.js';


const originalAdapter = api.defaults.adapter;

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});


describe('data sync API boundary', () => {
  it('loads shared status with AbortSignal support', async () => {
    assert.equal(typeof apiModule.fetchDataSyncStatus, 'function');
    const controller = new AbortController();
    let requestConfig;
    api.defaults.adapter = async (config) => {
      requestConfig = config;
      return {
        data: { enabled: false, jobs: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await apiModule.fetchDataSyncStatus(controller.signal);

    assert.equal(requestConfig.url, '/data-sync/status');
    assert.equal(requestConfig.method, 'get');
    assert.equal(requestConfig.signal, controller.signal);
  });

  it('starts one encoded dataset request with a 15-second timeout and no retry', async () => {
    assert.equal(typeof apiModule.startDataSync, 'function');
    let calls = 0;
    let requestConfig;
    api.defaults.adapter = async (config) => {
      calls += 1;
      requestConfig = config;
      return {
        data: { job: { id: 'job-1', status: 'dispatching' }, already_running: false },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await apiModule.startDataSync('data master/unsafe');

    assert.equal(calls, 1);
    assert.equal(requestConfig.url, '/data-sync/data%20master%2Funsafe');
    assert.equal(requestConfig.method, 'post');
    assert.equal(requestConfig.timeout, 15000);
  });

  it('cancels one encoded job through the browser API boundary', async () => {
    assert.equal(typeof apiModule.cancelDataSync, 'function');
    let requestConfig;
    api.defaults.adapter = async (config) => {
      requestConfig = config;
      return {
        data: { canceled: true, job: { id: 'job/1', status: 'canceled' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await apiModule.cancelDataSync('data master/unsafe', 'job/1');

    assert.equal(
      requestConfig.url,
      '/data-sync/data%20master%2Funsafe/job%2F1/cancel',
    );
    assert.equal(requestConfig.method, 'post');
    assert.equal(requestConfig.timeout, 15000);
  });
});
