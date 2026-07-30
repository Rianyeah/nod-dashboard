# NOD Dashboard Graphite Redesign and Reliability Design

## Status

Approved in conversation on 2026-07-30.

The approved direction is **Matte Graphite + Telkomsel Red Edge**, paired with
the **Operational Precision** icon and chart language. The redesign applies to
both dark and light themes and includes the agreed Command Center, Reporting,
and Tower Visualizer reliability fixes.

## Summary

Refresh the complete NOD Dashboard visual system so it feels deliberate,
operational, and consistent without changing business meaning. Matte graphite
and neutral grey remain dominant. Telkomsel red is a controlled accent for
selection, focus, and priority—not a decorative color applied to every chart.

The work also repairs three visible reliability gaps:

- Performance Trend on Command Center does not render even though reporting
  trend data is available.
- Proker Activity values do not appear reliably in the Reporting Performance
  Table, and the table needs a BPS-specific Backup Sukses metric.
- Mobile Site ID confirmation in Tower Visualizer can fail because keyboard
  submission depends on debounced result state.

Core Mapbox, RF Tilt, Tower Visualizer geometry, and exported tower artwork are
preserved.

## Goals

- Apply one coherent dark and light visual foundation to every NOD Dashboard
  page and the sidebar.
- Make light-mode panel boundaries clearly visible.
- Standardize icons, charts, tooltips, legends, empty states, and semantic
  colors.
- Remove decorative glow and cyan-heavy styling that makes the interface feel
  synthetic or inconsistent.
- Restore the Command Center Performance Trend.
- Restore accurate Proker Activity values.
- Add Backup Sukses count and BPS-relative rate per Kabupaten/Kota and in the
  table total.
- Remove Battery Type from the Reporting UI.
- Make Tower Visualizer Site ID selection reliable with mobile keyboards.
- Use compact section headers when no subtitle is present.
- Verify the final result on dark/light themes and desktop/mobile viewports.

## Non-Goals

- No change to business definitions except the explicitly approved Backup
  Sukses metric.
- No change to global filter meaning, data ownership, or source tables.
- No rewrite of the dashboard information architecture or business labels.
- No replacement of Recharts, Lucide, Mapbox, or the existing React stack.
- No modification to core map layers, RF Tilt map rendering, tower geometry,
  antenna grouping, or exported tower graphics.
- No deletion of the Reporting battery backend endpoint solely because its
  frontend table is removed; other consumers may still use it.
- No decorative three-dimensional graphics, glass-heavy effects, or large
  red gradients.

## Current-System Findings

The existing system has global theme tokens in `frontend/src/index.css`, but
many pages also contain direct cyan colors, background values, borders, chart
colors, and glow treatments. Shared dashboard primitives exist, while some
older charts still compose Recharts directly. Icons are mixed between Lucide
and Phosphor.

Read-only verification during design produced two important constraints:

- The reporting trend query and Overview reporting module return seven current
  trend rows for the latest reporting period. Performance Trend must therefore
  be treated as an integration or rendering failure, not as missing source
  data.
- The Reporting endpoint can return non-zero `OPEN` and `CLOSE` Proker values
  for the latest available reporting period. The fix must cover the complete
  query, response-model, cache, and rendering path rather than replacing valid
  values with presentation fallbacks.

The Tower Visualizer picker currently accepts Enter only while the result
dropdown is open and the debounced result query exactly matches the current
input. That condition can be missed by mobile soft-keyboard submission.

## Approved Visual Foundation

### Theme direction

Dark mode uses a matte graphite canvas with a restrained neutral gradient.
The sidebar is one tonal level deeper than the page. A faint Telkomsel-red edge
may appear near brand or selected navigation, but it must not read as a glow
across the application.

Light mode uses a visibly darker cool-grey canvas instead of near-white. Panels
are lighter than the canvas and use stronger borders so adjacent panels remain
distinct at a glance.

The visual-companion palette is the starting reference:

| Role | Dark reference | Light reference |
| --- | --- | --- |
| Canvas | `#0D1015` to `#171B23` | `#D2D8E0` to `#D9DEE5` |
| Sidebar | deep graphite | `#CBD1D9` family |
| Panel | translucent `#1D222B` family | near-opaque `#F8FAFC` family |
| Strong border | white at about 10% | `#AEB7C3` family |
| Soft border | white at about 6.5% | `#C2C9D2` family |
| Primary text | `#EEF2F7` family | `#171B22` family |
| Muted text | `#8994A3` family | `#667180` family |
| Brand accent | Telkomsel red `#E60012` family | same semantic role |

Exact token values may be tuned during implementation to meet contrast and
browser-rendering requirements, but the approved tonal hierarchy must remain.

