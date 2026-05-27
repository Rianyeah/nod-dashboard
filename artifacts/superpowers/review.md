# Superpowers Review — SiteDetailModal

**File**: `frontend/src/components/SiteDetailModal.jsx` (425 lines)
**Reviewed**: 2026-05-26

---

## Blockers

### B1 — Light-mode is broken: all inline colors assume dark background
**Severity**: Blocker  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx)  
**Lines**: 202, 252–257, 263–268, 273–281  

All card/section containers use hardcoded `bg-white/[0.035]`, `border-white/[0.07]`, `bg-white/[0.025]` and `text-white`. In `[data-theme="light"]` the white-on-white opacity hack is invisible — sections vanish, text is unreadable. The screenshots provided confirm this: the light-mode variant shows a flat white page with almost no card boundaries.

**Fix**: Replace hardcoded `white/[opacity]` values with CSS custom properties (e.g., `var(--bg-elevated)`, `var(--border)`) that already flip correctly across themes.

---

### B2 — Charts have no tooltip / hover interactivity
**Severity**: Blocker  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L210-L244)  

The sparkline charts are raw SVG `<path>` + `<circle>` elements with no `<title>`, no hover event, and no tooltip. Users cannot inspect individual data points. For a "detail" modal this is a critical missing feature — the user opened the modal *to* understand data, but can't read exact values from the chart.

**Fix**: Add hover-based tooltips (either a custom React tooltip or SVG `<title>`) on each circle point, showing the exact value and date.

---

## Majors

### M1 — Responsive collapse: 3-column chart grid breaks below 1080px
**Severity**: Major  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L355)  

The chart section uses `xl:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)_320px]` which only activates at `xl` (1280px+). Below that, all three cards (6-month trend, daily trend, scorecard) stack vertically. On typical 1366px laptops with sidebar visible, the actual modal content area is <1080px, meaning the 3-column layout almost never renders.

**Fix**: Use a `md:` or `lg:` breakpoint or a custom container query. Consider changing to a 2-column layout (charts side-by-side, scorecard full-width below) as the default, with 3-column for wide screens.

### M2 — Charts are tiny and lack axis reference lines / labels
**Severity**: Major  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L145-L148)  

`CHART_HEIGHT = 68px`, `CHART_WIDTH = 250px` — these sparklines are too small for a detail modal. There are no Y-axis labels, no grid lines, and no 99.5%/95% threshold reference lines to visually distinguish "good" from "bad" performance. The user must mentally map between the tiny dots and the headline number.

**Fix**: Increase chart dimensions, add subtle horizontal reference lines at 95% and 99.5%, show Y-axis min/max labels. Consider using Recharts (already a dependency) for richer interaction instead of hand-rolled SVG.

### M3 — No keyboard navigation or focus trap
**Severity**: Major  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L324-L331)  

The modal doesn't trap focus, doesn't handle `Escape` to close, and the scrollable content area has no keyboard-accessible focusables. The overlay `onClick` closes the modal, but a keyboard user can't invoke it.

**Fix**: Add `onKeyDown` for Escape, `autoFocus` on the close button, and a focus trap wrapper.

### M4 — Overcrowded info sections with uniform, monotonous layout
**Severity**: Major  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L384-L419)  

All 7+ field groups render identically (same `Section` → `InfoRow` pattern with identical spacing and `text-[10px]` sizing). This creates a dense, monolithic wall of text. The "Teknologi" section (which is a numeric count per band) would benefit from a different visualization (e.g., horizontal mini-bars). "Lokasi" (geographic data) would benefit from a mini-map or at least larger/bolder formatting.

**Fix**: Differentiate section rendering by content type. Use visual variety to break monotony.

### M5 — Scroll area has no visual indicator of "more content below"
**Severity**: Major  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L354)  

The scrollable area (`overflow-y-auto`) has no scroll indicator shadow or fade at top/bottom edges. The user may not realize there are 5+ more sections below the fold.

**Fix**: Add a `mask-image` gradient or `box-shadow` scroll indicator at the bottom of the scroll container.

