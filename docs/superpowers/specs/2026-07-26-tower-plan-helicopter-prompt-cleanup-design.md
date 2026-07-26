# Tower Plan Helicopter View and Prompt Cleanup Design

**Date:** 2026-07-26  
**Status:** Approved design, pending written-spec review

## Goal

Improve the Tower Plan Generator by restoring a height-aware Helicopter View,
turning the prompt output into professional natural-language instructions, and
removing the unused reference-image and direct AI-generation surfaces.

## Scope

This change includes:

- height rings and clearer antenna annotations in Helicopter View;
- a concise external-image-generator prompt;
- removal of the Reference Visual and AI Visualization panels;
- removal of their unused frontend and backend integration code;
- focused automated and browser-level regression coverage.

This change does not add the optional future tools listed under
"Recommendations". Existing SVG, PNG, JSON, auto-fill, editing, validation, and
local draft features remain.

## 1. Height-Aware Helicopter View

### Data model

The renderer derives its rings directly from the current antenna list:

1. Convert every valid antenna height to a number.
2. Deduplicate the heights.
3. Sort heights from highest to lowest.
4. Assign the highest height to the outermost ring and progressively lower
   heights to inner rings.

All unique heights are retained. Ring radii are distributed within the available
panel area so the drawing remains valid for Four-leg, Three-leg, and Monopole.
With one unique height the radius is 62 SVG pixels. With multiple heights, radii
are distributed evenly from 72 pixels for the highest to 42 pixels for the
lowest. Height labels alternate placement when needed to reduce collisions.

### Antenna rendering

Each antenna starts at the ring for its installation height and at the bearing of
its installation leg or mounting side. The directional arrow follows the antenna
azimuth.

The visible annotation format is:

```text
SEC <sector> | <azimuth>°
```

Height appears once on the corresponding ring, for example `46 m`, instead of
being repeated in every antenna label.

Antennas with the same installation position, height, and azimuth receive a
small tangential offset. This prevents their paths and labels from completely
overlapping without changing the engineering values. Arrowheads use the
antenna/status colour rather than one shared blue marker.

The SVG exposes diagnostic attributes:

- `data-elevation-ring="<height>"`;
- `data-top-antenna="<antenna-id>"`;
- existing `data-installation-label` and `data-structure-kind` attributes.

### Layout

The existing reserved Helicopter View panel remains at least 50 SVG pixels from
the tower envelope. The tower footprint and installation labels continue to use
the shared tower geometry descriptors.

## 2. Professional Natural-Language Prompt

The Create Prompt action produces English natural-language instructions suitable
for copying into an external image generator. The dashboard UI remains
Indonesian.

The prompt contains:

- site and plan identity;
- tower type, height, and orientation;
- one readable bullet per physical antenna containing name, status, sector,
  height, azimuth, CID values, and installation leg or mounting side;
- selected visual style;
- the optional revision instruction;
- a short constraint not to add, remove, merge, or change supplied engineering
  values.

The prompt must not expose implementation language or serialized application
data. Specifically, it excludes:

- `TEMPLATE`, `TARGET`, and schema/version identifiers;
- the word `deterministic`;
- raw JSON;
- internal field names such as `heightM` or `azimuthDeg`;
- messages about internal sanitization or which export is the approved source.

Example shape:

```text
Create a professional four-leg lattice tower planning illustration for site
PSN099. The tower is 52 metres high, with Leg A oriented 45 degrees clockwise
from North.

Install the following antennas exactly:
- Antenna Sectoral ... — Existing; Sector 1; 46 m; azimuth 40°; CID 11, 12;
  Leg A.

Use a clean portrait engineering drawing with a white background...
Do not add, remove, merge, or change any supplied antenna or measurement.
```

The output remains copyable from the existing textarea. The section title becomes
`Prompt generator`, and its supporting copy no longer refers to direct AI
requests.

## 3. AI and Reference-Image Cleanup

### Frontend

Remove:

- Reference Visual panel and upload input;
- AI Visualization panel, quality selector, confirmation, preview, and loading
  state;
- AI capability fetching and image-generation client calls;
- manual-reference and latest-AI asset hydration;
- unused icons, handlers, constants, and object-URL lifecycle code;
- asset read/write exports that become unused.

The IndexedDB database and existing asset object store are not destructively
deleted. Old local assets are simply no longer read or displayed.

### Backend

Remove the Tower Plan direct image-generation surface:

- AI request/capability models;
- `/tower-plan/ai-capabilities`;
- `/tower-plan/ai-visualizations`;
- image-provider adapter, AI concurrency/rate-limit code, and related
  configuration;
- Tower Plan AI environment examples and route tests.

The Tower Plan Site ID search and site-configuration endpoints remain unchanged.

## 4. Error Handling

- Prompt creation continues to use the existing Tower Plan validation gate.
- Antennas with invalid heights or azimuths remain blocked by validation before
  prompt/export actions.
- An empty antenna list produces an explicit sentence stating that no antennas
  are defined; it never emits empty JSON or internal placeholders.
- Ring construction ignores non-finite heights defensively, even though valid
  plans should not contain them.

## 5. Testing and Verification

### Automated contracts

Add or update tests proving:

- unique antenna heights create matching `data-elevation-ring` elements;
- higher antennas use outer rings and lower antennas use inner rings;
- labels include `SEC <sector> | <azimuth>°`;
- duplicate paths receive distinct offsets;
- Four-leg, Three-leg, and Monopole retain their correct installation positions;
- prompt output contains all engineering data in natural language;
- prompt output contains none of the banned internal terms or raw JSON;
- Reference Visual and AI Visualization UI/imports are absent;
- removed backend AI endpoints no longer appear in the authenticated router
  contract;
- existing site search, grouping, SVG, state migration, lint, and build contracts
  remain green.

### Browser verification

Using live `ransys_gabungan` data:

1. Search and apply a multi-height site.
2. Confirm ring count equals the unique antenna-height count.
3. Confirm each visible annotation uses `SEC | azimuth`.
4. Switch across all three tower types.
5. Create and copy the natural-language prompt.
6. Confirm the two removed panels are absent.
7. Check desktop and mobile layout and page-specific console errors.

## Recommendations for a Later Scope

1. **Antenna Schedule export (CSV/PDF):** highest immediate operational value.
2. **Clearance checker:** warn when antennas on the same position and nearby
   heights violate a configurable vertical-clearance rule.
3. **Existing-versus-proposed comparison:** show additions, relocations, and
   dismantles as a revision summary.
4. **Batch generator:** generate reviewed tower plans for multiple Site IDs.

These recommendations are intentionally excluded from the current implementation.
