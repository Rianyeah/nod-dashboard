# Data Potensi Insight Carousel and Cell Heatmap Design

**Date:** 2026-08-04
**Status:** Approved for implementation planning
**Scope:** Data Potensi dashboard only

## Summary

Replace the two side-by-side Operational Readiness and Transport Configuration panels with one three-slide shadcn Carousel. The carousel will contain Operational Readiness Heatmap, Transport Configuration Matrix, and a new Cell Distribution Heatmap. Tower Provider Distribution moves into the former right-hand Transport Configuration position, and its old standalone row is removed.

The two existing matrix panel descriptions are removed. The carousel header shows only the active slide title and icon, plus compact navigation. No new dashboard filter is introduced; all three carousel datasets and Tower Provider Distribution continue to use the existing Data Potensi filters.

## Goals

- Consolidate related infrastructure matrices into one predictable, space-efficient panel.
- Support previous/next buttons, dot navigation, keyboard navigation, and touch or mouse swipe.
- Preserve horizontal table scrolling without accidentally changing slides.
- Add a Kabupaten-level heatmap for nine cell technologies from `public.data_site_master`.
- Move Tower Provider Distribution beside the carousel and remove its duplicate standalone position.
- Preserve the dashboard's existing graphite visual language, dense information hierarchy, and accessible table semantics.

## Non-goals

- No autoplay or infinite looping.
- No new period filter or carousel-specific data filter.
- No change to the Data Potensi site table, scorecards, donut charts, or Breakdown by Kabupaten behavior.
- No schema migration or cleanup of source values in Neon.
- No mutation of `data_site_master`.

## Confirmed Source Data

The following `data_site_master` columns exist as PostgreSQL `text` columns:

- `GSM900`
- `DCS1800`
- `L900`
- `L1800`
- `L2100`
- `L2300`
- `LTE NB-IoT`
- `NR2100`
- `NR2300`

Most populated values are numeric counts, but the source also contains blanks and spreadsheet errors such as `#N/A`, verbose VLOOKUP errors, and `####`. The API must therefore validate each value before casting it. Invalid or blank values contribute zero and must never fail the complete dashboard response.

## Chosen Approach

Use the shadcn Carousel component backed by `embla-carousel-react`.

This is preferred over a hand-written React carousel because the dashboard needs reliable swipe, keyboard, resize, focus, and snap behavior. The implementation will add the local shadcn component source to `frontend/src/components/ui/carousel.jsx` and the required Embla dependency to the frontend lockfile.

Carousel configuration:

- horizontal orientation;
- `align: "start"`;
- `loop: false`;
- one slide per snap;
- no autoplay;
- reduced motion disables transition duration;
- controlled API state supplies the active title, icon, arrow state, and dot state;
- a custom `watchDrag` callback returns `false` when a drag starts inside an element marked `data-carousel-scroll-region`, allowing matrix tables to keep native horizontal scrolling.

## Page Layout

The section after the three donut charts becomes a responsive two-column row:

```text
Desktop / XL
+--------------------------------------+------------------------------+
| Infrastructure insight carousel      | Tower Provider Distribution  |
| Readiness / Transport / Cell          | existing bar chart           |
+--------------------------------------+------------------------------+

Mobile / tablet
+-------------------------------------------------------------+
| Infrastructure insight carousel                             |
+-------------------------------------------------------------+
| Tower Provider Distribution                                 |
+-------------------------------------------------------------+
```

The carousel and Tower Provider cards use the same minimum height so the row remains aligned. Tower Provider Distribution is removed from its old standalone section below Breakdown by Kabupaten.

Loading state uses two aligned skeletons in this row. The downstream Breakdown by Kabupaten and site table retain their current order.

## Carousel Panel

Create a focused `DataPotensiInsightCarousel` component. It owns only slide selection and presentation; it does not fetch data.

The single outer `DashboardChartPanel` uses the active slide's title and icon:

1. `Operational Readiness Heatmap` with `CheckCircle2`.
2. `Transport Configuration Matrix` with `Network`.
3. `Cell Distribution Heatmap` with a suitable existing Lucide radio/cell icon.

The `description` prop is omitted for every slide, satisfying the request to remove panel sub-labels. Previous and next icon buttons are supplied through the existing `action` slot. Three compact dot buttons appear beneath the content and expose the slide names through accessible labels. The current slide is announced as `Slide N dari 3` in a polite live region.

Keyboard behavior follows the shadcn/Embla primitive. Previous and next buttons are disabled at the first and last slide because looping is disabled. Dot buttons directly select their corresponding slide.

Each slide remains a semantic table or explicit empty state. The component must not hide useful cell values behind hover-only UI.

## Existing Slides

### Operational Readiness Heatmap

- Keep the existing Kabupaten rows and ENVA, Dual EAS, and BBLTI SW columns.
- Keep percentage as the primary value and ready/total as the cell-level secondary value.
- Keep the green intensity legend.
- Remove the panel description `Persentase site siap per Kabupaten berdasarkan status monitoring.`.

### Transport Configuration Matrix

- Keep Transport Type plus Modem as row dimensions and Jumper as columns.
- Keep site count as the primary value and percentage of filtered sites as the cell-level secondary value.
- Keep the primary-color intensity legend.
- Remove the panel description `Jumlah site untuk kombinasi Transport Type, Modem, dan Jumper.`.

The request concerns panel-title sub-labels, not the useful secondary values inside heatmap cells. Those cell values remain.

## Cell Distribution Heatmap

### Data semantics

For every Kabupaten and technology, show the total number of cells:

```text
SUM(valid numeric value from the technology column)
```

A value is valid only after trimming when it matches a non-negative numeric representation. Blank strings, `#N/A` variants, `####`, and other nonnumeric values contribute zero. The result is returned as an integer.

