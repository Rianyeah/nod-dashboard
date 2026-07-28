# Tower Visualizer Paint, Mechanical Tilt, and Footer Design

## Goal

Make the Tower Visualizer drawing match standard red-and-white telecom tower paint bands, retain only meaningful physical-antenna tilt data, and make the lower engineering summary easier to read without changing the established Site ID search, physical grouping, CID extraction, or antenna-placement rules.

## Mechanical Tilt Data Contract

### Physical grouping

The physical antenna key remains `sector_base + antenna_type + antenna_height`. The group already represents one sectoral antenna even when it has multiple cells or CIDs.

### Mechanical Tilt resolution

`mechanical_tilt` is resolved per physical antenna group using non-empty, numerically valid source values:

- Count each normalized one-decimal value.
- Select the value with the highest count.
- If one value has the highest count, expose it as `mechanical_tilt_deg`, including `0`.
- If two or more values tie for the highest count, expose `null`, set `mechanical_tilt_conflict` to `true`, and add one manual-review warning.
- Missing or malformed values do not participate in the count.

This avoids discarding a reliable majority value while preserving a manual-review path for an unresolved tie.

### Electrical Tilt removal

Electrical Tilt is not a group-level property because cells on the same physical antenna may have different electrical values. Remove it from the Tower Visualizer group response, persisted antenna state, editor, prompt, and SVG. Raw RF Tilt Analysis behavior and data remain unchanged.

## Tower Paint System

- The elevation begins with a red band from `0 m` through `<10 m`.
- Each following 10 m elevation band alternates white, red, white, and so on.
- A partial band at the tower peak uses the color belonging to its 10 m interval.
- Lattice legs, rings, and bracing use the band color at their elevation. White structural members have a subtle gray outline so they remain legible on the white drawing ground.
- Monopole shafts use stacked 10 m trapezoid segments with the same paint sequence.
- Antenna status colors, labels, callouts, and dimensional guides retain their current high-contrast colors.

## Footer Layout

The footer becomes a two-column engineering summary:

- Left: `SITE DATA` card above a smaller `LEGEND` card.
- Right: widened `HELICOPTER VIEW` panel, vertically spanning the left stack.

Site Data shows the existing Site ID, tower type, and height plus:

- `TOTAL ANTENNA`: the number of displayed physical antenna records.
- `TOTAL CELL`: the number of unique non-empty CIDs across those records.

The helicopter label-placement algorithm remains deterministic and collision-safe, but receives the widened panel bounds and a dynamic grid that uses the available footer height.

## Compatibility and Validation

- Existing stored `electricalTilt` properties are ignored during normalization so they no longer reappear in the UI, prompt, or export.
- Existing stored `mechanicalTilt` values remain editable and take priority after a user manually changes them.
- The Site ID auto-fill draft keeps its current source metadata and applies MT only from the API’s resolved group field.
- Auto-fill remains valid when MT is blank because an MT tie is informational, not a structural configuration error.
- PNG and SVG downloads continue to render from the shared SVG generator.

## Verification

- Backend tests prove majority MT selection, preservation of zero, and tie warnings; they also prove Electrical Tilt is absent from the group response.
- Frontend contracts prove MT auto-fill, removal of ET, prompt/SVG output, and migration behavior.
- SVG contracts prove 10 m band alternation, the new Site Data totals, Legend-under-Site-Data geometry, and collision-safe helicopter labels.
- Focused and complete frontend tests, targeted backend tests, lint, production build, and browser checks cover Four-leg, Three-leg, and Monopole renderings.
