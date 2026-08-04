# Data Potensi Insight Carousel and Cell Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the Data Potensi readiness and transport matrices into a three-slide shadcn Carousel, add a safely aggregated Kabupaten-level cell distribution heatmap, and move Tower Provider Distribution beside the carousel.

**Architecture:** Extend the existing `/api/v1/data-potensi/dashboard` payload with one filtered Kabupaten aggregation that safely parses nine text-backed cell columns. Keep data fetching in `DataPotensiPage`, move matrix rendering into content-only components, and compose those components inside a controlled shadcn/Embla carousel whose drag policy yields to horizontally scrollable tables.

**Tech Stack:** FastAPI, SQLAlchemy text queries, Pydantic, PostgreSQL/Neon, React 19, shadcn/ui, Embla Carousel, Tailwind CSS, Node test runner, Python unittest/pytest, Playwright CLI.

## Global Constraints

- Work on `codex/site-detail-performance-data-potensi-charts`; do not merge or push unless explicitly requested.
- Preserve all unrelated untracked files and stage only files named by each task.
- Do not add a period filter, autoplay, or infinite carousel looping.
- Keep all existing Data Potensi filters authoritative for every new aggregation.
- Treat blank and nonnumeric cell source values, including `#N/A` and `####`, as zero.
- Normalize heat intensity independently for each cell technology column.
- Remove panel descriptions from Operational Readiness and Transport Configuration while retaining cell-level secondary values.
- Use shadcn Carousel with `embla-carousel-react`; do not hand-roll swipe mechanics.
- Follow strict RED-GREEN-REFACTOR for every production change.
- After all code changes and tests, run authenticated browser QA and `graphify update .`.

---

### Task 1: Cell Distribution API Contract and Aggregation

**Files:**
- Modify: `backend/tests/test_data_potensi_contract.py`
- Modify: `backend/models/data_potensi.py`
- Modify: `backend/routers/data_potensi.py`

**Interfaces:**
- Produces: `CellDistributionByKabupatenItem` with `kabupaten`, `gsm900`, `dcs1800`, `l900`, `l1800`, `l2100`, `l2300`, `lte_nb_iot`, `nr2100`, and `nr2300` integer fields.
- Produces: `CELL_DISTRIBUTION_QUERY` with `{nop_filter}`, `{status_filter}`, and `{advanced_filter}` placeholders.
- Produces: `rows_to_cell_distribution(rows) -> list[CellDistributionByKabupatenItem]`.
- Extends: `DataPotensiResponse.cell_distribution_by_kabupaten`.
- Changes: Data Potensi dashboard cache namespace from `dashboard-v2` to `dashboard-v3`.

- [ ] **Step 1: Write failing backend tests for the response shape and row conversion**

Add imports for `CELL_DISTRIBUTION_QUERY` and `rows_to_cell_distribution`, then add this behavior test:

```python
def test_cell_distribution_rows_preserve_all_technology_totals(self):
    items = rows_to_cell_distribution([{
        "kabupaten": "SIDOARJO",
        "gsm900": 12,
        "dcs1800": 14,
        "l900": 11,
        "l1800": 17,
        "l2100": 9,
        "l2300": 15,
        "lte_nb_iot": 2,
        "nr2100": 1,
        "nr2300": 3,
    }])

    self.assertEqual(len(items), 1)
    self.assertEqual(items[0].kabupaten, "SIDOARJO")
    self.assertEqual(items[0].model_dump(exclude={"kabupaten"}), {
        "gsm900": 12,
        "dcs1800": 14,
        "l900": 11,
        "l1800": 17,
        "l2100": 9,
        "l2300": 15,
        "lte_nb_iot": 2,
        "nr2100": 1,
        "nr2300": 3,
    })
```

Add a query-boundary test that checks the three filter placeholders, every quoted source column, the numeric regex guard, and the absence of an unconditional direct text-to-integer cast. Extend the payload/cache test to require `cell_distribution_by_kabupaten` and `"dashboard-v3"` while rejecting `"dashboard-v2"`.

- [ ] **Step 2: Run the focused backend tests and confirm RED**

Run:

```powershell
python -m pytest backend/tests/test_data_potensi_contract.py -q
```

Expected: collection/import failure because `CELL_DISTRIBUTION_QUERY` and `rows_to_cell_distribution` do not exist.

- [ ] **Step 3: Add the Pydantic response model**

Add:

```python
class CellDistributionByKabupatenItem(BaseModel):
    """Aggregated cell counts for one Kabupaten/Kota."""
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

Add the list field to `DataPotensiResponse` with `Field(default_factory=list)`.

- [ ] **Step 4: Add safe SQL aggregation and row conversion**

Import the new model in the router. Define one local SQL expression per technology using this exact safety rule:

```sql
CASE
  WHEN TRIM(COALESCE(d."GSM900", '')) ~ '^[0-9]+([.][0-9]+)?$'
  THEN TRIM(d."GSM900")::numeric
  ELSE 0