### Token architecture

Theme values are centralized and expressed by semantic role rather than by
page:

- canvas and canvas gradient;
- sidebar surface and sidebar border;
- panel, elevated panel, hover, and selected surfaces;
- soft and strong borders;
- primary, secondary, and muted text;
- brand accent and accent-muted;
- success, warning, danger, and informational status colors;
- chart grid, axis, neutral series, and semantic series;
- shadow and focus-ring values.

Page components consume these tokens. Direct cyan, hardcoded white panel,
one-off grey, and glow declarations are removed when a semantic token exists.

### Surface hierarchy

- Page canvas is the darkest or lowest visual layer.
- Sidebar is visually separate through tone and a thin border, not a heavy
  shadow.
- Standard panels use a clear one-pixel border.
- Elevated menus, popovers, and tooltips use the elevated surface and stronger
  border.
- Shadows remain short and low-opacity.
- Border radius is consistent and restrained; nested containers do not
  repeatedly add large rounded cards.
- Red is reserved for selected navigation, focus, priority, destructive
  actions, or an explicitly red business series.

### Sidebar

- Preserve navigation hierarchy, labels, route behavior, collapse behavior,
  and mobile drawer behavior.
- Use one Lucide icon family and consistent icon box sizes.
- Active navigation uses a restrained red edge or indicator plus a selected
  graphite surface.
- Hover states remain neutral; they do not compete with the active route.
- Brand treatment remains readable without filling the full sidebar with red.

### Panel and header density

Panel shells share padding, border, title typography, action placement, and
state rendering. A header with title plus subtitle uses the normal layout. A
header with no subtitle automatically uses a compact layout with less vertical
padding and no empty description slot.

The compact rule applies consistently to shared dashboard panels and to Tower
Visualizer section headers. It must not collapse headers that contain helper
copy, actions, badges, or validation status.

## Approved Icon System

Lucide becomes the primary dashboard icon family because it is already
available and aligns with the existing component stack.

- Navigation and dense-control icons use a consistent regular stroke.
- Page and panel icons use standardized sizes.
- KPI icons may use a small neutral icon container but no broad radial glow.
- Color communicates state or meaning; it does not assign a different bright
  color to every icon.
- Existing domain-specific visual artwork is not replaced with a generic icon.
- Phosphor imports are migrated where a clear Lucide equivalent exists. A
  documented exception is allowed only when removing it would reduce meaning.

## Approved Chart System

### Visual language

- Graphite and neutral grey are the base series colors.
- Telkomsel red is the primary controlled accent.
- Green is reserved for success or healthy values.
- Amber is reserved for warning or threshold states.
- Blue may remain only where it has a clear informational or comparison
  meaning; cyan is not the default visual identity.
- Area fills are very light and never become the dominant background.
- Gridlines and axes are compact, subdued, and theme-aware.
- Legends are concise and follow one layout system.
- Tooltips use the shared elevated surface, strong border, tabular numbers, and
  series-aware indicators.
- Values may be labeled directly when this reduces pointer dependence and does
  not cause crowding.
- Animation is reduced or disabled where deterministic reporting and
  screenshots are more important.

Chart type may change when another representation is materially clearer, but
data keys, metric definitions, filters, and data sources remain unchanged.

### Shared states

Every chart panel uses consistent:

- loading skeleton;
- empty state;
- partial-data or coverage warning;
- recoverable error state;
- tooltip and legend;
- explicit chart height to avoid zero-height responsive containers.

An empty state is shown only for a valid empty result. Render exceptions,
zero-size containers, and failed module requests must not be mislabeled as
“data unavailable.”

### Core visual exceptions

The following remain visually intact:

- Mapbox map rendering and domain layers;
- RF Tilt map rendering;
- Tower Visualizer tower geometry and antenna artwork;
- exported SVG, PNG, PDF, or other tower output, except for already-approved
  unrelated work that exists outside this specification.

Surrounding panel chrome, buttons, form controls, legend shells, tooltips, and
supporting charts may adopt the new system.

## Command Center Functional Design

### Performance Trend

The data flow remains:

`GET /overview` → `reporting_trend` → Home page trend data → shared chart shell.

The implementation must separately distinguish:

1. Overview or reporting-module request failure;
2. valid response with zero trend rows;
3. valid response with trend rows but a chart-rendering failure;
4. valid chart with partial availability values.

The chart receives an explicit, non-zero height and a container that can shrink
inside the grid (`min-width: 0` where required). Revenue, payload, and
availability continue to use their own scales. Null availability values may
connect or gap according to current reporting semantics, but must not suppress
revenue and payload.

