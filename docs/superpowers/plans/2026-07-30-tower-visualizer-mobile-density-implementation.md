# Tower Visualizer Mobile Selection and Header Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Site ID submission reliably open the existing auto-fill confirmation flow on mobile and reduce wasted header space wherever Tower Visualizer sections have no subtitle.

**Architecture:** Keep debounced suggestions, but route touch selection, desktop Enter, mobile soft-keyboard submission, and form submit through one current-query resolver that can perform an immediate search when debounce has not settled. Wrap Tower Visualizer card headers in one density-aware component that reuses the shared dashboard panel header while leaving tower state, geometry, preview, and exports unchanged.

**Tech Stack:** React 19, Lucide React, shadcn/ui Card and Dialog, Node test runner, Playwright.

---

## Dependency and protected behavior

Run after the graphite visual-system plan so
`DashboardPanelHeader` is available. This plan does not require backend query
changes.

Protected files and behavior:

- `frontend/src/features/tower-plan/towerPlanGeometry.js`;
- `frontend/src/features/tower-plan/towerPlanSvg.js`;
- `frontend/src/features/tower-plan/towerPlanDocument.js`;
- `frontend/src/features/tower-plan/towerPlanState.js`;
- `frontend/src/features/tower-plan/towerPlanStorage.js`;
- Tower preview geometry and export bytes;
- the existing review dialog and `applyAutofillDraft` semantics.

## File map

- Modify `frontend/src/features/tower-plan/towerPlanSiteSelection.js`: normalize,
  validate, and resolve submission against current or immediately fetched
  results.
- Modify `frontend/src/features/tower-plan/TowerPlanSitePicker.jsx`: form
  submission, mobile keyboard hint, IME guard, stale-request cancellation, and
  shared commit path.
- Create `frontend/src/features/tower-plan/TowerPlanSectionHeader.jsx`:
  density-aware `CardHeader`.
- Modify `frontend/src/pages/TowerPlanGeneratorPage.jsx`: replace local section
  headers and compact the title-only page header.
- Modify `frontend/src/__tests__/towerPlanContracts.test.js`.
- Modify `e2e-playwright.spec.js`.

## Task 1: Define current-query submission behavior with pure tests

**Files:**

- Modify: `frontend/src/features/tower-plan/towerPlanSiteSelection.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Write failing tests for settled, stale, pending, and empty results**

Import the new resolver:

```js
import {
  canSelectCurrentSiteResult,
  normalizeSiteQuery,
  resolveSiteSubmission,
  selectSiteFromResults,
} from '../features/tower-plan/towerPlanSiteSelection.js';
```

Add:

```js
it('normalizes Site ID before comparing or submitting', () => {
  assert.equal(normalizeSiteQuery('  psn003  '), 'PSN003');
  assert.equal(normalizeSiteQuery(null), '');
});

it('submits a current exact result without issuing another search', async () => {
  let searches = 0;
  const selected = await resolveSiteSubmission({
    query: 'psn003',
    items: [{ site_id: 'PSN003A' }, { site_id: 'PSN003' }],
    resultsQuery: 'PSN003',
    loading: false,
    searchSites: async () => {
      searches += 1;
      return { items: [] };
    },
  });

  assert.equal(searches, 0);
  assert.deepEqual(selected, { site_id: 'PSN003' });
});

it('performs an immediate current-query search when debounce is pending or stale', async () => {
  const submittedQueries = [];
  const selected = await resolveSiteSubmission({
    query: 'psn003',
    items: [{ site_id: 'OLD001' }],
    resultsQuery: 'OLD001',
    loading: true,
    searchSites: async (query) => {
      submittedQueries.push(query);
      return { items: [{ site_id: 'PSN003' }] };
    },
  });

  assert.deepEqual(submittedQueries, ['PSN003']);
  assert.deepEqual(selected, { site_id: 'PSN003' });
});

it('returns null when a current-query search has no result', async () => {
  const selected = await resolveSiteSubmission({
    query: 'missing',
    items: [],
    resultsQuery: '',
    loading: false,
    searchSites: async () => ({ items: [] }),
  });

  assert.equal(selected, null);
});