END
```

Sum each guarded expression, cast the sum to `int`, group by the normalized Kabupaten expression, apply the three existing filter placeholders, and order by Kabupaten. Alias fields using the API keys from the model.

Implement:

```python
def rows_to_cell_distribution(rows) -> list[CellDistributionByKabupatenItem]:
    return [
        CellDistributionByKabupatenItem(
            kabupaten=row.get("kabupaten") or "Tidak ada",
            gsm900=int(row.get("gsm900") or 0),
            dcs1800=int(row.get("dcs1800") or 0),
            l900=int(row.get("l900") or 0),
            l1800=int(row.get("l1800") or 0),
            l2100=int(row.get("l2100") or 0),
            l2300=int(row.get("l2300") or 0),
            lte_nb_iot=int(row.get("lte_nb_iot") or 0),
            nr2100=int(row.get("nr2100") or 0),
            nr2300=int(row.get("nr2300") or 0),
        )
        for row in rows
    ]
```

Execute the query after the transport matrix query, pass its rows through the converter, include the new field in `DataPotensiResponse`, and bump the cache namespace to `dashboard-v3`.

- [ ] **Step 5: Run focused backend tests and confirm GREEN**

Run:

```powershell
python -m pytest backend/tests/test_data_potensi_contract.py -q
```

Expected: all Data Potensi contract tests pass.

- [ ] **Step 6: Commit the backend API slice**

```powershell
git add -- backend/models/data_potensi.py backend/routers/data_potensi.py backend/tests/test_data_potensi_contract.py
git diff --cached --check
git commit -m "feat: add data potensi cell distribution"
```

---

### Task 2: Cell Distribution Matrix Utilities and Content

**Files:**
- Modify: `frontend/src/__tests__/dataPotensiMatrixUtils.test.js`
- Modify: `frontend/src/features/data-potensi/dataPotensiMatrixUtils.js`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`
- Modify: `frontend/src/features/data-potensi/DataPotensiMatrixCharts.jsx`

**Interfaces:**
- Produces: `buildCellDistributionColumns() -> Array<{ key: string, label: string }>` in the approved fixed order.
- Produces: `buildCellDistributionMatrix(rows) -> { rows, columns, maxima }` with non-negative integer cells and independent maxima per technology.
- Produces: content-only `OperationalReadinessHeatmap`, `TransportConfigurationMatrix`, and `CellDistributionHeatmap` components; none owns an outer `DashboardChartPanel`.
- Cell and transport scroll containers expose `data-carousel-scroll-region`.

- [ ] **Step 1: Write failing matrix utility tests**

Add imports for `buildCellDistributionColumns` and `buildCellDistributionMatrix`. Add literal order and maxima tests:

```javascript
it('defines the approved cell technologies in display order', () => {
  assert.deepEqual(
    buildCellDistributionColumns().map(({ key, label }) => [key, label]),
    [
      ['gsm900', 'GSM900'],
      ['dcs1800', 'DCS1800'],
      ['l900', 'L900'],
      ['l1800', 'L1800'],
      ['l2100', 'L2100'],
      ['l2300', 'L2300'],
      ['lte_nb_iot', 'LTE NB-IoT'],
      ['nr2100', 'NR2100'],
      ['nr2300', 'NR2300'],
    ],
  );
});

it('normalizes cell totals and calculates maxima per technology', () => {
  const matrix = buildCellDistributionMatrix([
    { kabupaten: 'SIDOARJO', gsm900: 12, dcs1800: 4, nr2300: 0 },
    { kabupaten: 'PASURUAN', gsm900: 6, dcs1800: 10, nr2300: null },
  ]);

  assert.equal(matrix.rows[0].kabupaten, 'PASURUAN');
  assert.equal(matrix.maxima.gsm900, 12);
  assert.equal(matrix.maxima.dcs1800, 10);
  assert.equal(matrix.maxima.nr2300, 0);
  assert.equal(matrix.rows[0].nr2300, 0);
});
```

- [ ] **Step 2: Run focused utility tests and confirm RED**

Run:

```powershell
node --test src/__tests__/dataPotensiMatrixUtils.test.js
```

from `frontend/`.

Expected: import failure because both new exports are absent.

- [ ] **Step 3: Implement cell column metadata and shaping**

Return a fresh fixed column array. Normalize each technology value with `Math.max(0, Math.trunc(Number(value) || 0))`, normalize a blank Kabupaten to `Tidak ada`, sort rows alphabetically by Kabupaten, and calculate each maximum without reusing production output as a test expectation.

- [ ] **Step 4: Run utility tests and confirm GREEN**

Run the same focused Node test. Expected: all matrix utility tests pass.

