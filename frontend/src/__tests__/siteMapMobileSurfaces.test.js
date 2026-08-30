import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveMobileSiteMapSurfaces } from '../features/site-map/siteMapMobileSurfaces.js';

describe('Site Map mobile surface orchestration', () => {
  it('keeps a desktop direct site link free from mobile overlays', () => {
    assert.deepEqual(resolveMobileSiteMapSurfaces({
      isMobile: false,
      selectedSiteId: 'PSN008',
      inspectorState: { siteId: 'PSN008', open: true },
      resultsOpen: false,
    }), {
      inspectorOpen: false,
      resultsOpen: false,
    });
  });

  it('preserves a dismissed inspector for the same site on mobile', () => {
    assert.deepEqual(resolveMobileSiteMapSurfaces({
      isMobile: true,
      selectedSiteId: 'PSN008',
      inspectorState: { siteId: 'PSN008', open: false },
      resultsOpen: false,
    }), {
      inspectorOpen: false,
      resultsOpen: false,
    });
  });

  it('keeps results authoritative when the URL selects another site', () => {
    assert.deepEqual(resolveMobileSiteMapSurfaces({
      isMobile: true,
      selectedSiteId: 'PSN015',
      inspectorState: { siteId: 'PSN008', open: true },
      resultsOpen: true,
    }), {
      inspectorOpen: false,
      resultsOpen: true,
    });
  });

  it('opens the selected inspector after a desktop-to-mobile resize unless results are open', () => {
    const selection = {
      selectedSiteId: 'PSN008',
      inspectorState: { siteId: null, open: false },
    };

    assert.deepEqual(resolveMobileSiteMapSurfaces({
      ...selection,
      isMobile: true,
      resultsOpen: false,
    }), {
      inspectorOpen: true,
      resultsOpen: false,
    });

    assert.deepEqual(resolveMobileSiteMapSurfaces({
      ...selection,
      isMobile: true,
      resultsOpen: true,
    }), {
      inspectorOpen: false,
      resultsOpen: true,
    });
  });
});
