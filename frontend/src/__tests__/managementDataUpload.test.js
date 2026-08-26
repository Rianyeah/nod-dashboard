import assert from 'node:assert/strict';
import test from 'node:test';

import axios from 'axios';

test('management import keeps FormData so Axios can generate a multipart boundary', async () => {
  const originalAdapter = axios.defaults.adapter;
  let requestConfig;

  axios.defaults.adapter = async (config) => {
    requestConfig = config;
    return {
      config,
      data: { status: 'validated' },
      headers: {},
      status: 201,
      statusText: 'Created',
    };
  };

  try {
    const { validateManagementImport } = await import(`../services/api.js?test=${Date.now()}`);
    await validateManagementImport('ticketing_swfm_non_inap', [
      new Blob(['ticket-one']),
      new Blob(['ticket-two']),
    ]);

    assert.ok(requestConfig.data instanceof FormData);
    assert.equal(requestConfig.data.get('target'), 'ticketing_swfm_non_inap');
    assert.equal(requestConfig.data.getAll('files').length, 2);
    assert.notEqual(requestConfig.headers.getContentType(), 'application/json');
  } finally {
    axios.defaults.adapter = originalAdapter;
  }
});