it('does not search a query shorter than two characters', async () => {
  let searched = false;
  const selected = await resolveSiteSubmission({
    query: 'p',
    items: [],
    resultsQuery: '',
    loading: false,
    searchSites: async () => {
      searched = true;
      return { items: [] };
    },
  });

  assert.equal(selected, null);
  assert.equal(searched, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run from `frontend`:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because `normalizeSiteQuery` and `resolveSiteSubmission` do not
exist.

- [ ] **Step 3: Implement the pure resolver**

Replace the helper file with:

```js
export function normalizeSiteQuery(value) {
  return String(value || '').trim().toUpperCase();
}

export function selectSiteFromResults(items, query) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalizedQuery = normalizeSiteQuery(query);
  return items.find((item) => (
    normalizeSiteQuery(item?.site_id) === normalizedQuery
  )) || items[0];
}

export function canSelectCurrentSiteResult(query, resultsQuery, loading) {
  const normalizedQuery = normalizeSiteQuery(query);
  const normalizedResultsQuery = normalizeSiteQuery(resultsQuery);
  return !loading
    && normalizedQuery.length >= 2
    && normalizedQuery === normalizedResultsQuery;
}

export async function resolveSiteSubmission({
  query,
  items,
  resultsQuery,
  loading,
  searchSites,
}) {
  const normalizedQuery = normalizeSiteQuery(query);
  if (normalizedQuery.length < 2) return null;

  if (canSelectCurrentSiteResult(
    normalizedQuery,
    resultsQuery,
    loading,
  )) {
    return selectSiteFromResults(items, normalizedQuery);
  }

  const response = await searchSites(normalizedQuery);
  return selectSiteFromResults(response?.items || [], normalizedQuery);
}
```

- [ ] **Step 4: Run the focused contract**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the selection contract**

Run from the repository root:

```powershell
git add frontend/src/features/tower-plan/towerPlanSiteSelection.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "test: define mobile Site ID submission behavior"
```

## Task 2: Route mobile and desktop submission through one picker flow

**Files:**

- Modify: `frontend/src/features/tower-plan/TowerPlanSitePicker.jsx`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Add a failing source contract for mobile form submission**

Replace the old Enter-source assertions with:

```js
it('uses one form submission path for desktop and mobile Site ID confirmation', () => {
  const pickerSource = readFileSync(
    new URL('../features/tower-plan/TowerPlanSitePicker.jsx', import.meta.url),
    'utf8',
  );

  assert.match(pickerSource, /<form[\s\S]*onSubmit=\{submitCurrentQuery\}/);
  assert.match(pickerSource, /enterKeyHint="search"/);
  assert.match(pickerSource, /resolveSiteSubmission/);
  assert.match(pickerSource, /isComposingRef/);
  assert.match(pickerSource, /searchControllerRef/);
  assert.match(pickerSource, /committedQueryRef/);
  assert.doesNotMatch(pickerSource, /event\.key === 'Enter' && open && hasCurrentResults/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL on the missing form and unified submission path.

- [ ] **Step 3: Replace the picker with the unified implementation**

Use this complete component:

```jsx
import { useEffect, useRef, useState } from 'react';
import { Database, LoaderCircle, Search, TowerControl } from 'lucide-react';

import { Input } from '../../components/ui/input';
import { searchTowerPlanSites } from '../../services/api';
import {
  canSelectCurrentSiteResult,
  normalizeSiteQuery,
  resolveSiteSubmission,
} from './towerPlanSiteSelection';

export default function TowerPlanSitePicker({ disabled, onSelect }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [resultsQuery, setResultsQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const firstResultRef = useRef(null);
  const requestIdRef = useRef(0);
  const searchControllerRef = useRef(null);
  const committedQueryRef = useRef('');
  const isComposingRef = useRef(false);

  useEffect(() => {
    const normalized = normalizeSiteQuery(query);
    if (committedQueryRef.current === normalized) {
      committedQueryRef.current = '';
      return undefined;
    }
    if (normalized.length < 2) return undefined;

    const timer = setTimeout(async () => {
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError('');

      try {
        const response = await searchTowerPlanSites(normalized, controller.signal);
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setItems(response.items || []);
        setResultsQuery(normalized);
        setOpen(true);
      } catch (requestError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (requestError.name !== 'CanceledError' && requestError.name !== 'AbortError') {
          setItems([]);
          setResultsQuery(normalized);
          setError('Pencarian Site ID gagal. Mode manual tetap dapat digunakan.');
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => {
    searchControllerRef.current?.abort();
  }, []);

  const chooseSite = (siteId) => {
    const normalized = normalizeSiteQuery(siteId);
    committedQueryRef.current = normalized;
    setQuery(normalized);
    setOpen(false);
    setError('');
    onSelect(normalized);
  };

  const submitCurrentQuery = async (event) => {
    event.preventDefault();
    if (disabled || isComposingRef.current) return;

    const normalized = normalizeSiteQuery(query);
    if (normalized.length < 2) return;

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    const wasLoading = loading;
    setLoading(true);
    setError('');

    try {
      const selected = await resolveSiteSubmission({
        query: normalized,
        items,
        resultsQuery,
        loading: wasLoading,
        searchSites: (currentQuery) => (
          searchTowerPlanSites(currentQuery, controller.signal)
        ),
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;

      if (!selected) {
        setItems([]);
        setResultsQuery(normalized);
        setError('Site ID tidak ditemukan.');
        setOpen(true);
        return;
      }
      chooseSite(selected.site_id);
    } catch (requestError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      if (requestError.name !== 'CanceledError' && requestError.name !== 'AbortError') {
        setItems([]);
        setResultsQuery(normalized);
        setError('Pencarian Site ID gagal. Silakan coba kembali.');
        setOpen(true);
      }
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const hasCurrentResults = canSelectCurrentSiteResult(query, resultsQuery, loading);
  const visibleItems = hasCurrentResults ? items : [];

  return (
    <form className="relative" onSubmit={submitCurrentQuery}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-autocomplete="list"
          aria-busy={loading}
          aria-controls="tower-plan-site-results"
          aria-expanded={open && query.trim().length >= 2}
          aria-label="Cari Site ID untuk auto-fill"
          autoComplete="off"
          className="pl-9 pr-9"
          disabled={disabled}
          enterKeyHint="search"
          onChange={(event) => {
            const nextQuery = event.target.value;
            searchControllerRef.current?.abort();
            requestIdRef.current += 1;
            committedQueryRef.current = '';
            setQuery(nextQuery);
            setItems([]);
            setResultsQuery('');
            setError('');
            setLoading(nextQuery.trim().length >= 2);
            setOpen(true);
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && open) {
              event.preventDefault();
              firstResultRef.current?.focus();
            }
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Ketik minimal 2 karakter Site ID..."
          role="combobox"
          value={query}
        />
        {loading && (
          <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          id="tower-plan-site-results"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          role="listbox"
          aria-busy={loading}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Database className="size-3.5" />
            Sumber: ransys_gabungan
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {loading && (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin text-primary" />
                Mencari Site ID...
              </p>
            )}
            {error && <p className="px-3 py-4 text-xs text-destructive">{error}</p>}
            {!loading && !error && visibleItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Site ID tidak ditemukan.
              </p>
            )}
            {visibleItems.map((item, index) => (
              <button
                key={item.site_id}
                ref={index === 0 ? firstResultRef : null}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => chooseSite(item.site_id)}
                role="option"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TowerControl className="size-4 shrink-0 text-primary" />
                  <span className="truncate font-semibold text-foreground">{item.site_id}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {item.cell_count} cell · ±{item.estimated_antenna_count} antena
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run Tower contracts and lint**

Run from `frontend`:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
npx eslint src/features/tower-plan/TowerPlanSitePicker.jsx src/features/tower-plan/towerPlanSiteSelection.js
```

Expected: PASS.

- [ ] **Step 5: Commit the mobile submission fix**

Run from the repository root:

```powershell
git add frontend/src/features/tower-plan/TowerPlanSitePicker.jsx frontend/src/features/tower-plan/towerPlanSiteSelection.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: support mobile Site ID submission"
```

## Task 3: Introduce density-aware Tower Visualizer section headers

**Files:**

- Create: `frontend/src/features/tower-plan/TowerPlanSectionHeader.jsx`
- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Add failing header-density contracts**

Add:

```js
it('uses compact Tower Visualizer headers when no subtitle is present', () => {
  const page = readFileSync(
    new URL('../pages/TowerPlanGeneratorPage.jsx', import.meta.url),
    'utf8',
  );
  const header = readFileSync(
    new URL('../features/tower-plan/TowerPlanSectionHeader.jsx', import.meta.url),
    'utf8',
  );

  assert.match(page, /TowerPlanSectionHeader/);
  assert.doesNotMatch(page, /function SectionTitle/);
  assert.match(header, /data-density=\{description \? 'normal' : 'compact'\}/);
  assert.match(header, /description \? 'py-4' : 'py-3'/);
  assert.match(page, /title="Project Data"/);
  assert.match(page, /title="Note & Appearance"/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because `TowerPlanSectionHeader` does not exist.

- [ ] **Step 3: Create the reusable section header**

Create:

```jsx
import { DashboardPanelHeader } from '../../components/ui/DashboardPrimitives';
import { CardHeader } from '../../components/ui/card';

export function TowerPlanSectionHeader({
  title,
  description,
  icon,
  action,
}) {
  return (
    <CardHeader
      data-density={description ? 'normal' : 'compact'}
      className={[
        'border-b border-border px-5',
        description ? 'py-4' : 'py-3',
      ].join(' ')}
    >
      <DashboardPanelHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
        className="pb-0"
      />
    </CardHeader>
  );
}
```

- [ ] **Step 4: Replace every local section-title pair**

Delete the local `SectionTitle` function and remove `CardHeader` from the page
import. Import:

```js
import { TowerPlanSectionHeader } from '../features/tower-plan/TowerPlanSectionHeader';
```

Replace:

```jsx
<CardHeader className="border-b border-border">
  <SectionTitle
    icon={TowerControl}
    title="Project Data"
  />
</CardHeader>
```

with:

```jsx
<TowerPlanSectionHeader
  icon={TowerControl}
  title="Project Data"
/>
```

Apply the same replacement to Search Site ID, Note & Appearance, Antennas,
Prompt generator, and Export. Preserve each existing description and action.
Title-only sections become compact automatically.

Change the top title-only page header from `py-4` to `py-3` while preserving
the Tools badge and actions:

```jsx
<header
  data-density="compact"
  className="border-b border-border bg-[var(--bg-header)] px-4 py-3 sm:px-6"
>
```

- [ ] **Step 5: Run tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
npx eslint src/pages/TowerPlanGeneratorPage.jsx src/features/tower-plan/TowerPlanSectionHeader.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit header density**

Run from the repository root:

```powershell
git add frontend/src/features/tower-plan/TowerPlanSectionHeader.jsx frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: compact Tower Visualizer headers"
```

## Task 4: Verify mobile confirmation, autofill, and protected output

**Files:**

- Modify: `e2e-playwright.spec.js`

- [ ] **Step 1: Capture protected tower checksums**

Run from the repository root:

```powershell
$protected = @(
  'frontend/src/features/tower-plan/towerPlanGeometry.js',
  'frontend/src/features/tower-plan/towerPlanSvg.js',
  'frontend/src/features/tower-plan/towerPlanDocument.js',
  'frontend/src/features/tower-plan/towerPlanState.js',
  'frontend/src/features/tower-plan/towerPlanStorage.js'
)
$protected | ForEach-Object {
  "$_`t$((Get-FileHash $_ -Algorithm SHA256).Hash)"
} | Set-Content .git/tower-mobile-protected-before.txt
```

- [ ] **Step 2: Add the mobile browser test**

Add:

```js
test('Tower Visualizer mobile Enter opens review and autofills the selected Site ID', async ({ page }) => {
  await authenticate(page, 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${E2E_BASE_URL}/tower-plan-generator`);

  const siteInput = page.getByRole('combobox', { name: 'Cari Site ID untuk auto-fill' });
  await expect(siteInput).toBeVisible({ timeout: 20000 });
  await siteInput.fill('PSN003');
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 20000 });

  await siteInput.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Review Auto-fill/i)).toBeVisible({ timeout: 20000 });
  await expect(dialog).toContainText('PSN003');

  await dialog.getByRole('button', { name: 'Terapkan konfigurasi' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/antena fisik dimuat dari/i)).toBeVisible();

  const compactHeaders = page.locator('[data-density="compact"]');
  await expect(compactHeaders).not.toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBeTruthy();
});
```

This test exercises the same Enter event emitted by a mobile viewport. Manually
repeat once using an actual Android/iOS soft keyboard if available because
browser automation cannot emulate every IME.

- [ ] **Step 3: Prove protected files did not change**

Run:

```powershell
Get-Content .git/tower-mobile-protected-before.txt | ForEach-Object {
  $path, $before = $_ -split "`t", 2
  $after = (Get-FileHash $path -Algorithm SHA256).Hash
  if ($after -ne $before) { throw "Protected tower file changed: $path" }
}
```

Expected: no output and exit code 0.

- [ ] **Step 4: Run complete Tower tests and build**

Run from `frontend`:

```powershell
node --test src/__tests__/towerPlanContracts.test.js src/__tests__/towerPlanDocument.test.js
npx eslint src/pages/TowerPlanGeneratorPage.jsx src/features/tower-plan
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run backend Tower contracts**

Run from `backend`:

```powershell
python -m pytest tests/test_tower_plan.py -q
```

Expected: PASS; no backend changes were required.

- [ ] **Step 6: Run authenticated browser verification**

Run from the repository root with backend and frontend active:

```powershell
npx playwright test e2e-playwright.spec.js -g "Tower Visualizer mobile Enter"
```

Expected: PASS at 390×844.

- [ ] **Step 7: Commit browser coverage**

Run:

```powershell
git add e2e-playwright.spec.js
git commit -m "test: verify Tower Visualizer mobile autofill"
```

## Completion checkpoint

Run:

```powershell
git status --short
git log --oneline -4
```

Expected:

- no tracked uncommitted changes from this track;
- touch suggestion and Enter both open the same review dialog;
- pending debounce no longer makes Enter a no-op;
- no-result and request-error states remain recoverable;
- title-only headers are compact;
- protected tower state, geometry, and export files match their original
  checksums.
