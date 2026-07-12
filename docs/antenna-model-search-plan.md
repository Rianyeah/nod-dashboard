# Implementation Plan: Antenna Model Search + Spec Panel

## Objective

Replace the hardcoded "Antenna Series" dropdown in the RF Tilt Analysis tool with a searchable "Antenna Model" combobox sourced from the `antenna_specs` table (30 models with scraped specs). Add hover-to-preview compact specs on search results, and a new "Antenna Specification" panel above the Result Summary panel.

---

## Confirmed Decisions

| Decision | Choice |
|---|---|
| Model list scope | Only 30 models from `antenna_specs` table (models with scraped specs) |
| Panel visibility | Visible on model select (before analysis runs) |
| Auto-set frequency | Yes — auto-set `frequency_mhz` from model's `frequency_bands` |
| Panel layout | Standalone full-width before analysis; 1fr column above Result Summary after analysis |

---

## Files to Change (8 total)

### Backend (3 files)

#### 1. `backend/queries/sql_queries.py` — Add `ANTENNA_MODEL_LIST_QUERY`

```sql
SELECT antenna_model, vendor, series, frequency_bands, ports, connector_type,
       frequency_low_mhz, frequency_high_mhz
FROM antenna_specs
WHERE antenna_model ILIKE :q
ORDER BY antenna_model
LIMIT :limit
```

- Optional `q` filter (defaults to all 30 models when no search query)
- Returns compact fields for the dropdown list + hover tooltip

#### 2. `backend/models/rf_tilt.py` — Add 2 models

```python
class AntennaModelListItem(BaseModel):
    antenna_model: str
    vendor: Optional[str] = None
    series: Optional[str] = None
    frequency_bands: Optional[str] = None
    ports: Optional[int] = None
    connector_type: Optional[str] = None
    frequency_low_mhz: Optional[int] = None
    frequency_high_mhz: Optional[int] = None

class AntennaModelListResponse(BaseModel):
    items: List[AntennaModelListItem]
    total: int
```

#### 3. `backend/routers/rf_tilt.py` — Add `GET /rf-tilt/antenna-models`

- Query params: `q: str = Query("")`, `limit: int = Query(50, ge=1, le=200)`
- Executes `ANTENNA_MODEL_LIST_QUERY`, returns `AntennaModelListResponse`
- Pattern mirrors existing `/sites` endpoint

---

### Frontend (5 files)

#### 4. `frontend/src/services/api.js` — Add `searchAntennaModels(q)`

```js
export async function searchAntennaModels(q) {
  const { data } = await api.get('/rf-tilt/antenna-models', { params: { q: q || undefined } });
  return data;
}
```

#### 5. `frontend/src/features/rf-tilt/useRfTiltAnalysis.js` — Add model search + selection logic

**New state:**
- `antennaModelResults` — search results from API
- `antennaModelLoading` — loading flag

**New callbacks:**
- `searchAntennaModels(query)` — 300ms debounced search via API (mirrors `searchSites`)
- `selectAntennaModel(model)` — sets `params.antenna_type` to `model.antenna_model`, auto-sets `frequency_mhz` from `model.frequency_bands`, fetches full spec via `getAntennaSpec`

**Frequency auto-set logic:**
1. Parse `frequency_bands` string (e.g. `"806-960/1710-2170"`)
2. Split by `/` → take first range
3. Compute center frequency
4. Match to nearest of `[900, 1800, 2100, 2300]`
5. If no `frequency_bands`, keep current frequency

#### 6. `frontend/src/features/rf-tilt/RfTiltParamForm.jsx` — Replace Series Select with Model combobox

**Replace** lines 235-247 (Antenna Series Select) with a Popover combobox:
- Trigger button: shows `antennaSpec?.antenna_model` or "Search antenna model..."
- Popover content: search input + scrollable results list (same pattern as site search lines 90-152)
- Each result button: model name + vendor
- Wrapped with `Tooltip` / `TooltipTrigger` / `TooltipContent`
- Tooltip shows compact spec: `frequency_bands`, `ports`, `connector_type` (3 lines)