- [ ] **Step 5: Write failing component contract assertions**

Update `dataPotensiContracts.test.js` to require:

- `Cell Distribution Heatmap` and every approved technology label;
- `data-carousel-scroll-region` on scrollable matrix regions;
- no readiness or transport `description=` text;
- a `CellDistributionHeatmap` export;
- the existing semantic tables and empty states.

Run:

```powershell
node --test src/__tests__/dataPotensiContracts.test.js
```

Expected: fail because the third heatmap and content-only refactor are absent.

- [ ] **Step 6: Refactor matrix panels into carousel-ready content and add Cell Distribution**

Remove `DashboardChartPanel` ownership from the existing two exports. Keep their tables, cell-level secondary values, legends, and empty states. Mark horizontal table containers with `data-carousel-scroll-region`.

Implement `CellDistributionHeatmap` using `buildCellDistributionMatrix`. For each cell calculate:

```javascript
const maximum = matrix.maxima[column.key] || 0;
const intensity = maximum > 0 ? (value / maximum) * 100 : 0;
```

Render the formatted integer value, provide exact `title` and `aria-label`, use the information chart color, show zeros, and keep a sticky table header with all nine columns.

- [ ] **Step 7: Run both focused frontend tests and confirm GREEN**

```powershell
node --test src/__tests__/dataPotensiMatrixUtils.test.js src/__tests__/dataPotensiContracts.test.js
```

- [ ] **Step 8: Commit the matrix content slice**

```powershell
git add -- frontend/src/__tests__/dataPotensiMatrixUtils.test.js frontend/src/__tests__/dataPotensiContracts.test.js frontend/src/features/data-potensi/dataPotensiMatrixUtils.js frontend/src/features/data-potensi/DataPotensiMatrixCharts.jsx
git diff --cached --check
git commit -m "feat: add cell distribution heatmap"
```

---

### Task 3: shadcn Carousel Primitive and Insight Composition

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/components/ui/carousel.jsx`
- Create: `frontend/src/features/data-potensi/dataPotensiCarouselUtils.js`
- Create: `frontend/src/features/data-potensi/DataPotensiInsightCarousel.jsx`
- Create: `frontend/src/__tests__/dataPotensiCarouselUtils.test.js`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`

**Interfaces:**
- Produces: shadcn `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, and API support.
- Produces: `shouldHandleCarouselDrag(event) -> boolean`; returns false when the origin or an ancestor has `data-carousel-scroll-region`.
- Produces: `DataPotensiInsightCarousel({ readinessData, transportData, cellDistributionData })`.

- [ ] **Step 1: Write failing drag-policy and composition tests**

Create a real-behavior utility test with minimal fake targets:

```javascript
it('keeps carousel drag outside matrix scroll regions', () => {
  assert.equal(shouldHandleCarouselDrag({ target: { closest: () => null } }), true);
});

it('yields carousel drag to matrix scroll regions', () => {
  assert.equal(
    shouldHandleCarouselDrag({
      target: { closest: (selector) => selector === '[data-carousel-scroll-region]' ? {} : null },
    }),
    false,
  );
});
```

Extend the Data Potensi contract to require the new component file, all three titles, shadcn Carousel imports, non-looping options, `watchDrag: shouldHandleCarouselDrag`, previous/next accessible labels, three direct-select dot buttons, `aria-current`, and a polite slide status.

- [ ] **Step 2: Run the focused tests and confirm RED**

```powershell
node --test src/__tests__/dataPotensiCarouselUtils.test.js src/__tests__/dataPotensiContracts.test.js
```

Expected: missing utility/component failures.

- [ ] **Step 3: Add the official shadcn Carousel primitive**

From `frontend/`, run:

```powershell
npx shadcn@latest add carousel --yes
```

Confirm it adds `embla-carousel-react`, updates only the lock/package files plus `src/components/ui/carousel.jsx`, uses the existing `@/lib/utils` alias, and does not overwrite shared Button behavior. If the CLI proposes unrelated updates, stop and add only the official Carousel source plus `npm install embla-carousel-react`.

- [ ] **Step 4: Implement the drag policy helper**

```javascript
export function shouldHandleCarouselDrag(event) {
  return !event?.target?.closest?.('[data-carousel-scroll-region]');
}
```

- [ ] **Step 5: Implement the controlled insight carousel**

Compose exactly three `CarouselItem` slides from the content components. Use `DashboardChartPanel` once, with the active slide's title and icon. Pass:

```javascript
opts={{
  align: 'start',
  loop: false,
  watchDrag: shouldHandleCarouselDrag,
  breakpoints: {
    '(prefers-reduced-motion: reduce)': { duration: 0 },
  },
}}
```

Track `selectedScrollSnap()` through `setApi`, clean up the `select` event listener, and derive arrow disabled state from `canScrollPrev()` and `canScrollNext()`. Use existing `Button` variants for compact arrow and dot controls. Add `aria-current="true"` to the active dot and a visually hidden or compact polite status `Slide {current + 1} dari 3`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

```powershell
node --test src/__tests__/dataPotensiCarouselUtils.test.js src/__tests__/dataPotensiContracts.test.js
```

- [ ] **Step 7: Commit the carousel slice**

```powershell
git add -- frontend/package.json frontend/package-lock.json frontend/src/components/ui/carousel.jsx frontend/src/features/data-potensi/dataPotensiCarouselUtils.js frontend/src/features/data-potensi/DataPotensiInsightCarousel.jsx frontend/src/__tests__/dataPotensiCarouselUtils.test.js frontend/src/__tests__/dataPotensiContracts.test.js
git diff --cached --check
git commit -m "feat: add data potensi insight carousel"
```

---

### Task 4: Page Layout, Integration, and Verification

**Files:**
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`
- Update generated graph artifacts through `graphify update .` but do not stage unrelated user-owned Graphify scratch files.