Acceptance behavior:

- available trend rows produce visible series;
- an empty response produces the shared empty state;
- a module error produces an error or partial-data state;
- changing period or NOP refreshes the chart;
- dark/light and desktop/mobile layouts remain legible.

### Badge cleanup

- Remove `Latest / Live` from the Today Impact Service scorecard.
- Remove `Snapshot master · tidak dipengaruhi periode` from the Data Potensi
  Site heading.
- Do not replace either badge with decorative copy.

## Reporting Functional Design

### Proker Activity

The Performance Table continues to expose `proker_open` and `proker_closed` per
Kabupaten/Kota and in the total row.

The repair covers:

- the active period and NOP filters;
- Kabupaten/Kota key matching between reporting master data and Proker data;
- backend response-model serialization;
- cached payload compatibility;
- frontend row and total aggregation;
- zero versus missing-value presentation.

Canonical Kabupaten matching should be introduced only as needed by verified
data differences, using the same normalization for both sides of a join. The
UI must not invent non-zero values. A zero means the filtered source query
returned zero for that row.

### Backup Sukses

Add two additive fields to each Performance Table row:

- `backup_sukses_bps`: count of BPS tickets whose trimmed
  `backup_sukses` value is `BU Genset`;
- `backup_sukses_rate`: `backup_sukses_bps / ticket_swfm_bps * 100`.

The same BPS-category normalization used by `ticket_swfm_bps` must be used by
the numerator. A ticket cannot be included in the numerator unless it is also
included in the denominator.

Per-row formula:

```text
backup_sukses_bps =
  COUNT(ticket WHERE category = BPS AND backup_sukses = "BU Genset")

backup_sukses_rate =
  100 × backup_sukses_bps / ticket_swfm_bps
```

If `ticket_swfm_bps` is zero, the displayed rate is `0%` rather than an invalid
or infinite value.

The table presents the metric in one **Backup Sukses** column with count and
percentage together. The exact typographic arrangement may use a primary count
and secondary percentage, but both must remain visible and accessible.

The total row is weighted from total counts:

```text
total_backup_sukses_rate =
  100 × SUM(backup_sukses_bps) / SUM(ticket_swfm_bps)
```

It must never average the row percentages.

### Battery Type removal

Remove from the Reporting frontend:

- Battery Type tab;
- Battery Type table;
- battery-specific component state and totals;
- the page-level battery request;
- imports used only by that UI.

The backend battery endpoint and model remain unless a separate dependency
audit proves they are unused by every consumer.

### Performance Table responsiveness

The new column increases table width. The table remains in a deliberate
horizontal-scroll region on smaller screens, keeps headers aligned with cells,
and preserves access to Kabupaten/Kota while scrolling where practical. It
must not compress count and percentage into unreadable wrapping.

## Tower Visualizer Functional Design

### Mobile Site ID selection

All selection paths call one selection function:

- pointer or touch on a suggestion;
- desktop Enter;
- mobile soft-keyboard Search/Enter;
- form submission where the browser emits submit instead of a conventional
  keydown.

Selection is based only on results for the current normalized query. Stale
responses from an earlier query are ignored.

If a current result is already available, submission selects the exact Site ID
match first and otherwise the first current suggestion. If the current request
is still pending, submission must not silently do nothing: it either waits for
or performs the current-query resolution, then commits the valid result. If no
result exists, the picker presents a clear not-found state and does not open an
empty confirmation dialog.

The input uses appropriate combobox semantics and a mobile keyboard hint such
as `enterKeyHint="search"`. IME composition is not treated as final submission.

After a valid selection:

1. dropdown closes;
2. normalized Site ID remains visible in the input;
3. the existing auto-fill review/confirmation dialog opens;
4. confirmation applies the existing draft/autofill behavior;
5. cancel leaves the existing project unchanged.

### Compact header behavior

Tower Visualizer section headers with no subtitle use the compact header
variant. Headers with descriptions retain normal spacing. The rule applies at
mobile and desktop breakpoints and does not change the tower drawing canvas,
form order, or exported artwork.

## Data and Cache Compatibility

The Reporting API change is additive. Existing fields remain unchanged.
Backend response models and frontend contracts gain the two Backup Sukses
fields.

Any cache storing Reporting Performance Table payloads must be versioned,
invalidated, or use a revised key so an old cached object cannot silently
produce zero/default values for new fields. The same audit applies to Proker
fields if their first valid implementation reused an older cache key.

No database migration is expected because the required ticket, category,
backup, Proker, and location fields already exist.

## Accessibility and Responsive Requirements

- Focus indication uses the semantic focus-ring token and remains visible in
  both themes.
