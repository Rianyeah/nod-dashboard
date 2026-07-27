# Tower Plan Generator Enhancements Design

**Date:** 2026-07-25
**Status:** Approved for implementation
**Scope:** Tower Plan Generator in the NOD Dashboard feature worktree

## 1. Context

The first Tower Plan Generator implementation adds a dashboard-native workbench, Site ID auto-fill, deterministic SVG/PNG export, and optional AI visualization. Review of the local UI and the connected `ransys_gabungan` data identified five follow-up requirements:

1. The Helicopter View panel is too close to the tower elevation.
2. Site ID search does not provide a reliable keyboard-driven selection flow.
3. The generator must support four-leg lattice, three-leg lattice, and monopole towers.
4. CID values must be derived from the suffix after the final underscore in `enodeb_ci`.
5. Cells with the same `sector_base`, normalized `antenna_type`, and `antenna_height` at one Site ID represent one physical sector antenna.

The tower base plate and Leg labels also need to follow the actual tower-foot coordinates instead of being positioned independently.

## 2. Goals

- Make Site ID search predictable for mouse and keyboard users.
- Group logical cells into physical sector antennas using the approved RF fields.
- Preserve every unique CID associated with a grouped antenna.
- Render structurally distinct four-leg, three-leg, and monopole tower plans.
- Keep elevation, base plate, leg labels, and Helicopter View geometrically consistent.
- Maintain deterministic, printable SVG and PNG outputs.
- Preserve compatibility with existing browser drafts and exported JSON.

## 3. Non-goals

- Inferring tower type from `ransys_gabungan`; the user selects it.
- Producing structural engineering calculations or certified foundation dimensions.
- Replacing deterministic SVG with a 3D or AI renderer.
- Changing unrelated NOD Dashboard pages or global design tokens.

## 4. Chosen Approach

Use one configuration-driven SVG engine with separate geometry descriptors for each tower type. Shared layout, antenna callouts, title blocks, validation, export, and prompt generation remain centralized. Tower-specific geometry supplies:

- elevation foot coordinates;
- tower members or monopole shaft geometry;
- plan-view mounting coordinates;
- supported installation labels;
- azimuth-to-installation mapping.

This avoids three duplicated renderers while allowing each tower type to look and behave correctly.

## 5. Tower Types and Installation Mapping

### 5.1 Four-leg lattice tower

- Display name: `Four-leg lattice tower`
- Installation terminology: `Leg`
- Labels: A, B, C, D
- Mapping:
  - A: 0–90 degrees
  - B: greater than 90–180 degrees
  - C: greater than 180–270 degrees
  - D: greater than 270–less than 360 degrees

### 5.2 Three-leg lattice tower

- Display name: `Three-leg lattice tower`
- Installation terminology: `Leg`
- Labels: A, B, C
- Mapping:
  - A: 0–120 degrees
  - B: greater than 120–240 degrees
  - C: greater than 240–less than 360 degrees

### 5.3 Monopole

- Display name: `Monopole`
- Installation terminology: `Mounting Side`
- Labels: A, B, C, D
- Mapping:
  - A: 0–90 degrees
  - B: greater than 90–180 degrees
  - C: greater than 180–270 degrees
  - D: greater than 270–less than 360 degrees

Changing tower type recalculates installation labels from antenna azimuth. Existing manual edits remain possible after recalculation.

## 6. Site ID Search

### 6.1 Root cause

The API and dropdown return data for tested Site IDs such as `PSN003` and `EPM081`. The incomplete interaction is that pressing Enter in the combobox does not select the exact or first result. The current backend also matches `cell_name`, which can return Site IDs unrelated to the visible query.

### 6.2 Search behavior

- Search only normalized `site_id`.
- Require at least two characters.
- Rank results in this order:
  1. exact match;
  2. prefix match;
  3. contains match.
- Pressing Enter selects an exact match when present, otherwise the first result.
- Arrow Down moves focus to the first result.
- Escape closes the result panel.
- Expose explicit loading, error, and empty states.
- Keep request cancellation and the 300 ms debounce so stale responses cannot replace newer results.

## 7. Data Selection, CID Parsing, and Grouping

### 7.1 Source fields

The configuration query reads:

- `site_id`
- `cell_name`
- `enodeb_ci`
- `sector_base`
- `antenna_type`
- `antenna_height`
- `azimuth`
- `band`
- `teknologi`
- tilt and beamwidth metadata
- `tower_hight` when the column exists

`sector_base` is the authoritative grouping sector for this feature. Schema introspection remains in place so environments without optional columns fail gracefully.

### 7.2 CID parsing

- Convert `enodeb_ci` to trimmed text.
- Use the non-empty suffix after the final underscore.
- Example: `225003_14` becomes `14`.
- If `enodeb_ci` is missing or has no usable suffix, fall back to the existing `ci` value.
- Store CID values as unique strings sorted naturally.

### 7.3 Physical antenna grouping

Within one normalized Site ID, the grouping key is:

`normalized sector_base + normalized antenna_type + antenna_height rounded to one decimal`

Azimuth and CID are not grouping keys.

