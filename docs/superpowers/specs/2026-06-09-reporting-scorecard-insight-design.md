# Reporting Scorecard and Executive Insight Design

## Objective

Improve the Network Reporting summary so its scorecards expose the site composition and year-to-date business context requested by operations users, while keeping the existing page structure and global filtering behavior.

The change covers:

- Active EPM and non-EPM site counts.
- SIDOARJO as the default Reporting NOP.
- Relative month-over-month percentages.
- Revenue and payload year-to-date values.
- More readable Executive Insight supporting text.

## Confirmed Definitions

### EPM classification

`data_site_master` has no dedicated EPM column. A site is classified as EPM when its normalized site ID starts with `EPM`:

```sql
UPPER(TRIM(d."Siteid")) LIKE 'EPM%'
```

All other active sites are classified as non-EPM.

The counts use only rows where:

```sql
d."Status Site" = 'Active'
```

They also apply the selected NOP filter. The following invariant must hold:

```text
total_sites = epm_sites + non_epm_sites
```

Live database validation for `NOP SIDOARJO` found 1,070 active sites: 18 EPM and 1,052 non-EPM.

### Year to date

Revenue and payload YTD are cumulative values from January through the selected month in the selected year.

For example, the May 2026 scorecard uses:

```text
2026-01 through 2026-05
```

The calculation applies the same NOP filter as the monthly scorecard.

### Month-over-month percentage

Revenue, payload, and availability use relative percentage change:

```text
((current - previous) / previous) * 100
```

Availability does not use percentage-point notation. If the previous value is zero or unavailable, the displayed MoM value is `-`.

## Backend Design

### Response contract

Extend `ReportingScorecard` with:

```python
epm_sites: int = 0
non_epm_sites: int = 0
revenue_ytd: int = 0
payload_ytd: int = 0
```

The existing fields remain unchanged:

```python
total_sites: int
total_revenue: int
total_payload: int
avg_availability: Optional[float]
```

This keeps current consumers compatible while exposing the new values directly.

### Query changes

Replace the active site count query with one aggregate that returns:

- `total_sites`
- `epm_sites`
- `non_epm_sites`

Add a YTD aggregate over `traktor_data` using the selected `trx_month` as an inclusive upper bound and the selected year as the lower boundary.

The YTD query must:

- Join `data_site_master` for NOP filtering.
- Include only records in the selected year.
- Include months less than or equal to the selected month.
- Return zero for missing revenue or payload.

The scorecard endpoint remains:

```text
GET /reporting/scorecards?trx_month=YYYY-MM&nop=...
```

No additional frontend request is required.

### Error behavior

An invalid `trx_month` continues to return zero YTD values and no availability rather than causing the page to fail. Database errors continue through the existing FastAPI error handling.

## Frontend Design

### Default NOP

Use canonical `SIDOARJO` as the Reporting default after filter options load.

The implementation must resolve either `SIDOARJO` or `NOP SIDOARJO` from the available options and store the actual option value. This preserves compatibility with the existing backend normalization.

The user can still select `Semua NOP`.

### Scorecards

Use the approved two-line metadata layout.

#### Total Site

```text
EPM: n
Site (non EPM): n
```

Do not display a Total Site MoM value.

#### Total Revenue

```text
+n,n% MoM
YTD: Rp ...
```

#### Total Payload

```text
+n,n% MoM
YTD: ... TB
```

#### Availability

```text
+n,n% MoM
```

Do not retain the generic `rata-rata availability jaringan` subtitle.

The existing scorecard title, main value, icon, and accent color remain unchanged.

### Formatting

Add a relative percentage helper that:

- Returns `null` when either value is unavailable.
- Returns `null` when the previous value is zero.
- Includes `+` for positive values.
- Uses Indonesian decimal formatting.
- Displays one decimal place for revenue and payload.
- Displays two decimal places for availability.

### Executive Insight

Keep the existing three-card structure and business logic, but simplify the supporting copy.

Each insight card contains:

- A small uppercase category label.
- A concise title.
- One or two short supporting sentences.
- An optional status chip.

Numbers and key business phrases in the supporting text use a high-contrast foreground color. Secondary words use `text-[var(--text-secondary)]` or a stronger equivalent that remains readable in dark and light themes. Supporting text must not use the current low-contrast muted color.

Example:

```text
Rp 93,5 M, naik 10,5% dari April.
Target terlampaui 3,9%.
```

The generated insight values continue to follow the selected month and NOP.

## Data Flow

1. Reporting filter options load.
2. The frontend selects the canonical SIDOARJO option.
3. The latest available reporting month remains selected.
4. The scorecard request returns monthly metrics, site composition, and YTD totals.
5. The previous-month scorecard request supplies the comparison values.
6. The frontend calculates relative MoM percentages.
7. Scorecards and Executive Insight render from the same selected month and NOP state.

Changing NOP or period refreshes all existing Reporting scorecards, insight cards, chart, and tables.

## Testing

### Backend contracts

Add coverage for:

- New `ReportingScorecard` fields.
- Active EPM and non-EPM classification.
- The total-site invariant.
- YTD year boundary and inclusive selected month.
- NOP filtering on site composition and YTD aggregates.

### Frontend contracts

Add coverage for:

- Default SIDOARJO selection after filter loading.
- Total Site EPM/non-EPM metadata.
- Revenue and payload relative MoM plus YTD.
- Availability relative MoM only.
- Removal of old generic scorecard subtitles.
- Higher-contrast Executive Insight supporting text.

### Runtime validation

Verify at minimum:

- Reporting loads with SIDOARJO selected.
- Site counts render as 18 EPM and 1,052 non-EPM against the current database snapshot.
- YTD changes when the selected month changes.
- YTD and all Reporting data change when NOP changes.
- Executive Insight remains readable in dark and light themes.
- Desktop and mobile layouts do not clip metadata.

## Scope Boundaries

This change does not:

- Redesign the Reporting page structure.
- Change the Performance Trend chart or table definitions.
- Add a separate YTD endpoint.
- Persist the Reporting NOP selection across browser sessions.
- Reclassify EPM using site name or another master-data field.
