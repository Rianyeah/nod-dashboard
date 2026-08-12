# Ticketing Dashboard Quick Fixes Design

## Scope

Refine the Ticketing work already present on PR #28 without changing the approved dashboard layout or FOP scoring formula.

## Approved behavior

- Remove the help tooltip beside the `Average MTTR` scorecard value.
- `Kabupaten/Kota Distribution` remains a horizontal chart. The dropdown selects one source column (`takeover`, `visitation`, `backup_sukses`, or `is_escalate`) and the chart renders every value in that column as stacked segments for each Kabupaten/Kota. Empty values are shown as `Unknown` instead of being dropped.
- The location API uses long-form rows (`label`, `metric`, `value`, `tickets`) so new categorical values remain visible without adding fixed response fields.
- The chart shows at most 12 locations, ordered by the total tickets represented by the active metric. A legend identifies each stacked category.
- In `Performance Tim FOP`, performance score text is green only when the score is greater than 50.
- Takeover text is green when the total reaches `26 x selected month count`. Examples: one month 26, two months 52, three months 78.
- Month count comes from `period_meta.active_months` for month-range filters. For custom dates it is the inclusive number of calendar months touched by the selected start and end dates.
- Every FOP header is sortable. Selecting a header sorts ascending or descending; selecting it again reverses direction. The default remains performance score descending. Rank values remain the canonical backend ranking even when rows are rearranged.

## Verification

Backend contract tests cover long-form category aggregation. Frontend utility tests cover stacking, deterministic location ordering, month thresholds, and FOP sorting. A browser check confirms the stacked series, tooltip removal, threshold colors, and header interactions.
