# Dashboard Filter Top Bar and Impact Donut Design

## Scope

- Keep every global dashboard filter in a horizontal adaptive toolbar.
- Use one desktop row and allow wrapping on mobile to prevent horizontal overflow.
- Move Transport Quality and Ticketing global filters into their page headers.
- Replace the Transport Quality and Ticketing advanced filter Sheet with a compact Popover.
- Fix the Impact Service category donut clipping and move its value legend farther right.

## Filter Behavior

- Existing filter values, defaults, API parameters, and request separation remain unchanged.
- Advanced filters continue to use draft values.
- `Terapkan` applies the full draft atomically.
- `Batal`, outside click, and Escape discard unapplied changes.
- `Bersihkan` clears the Popover draft; the user still presses `Terapkan` to apply it.
- Applied advanced filters remain represented by removable chips.

## Responsive Layout

- Desktop filter controls and actions use a single non-wrapping horizontal row.
- Mobile and narrow tablet layouts wrap controls onto additional rows.
- Transport Quality keeps the last-update indicator in the header.
- Ticketing keeps Refresh and Export CSV beside the header filter controls.

## Impact Service Donut

- Increase the chart canvas so the donut has padding around its outer radius.
- Keep the center total label.
- Use a fixed desktop chart column and add left padding to the value legend column.
- Stack chart and legend on mobile.

## Verification

- Contract tests cover the horizontal toolbar classes, Popover component contract, header placement, and donut dimensions.
- Existing dashboard filter, Transport Quality, Ticketing, and Impact Service tests remain green.
- Browser QA covers desktop and mobile layout, Popover interaction, donut visibility, and horizontal overflow.