**Interfaces:**
- Consumes: `dashboardData.cell_distribution_by_kabupaten`.
- Consumes: `DataPotensiInsightCarousel`.
- Page layout: carousel left, `TpDistributionChart` right on XL; stacked on smaller screens.

- [ ] **Step 1: Write a failing page-layout contract**

Replace the former two-matrix expectation with assertions that:

- `DataPotensiInsightCarousel` receives all three arrays;
- `TpDistributionChart` occurs inside the same `xl:grid-cols-2` section after the carousel;
- `TpDistributionChart` is rendered exactly once;
- the carousel/Tower Provider row appears before `StackedBarSection`;
- no old standalone TP section or `DataPotensiMatrixCharts` default import remains;
- the loading branch renders exactly two aligned skeletons for the row.

- [ ] **Step 2: Run the focused page contract and confirm RED**

```powershell
node --test src/__tests__/dataPotensiContracts.test.js
```

Expected: fail against the current two-matrix row and standalone TP section.

- [ ] **Step 3: Implement the two-column page layout**

Import `DataPotensiInsightCarousel`. Replace Section 3 with:

```jsx
<section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
  <DataPotensiInsightCarousel
    readinessData={dashboardData.readiness_by_kabupaten || []}
    transportData={dashboardData.transport_configuration_matrix || []}
    cellDistributionData={dashboardData.cell_distribution_by_kabupaten || []}
  />
  <TpDistributionChart data={dashboardData.tp_distribution || []} />
</section>
```

Remove the old standalone TP section, renumber section comments, and keep Breakdown by Kabupaten after the new row.

- [ ] **Step 4: Run the focused page contract and confirm GREEN**

Run the same focused test. Expected: all Data Potensi dashboard contracts pass.

- [ ] **Step 5: Run full automated verification**

Run backend and frontend checks, parallelizing independent commands:

```powershell
python -m pytest backend/tests -q
```

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run audit:production
npm run build
```

Expected: zero failures. Existing reviewed dependency and chunk-size notices may remain informational; no new unreviewed audit finding is allowed.

- [ ] **Step 6: Restart the local backend and perform authenticated browser QA**

The current frontend can hot reload, but restart the backend process on port `8002` so the new API query is loaded. Keep the established process-only local credentials and exact origin `http://127.0.0.1:5176`; do not write secrets to `.env`.

With Playwright CLI:

- log in as the local operator;
- open `/data-potensi`;
- verify Readiness is the default slide with no description;
- use next/previous and dot controls across all three slides;
- verify Cell Distribution has nine ordered technology columns and Kabupaten values;
- drag outside a table to change slides;
- horizontally scroll inside a marked matrix table without changing slides;
- verify Tower Provider is aligned to the right on XL and appears only once;
- apply an existing filter and confirm the carousel plus Tower Provider update;
- verify stacked mobile layout at a narrow viewport;
- capture a screenshot under `output/playwright/` without staging it.

- [ ] **Step 7: Refresh Graphify and verify repository state**

```powershell
graphify update .
git diff --check origin/main...HEAD
git status --short
```

Verify the current Graphify artifact location contains non-empty `graph.json` and `GRAPH_REPORT.md`. Preserve unrelated untracked files.

- [ ] **Step 8: Commit the page integration slice**

```powershell
git add -- frontend/src/pages/DataPotensiPage.jsx frontend/src/__tests__/dataPotensiContracts.test.js
git diff --cached --check
git commit -m "feat: integrate data potensi insight carousel"
```

- [ ] **Step 9: Review acceptance criteria against the approved spec**

Confirm each item in `docs/superpowers/specs/2026-08-04-data-potensi-insight-carousel-cell-heatmap-design.md` against the final code, API payload, tests, and browser evidence. If any item is not evidenced, return to the relevant TDD task before declaring completion.