---

## Minors

### m1 — Status dot is static, has no semantic meaning communicated
**Severity**: Minor  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L342-L345)  

The status indicator dot (green/yellow/red) has a glow effect but no label explaining what color means. Also, the glow uses the same `boxShadow` pattern as the `animate-pulse-ring` animation class that exists in the codebase, but is never applied here — a subtle pulse would draw attention to the status.

**Fix**: Add a tooltip or small text label next to the dot (e.g., "Active" or "99.34% — Healthy"). Consider applying `animate-pulse-ring` when status is critical.

### m2 — Duplicated RCA Dominan field
**Severity**: Minor  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L45-L46)  

`RCA Dominan` appears in `FIELD_GROUPS[1]` ("Info Site" group, line 45) and again in the dedicated "Kualitas Data" section (line 416). It will render twice if the value is not empty.

**Fix**: Remove it from one of the two locations.

### m3 — Header gradient appears flat in light mode
**Severity**: Minor  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L332)  

`bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-elevated)]` — In light mode, both CSS vars resolve to almost-white (#FFFFFF → #F8FAFC), making the gradient invisible. The header blends into the body.

**Fix**: In light mode, add a bottom border or a subtle colored accent stripe to the header for visual separation.

### m4 — Magic numbers in chart layout
**Severity**: Minor  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L145-L148)  

`CHART_WIDTH = 250`, `CHART_HEIGHT = 68`, `CHART_PADDING_X = 20`, `CHART_PADDING_Y = 10` are magic numbers defined at module scope with no documentation about *why* those sizes were chosen.

**Fix**: Add comments or calculate dimensions relative to the container.

### m5 — Monthly Scorecard metric cards are equal-weighted but have different importance
**Severity**: Minor  
**File**: [SiteDetailModal.jsx](file:///d:/Web-dashboard/frontend/src/components/SiteDetailModal.jsx#L373-L381)  

"Availability" and "Total Outage" are the primary KPIs but get the same visual weight as "Total Cell" and "Hari Data" (which are supporting metadata). All four use the same `CompactMetricCard` with identical sizing.

**Fix**: Make the top two KPIs (Availability + Total Outage) more prominent — larger font, or a full-width "hero" row, with the secondary metrics below in a smaller row.

---

## Nits

### n1 — Inconsistent value formatting
**Lines**: 131-135  
`formatValue()` uses `Number.isInteger()` which treats `99.00` (a float) differently from `99` (an integer) even though they're visually equivalent.

### n2 — Indonesian hardcoded strings not extracted
Lines throughout — e.g., `'Data trend tidak tersedia'`, `'Tutup detail site'`. Should be i18n constants if multilingual is ever needed.

### n3 — Missing `aria-modal="true"` and `role="dialog"`
Line 328 — The modal container lacks proper ARIA attributes.

### n4 — SVG gradient IDs may collide
Line 214 — `id={`trend-fill-${title.replace(/\\s+/g, '-')}`}` uses title-based IDs which could collide if the same title appears in multiple instances.

### n5 — `minutesLabel` uses `Math.round` which can produce misleading "0 min" for values <0.5
Line 141 — Edge case: if value is 0.3 minutes, it displays "0 min".

---

## Summary

| Severity | Count |
|----------|-------|
| Blocker  | 2     |
| Major    | 5     |
| Minor    | 5     |
| Nit      | 5     |

### Key Themes
1. **Light-mode is completely broken** — the modal is invisible/unreadable
2. **Charts lack interactivity and are too small** — defeats the purpose of a "detail" view
3. **Monotonous layout** — every section looks identical, creating a wall of text
4. **No accessibility considerations** — no keyboard nav, focus trap, or ARIA roles
5. **Responsive layout only works on very wide screens**

### Next Actions
- Fix Blockers B1 & B2 immediately
- Address Majors M1–M5 in a design/layout improvement pass
- Bundle Minors/Nits into a cleanup pass

**Do NOT implement changes from this review.** This review is complete. Use the plan workflow to schedule implementation.
