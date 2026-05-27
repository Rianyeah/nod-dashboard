# Fix & Improve SiteDetailModal — Design, Charts, Layout

## Goal

Redesign the SiteDetailModal to fix broken light-mode rendering, upgrade charts from tiny non-interactive sparklines to rich interactive Recharts-based visualizations, improve layout responsiveness, add accessibility, and create visual hierarchy that differentiates KPI sections from metadata sections.

## Assumptions

- Recharts (`^3.8.1`) is already installed and used elsewhere in the project (`AvailabilityChart.jsx`).
- Tailwind CSS v4 is set up and working (confirmed in `package.json`).
- The modal is only used from `DashboardPage.jsx` with props: `data`, `trendData`, `dailyData`, `onClose`.
- CSS custom properties (`--bg-surface`, `--bg-elevated`, `--border`, `--text-*`) flip correctly between `[data-theme="light"]` and dark mode.
- No new npm dependencies will be added.

## Plan

### 1. Fix light-mode theming (Blocker B1)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Replace all `bg-white/[0.035]`, `bg-white/[0.025]`, `bg-white/[0.03]` with `bg-[var(--bg-elevated)]` or theme-aware Tailwind classes.
  - Replace `border-white/[0.07]`, `border-white/[0.06]`, `border-white/[0.05]`, `border-white/[0.08]` with `border-[var(--border)]` or `border-[var(--border-light)]`.
  - Replace `text-white` in the header `h2` with `text-[var(--text-primary)]`.
  - Replace `bg-black/72` overlay with a theme-aware alternative.
- **Verify**: Toggle `data-theme="light"` in browser DevTools. Confirm all cards/sections have visible borders and readable text.

### 2. Upgrade charts to Recharts with tooltips (Blocker B2 + Major M2)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Replace hand-rolled SVG sparkline `TrendCard` with Recharts `AreaChart` + `Tooltip` + `ReferenceLine` (at 95% and 99.5%).
  - Increase chart height from 68px to ~120px.
  - Add custom tooltip component showing exact date + value on hover.
  - Add Y-axis labels (min/max) and subtle grid lines.
  - Keep the gradient fill under the area line.
  - Remove the old `buildSparklinePoints()` function and related SVG rendering code.
- **Verify**: Hover over chart points — tooltip must appear with date and percentage value. Check light and dark mode.

### 3. Improve chart grid layout (Major M1)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Change the top chart section from `xl:grid-cols-3` to a 2+1 layout:
    - Two trend charts side-by-side at `md:` breakpoint (`md:grid-cols-2`).
    - Monthly Scorecard as full-width row below the charts.
  - In the Monthly Scorecard row, make Availability + Total Outage "hero" sized (larger font, wider cards) and Total Cell + Hari Data smaller secondary metrics on the right.
- **Verify**: Resize browser window from 900px → 1400px. Layout should gracefully reflow. No horizontal overflow.

### 4. Add scroll indicator and visual hierarchy to info sections (Majors M4 + M5)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`, `frontend/src/index.css`
- **Change**:
  - Add a fade mask (`mask-image: linear-gradient(...)`) or subtle top/bottom `box-shadow` on the scroll container to indicate more content below.
  - Restyle "Teknologi" section: instead of label-value rows, show each band as a small horizontal bar chart or pill badges with count.
  - Increase `InfoRow` label width for "Lokasi" section to accommodate longer address fields.
  - Remove duplicate "RCA Dominan" from FIELD_GROUPS (it's already in "Kualitas Data" section).
- **Verify**: Open modal, scroll — gradient should fade in/out. Check "Teknologi" section shows band counts visually.

### 5. Add keyboard navigation & accessibility (Major M3)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the site-id heading.
  - Add `onKeyDown` handler on the outer div to close on `Escape`.
  - Auto-focus the close button on mount via `useRef` + `useEffect`.
  - Prevent body scroll while modal is open (`document.body.style.overflow = 'hidden'`).
- **Verify**: Open modal → press `Escape` → modal closes. Tab key should focus the close button first.

### 6. Polish header and status indicator (Minors m1, m3)
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Add a text label next to the status dot (e.g., "Healthy", "Warning", "Critical") based on availability thresholds.
  - Apply subtle `animate-pulse-ring` to the dot when availability < 95%.
  - Add a colored accent stripe (2px gradient bar) at the top of the modal header for visual identity.
  - Fix header gradient to use a visible accent in light mode.
- **Verify**: Check both themes. Status label should read correctly. Pulse animation visible on critical sites.

### 7. Clean up nits and final polish
- **Files**: `frontend/src/components/SiteDetailModal.jsx`
- **Change**:
  - Fix `minutesLabel` edge case for values < 0.5 (show `< 1 min` instead of `0 min`).
  - Use unique SVG gradient IDs with `useId()` React hook.
  - Add `aria-modal="true"` and `role="dialog"` (if not done in step 5).
  - Test overall visual quality in both themes and verify no regressions.
- **Verify**: `npm run build` to confirm no compilation errors. Visual spot-check both themes.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Recharts increases bundle size for modal | Recharts is already a dependency — no net addition |
| Chart responsive behavior may differ from sparkline | Use `<ResponsiveContainer>` which auto-resizes |
| Light-mode CSS variable changes may affect other components | Changes are scoped to SiteDetailModal only; global CSS vars are unchanged |
| Accessibility changes may break click-outside-to-close | Test both mouse and keyboard interactions in each step |

## Rollback plan

All changes are in a single file (`SiteDetailModal.jsx`) with minor CSS additions in `index.css`. To roll back:
1. `git checkout -- frontend/src/components/SiteDetailModal.jsx frontend/src/index.css`
2. Verify the modal renders as before.

No database, API, or state management changes are involved.
