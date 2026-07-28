# Tower Visualizer Download, Tilt, and SVG Refinement Design

## Goal

Simplify the Tower Visualizer completion flow, expose RF mechanical/electrical tilt in the antenna workbench and drawing, and improve SVG legibility without changing Site ID search, auto-fill grouping, validation gates, or local draft persistence.

## User-Facing Changes

### Download and validation

- Rename `Export & konfigurasi` to `Download`.
- Keep one horizontal row with exactly two actions: `PNG file` and `SVG file`.
- Remove JSON export/import controls and their visible file input. IndexedDB autosave remains unchanged.
- Remove the separate Validation card. When the plan is valid, render a compact green `Konfigurasi valid` check beside the Download title. Invalid configurations show no persistent error list; existing action-time notices continue to explain why prompt or download is blocked.

### Antenna editor and tilt

- Remove the visible `Operator/owner` input. Preserve the legacy `operator` property during migration/import so historic drafts do not lose data.
- Add editable number inputs `Mechanical Tilt (MT)` and `Electrical Tilt (ET)`, in degrees, alongside the antenna engineering fields.
- Auto-fill creates a group-level tilt only when all non-empty cell values for that tilt agree. A group with missing values only uses the available unanimous value. A group with two or more distinct values leaves that input blank and adds a review warning; it never guesses from the first cell.
- Persist tilt values in antenna state, local drafts, prompt output, PNG, and SVG export. Manual edits remain authoritative.

## Data Contract

`ransys_gabungan` already supplies `mechanical_tilt` and `electrical_tilt` for each source cell. The Tower Plan backend keeps those values in `TowerPlanSourceCell` and exposes deterministic group-level fields:

- `mechanical_tilt_deg`: a number only when non-empty source values are unanimous, otherwise `null`.
- `electrical_tilt_deg`: a number only when non-empty source values are unanimous, otherwise `null`.
- `mechanical_tilt_conflict` and `electrical_tilt_conflict`: true when a group has multiple distinct non-empty values.

The frontend maps these fields to `mechanicalTilt` and `electricalTilt` on draft and persisted antennas. Blank values are valid and render nowhere; tilt values are informational and do not alter grouping, antenna placement, or plan validation.

## SVG Layout

### Canvas and structure

- Widen the engineering canvas while retaining a tall technical-plan aspect ratio. Reposition the tower, callout columns, vertical tower-height dimension, and footer from shared layout constants so the dimension label has its own clear left corridor.
- Replace the slate steel gradient with a red-to-white tower gradient. Use supporting red/pink structural strokes for lattice rings and bracing while retaining high-contrast dark labels and status-color antenna masts.

### Antenna callouts

- Use deterministic word wrapping for long antenna names, capped at a readable number of lines.
- Calculate each callout card height from its wrapped title and details. Include sector/leg/height, azimuth, CID(s), and an `MT / ET` line when either tilt is present.
- Lay out up to eight cards per side with non-overlapping vertical slots. Connector paths anchor to the computed card midpoint. The export remains bounded within the widened SVG canvas for up to 16 antennas.

### Helicopter view and footer

- Move the helicopter panel into the lower footer band so its bottom edge aligns with the Site Data and Legend cards.
- Resize its internal compass, rings, and footer text for the new panel height.
- Place `SEC | azimuth` labels through a deterministic collision-aware layout: labels reserve a bounding box, then receive perpendicular/radial offsets until they no longer overlap labels already placed. This applies even when height or azimuth differs slightly.

## Error Handling and Compatibility

- Existing Site ID and antenna grouping behavior remains unchanged: sectoral identity is still `sector_base + antenna_type + antenna_height`.
- Tilt conflicts warn in the auto-fill review and require a manual choice only if the user wants a tilt recorded; they do not block applying a valid antenna configuration.
- Existing plans migrate with empty tilt values. Existing PNG and SVG calls still use the same shared renderer.
- The active route remains `/tower-plan-generator`; labels use Tower Visualizer.

## Verification

- Extend backend route/grouping tests for unanimous, missing, and conflicting MT/ET values.
- Extend frontend state contracts for auto-fill, persistence migration, manual edits, and prompt text.
- Extend SVG tests for the widened canvas, clear tower-height corridor, wrapped/dynamic callouts, footer-aligned helicopter panel, collision-safe sector labels, and red/white gradient.
- Run the full frontend suite, backend targeted tests, lint, production build, and authenticated browser checks for Four-leg, Three-leg, and Monopole renderings.
