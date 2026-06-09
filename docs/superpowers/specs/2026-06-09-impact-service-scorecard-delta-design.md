# Impact Service Scorecard Delta Design

## Objective

Replace the static subtitle on every Impact Service scorecard with the absolute
delta and relative percentage against the immediately preceding comparison
period.

The affected scorecards are:

- Alarm Impact Service
- Impacted Site
- OPEN Alarm
- CLEAR Alarm
- SOW TSEL

## Comparison Period

The active scorecard value remains an aggregate over the selected global date
range.

The comparison period:

- Has the same number of calendar days as the selected range.
- Ends one day before the selected `start_date`.
- Uses the same NOP filter as the active period.

Examples:

- `2026-06-09` through `2026-06-09` compares with `2026-06-08`.
- `2026-06-08` through `2026-06-09` compares with `2026-06-06` through
  `2026-06-07`.

Other Impact Service charts, distributions, tables, and modal queries continue
to use the active global date range without this comparison-period behavior.

## Backend Contract

`GET /api/v1/impact-service/summary` continues to accept:

- `start_date`
- `end_date`
- optional `nop`

`ImpactServiceSummary` retains the five current values and adds one previous
value for each metric:

- `previous_total_alarms`
- `previous_impacted_sites`
- `previous_open_alarms`
- `previous_clear_alarms`
- `previous_sow_tsel`

The router calculates the inclusive active range length, derives the previous
range, and runs the same summary aggregation for both periods. The existing NOP
normalization and filter are applied identically to both queries.

Returning previous values instead of precomputed deltas keeps the API explicit
and allows the frontend to apply one consistent formatting rule.

## Delta Calculation

For each metric:

```text
delta = current_value - previous_value
rate = (delta / previous_value) * 100
```

Rules:

- Positive delta uses a leading `+`.
- Negative delta uses a leading `-`.
- Zero delta has no sign.
- If the previous value is zero, the rate is unavailable and displays `-`.
- The absolute delta remains visible when the rate is unavailable.
- Relative percentages use one decimal place and Indonesian decimal
  formatting.

## Frontend Presentation

The main scorecard value remains unchanged.

For a one-day range, the subtitle format is:

```text
+12 (+2,0%) vs hari sebelumnya
```

For a multi-day range, the subtitle format is:

```text
+12 (+2,0%) vs periode sebelumnya
```

When the previous value is zero:

```text
+12 (-) vs hari sebelumnya
```

Color represents direction only:

- Positive: green.
- Negative: red.
- Zero or unavailable percentage: neutral.

The direction color does not imply whether an operational change is good or
bad. This avoids treating an increase in OPEN Alarm as a positive outcome while
still making the numerical direction easy to scan.

## Error And Loading Behavior

- Existing summary loading skeletons remain unchanged.
- A failed summary request continues to use the page-level error handling.
- Missing values are normalized to zero by the backend response model.
- Invalid reversed date ranges remain governed by the existing endpoint/page
  validation.

## Tests

Backend contract coverage will verify:

- The summary model exposes all five previous-period fields.
- The comparison range has the same inclusive duration and immediately
  precedes `start_date`.
- The same NOP filter is applied to current and previous queries.
- The endpoint maps current and previous aggregates correctly.

Frontend contract coverage will verify:

- Static scorecard subtitles are removed.
- All five scorecards use the shared delta formatter.
- One-day and multi-day comparison labels are present.
- Zero previous values produce an unavailable percentage.
- Positive, negative, and neutral direction classes exist.

Runtime QA will verify:

- A single-day filter displays `vs hari sebelumnya`.
- A multi-day filter displays `vs periode sebelumnya`.
- NOP changes update both current and comparison values.
- Desktop and mobile layouts remain readable.
- Browser console has no relevant errors or warnings.

## Out Of Scope

- Changing the scorecard primary values.
- Adding delta comparison to charts, tables, or distributions.
- Changing Impact Service default date selection.
- Interpreting an increase or decrease as operationally good or bad.