- Text and essential chart marks meet reasonable dashboard contrast; body text
  targets WCAG AA where applicable.
- Color is not the only indicator of success, warning, selection, or series.
- Interactive controls retain accessible names and keyboard behavior.
- Chart tooltips are supplemental; important totals remain available outside
  hover-only interactions.
- Shared panels do not create page-level horizontal overflow.
- Tables may scroll within their own container.
- Desktop checks cover common wide dashboard layouts.
- Mobile checks include the Tower Visualizer Site ID flow with a soft-keyboard
  equivalent and narrow header layouts.

## Error Handling

- Overview module failures remain isolated so one failed module does not blank
  the entire Command Center.
- Reporting numeric fields are validated and defaulted only after distinguishing
  missing data from a real zero.
- Division by zero returns a safe zero rate.
- Stale Site ID requests cannot overwrite a newer query.
- Site search failure keeps the input usable and provides a retryable message.
- Chart render failures are observable during development and are not converted
  into misleading empty states.

## Verification Strategy

### Backend tests

- Reporting query returns Proker `OPEN` and `CLOSE` values for matching source
  data.
- Backup Sukses numerator includes only BPS + `BU Genset`.
- Row rate uses row BPS tickets as denominator.
- Total rate is computed from summed counts.
- Zero BPS denominator yields `0%`.
- Period and NOP filters apply consistently to ticket and Proker aggregates.
- Response models serialize the new fields.
- Cache miss and cache hit return the same response shape.

### Frontend unit and contract tests

- Global theme tokens cover both dark and light roles.
- Shared panels use compact headers when no subtitle exists.
- Dashboard pages use Lucide as the standard icon path.
- Chart shells expose consistent loading, empty, error, tooltip, and legend
  behavior.
- Home no longer contains either removed badge.
- Home Performance Trend consumes `reporting_trend`.
- Reporting renders Proker values and Backup Sukses count/rate in row and total.
- Reporting no longer requests or renders Battery Type.
- Tower selection logic rejects stale results and commits a current result
  through every supported submission path.

### Browser verification

Use authenticated browser checks with the actual local frontend/backend:

- smoke-test every dashboard route in dark and light mode;
- inspect sidebar, panel boundaries, icon consistency, charts, tables, dialogs,
  popovers, empty states, and error states;
- verify Command Center Performance Trend with actual non-empty data;
- verify Reporting Proker and Backup Sukses values against read-only backend
  aggregates;
- verify the weighted total formula;
- verify Battery Type is absent and no battery request is sent by Reporting;
- test Tower Visualizer suggestion click and Enter at desktop width;
- test Tower Visualizer mobile Search/Enter, confirmation dialog, autofill, and
  no stale-result selection;
- verify compact versus descriptive headers;
- compare tower preview and exported artwork before and after to ensure the
  protected visual core is unchanged;
- confirm no unexpected page-level overflow or console errors.

### Build and quality checks

Run the applicable frontend contract suite, backend test suite, lint, production
build, and focused Playwright/browser checks. Existing unrelated failures must
be reported separately with evidence rather than hidden by the redesign.

## Implementation Order

1. Establish theme tokens and shared visual primitives.
2. Update sidebar, global shell, panel/header density, and icon foundation.
3. Migrate page chrome and charts in bounded page groups while preserving
   protected map/tower visuals.
4. Repair Command Center Performance Trend and remove the two badges.
5. Repair Reporting Proker flow, add Backup Sukses, handle cache compatibility,
   and remove Battery Type frontend work.
6. Repair Tower Visualizer mobile Site ID submission and compact headers.
7. Run targeted tests after each group, then the full visual and functional
   verification matrix.

## Acceptance Criteria

- Dark mode visibly follows Matte Graphite + Telkomsel Red Edge.
- Light mode uses a darker cool-grey canvas and clearly separated panel borders.
- Sidebar, panels, icons, charts, tooltips, legends, and states are consistent
  across the complete dashboard.
- Cyan is no longer the default accent and decorative glows are removed.
- Performance Trend displays the available reporting trend.
- The two specified Command Center badges are absent.
- Proker Activity displays correct filtered values per Kabupaten/Kota and Total.
- Backup Sukses displays approved count and BPS-relative percentage per row and
  a weighted percentage in Total.
- Battery Type is absent from Reporting and is not fetched by that page.
- Mobile Site ID submission opens the existing confirmation/autofill flow
  reliably.
- Headers without subtitles are compact.
- Core map, RF Tilt, tower rendering, and tower exports remain unchanged.
- Required tests, lint, build, and browser checks pass, or unrelated baseline
  failures are documented with reproducible evidence.