- Missing `sector_base` or missing antenna model prevents automatic merging; each affected row remains its own review item.
- All source cells, bands, technologies, and CIDs are retained in group metadata.
- The search estimate uses the same grouping definition as configuration loading.

### 7.4 Azimuth conflicts

- One distinct normalized azimuth: use it automatically.
- Multiple distinct azimuths in one physical group: return all values and mark the group as requiring review.
- The review dialog shows the conflicting values and requires the user to enter or choose one valid azimuth before applying.
- Installation Leg or Mounting Side is recalculated from the resolved azimuth and selected tower type.

## 8. Frontend State and Migration

- Increase the Tower Plan schema version.
- Replace the fixed four-leg constant with an allowed tower-type configuration.
- Add a `cids` array to each antenna while retaining the existing `cid` string during migration and import.
- Existing `cid` values migrate into a unique one-item `cids` array.
- The editor presents a `CID(s)` field as a comma-separated string.
- JSON export retains structured `cids`; prompt and SVG output display a human-readable comma-separated list.
- Existing v4/v5 browser drafts and imported JSON remain loadable.

## 9. SVG Layout and Geometry

### 9.1 Shared layout regions

The 1024 × 1536 canvas is divided into stable regions:

- left callout and height scale;
- central tower elevation;
- right-side Helicopter View;
- bottom site data and legend.

The Helicopter View width is reduced and its left edge is moved right. The renderer maintains at least approximately 50 px of clear horizontal space between the tower envelope and the panel.

### 9.2 Base plate and label alignment

Base elements derive from the exact elevation foot coordinates:

- Four-leg: four individual rectangular foot plates.
- Three-leg: three individual foot plates following the triangular projection.
- Monopole: one central flange/foundation plate with anchor-bolt detail.

Tower members terminate at the center of their associated plate. Leg badges and labels are offset from those same coordinates, with per-foot label direction chosen to avoid collisions.

SVG layering is:

1. ground/foundation;
2. rear structure and rear plates;
3. front structure and front plates;
4. installation badges and labels;
5. antenna mounts and callouts.

This keeps labels aligned and prevents plates, feet, and labels from visually covering one another.

### 9.3 Tower-specific elevation

- Four-leg: tapered four-column lattice with four projected feet.
- Three-leg: tapered triangular lattice with three projected feet and type-appropriate bracing.
- Monopole: tapered pole shaft with flange base; no lattice legs.

Helicopter View uses the same tower-type coordinate definition and bearing transformation as the elevation renderer.

## 10. UI Changes

- Replace the disabled Tower Type input with a select control.
- Rename `Installation leg` dynamically to `Installation leg` or `Mounting side`.
- Limit available labels to A–C for three-leg towers.
- Show grouped CIDs and source metadata in the review dialog and antenna editor.
- Show an explicit azimuth-conflict warning and block Apply until resolved.
- Preserve the existing NOD Dashboard theme, density, component primitives, and responsive layout.

## 11. Error Handling

- Search failures show an actionable inline message without disabling manual editing.
- Missing source fields generate review warnings instead of invented values.
- Invalid `enodeb_ci` does not fail the whole Site ID; the row falls back to `ci` or an empty CID.
- Configuration with more than 16 grouped antennas remains blocked without silent truncation.
- Invalid or conflicting azimuths block Apply.
- Export remains blocked when tower geometry is invalid.

## 12. Testing and Verification

### Backend

- CID suffix parsing and `ci` fallback.
- Grouping by `sector_base`, normalized antenna model, and rounded height.
- Multiple CIDs retained in one group.
- Missing sector/model rows remain separate.
- Azimuth conflict metadata.
- Four-leg, three-leg, and monopole angle boundaries.
- Site-only search filtering and exact/prefix/contains ordering.
- Search estimate matches configuration grouping.

### Frontend

- Schema migration from existing drafts.
- Tower-type selection and installation-label recalculation.
- Three-leg A–C validation.
- Monopole Mounting Side labeling.
- CID list editing and duplicate validation.
- Enter selects exact or first Site ID result.
- Conflicting azimuth blocks auto-fill Apply.
- Prompt and JSON output use the selected tower type and grouped CIDs.

### SVG and browser

- Distinct elevation structures for all three tower types.
- Correct plate count and type.
- Every Leg label is spatially close to its corresponding plate.
- Helicopter View maintains the required separation from the tower envelope.
- Desktop and mobile visual checks.
- Site ID search, PSN003 grouping, CID display, auto-fill review, SVG export, and PNG export.

## 13. Acceptance Criteria

- Searching `PSN003` by typing and pressing Enter opens the review flow.
- PSN003 cells sharing sector 1, model `ASI4518R42v06`, and height 43 m are represented by one physical antenna with CIDs 11, 13, 14, and 15.
- Tower type can be changed among all three supported types.
- Installation labels and azimuth mapping follow the selected type.
- Elevation, base plates, Leg labels, and Helicopter View remain aligned.
- The Helicopter View no longer visually touches the tower.
- Existing drafts migrate without data loss.
- Full backend tests, frontend tests, lint, build, and browser verification pass.
