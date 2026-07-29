# Tower Visualizer Note, Zoom, and Background Design

## Goal

Extend Tower Visualizer with three document-focused capabilities:

1. an optional workflow note card below Helicopter View,
2. a large interactive preview with zoom and pan, and
3. professional document background choices, including a custom colour.

Preview, SVG download, and PNG download must continue to use the same
deterministic SVG renderer so the user never approves one layout and downloads
another.

## Confirmed decisions

- Note data is stored as part of the tower plan.
- A note card is omitted from SVG and PNG output when its body is blank.
- The SVG remains a fixed landscape document at `1900 x 1200`.
- Note input is limited to 1,200 characters and at most 16 rendered lines.
- The preview opens in a large modal with zoom buttons, fit/reset actions,
  mouse-wheel zoom, and drag-to-pan.
- Background choices include curated presets and a free custom colour picker.
- Foreground colours are selected automatically for readable contrast.

## Plan state and migration

Increment `TOWER_PLAN_SCHEMA_VERSION` and add these fields to the plan:

```js
{
  documentNote: {
    title: "WORKFLOW NOTE",
    text: "",
    headerColor: "#17263b"
  },
  backgroundPreset: "white",
  backgroundColor: "#ffffff"
}
```

The supported presets are:

| ID | Label | Colour |
|---|---|---|
| `white` | White | `#ffffff` |
| `soft-gray` | Soft Gray | `#eef2f6` |
| `warm-ivory` | Warm Ivory | `#f7f3e8` |
| `blueprint-navy` | Blueprint Navy | `#102337` |
| `custom` | Custom | user-selected hex colour |

`createBlankTowerPlan()` supplies the defaults. `migrateTowerPlan()` normalizes
legacy plans and malformed values without dropping existing tower or antenna
data:

- a missing note becomes the default empty note;
- a blank note title becomes `WORKFLOW NOTE`;
- an invalid note-header colour falls back to `#17263b`;
- an invalid background colour falls back to the active preset colour, or
  white when the preset is also invalid;
- a known preset resolves to its canonical colour;
- `custom` retains a valid six-digit hex colour.

IndexedDB autosave remains the source of truth. The local-storage fallback key
is versioned forward while retaining the current version as a legacy read key.

## Dashboard controls

Add a focused **Note & Appearance** card below Project Data. It contains:

- a `Note header` text input;
- a `Header colour` native colour control with a synchronized hex input;
- a `Workflow note` textarea;
- a live `n / 1200` character counter;
- preset background swatches with text labels; and
- a `Custom` swatch that reveals a synchronized colour and hex input.

The note title is normalized on blur. If it is blank, it returns to
`WORKFLOW NOTE`. The header colour and custom background update only when a
complete `#RRGGBB` value is valid, so partially typed hex values cannot corrupt
the saved plan.

The textarea accepts manual line breaks. It has a hard 1,200-character limit.
If the deterministic SVG wrapper would exceed 16 lines, the dashboard shows an
inline message and download actions remain blocked until the note fits. Text is
never silently truncated in preview or export.

## SVG note card

The note card occupies the existing free space below Helicopter View in the
right sidebar:

- `x` and `width` match the Site Data, Legend, and Helicopter View cards;
- `y` equals the Helicopter View bottom plus a 24-unit gap;
- the header is 32 SVG units high;
- body text wraps deterministically while preserving explicit paragraph
  breaks;
- the body uses a readable technical-document font size and 14-unit line
  height;
- total height grows with the rendered line count, from a compact minimum to a
  maximum that remains inside the `1900 x 1200` canvas; and
- no card markup is emitted when the trimmed note body is empty.

The title uses the user-selected header colour. Its text colour is either deep
navy or white, selected from calculated relative luminance. The body retains a
light document surface with dark text so workflow instructions remain readable
on every canvas background.

The renderer exposes deterministic data attributes for the note card position,
size, line count, and wrapped text lines. Contract tests use these attributes
to prove containment and prevent regressions.

## Background palette and contrast

