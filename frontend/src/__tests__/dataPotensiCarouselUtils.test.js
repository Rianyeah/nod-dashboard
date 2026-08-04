import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { shouldHandleCarouselDrag } from '../features/data-potensi/dataPotensiCarouselUtils.js';


describe('Data Potensi carousel gesture policy', () => {
  it('keeps carousel drag outside matrix scroll regions', () => {
    assert.equal(shouldHandleCarouselDrag({ target: { closest: () => null } }), true);
  });

  it('yields carousel drag to matrix scroll regions', () => {
    assert.equal(
      shouldHandleCarouselDrag({
        target: {
          closest: (selector) => selector === '[data-carousel-scroll-region]' ? {} : null,
        },
      }),
      false,
    );
  });
});
