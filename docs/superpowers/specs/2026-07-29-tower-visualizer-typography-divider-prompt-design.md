# Tower Visualizer Typography, Divider, and Prompt Design

**Date:** 2026-07-29  
**Status:** Approved  
**Scope:** Incremental enhancement of the existing Tower Visualizer landscape
document and workbench.

## Goal

Improve exported drawing readability, give users one professional document-wide
detail font control, visually separate the tower composition from the right-side
information stack, rename the default workflow note, and make the generated
prompt describe the current exported drawing.

## Approved Behaviour

### Detail font control

The Note & Appearance panel gains one **Detail font size** control with:

- Small: 11 px
- Standard: 13 px
- Large: 15 px
- Custom: 10–16 px

Standard 13 px is the new default. The selected size is document state and
therefore affects the compact preview, large preview, SVG download, PNG
download, saved draft, and generated prompt.

The setting applies to antenna callout titles/details, Site Data, Legend,
Helicopter View labels/readout, and the optional workflow note. It does not
scale the plan title, site subtitle, tower structure, tower-height dimension,
or installation-leg badges.

Text wrapping, line height, and card height must be derived from the selected
font size. All supported font sizes must keep up to 16 antenna callouts inside
the fixed 1900 × 1200 canvas without overlapping neighbouring cards.

### Professional vertical divider

Add a vertical separator between the tower/callout composition and the
right-side panel stack. The separator uses a thin muted guide line with short
navy accent caps at the top and bottom. It spans the usable drawing height,
does not overlap callouts, and remains contrast-safe on every supported
background.

### Workflow note default

The default note title becomes **Skenario Pekerjaan**.

Migration rules:

- missing or blank titles become `Skenario Pekerjaan`;
- the former untouched default `WORKFLOW NOTE` becomes `Skenario Pekerjaan`;
- user-customized titles remain unchanged.

The fallback applied when a user leaves the title blank must use the same new
default.

### Generated prompt

The generated prompt must describe the current deterministic drawing without
using implementation jargon. In addition to the existing engineering data, it
must specify:

- a 1900 × 1200 landscape engineering composition;
- a red-and-white tower painted in alternating 10-metre blocks;
- antenna callout cards arranged on the left and right of the tower;
- a vertical divider before the right-side information stack;
- the right-side order: Site Data, Legend, Helicopter View, then optional note;
- the selected detail font size in pixels;
- the selected background;
- the note title and note body when the note is not blank.

Blank notes must not be mentioned.

## State and Migration

Increment the Tower Visualizer schema from 7 to 8.

Store:

```js
detailFontPreset: 'standard'
detailFontSize: 13
```

Accepted presets are `small`, `standard`, `large`, and `custom`. Invalid state
normalizes to Standard 13 px. Curated presets always resolve to their fixed
size; Custom clamps to the 10–16 px range.

Draft storage must load schema v8 first while retaining v7 and older fallbacks.

## UI Design

Place **Detail font size** below the Background controls in Note & Appearance.
Use four compact selectable buttons consistent with existing background
presets. Show a numeric input only for Custom, with min 10, max 16, and suffix
`px`. Selection feedback uses the existing primary border/ring treatment.

## Rendering Design

Add a pure typography resolver that produces stable drawing tokens from plan
state. The SVG renderer consumes those tokens rather than multiplying the full
SVG, so coordinates remain deterministic.

The separator belongs to the document renderer and is emitted before the
right-side cards. It uses the resolved canvas guide colour plus navy accents.

## Validation and Error Handling

Normalization prevents invalid preset names or non-numeric custom sizes from
reaching the renderer. The UI constrains Custom input to 10–16. Imported or
legacy malformed values silently fall back to Standard 13 px.

## Verification

- Unit tests cover defaults, schema migration, preset resolution, custom
  clamping, and updated prompt wording.
- SVG contract tests cover enlarged font tokens, adaptive callout metrics,
  divider placement, note default migration, and no callout overlap at 16
  antennas using Large 15 px.
- UI source contracts cover the four presets and Custom numeric input.
- Full frontend contract suite, ESLint, and production build must pass.
- Browser QA verifies Standard/Large/Custom selection, readable large preview,
  divider visibility, migrated note title, prompt output, zoom controls, and
  zero console errors.
