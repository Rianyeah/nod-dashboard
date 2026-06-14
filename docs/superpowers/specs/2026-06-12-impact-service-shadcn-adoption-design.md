# Impact Service shadcn/ui Adoption Design

## Objective

Adopt shadcn/ui on the complete Impact Service page as the pilot for a broader
dashboard migration.

The approved visual direction is hybrid:

- shadcn/ui supplies component structure, accessibility behavior, semantic
  tokens, interaction states, and chart wrappers;
- the existing NOC palette, operational status colors, information density,
  business labels, dark/light modes, and data contracts remain recognizable;
- chart types may be optimized when the same backend data can communicate the
  operational meaning more clearly.

The page remains functionally compatible with all current Impact Service API
endpoints and global filters.

## Initialization Strategy

Run the requested preset initialization from `frontend`:

```powershell
npx shadcn@latest init --preset bLrdjONkJ --template vite --pointer
```

The repository currently has no `frontend/components.json`, so this is a new
shadcn initialization rather than a preset switch. Before accepting generated
changes, review:

- `components.json`
- `package.json` and `package-lock.json`
- `vite.config.js`
- the Tailwind entry file
- generated aliases, utilities, and component destinations

The initialization must not replace the existing Vite application, routes, or
dashboard source files. Generated configuration is merged into the current
frontend.

After initialization, add only the components required by this pilot:

- `alert`
- `badge`
- `button`
- `calendar`
- `card`
- `chart`
- `empty`
- `input`
- `pagination`
- `popover`
- `select`
- `separator`
- `skeleton`
- `table`
- `tooltip`

The Date Range Picker is composed from `Button`, `Popover`, and `Calendar`.
Existing Recharts remains the chart engine through the shadcn Chart component.

## Design System Integration

### Semantic token bridge

The shadcn CSS variables become the component-facing API. They are mapped to
the existing NOC tokens instead of replacing the NOC palette.

Required mappings include:

```text
--background            -> --bg-base
--card                  -> --bg-surface / --bg-glass
--popover               -> --bg-elevated
--foreground            -> --text-primary
--muted-foreground      -> --text-muted
--border                -> existing NOC border value
--primary               -> NOC blue
--destructive           -> NOC danger
--chart-1               -> total / primary blue
--chart-2               -> OPEN red
--chart-3               -> CLEAR green
--chart-4               -> warning amber
--chart-5               -> secondary informational color
```

Both `:root` and `[data-theme="light"]` receive compatible shadcn variables.
The existing `useTheme` flow and `data-theme` attribute remain the source of
truth; this pilot does not introduce a second theme provider.

### Visual rules

- Keep the current Inter and Fira Code typography roles.
- Preserve compact dashboard density while standardizing spacing through
  shadcn component composition.
- Use semantic component variants rather than raw one-off color classes for
  controls, alerts, badges, and surfaces.
- Preserve operational colors: OPEN red, CLEAR green, warning amber, total
  blue.
- Reduce decorative grid and glow effects in the page header, but retain a
  restrained NOC dark appearance.
- Use shadcn focus, disabled, keyboard, and screen-reader behavior.

## Page Architecture

The current `ImpactServicePage.jsx` is large and mixes data orchestration with
page-level UI. The migration introduces focused feature components while
leaving API state and request coordination in the page.

Proposed structure:

```text
frontend/src/
  components/ui/                 generated shadcn primitives
  features/impact-service/
    ImpactServiceHeader.jsx      title, period summary, back action
    ImpactServiceFilters.jsx     date range, NOP, reset
    ImpactServiceKpiGrid.jsx     five approved business metrics
    ImpactServiceCharts.jsx      chart layout and chart cards
    ImpactServiceTopAlarms.jsx   ranked compact table
    ImpactServiceAlarmTable.jsx  search, status badges, pagination
    impactServiceChartConfig.js  semantic series and chart metadata
  pages/
    ImpactServicePage.jsx        fetching, state, validation, composition
```

Small calculation and formatting helpers may remain near the page unless they
are reused by more than one extracted component.

## Page Layout

### Header

The header contains:

- back action;
- `Impact Service` title;
- active period summary;
- compact alarm icon treatment.

The current decorative background grid is removed. The header uses a clear
surface boundary and less visual noise.

### Filter toolbar

