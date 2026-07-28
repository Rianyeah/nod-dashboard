# Tower Visualizer Landscape Sidebar Design

## Goal

Make the engineering SVG legible in the dashboard preview by changing the
document from a portrait tower sheet to a landscape engineering sheet. Site
Data, Legend, and Helicopter View must be stacked in a dedicated right-hand
sidebar instead of occupying the narrow footer below the tower.

## Confirmed layout

- The SVG canvas is landscape at `1900 x 1200`.
- The tower, height dimension, and antenna callout columns remain in the left
  drawing field. Their coordinates are widened only as needed to preserve the
  current callout-card collision guarantees.
- The right sidebar is a separate, non-overlapping column. Its order is:
  1. Site Data,
  2. Legend,
  3. Helicopter View.
- The sidebar cards share one horizontal alignment and have visible gaps. The
  helicopter panel is at least 520 SVG units wide and uses a landscape ratio.
- No footer card may be below the tower base after this change.

## Helicopter readability

- Keep the north-fixed tower footprint and elevation rings. Every distinct
  antenna height continues to create one ring.
- Replace tiny, collision-prone floating text with a legible radar/readout
  layout inside the Helicopter View: the left side contains the footprint,
  rings, arrows, and numbered markers; the right side contains matching rows
  in the form `SEC n | azimuth degrees`.
- Rows use the antenna colour, stay inside the helicopter panel, do not
  overlap, and are deterministically ordered by antenna source order.
- The panel uses larger source SVG typography and dynamic row spacing so
  ordinary site configurations are readable directly in the dashboard preview
  while the maximum antenna configuration remains bounded and collision-safe.

## Compatibility

- Retain the red/white 10-m paint-band behaviour, all three tower types,
  antenna callouts, export formats, total antenna/cell counts, and the
  existing data attributes used by regression tests.
- Preserve the SVG font family used by NOD Dashboard.

## Tests and verification

- Update the SVG contract for the landscape viewBox and the right-hand sidebar
  geometry.
- Add a dense-antenna regression that proves the sidebar cards are vertically
  ordered, helicopter readout rows stay contained and non-overlapping, and
  elevation rings remain present.
- Verify the contract test, frontend lint/build, and a live local preview at
  `/tower-plan-generator`.