**Remove** lines 250-299 (old antenna specs panel) — replaced by new panel on right side.

#### 7. `frontend/src/features/rf-tilt/RfTiltAntennaSpecPanel.jsx` — NEW component

A `Card size="sm"` titled "Antenna Specification" with:

- **Header**: Title + Matched/Generic badge
- **Full spec display** from `antennaSpec` (AntennaSpecResponse):
  - Model, vendor, series
  - Frequency bands, frequency range
  - Gain by band (JSONB → display each band:gain pair)
  - VBW by band
  - HBW, electrical tilt range
  - Ports, connector type
  - Dimensions (H x W x D mm), weight
  - Source URL link
- **Loading state**: pulsing "Loading..."
- **Empty state**: "Select an antenna model to view specs"

#### 8. `frontend/src/pages/RfTiltAnalysisPage.jsx` — Add Antenna Spec panel to layout

Restructure right column:

```jsx
<div className="space-y-4 min-w-0">
  {/* Antenna Spec panel — standalone full width before analysis */}
  {antennaSpec && !result && (
    <AntennaSpecPanel antennaSpec={antennaSpec} loading={antennaSpecLoading} />
  )}

  {result && (
    <div ref={exportRef} className="space-y-4 bg-[var(--bg-base)] p-3 rounded-lg">
      <RfTiltChart result={result} />
      <div className="grid grid-cols-[3fr_1fr] gap-4">
        <div className="rf-map-skip-export min-w-0">
          <RfTiltMap ... />
        </div>
        <div className="space-y-4 min-w-0">
          {/* Antenna Spec panel — above Result Summary, same 1fr width */}
          {antennaSpec && (
            <AntennaSpecPanel antennaSpec={antennaSpec} loading={antennaSpecLoading} />
          )}
          <RfTiltResultPanel result={result} clutterCount={0} selectedSiteId={selectedSiteId} />
        </div>
      </div>
    </div>
  )}

  {!result && !loading && !antennaSpec && (
    /* empty state */
  )}
</div>
```

---

## Data Flow

```
User types in combobox
  → searchAntennaModels(q) → GET /rf-tilt/antenna-models?q=...
  → results with compact spec (freq_bands, ports, connector)

User hovers a result
  → Tooltip shows compact spec

User selects a model
  → selectAntennaModel(model)
  → sets params.antenna_type = model.antenna_model
  → auto-sets params.frequency_mhz from model.frequency_bands
  → fetches full spec via getAntennaSpec(model.antenna_model)
  → antennaSpec state → AntennaSpecPanel renders on right side

User runs analysis
  → POST /rf-tilt/analysis with antenna_type
  → result.antenna_reference (band-resolved) → RfTiltResultPanel shows summary
  → AntennaSpecPanel (full spec) stays above Result Summary
```

---

## Edge Cases Handled

- **No model selected** → AntennaSpecPanel not shown, empty state visible
- **Model selected but no spec match** → panel shows "No spec available" with model name
- **Site selection still works** → `selectSite` fetches spec, combobox shows matched model
- **Model without `frequency_bands`** → keep current frequency, don't auto-set
- **`antenna_series`** still sent to backend (derived from spec or `inferAntennaSeries`) as fallback

---

## Verification

| Check | Command |
|---|---|
| Backend tests | `python -m pytest tests/` |
| Backend compile | `python -c "from routers.rf_tilt import router"` |
| Frontend build | `npm run build` |
| Frontend lint | `npm run lint` |
| Manual: model search | Type in combobox, verify results appear |
| Manual: hover tooltip | Hover over result, verify compact spec shows |
| Manual: model select | Click model, verify frequency auto-sets + spec panel appears |
| Manual: run analysis | Run analysis, verify spec panel stays above Result Summary |