`renderTowerPlanSvg()` resolves a document palette from `backgroundColor`.
The root SVG background uses the selected colour. The palette switches the
following items between dark and light variants based on relative luminance:

- plan title and Site ID heading;
- tower-height dimension text and line;
- height guides; and
- supporting labels placed directly on the canvas.

Information cards and antenna callouts retain light surfaces and dark body text
for consistent legibility. Existing status colours, red/white 10-metre tower
paint bands, white-segment outlines, and antenna colours remain unchanged.

PNG conversion must not paint an additional white rectangle over the SVG.
Instead, the canvas uses the selected document background before drawing the
SVG. SVG and PNG therefore match the preview for both preset and custom
backgrounds.

The engineering prompt uses the selected background label or custom hex value
instead of the current hard-coded white-background instruction. The document
note remains a deterministic drawing annotation and is not added to the
external image-generation prompt.

## Interactive preview

The compact Engineering Preview remains in the right dashboard column. The
image and a visible maximize action open a dedicated preview dialog.

The dialog:

- uses the existing Radix/shadcn dialog primitives;
- occupies most of the viewport without leaving the dashboard route;
- starts in `Fit` mode whenever it opens;
- provides Zoom Out, Zoom In, Fit, Reset, and Close controls;
- supports a zoom range of 50% to 250%;
- supports mouse-wheel zoom centred on the pointer;
- supports pointer drag-to-pan when the rendered image exceeds the viewport;
- clamps panning so the document cannot be lost completely outside the view;
- reports the current zoom percentage; and
- supports `Escape` through the dialog primitive.

`Fit` recalculates the scale required to contain the full SVG in the current
viewport. `Reset` returns to 100% with a centred document. Opening or closing
the dialog does not mutate the plan or persist view-only zoom state.

The preview component is split into a compact trigger and a focused modal so
zoom mechanics do not enlarge the page component or affect SVG generation.

## Validation and error handling

- Empty note bodies are valid and render no note card.
- Note bodies over 1,200 characters cannot be entered.
- Note content that wraps beyond 16 lines produces one actionable validation
  error and blocks prompt/download actions through the existing validation
  flow.
- Invalid hex input keeps the last valid stored colour and displays an inline
  field message.
- All note content and titles pass through XML escaping before SVG insertion.
- Zoom state is clamped after wheel, button, resize, and pointer operations.
- Modal controls remain keyboard reachable and include accessible names.

## Compatibility

- Site ID search, Neon auto-fill, grouping, tower-type geometry, antenna
  validation, and CID logic remain unchanged.
- All three tower types keep the current right-sidebar order:
  Site Data, Legend, Helicopter View, then the optional note card.
- The active route remains `/tower-plan-generator`.
- Existing blank and saved plans migrate without losing user data.
- PNG and SVG filenames and download buttons remain unchanged.
- The landscape canvas and NOD Dashboard font family remain unchanged.

## Verification

### State and storage contracts

- Blank plans receive the new defaults.
- Schema migration preserves existing plans and normalizes invalid colours.
- Note and background choices survive save/load round trips.
- Note overflow contributes one validation error.
- Prompt output reflects the selected background.

### SVG contracts

- Blank notes emit no note card.
- Short and maximum-length notes produce deterministic wrapped lines.
- The note card follows Helicopter View, matches the sidebar width, and stays
  within the canvas.
- Header text meets the automatic light/dark contrast rule.
- Preset and custom backgrounds render the expected root colour and foreground
  palette.
- Existing tower, callout, ring, and sidebar containment contracts continue to
  pass.

### UI and browser verification

- The Note & Appearance controls edit and persist the plan.
- Preset and custom background controls update the compact preview.
- Clicking preview opens the modal.
- Buttons, wheel, pointer pan, Fit, Reset, Close, and Escape behave correctly.
- The same note and background appear in preview, SVG, and PNG.
- Four-leg, Three-leg, and Monopole plans remain readable on light and dark
  backgrounds at desktop and narrower dashboard widths.

Run the targeted Tower Plan contracts, the complete frontend test suite, lint,
production build, and an authenticated local browser check.