Replace the two independent date inputs with one Date Range Picker while
preserving the same `startDate` and `endDate` state sent to every endpoint.

The toolbar contains:

- Date Range Picker;
- NOP Select;
- reset button;
- active-filter summary when useful at narrow widths.

Changing either date or NOP continues to refresh all scorecards, charts,
rankings, and the alarm table. Reset restores the currently defined default
date behavior and `Semua NOP`.

Invalid date ranges render a shadcn `Alert` and do not trigger invalid data
requests.

### KPI grid

Retain these labels exactly:

- `Alarm impact service`
- `Impacted Site`
- `OPEN Alarm`
- `CLEAR Alarm`
- `SOW TSEL`

Each KPI uses full Card composition and retains:

- primary value;
- previous-period delta;
- comparison label;
- operational accent.

Loading uses Card-shaped Skeleton components. Values and delta semantics do not
change.

## Chart Redesign

All charts use shadcn `ChartContainer`, `ChartTooltip`,
`ChartTooltipContent`, and `ChartLegend` where a legend is necessary.
Chart metadata comes from one shared configuration so colors and labels are not
redeclared in each chart.

### Primary row

#### Last 7 Days Trend

- Occupies two-thirds of the desktop row.
- Uses stacked bars for OPEN and CLEAR.
- Uses a total line over the stacked bars.
- Keeps date labels, total labels, and filter-driven data.
- Uses a clear legend and tooltip with Indonesian number formatting.

#### NOP Contribution / Top Impacted Sites

- Occupies one-third of the desktop row.
- Uses a horizontal stacked bar.
- Switches title and category source when an NOP is selected, matching current
  behavior.
- Ranks and limits the same top ten records.

### Secondary row

#### Status by Severity

Use grouped horizontal bars instead of stacked bars. OPEN and CLEAR are placed
side by side so operational imbalance is visible without mentally separating a
stack.

#### Category Distribution

Use a ranked horizontal bar of total alarms. Preserve the top-eight limit and
allow long labels enough width without compressing the plot area.

#### Aging Range

Use vertical bars with risk-aware colors:

- recent ranges use blue or green;
- intermediate ranges use amber;
- oldest ranges use destructive red.

The backend buckets and values remain unchanged.

### Top Alarm Names

Retain this as a ranked compact table rather than forcing tabular data into a
chart. Use shadcn `Table`, rank numbers, formatted totals, and impacted-site
counts.

## Alarm Detail Table

The detail table uses shadcn Table composition and preserves the current
columns, search behavior, filters, row data, and server pagination.

Adopt:

- `Input` for search;
- `Select` for status or supported table filters;
- `Badge` for OPEN/CLEAR and other categorical states;
- `Pagination` primitives for page navigation;
- `Skeleton` rows while loading;
- `Empty` when no results match;
- `Alert` for request failures;
- `Tooltip` where truncated values need full text.

Table density remains appropriate for operations users. The migration must not
turn rows into a card grid.

## Loading, Empty, Error, and Accessibility States

- Page-level render failures retain an error boundary but use shadcn Alert and
  Button composition.
- Request failures remain visible without blanking successfully loaded
  sections.
- Loading placeholders match the final component geometry.
- Every chart and table provides a meaningful empty state.
- Date, select, search, pagination, reset, and back controls are fully keyboard
  accessible.
- Chart color is supplemented by labels and legend text; status meaning does
  not depend on color alone.
- Reduced-motion behavior remains supported.

## Responsive Behavior

Desktop:

- five KPI cards on wide screens;
- primary chart row uses a 2:1 ratio;
- secondary analytics use a balanced multi-column layout;
- detail table remains full width.

Tablet:

- KPI grid reduces to two or three columns;
- primary charts stack when their plot area would become cramped;
- filters wrap without detaching labels from controls.

Mobile:

- header actions remain reachable;
- filters become a vertical or compact wrapped toolbar;
- KPI cards use one or two columns;
- all charts stack;
- the table keeps horizontal scrolling rather than hiding required columns.

## Data Flow and Compatibility

No backend endpoint or response model changes are required.

The following remain unchanged:

- summary request and previous-period values;
- daily trend request;
- NOP and site contribution request;
- severity, category, and aging distributions;
- top alarms request;
- alarm detail search and pagination;
- global `start_date`, `end_date`, and optional `nop` propagation.