Rows use the same normalized Kabupaten expression as the other Data Potensi matrices. The existing NOP, Status Site, Cluster, Kabupaten, Site Class, Type Site, Transport Type, Type Battery, and Tower Provider filters all apply before aggregation.

### API contract

Add `CellDistributionByKabupatenItem` to the Data Potensi response:

```python
class CellDistributionByKabupatenItem(BaseModel):
    kabupaten: str
    gsm900: int = 0
    dcs1800: int = 0
    l900: int = 0
    l1800: int = 0
    l2100: int = 0
    l2300: int = 0
    lte_nb_iot: int = 0
    nr2100: int = 0
    nr2300: int = 0
```

`DataPotensiResponse` gains:

```python
cell_distribution_by_kabupaten: list[CellDistributionByKabupatenItem]
```

The dashboard cache namespace advances from `dashboard-v2` to `dashboard-v3` so a stale cached payload cannot omit the new field.

### Presentation

- Rows: Kabupaten.
- Columns, in fixed order: GSM900, DCS1800, L900, L1800, L2100, L2300, LTE NB-IoT, NR2100, NR2300.
- Primary cell value: formatted total cell count.
- Heat intensity: independently normalized within each technology column against that column's maximum Kabupaten value.
- A zero value uses the lowest intensity and remains visibly rendered as `0`.
- Cell tooltip and `aria-label`: Kabupaten, technology, and exact total cell count.
- Legend: low-to-high cell concentration using the dashboard information color.
- The table uses a sticky header and a marked horizontal/vertical scroll region.

Per-column normalization prevents high-volume LTE/GSM columns from making low-volume NB-IoT and NR columns visually indistinguishable.

## Component Boundaries

- `backend/models/data_potensi.py`: response schema for cell distribution.
- `backend/routers/data_potensi.py`: safe numeric aggregation, filter application, payload field, and cache-version bump.
- `frontend/src/components/ui/carousel.jsx`: generated/adapted shadcn Carousel primitive.
- `frontend/src/features/data-potensi/dataPotensiMatrixUtils.js`: fixed cell column metadata and per-column maximum calculation.
- `frontend/src/features/data-potensi/DataPotensiMatrixCharts.jsx`: content-only matrix tables and the new Cell Distribution table.
- `frontend/src/features/data-potensi/DataPotensiInsightCarousel.jsx`: carousel state, navigation, active header, gesture policy, dots, and slide composition.
- `frontend/src/pages/DataPotensiPage.jsx`: two-column carousel/Tower Provider layout and removal of the old Tower Provider row.

The page remains responsible for data loading. The carousel receives `readinessData`, `transportData`, and `cellDistributionData` as props.

## Error, Empty, and Loading Behavior

- The dashboard API remains one response. A SQL error is surfaced through the existing Data Potensi dashboard error state.
- Invalid source cell strings are data-quality conditions, not API errors, and resolve to zero.
- Each carousel slide independently renders its existing-style empty state when its array is empty.
- Changing slides never triggers a network request.
- Filter changes retain the current active slide and refresh all slide data through the existing dashboard request.
- Initial loading renders the two-card skeleton row.

## Accessibility

- Carousel has an explicit region label describing the infrastructure insights group.
- Previous and next controls use real buttons with Indonesian accessible names.
- Dot controls use the complete slide title and `aria-current` for the selected slide.
- Slide changes update a polite live region.
- Tables keep semantic `table`, `thead`, row header, and column header markup.
- Heat color is never the only information channel; every cell contains a number.
- Focus indicators use the existing shared Button styles.
- Reduced-motion preference removes carousel animation while keeping navigation functional.

## Testing Strategy

### Backend

- Contract test for the new response model field and all nine keys.
- Query contract verifies all existing filters are included.
- Conversion test proves numeric strings are summed and blank, `#N/A`, VLOOKUP error, and `####` values contribute zero.
- Endpoint payload test verifies Kabupaten rows are returned and cache namespace is `dashboard-v3`.

### Frontend

- Utility test verifies the fixed nine-column order.
- Utility test verifies independent per-column maxima, including all-zero columns.
- Component contract verifies the two existing descriptions are absent.
- Carousel contract verifies all three slide titles, previous/next buttons, dots, live status, and non-looping configuration.
- Gesture contract verifies `watchDrag` ignores marked table scroll regions.
- Page layout contract verifies Tower Provider is beside the carousel and has no old standalone duplicate.
- Existing Data Potensi and production audit tests remain green.

### Browser QA

- Open Data Potensi with the current local authenticated flow.
- Verify the default Readiness slide and absence of its sub-label.
- Navigate through all slides with arrows and dots.
- Swipe between slides outside the table scroll region.
- Horizontally scroll the Transport and Cell tables without changing slides.
- Confirm Cell Distribution displays all nine columns and nonzero Kabupaten totals.
- Apply an existing dashboard filter and confirm carousel plus Tower Provider update together.
- Verify responsive stacking at a narrow viewport.

## Acceptance Criteria

- Exactly one carousel panel contains the three approved matrix slides.
- Operational Readiness and Transport Configuration panel descriptions are removed.
- Tower Provider Distribution occupies the right-hand position formerly used by Transport Configuration Matrix.
- No duplicate standalone Tower Provider panel remains.
- Cell Distribution aggregates the nine approved source columns by Kabupaten with safe numeric parsing.
- Heat intensity is normalized independently per technology column.
- Existing dashboard filters affect all four panels in the row.
- Buttons, dots, keyboard, and swipe navigation work without breaking matrix scrolling.
- Backend tests, frontend tests, lint, production audit, build, and authenticated browser QA pass.
