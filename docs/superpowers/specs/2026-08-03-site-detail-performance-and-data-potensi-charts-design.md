# Site Detail Performance and Data Potensi Charts Design

**Date:** 2026-08-03

**Status:** Approved for implementation planning

## Context

The shared site-detail modal is used by Data Potensi, Site Map, and the main
dashboard. Its availability scorecards and mini charts can show `N/A` even
when Neon contains data. The confirmed failure path is Data Potensi calling
the detail endpoint without a month and year while the backend defaults to
the current calendar month. On 2026-08-03, the latest availability period in
Neon was June 2026, so the calendar-month fallback selected an empty period.

The modal also does not explicitly group several populated columns now present
in `data_site_master`. Some remain in the generic fallback section, while
`NR2100` and `NR2300` do not match the aliases currently used by the technology
group.

The user also approved replacing the Daily Availability chart in the modal
with site-level Revenue and Payload scorecards, and adding two new charts to
Data Potensi using the newly available master-data fields.

## Goals

- Use the latest available availability period when a caller supplies no
  period.
- Keep explicit Site Map periods authoritative.
- Show a six-month site availability trend ending at the resolved availability
  period.
- Replace the modal's Daily Availability chart with site Revenue and Payload
  scorecards.
- Show a signed relative MoM percentage and the actual source period beneath
  each Revenue and Payload value.
- Add the approved `data_site_master` columns to intentional modal sections.
- Add an Operational Readiness Heatmap and a Transport Configuration Matrix
  to Data Potensi.
- Make both new Data Potensi charts honor every existing global and advanced
  filter.
- Preserve partial modal content when optional trend or performance data fails.

## Non-goals

- Do not delete `/availability/site/{site_id}`. The Mapbox popup still uses its
  daily rows.
- Do not add or modify Neon tables or source data.
- Do not add chart drill-down navigation or chart-driven filtering.
- Do not redesign the rest of Data Potensi or the shared dashboard visual
  system.
- Do not add Revenue or Payload to the Data Potensi table.

## Approved period behavior

### Availability

- If both `bulan` and `tahun` are supplied, use them exactly.
- If either value is absent, resolve both from the newest period available in
  `site_month_metrics`.
- Return the resolved period as lowercase `bulan` and `tahun` fields in the
  detail payload.
- Do not silently fall back to a different site-specific month when an explicit
  Site Map period has no data.

### Revenue and Payload

- Source both metrics from `traktor_data` for the selected site.
- Use the newest `trx_month` available for that site.
- Compare it only with the immediately preceding calendar month.
- If the preceding month is absent or its value is zero, return a null MoM
  value and render an en dash.
- Availability and performance may use different newest periods. Each visible
  surface must label its own period rather than implying that the months match.

## Backend design

### Availability detail period resolution

The existing `GET /sites/{site_id}/detail` route remains the source for master
data and current-period availability. Period resolution is moved away from the
server clock:

1. Validate an explicit complete period when supplied.
2. Otherwise query the existing latest-period contract backed by
   `site_month_metrics`.
3. Execute `POPUP_DETAIL_QUERY` with the resolved period.
4. Add `bulan` and `tahun` to the returned dictionary.

The resolver must have a focused unit-testable boundary so the route and any
future caller cannot reintroduce wall-clock defaults.

### Site performance endpoint

Add `GET /reporting/site/{site_id}/performance` with this response contract:

```json
{
  "site_id": "PSN003",
  "trx_month": "2026-07",
  "previous_trx_month": "2026-06",
  "total_revenue": 165241234,
  "previous_revenue": 141829528,
  "revenue_mom_pct": 16.51,
  "total_payload": 42855652,
  "previous_payload": 41688523,
  "payload_mom_pct": 2.8
}
```

The SQL selects the newest row for the site and left-joins the exact preceding
calendar month. It does not compare July with May when June is missing. Revenue
is stored and returned in Indonesian Rupiah; Payload is stored and returned in
MB, matching the existing reporting formatters.

If the site has no `traktor_data` rows, return a successful payload with null
period and metric fields. A missing performance row is not a missing master
site and must not make the entire modal fail.

### Data Potensi dashboard extensions

Extend `DataPotensiResponse` with:

```text
readiness_by_kabupaten: list[ReadinessByKabupatenItem]
transport_configuration_matrix: list[TransportConfigurationItem]
```

`ReadinessByKabupatenItem` contains:

```text
kabupaten
total_sites
enva_ready
enva_ready_pct
dual_eas_ready
dual_eas_ready_pct
bblti_software_ready
bblti_software_ready_pct
```

Readiness rules are exact and case-insensitive after trimming:

- ENVA ready: `ENVA STATUS = Completed`.
- Dual EAS ready: `dual_eas = Completed`. `NY Completed` is not ready.
- BBLTI Software ready: `bblti_software` starts with `YES`.

`TransportConfigurationItem` contains:

```text
transport_type
modem_transport
jumper_modem
site_count
percentage
```

Blank values, common missing labels, and values beginning with `#N/A` or
`#REF!` normalize to `Tidak ada`. Both queries reuse the existing NOP, status,
cluster, kabupaten, site class, site type, transport type, battery type, and TP
filter fragments.

The new arrays are returned by the existing `/data-potensi/dashboard` request;
the frontend must not issue separate chart requests. Version the dashboard
cache resource from `dashboard` to `dashboard-v2` so older cached payloads do
not produce empty new charts after deployment.

## Frontend data flow

Create one site-detail bundle boundary used by Data Potensi, Site Map, and the
main Dashboard page:

1. Request site detail with an explicit period when the caller has one.
2. Read the resolved `bulan` and `tahun` from the detail response.
3. Request the six-/twelve-month availability trend and site performance.
4. Treat detail as required; treat trend and performance as optional results.
5. Open the modal with empty optional data plus an error state when either
   optional request fails.

The modal prop contract changes from `dailyData` to `performanceData`. Remove
modal-only daily state and requests from all shared modal consumers. Keep the
independent Mapbox popup daily request unchanged.

## Modal presentation

### Top metrics row

- Left half: `Avg Avail 6 Month` chart with its explicit availability ending
  period.
- Right half: two equal scorecards, `Revenue` and `Payload`.
- Revenue uses the existing `formatRevenue` formatter.
- Payload uses the existing `formatPayload` formatter.
- Each card renders a signed relative sub-label such as
  `+16,5% MoM · Jul 2026`.
- Positive MoM uses the success tone, negative MoM uses the danger tone, zero
  uses the secondary tone, and unavailable MoM uses the muted tone.
- A missing performance payload renders `N/A` with its own empty-state copy;
  it does not remove the availability chart or monthly scorecards.
- Desktop shows the availability chart and the two scorecards in a balanced
  two-column row. Mobile stacks the chart, Revenue, and Payload vertically.

### Monthly scorecard

Keep Availability, Total Outage, Total Cell, and RCA Dominan. Values are tied
to the resolved availability period, not to the independently resolved
performance month.

### Master-data sections

Use these approved groupings:

- **Lokasi:** existing fields.
- **Info Site:** existing fields except Band NE.
- **Teknologi:** Band NE, DCS1800, GSM900, L900, L1800, L2100, L2300,
  NR2100, NR2300, LTE NB-IoT, NE Type, and Software Version.
- **Power:** existing power fields plus Tanggal Install Battery, Belting
  Battery, and Nama IDPEL.
- **Genset:** existing fields.
- **Transport:** existing fields plus Modem Transport and Jumper Modem.
- **Monitoring:** WDM, NMS Rectifier, EMU, ENVA, Dual EAS, BBLTI Software,
  Relokasi Battery, and Remark.

Technology aliases must accept both the current UI aliases and the actual Neon
column names `NR2100` and `NR2300`. `Data Lainnya` remains a future-proof
fallback, but every explicitly grouped key is excluded from it to prevent
duplicates. The modal's empty-value helper treats any trimmed value beginning
with `#N/A` or `#REF!` as empty.

## Data Potensi chart presentation

Place the two new panels after the three existing distribution charts and
before `Breakdown by Kabupaten`. They render side by side on wide screens and
stack on smaller screens.

### Operational Readiness Heatmap

- Rows are Kabupaten values in descending total-site order.
- Columns are ENVA, Dual EAS, and BBLTI Software.
- Every cell displays the readiness percentage.
- Tooltip and accessible text expose `ready / total sites` and the percentage.
- A compact legend explains the low-to-high readiness color scale.
- Empty filtered results use the existing dashboard chart empty state.

### Transport Configuration Matrix

- Rows are unique `Transport Type · Modem Transport` combinations, ordered by
  descending site count.
- Columns are Jumper Modem categories.
- Every populated cell displays the site count; color intensity represents its
  share of the filtered site population.
- Tooltip and accessible text expose Transport Type, Modem Transport, Jumper
  Modem, site count, and percentage.
- Large category sets remain horizontally scrollable rather than shrinking
  labels until they are unreadable.

The two matrices may share a focused, accessible heatmap-grid primitive, but
their data-shaping helpers remain separate because their semantics differ.

## Error and loading behavior

- A failed required site-detail request keeps the modal closed and surfaces the
  existing page-level failure path.
- A failed trend request shows the modal with the trend empty/error state.
- A failed performance request shows Revenue and Payload as unavailable while
  preserving master data and availability.
- New Data Potensi charts reuse the existing dashboard loading skeleton and
  stale-data error behavior because they are part of the same payload.
- No partial request may leave stale data from the previously selected site in
  the modal.

## Verification strategy

### Backend

- Prove omitted detail periods resolve to the latest metrics period rather than
  the current calendar month.
- Prove explicit periods remain unchanged.
- Prove site performance selects the newest site month and exact previous
  calendar month.
- Prove zero or missing previous values return null MoM.
- Prove readiness classification and percentage calculations.
- Prove transport normalization, counts, percentages, and all filter clauses.
- Prove the Data Potensi cache resource is versioned.

### Frontend

- Prove all shared modal callers use the bundle boundary.
- Prove Data Potensi works without a period and Site Map preserves its explicit
  period.
- Prove Daily Availability is absent from the modal while the Mapbox popup
  daily request remains.
- Prove Revenue and Payload use existing formatters and signed MoM labels.
- Prove the approved field groupings, `NR2100`/`NR2300` aliases, and error-value
  suppression.
- Prove both new matrices render the dashboard payload and preserve accessible
  labels and empty states.

### Browser QA

- Open `PSN003` from Data Potensi and verify availability values, the six-month
  chart, Revenue, Payload, MoM, periods, and the new master fields.
- Open `PSN003` from Site Map and verify the explicit availability period and
  the same performance scorecards.
- Verify the two new charts under default filters and after changing NOP and an
  advanced filter.
- Check desktop and mobile layouts, console health, and network responses.
- Confirm no chart or scorecard displays `N/A` when the corresponding API
  response contains the confirmed numeric data.

## Repository maintenance

After implementation and tests, run `graphify update .` and verify that both
`graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` are refreshed.
