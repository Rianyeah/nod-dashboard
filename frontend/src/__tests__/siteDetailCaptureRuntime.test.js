import { describe, it } from 'node:test';
import assert from 'node:assert/strict';


async function captureRuntime() {
  return import('../features/siteCapture/captureRuntime.js');
}


describe('site detail capture runtime', () => {
  it('normalizes a requested Site ID without accepting path-like values', async () => {
    const { normalizeCaptureSiteId } = await captureRuntime();

    assert.equal(normalizeCaptureSiteId(' bgl002 '), 'BGL002');
    assert.throws(
      () => normalizeCaptureSiteId('BGL002/OTHER'),
      /Invalid Site ID/,
    );
  });

  it('consumes one fragment token and removes it from the visible address', async () => {
    const { consumeFragmentToken } = await captureRuntime();
    const replacements = [];
    const location = {
      hash: '#token=signed-value',
      pathname: '/capture/site-detail/BGL002',
      search: '?trace=1',
    };
    const history = {
      replaceState: (...args) => replacements.push(args),
    };

    const token = consumeFragmentToken(location, history);

    assert.equal(token, 'signed-value');
    assert.deepEqual(replacements, [[null, '', '/capture/site-detail/BGL002?trace=1']]);
  });

  it('rejects missing or duplicate fragment tokens without echoing them', async () => {
    const { consumeFragmentToken } = await captureRuntime();
    const history = { replaceState() {} };

    for (const hash of ['', '#token=', '#token=first&token=second']) {
      assert.throws(
        () => consumeFragmentToken({ hash, pathname: '/capture', search: '' }, history),
        (error) => {
          assert.match(error.message, /Capture token is missing or invalid/);
          assert.doesNotMatch(error.message, /first|second/);
          return true;
        },
      );
    }
  });

  it('rejects a capture bundle whose IDs do not match the requested Site ID', async () => {
    const { validateCaptureBundleSite } = await captureRuntime();

    assert.throws(
      () => validateCaptureBundleSite('BGL002', {
        site_id: 'BGL003',
        detail: { Siteid: 'BGL003' },
      }),
      /Site ID mismatch/,
    );
    assert.deepEqual(
      validateCaptureBundleSite('BGL002', {
        site_id: 'BGL002',
        detail: { Siteid: 'BGL002' },
      }),
      {
        site_id: 'BGL002',
        detail: { Siteid: 'BGL002' },
      },
    );
  });
});
