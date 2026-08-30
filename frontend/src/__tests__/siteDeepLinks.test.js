import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizedDeepLinkSite } from '../features/site-map/siteDeepLinks.js';

describe('site tool deep links', () => {
  it('normalizes supported site identifiers', () => {
    assert.equal(normalizedDeepLinkSite(' psr001 '), 'PSR001');
    assert.equal(normalizedDeepLinkSite('site_01-a'), 'SITE_01-A');
  });

  it('rejects malformed or ambiguous site identifiers', () => {
    assert.equal(normalizedDeepLinkSite('../PSR001'), null);
    assert.equal(normalizedDeepLinkSite('PSR 001'), null);
    assert.equal(normalizedDeepLinkSite('A'), null);
    assert.equal(normalizedDeepLinkSite('A'.repeat(33)), null);
    assert.equal(normalizedDeepLinkSite(null), null);
  });
});