The migration changes rendering and local component composition only.

## Testing and Validation

### Configuration contracts

Verify:

- `components.json` resolves to the intended frontend paths;
- the Vite alias resolves generated imports;
- Tailwind v4 continues to compile;
- dark and light NOC token mappings satisfy shadcn variables;
- only required dependencies are added.

### Frontend contracts

Add or update tests to verify:

- all five business KPI labels remain;
- the Date Range Picker updates both start and end values;
- NOP and reset controls propagate to all data requests;
- each chart uses the shared shadcn chart configuration;
- Severity uses grouped bars;
- Category remains ranked and limited to eight;
- Aging uses risk-aware category colors;
- Top Alarm Names remains a table;
- Alarm Detail Table retains search and pagination;
- loading, empty, invalid range, and error states use the intended components.

### Build and runtime QA

Run:

```powershell
npm run lint
npm run build
node --test src/__tests__/homePageContracts.test.js
node --test src/__tests__/dashboardReportingContracts.test.js
node --test src/__tests__/impactServiceContracts.test.js
```

If the Impact Service contract test does not yet exist, create it as part of
implementation.

Browser validation covers:

- `/impact-service` with authentication;
- desktop and mobile viewport;
- dark and light mode;
- date range change;
- NOP change;
- reset action;
- search and pagination;
- loading and empty states where reproducible;
- console errors and warnings;
- visual comparison against the approved hybrid direction.

## Rollout

Impact Service is the only page migrated in this pilot. Existing dashboard
primitives remain available to all other pages.

After runtime acceptance, reusable patterns may be proposed for:

- shared KPI Card variants;
- shared dashboard filter toolbar;
- shared chart configuration;
- shared dense data table.

No other page is automatically migrated in this scope.

## Out of Scope

- Backend query or response changes.
- Redesigning navigation or the global AppShell.
- Migrating Home, Reporting, Activity Enom, Transport Quality, Ticketing, Site
  Map, or Site Detail Modal.
- Replacing Recharts with another chart engine.
- Changing business labels, metric definitions, date defaults, or NOP
  normalization.
- Adding new drill-down endpoints or analytics not already supplied by the
  backend.

## Chart Readability Addendum

The chart refinement approved after implementation adds these presentation
rules without changing API requests or metric definitions:

- KPI icons sit immediately beside their scorecard titles, and KPI values use a
  larger display size.
- Top Impacted Sites always renders every Site ID tick by disabling automatic
  Y-axis interval skipping and reserving sufficient label width.
- Stacked and grouped bars show a high-contrast value label for every non-zero
  OPEN and CLEAR segment. The stacked charts do not add a separate total label.
- Aging bars show their total value directly above each bar.
- Category Distribution becomes a donut chart. The period total is shown in the
  donut center, while a valued legend shows each category name and value.
- Chart value labels use a larger, bold font than the original 10px trend
  labels.
- Every bar rectangle uses a larger consistent corner radius.

## Compact Reporting and Alarm Sorting Addendum

The approved reporting refinement adds these requirements:

- Chart value labels use solid foreground colors without SVG stroke, outline,
  or paint-order effects.
- The screen layout uses compact reporting density: page gaps, card headers,
  KPI height, chart height, table rows, and control height are reduced while
  preserving readable labels and click targets.
- A print action produces an A4 landscape report. Navigation, breadcrumb,
  interactive filters, pagination, and screen-only controls are hidden.
- The print report contains KPI cards, all charts, Top Alarm Names, and a
  dedicated alarm detail dataset.
- The print alarm dataset is independent of the active screen table filters.
  It contains at most 100 OPEN alarms for the active global date and NOP
  filters, ordered by Critical, Major, Minor, Warning, then newest date.
- Alarm Detail Table sorting is server-side and applies across pagination.
  Sortable columns are Tanggal, Site ID, Site Name, NOP, Alarm Name, Category,
  Severity, Aging, Status, and SOW.
- Sort columns are mapped through a backend whitelist. User input is never
  interpolated directly into SQL.
- Clicking a sortable header toggles ascending and descending order and resets
  the table to page one. The default screen order remains newest date first.
- The print stylesheet must avoid splitting KPI cards, chart cards, and table
  rows where practical.
