# Superpowers Brainstorm

## Goal

Implement four features for the NOD (Network Operation Dashboard):

1. **Light mode toggle** — Add a theme switcher so users can toggle between the existing dark mode and a new light mode across all pages.
2. **Login page redesign** — Redesign the login page to match the dashboard's dark design system (glassmorphism, grid overlay, glow accents) and support light mode.
3. **Breadcrumb / drill-down navigation** — Add a breadcrumb component to show the user's current location in the app hierarchy and allow quick navigation between pages.
4. **Availability in reporting chart & table** — Add availability data to the *existing* Revenue Trend chart (as a 3rd line) and add an availability column to the Revenue & Payload table, so users can compare revenue/payload performance against network availability.

## Constraints

- The app uses **Vite + React 19 + TailwindCSS v4 + Recharts + Lucide icons**.
- The dark design system is defined via CSS custom properties in `index.css` (`:root`).
- The login page currently uses plain Tailwind utility classes with a light theme (white bg, blue buttons) — it looks disconnected from the dashboard.
- The Revenue Trend chart currently shows 2 series: Revenue (blue AreaChart, left Y-axis) and Payload (green AreaChart, right Y-axis). Availability (%) needs a 3rd axis or should share the right Y-axis with appropriate scaling.
- The Revenue & Payload table has columns: Kabupaten, Sites, Revenue Total, Rev Voice, Rev BB, Rev Digital, Rev SMS, Rev IR, Payload, Traffic. Availability should be added as a new column.
- Backend already has `/availability/by-kabupaten` and `site_month_metrics` table. The reporting endpoints need to be extended to include availability data.
- The breadcrumb must work with the existing React Router setup (3 routes: `/login`, `/dashboard`, `/reporting`).
- No new external dependencies required.

## Known context

| Aspect | Current state |
|--------|--------------|
| Theme | Dark-only. CSS vars in `:root` of `index.css`. No light mode support. |
| Login page | Light themed (`bg-slate-50`, white card), `LoginPage.jsx` ~83 lines. Not matching dashboard aesthetic. |
| Navigation | Header has a "Reporting" link, Reporting page has a back arrow. No breadcrumb. No shared layout. |
| Revenue Trend chart | `AreaChart` with 2 series: `total_revenue` (blue, left Y-axis) and `total_payload` (green, right Y-axis). Uses `recharts`. |
| Revenue table | Per-kabupaten table with revenue breakdown columns. No availability column. |
| Backend `/reporting/trend` | Returns `{trx_month, total_revenue, total_payload, total_traffic}[]` — no availability. |
| Backend `/reporting/revenue-by-kabupaten` | Returns per-kabupaten revenue/payload breakdown — no availability. |
| Backend `site_month_metrics` | Has `total_time_in_minutes`, `total_outage_menit` per site per month — can compute availability. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Light mode CSS conflicts** | High — Tailwind v4 uses `@import "tailwindcss"`, custom properties must work in both modes | Use `[data-theme="light"]` selector on `:root` to override CSS vars; test all components |
| **Theme persistence** | Medium — Users lose preference on refresh | Store theme in `localStorage`, read on app init |
| **Login page breaking** | Low — It's a standalone page | Test thoroughly after redesign; keep same login logic |
| **3rd Y-axis crowding** | Medium — Adding availability % to a chart with revenue (millions) and payload (TB) creates scale conflicts | Use a dedicated right-side Y-axis for availability %, keep it visually distinct (e.g., dashed line, different color like orange/amber) |
| **Backend join performance** | Low — `site_month_metrics` JOIN with `data_site_master` for per-kabupaten availability | Already indexed; similar to existing `/availability/by-kabupaten` query |

## Options (3)

### Option A — CSS-variables-only theme (Recommended)
- Add a `[data-theme="light"]` override block in `index.css` that redefines all `--bg-*`, `--text-*`, `--border-*` variables for light mode
- Create a `ThemeProvider` context + toggle button in Header
- All components automatically adapt since they use CSS vars
- **Pros:** Minimal component changes, consistent, easy to extend
- **Cons:** Components using hardcoded Tailwind colors (e.g., `text-white`, `bg-white/[0.06]`) need updating

### Option B — Dual CSS class approach
- Use `.dark` / `.light` class on `<html>` and create separate rulesets
- **Pros:** Full control per mode
- **Cons:** Doubles CSS maintenance, more error-prone

### Option C — Tailwind dark mode built-in
- Use Tailwind's `dark:` variant throughout
- **Pros:** Idiomatic Tailwind
- **Cons:** Massive refactor — every component needs `dark:` prefixes added, doesn't leverage existing CSS vars

## Recommendation

**Go with Option A — CSS-variables-only theme toggle.**

This approach has the best effort-to-impact ratio because:
1. The existing design system is already built on CSS custom properties — we just add a light-mode override block.
2. Components using `var(--bg-surface)`, `var(--text-primary)`, etc. will automatically switch themes with zero changes.
3. Components with hardcoded Tailwind classes (mainly `text-white`, `bg-white/[0.06]`) need targeted updates — but these are predictable and searchable.
4. The login page redesign naturally follows: switch from inline Tailwind colors to CSS vars.
5. A `ThemeContext` provides a clean hook (`useTheme`) for any component that needs it.

For the **availability in reporting**: Extend the existing backend endpoints (`/reporting/trend` and `/reporting/revenue-by-kabupaten`) to include availability data from `site_month_metrics`. On the frontend, add availability as a 3rd dashed line in the Revenue Trend chart (using the right Y-axis as percentage), and add an "Avg Availability" column with color-coded badges to the Revenue & Payload table. This keeps everything in one view for easy comparison.

For the **breadcrumb**, create a simple `Breadcrumb.jsx` component that reads `useLocation()` and maps path segments to labels. Integrate it into the Header or as a sub-header bar.

## Acceptance criteria

- [ ] **Light mode toggle**: A sun/moon icon button in the Header toggles between dark and light mode. The preference persists across sessions (localStorage). All pages (Dashboard, Reporting, Login) render correctly in both modes.
- [ ] **Login page redesign**: The login page uses the same dark design system as the dashboard (glass card, grid overlay, gradient bg, glow accents). It adapts to light mode. Logo and branding match.
- [ ] **Breadcrumb navigation**: A breadcrumb bar displays the current page path (e.g., `Home > Dashboard` or `Home > Reporting`). Clicking breadcrumb items navigates to that route.
- [ ] **Availability in Revenue Trend chart**: The existing Revenue Trend chart shows a 3rd line (availability %) alongside Revenue and Payload, with a distinct color and style (dashed line). Legend updated.
- [ ] **Availability in Revenue table**: The Revenue & Payload table has a new "Avg Availability" column with color-coded values (green ≥99.5%, yellow ≥95%, red <95%). Table footer shows overall average.
- [ ] **No regressions**: Existing dashboard map, site table, site detail modal, and reporting tables continue to work correctly in both themes.
