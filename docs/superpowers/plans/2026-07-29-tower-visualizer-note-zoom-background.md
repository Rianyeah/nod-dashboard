# Tower Visualizer Note, Zoom, and Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional workflow-note card, an interactive large preview, and contrast-safe preset/custom backgrounds to Tower Visualizer while keeping preview, SVG, and PNG deterministic.

**Architecture:** Store document note and appearance settings in the versioned tower-plan state. Keep normalization, wrapping, colour validation, and palette resolution in one pure document helper consumed by state, SVG, controls, prompt generation, and PNG export. Keep preview interaction isolated in a dialog plus pure transform helpers so zoom state never leaks into the saved plan.

**Tech Stack:** React 19, Vite 8, JavaScript ES modules, Radix/shadcn dialog primitives, Tailwind CSS, deterministic SVG strings, IndexedDB/localStorage, Node test runner, ESLint.

## Global Constraints

- Keep the SVG canvas fixed at `1900 x 1200`.
- Omit the note card from preview, SVG, and PNG when the trimmed note body is empty.
- Limit note input to 1,200 characters and at most 16 deterministically wrapped SVG lines.
- Preserve the right-sidebar order: Site Data, Legend, Helicopter View, optional note.
- Support White, Soft Gray, Warm Ivory, Blueprint Navy, and a valid custom `#RRGGBB` background.
- Select direct-on-canvas foreground colours automatically from relative luminance.
- Keep information cards and antenna callouts on light surfaces with dark text.
- Keep all existing tower types, Site ID auto-fill, antenna grouping, validation, status colours, 10-metre red/white bands, filenames, and download buttons unchanged.
- Use the shared SVG renderer for compact preview, zoom dialog, SVG download, and PNG download.
- Do not add backend endpoints or npm dependencies.

---

## File structure

- Create `frontend/src/features/tower-plan/towerPlanDocument.js`
  - Own document-note defaults, limits, background presets, hex validation,
    normalization, deterministic wrapping, contrast palette, and prompt label.
- Create `frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx`
  - Own Note & Appearance form controls and temporary invalid hex input state.
- Create `frontend/src/features/tower-plan/towerPlanPreviewTransform.js`
  - Own pure zoom and pan calculations.
- Create `frontend/src/features/tower-plan/TowerPlanPreviewDialog.jsx`
  - Own modal lifecycle, fit/reset, wheel zoom, and pointer pan.
- Create `frontend/src/__tests__/towerPlanDocument.test.js`
  - Unit-test document normalization, wrapping, validation, palette, and preview
    transform math.
- Modify `frontend/src/features/tower-plan/towerPlanState.js`
  - Migrate schema, persist document settings, validate note fit, and use the
    background in prompt output.
- Modify `frontend/src/features/tower-plan/towerPlanStorage.js`
  - Advance the local fallback key while retaining prior keys.
- Modify `frontend/src/features/tower-plan/towerPlanGeometry.js`
  - Define the optional note-card bounds beneath Helicopter View.
- Modify `frontend/src/features/tower-plan/towerPlanSvg.js`
  - Render the background palette and optional note card.
- Modify `frontend/src/features/tower-plan/TowerPlanPreview.jsx`
  - Make the compact preview an accessible dialog trigger.
- Modify `frontend/src/pages/TowerPlanGeneratorPage.jsx`
  - Wire the editor and use the selected background during PNG conversion.
- Modify `frontend/src/__tests__/towerPlanContracts.test.js`
  - Extend SVG and source-wiring regression coverage.

---

### Task 1: Versioned document state and pure appearance rules

**Files:**
- Create: `frontend/src/features/tower-plan/towerPlanDocument.js`
- Create: `frontend/src/__tests__/towerPlanDocument.test.js`
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/features/tower-plan/towerPlanStorage.js`
- Test: `frontend/src/__tests__/towerPlanDocument.test.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces:
  - `BACKGROUND_PRESETS: ReadonlyArray<{id: string, label: string, color: string}>`
  - `DEFAULT_DOCUMENT_NOTE: {title: string, text: string, headerColor: string}`
  - `MAX_NOTE_CHARACTERS: 1200`
  - `MAX_NOTE_LINES: 16`
  - `isHexColor(value: unknown): boolean`
  - `normalizeDocumentSettings(raw: object): {documentNote, backgroundPreset, backgroundColor}`
  - `wrapDocumentNote(text: string, maxCharacters?: number): string[]`
  - `validateDocumentNote(note: object): string[]`
  - `contrastTextColor(color: string): "#ffffff" | "#17263b"`
  - `resolveDocumentPalette(plan: object): {background, canvasInk, canvasMuted, guide}`
  - `documentBackgroundPrompt(plan: object): string`
- Consumes: no new interfaces.

- [ ] **Step 1: Write failing document helper and state tests**

Create `frontend/src/__tests__/towerPlanDocument.test.js` with focused pure
contracts:

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_NOTE_CHARACTERS,
  MAX_NOTE_LINES,
  documentBackgroundPrompt,
  normalizeDocumentSettings,
  resolveDocumentPalette,
  validateDocumentNote,
  wrapDocumentNote,
} from '../features/tower-plan/towerPlanDocument.js';
import {
  TOWER_PLAN_SCHEMA_VERSION,
  buildEngineeringPrompt,
  createBlankTowerPlan,
  migrateTowerPlan,
  validateTowerPlan,
} from '../features/tower-plan/towerPlanState.js';

describe('Tower Visualizer document settings', () => {
  it('adds versioned note and white background defaults', () => {
    const plan = createBlankTowerPlan();
    assert.equal(TOWER_PLAN_SCHEMA_VERSION, 7);
    assert.deepEqual(plan.documentNote, {
      title: 'WORKFLOW NOTE',
      text: '',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
  });

  it('migrates malformed legacy appearance without losing plan data', () => {
    const plan = migrateTowerPlan({
      schemaVersion: 6,
      planTitle: 'TOWER PLAN SITE001',
      siteName: 'SITE001',
      documentNote: { title: '', text: 'Check feeder', headerColor: 'red' },
      backgroundPreset: 'missing',
      backgroundColor: '#xyzxyz',
      antennas: [],
    });
    assert.equal(plan.siteName, 'SITE001');
    assert.deepEqual(plan.documentNote, {
      title: 'WORKFLOW NOTE',
      text: 'Check feeder',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
  });

  it('wraps explicit paragraphs deterministically and validates overflow', () => {
    const lines = wrapDocumentNote('First workflow line.\nSecond workflow line.', 24);
    assert.deepEqual(lines, ['First workflow line.', 'Second workflow line.']);
    assert.equal(validateDocumentNote({ text: 'A'.repeat(MAX_NOTE_CHARACTERS + 1) }).length, 1);
    assert.ok(MAX_NOTE_LINES === 16);
  });

  it('uses contrast-safe palettes and background prompt labels', () => {
    const dark = {
      ...createBlankTowerPlan(),
      backgroundPreset: 'blueprint-navy',
      backgroundColor: '#102337',
    };
    assert.equal(resolveDocumentPalette(dark).canvasInk, '#f8fafc');
    assert.match(documentBackgroundPrompt(dark), /Blueprint Navy/);
    assert.match(buildEngineeringPrompt(dark), /Blueprint Navy background/);
  });

  it('adds one tower-plan validation error when wrapped note exceeds the limit', () => {
    const plan = {
      ...createBlankTowerPlan(),
      planTitle: 'PLAN',
      siteName: 'SITE001',
      documentNote: {
        title: 'WORKFLOW NOTE',
        text: Array.from({ length: 17 }, (_, index) => `Line ${index + 1}`).join('\n'),
        headerColor: '#17263b',
      },
    };
    assert.deepEqual(
      validateTowerPlan(plan).filter((error) => error.includes('Workflow note')),
      ['Workflow note maksimal 16 baris pada hasil gambar.'],
    );
  });
});
```

Extend the existing storage source contract in
`towerPlanContracts.test.js` to expect `nod_tower_plan_draft_v7` and retain
`nod_tower_plan_draft_v6`.

- [ ] **Step 2: Run the tests and verify the new module/state contract fails**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js
```

Expected: FAIL because `towerPlanDocument.js` does not exist and schema version
is still 6.

- [ ] **Step 3: Implement the pure document helper**

Create `towerPlanDocument.js` with immutable constants and deterministic
helpers:

```js
export const MAX_NOTE_CHARACTERS = 1200;
export const MAX_NOTE_LINES = 16;
export const NOTE_WRAP_CHARACTERS = 86;

export const DEFAULT_DOCUMENT_NOTE = Object.freeze({
  title: 'WORKFLOW NOTE',
  text: '',
  headerColor: '#17263b',
});

export const BACKGROUND_PRESETS = Object.freeze([
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'soft-gray', label: 'Soft Gray', color: '#eef2f6' },
  { id: 'warm-ivory', label: 'Warm Ivory', color: '#f7f3e8' },
  { id: 'blueprint-navy', label: 'Blueprint Navy', color: '#102337' },
  { id: 'custom', label: 'Custom', color: null },
]);

export function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function presetById(id) {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id);
}

export function normalizeDocumentSettings(raw = {}) {
  const requestedPreset = presetById(raw.backgroundPreset);
  const backgroundPreset = requestedPreset?.id || 'white';
  const canonical = requestedPreset?.color || '#ffffff';
  const backgroundColor = backgroundPreset === 'custom' && isHexColor(raw.backgroundColor)
    ? String(raw.backgroundColor).toLowerCase()
    : canonical;
  const sourceNote = raw.documentNote && typeof raw.documentNote === 'object'
    ? raw.documentNote
    : {};
  return {
    documentNote: {
      title: String(sourceNote.title || '').trim() || DEFAULT_DOCUMENT_NOTE.title,
      text: String(sourceNote.text || '').slice(0, MAX_NOTE_CHARACTERS),
      headerColor: isHexColor(sourceNote.headerColor)
        ? String(sourceNote.headerColor).toLowerCase()
        : DEFAULT_DOCUMENT_NOTE.headerColor,
    },
    backgroundPreset,
    backgroundColor,
  };
}
```

Implement `wrapDocumentNote()` so it:

- normalizes CRLF to LF;
- preserves explicit paragraph/line boundaries;
- wraps words at `NOTE_WRAP_CHARACTERS`;
- splits a single overlong token into fixed-size chunks; and
- returns `[]` for a blank body.

Implement relative luminance using sRGB linearization. Use
`luminance < 0.35` for the dark-background palette:

```js
export function resolveDocumentPalette(plan) {
  const settings = normalizeDocumentSettings(plan);
  const dark = relativeLuminance(settings.backgroundColor) < 0.35;
  return {
    background: settings.backgroundColor,
    canvasInk: dark ? '#f8fafc' : '#111827',
    canvasMuted: dark ? '#cbd5e1' : '#26384d',
    guide: dark ? '#94a3b8' : '#64748b',
  };
}
```

`contrastTextColor()` returns white for colours below the same luminance
threshold and deep navy otherwise.

`validateDocumentNote()` returns exactly one length error or one wrapped-line
error. `documentBackgroundPrompt()` returns the preset label for curated
backgrounds and `Custom #rrggbb` for custom.

- [ ] **Step 4: Integrate schema, migration, validation, prompt, and storage**

In `towerPlanState.js`:

- increment `TOWER_PLAN_SCHEMA_VERSION` to 7;
- spread `normalizeDocumentSettings({})` into `createBlankTowerPlan()`;
- spread `normalizeDocumentSettings(raw)` after `...raw` in
  `migrateTowerPlan()`;
- append `validateDocumentNote(state.documentNote)` in `validateTowerPlan()`;
- replace the hard-coded white-background prompt sentence with:

```js
`Use a ${visualStyle} visual style with a landscape engineering composition `
  + `on a ${documentBackgroundPrompt(state)} background.`,
```

In `towerPlanStorage.js`:

```js
const FALLBACK_KEY = 'nod_tower_plan_draft_v7';
const LEGACY_FALLBACK_KEYS = [
  'nod_tower_plan_draft_v6',
  'nod_tower_plan_draft_v5',
  'nod_tower_plan_draft_v4',
];
```

- [ ] **Step 5: Run focused state/document tests**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: PASS with schema, migration, wrapping, validation, prompt, and
storage contracts green.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- frontend/src/features/tower-plan/towerPlanDocument.js frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/towerPlanStorage.js frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower document appearance state"
```

---

### Task 2: Deterministic SVG note card and background palette

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanGeometry.js`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Modify: `frontend/src/__tests__/towerPlanDocument.test.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes:
  - `wrapDocumentNote(text): string[]`
  - `resolveDocumentPalette(plan): {background, canvasInk, canvasMuted, guide}`
  - `normalizeDocumentSettings(raw)`
  - `contrastTextColor(color)`
  - `DEFAULT_DOCUMENT_NOTE`
- Produces:
  - `TOWER_DRAWING_LAYOUT.notePanel`
  - SVG group `data-document-note="true"` with deterministic geometry
    attributes.

- [ ] **Step 1: Write failing SVG contracts**

Add tests that parse the optional note group:

```js
it('renders a contained workflow note after Helicopter View', () => {
  const plan = {
    ...createBlankTowerPlan(),
    planTitle: 'TOWER PLAN SITE001',
    siteName: 'SITE001',
    documentNote: {
      title: 'INSTALLATION FLOW',
      text: 'Verify mounting bracket. Confirm feeder label.',
      headerColor: '#7c3aed',
    },
  };
  const svg = renderTowerPlanSvg(plan);
  const match = svg.match(
    /data-document-note="true" data-note-x="([\d.]+)" data-note-y="([\d.]+)" data-note-width="([\d.]+)" data-note-height="([\d.]+)" data-note-line-count="(\d+)"/,
  );
  assert.ok(match);
  const [, x, y, width, height, lineCount] = match.map(Number);
  const helicopter = getTowerGeometry(plan.towerType).helicopterPanel;
  assert.equal(x, helicopter.x);
  assert.equal(width, helicopter.width);
  assert.ok(y >= helicopter.y + helicopter.height + 24);
  assert.ok(y + height <= TOWER_DRAWING_LAYOUT.canvasHeight);
  assert.ok(lineCount >= 1 && lineCount <= 16);
  assert.match(svg, /INSTALLATION FLOW/);
  assert.match(svg, /fill="#7c3aed"/);
});

it('omits blank notes and resolves dark canvas ink', () => {
  const blank = renderTowerPlanSvg(createBlankTowerPlan());
  assert.doesNotMatch(blank, /data-document-note=/);
  const dark = renderTowerPlanSvg({
    ...createBlankTowerPlan(),
    backgroundPreset: 'blueprint-navy',
    backgroundColor: '#102337',
  });
  assert.match(dark, /data-document-background="#102337"/);
  assert.match(dark, /data-canvas-ink="#f8fafc"/);
});
```

Extend the dense 16-antenna contract to assert the note panel does not overlap
Helicopter View and remains inside the canvas.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because the geometry has no note panel and the SVG has no
document background attributes or note group.

- [ ] **Step 3: Add note-panel geometry**

In `TOWER_DRAWING_LAYOUT` add:

```js
notePanel: {
  x: 1330,
  y: 842,
  width: 520,
  minHeight: 92,
  maxHeight: 330,
  headerHeight: 32,
  lineHeight: 14,
},
```

Clone it from `getTowerGeometry()` as
`notePanel: { ...TOWER_DRAWING_LAYOUT.notePanel }`. Assert
`notePanel.y >= helicopterPanel.y + helicopterPanel.height + 24` in the
geometry contract.

- [ ] **Step 4: Render the note and palette in SVG**

Import document helpers into `towerPlanSvg.js`. Add a dedicated renderer:

```js
function documentNoteCard(state, geometry) {
  const text = String(state.documentNote?.text || '').trim();
  if (!text) return '';
  const card = geometry.notePanel;
  const lines = wrapDocumentNote(text);
  const bodyPadding = 16;
  const contentHeight = bodyPadding * 2 + lines.length * card.lineHeight;
  const height = Math.min(
    card.maxHeight,
    Math.max(card.minHeight, card.headerHeight + contentHeight),
  );
  const headerColor = normalizeDocumentSettings(state).documentNote.headerColor;
  const headerInk = contrastTextColor(headerColor);
  const lineMarkup = lines.map((line, index) => (
    `<text data-note-line="${index + 1}" x="${card.x + 18}" `
      + `y="${card.y + card.headerHeight + 24 + index * card.lineHeight}" `
      + `fill="#26384d" font-size="11">${escapeXml(line)}</text>`
  )).join('');
  return `<g data-document-note="true" data-note-x="${card.x}" `
    + `data-note-y="${card.y}" data-note-width="${card.width}" `
    + `data-note-height="${height}" data-note-line-count="${lines.length}">`
    + `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${height}" `
    + `rx="8" fill="#ffffff" stroke="#8493a6"/>`
    + `<path d="M${card.x + 8} ${card.y} H${card.x + card.width - 8} `
    + `Q${card.x + card.width} ${card.y} ${card.x + card.width} ${card.y + 8} `
    + `V${card.y + card.headerHeight} H${card.x} V${card.y + 8} `
    + `Q${card.x} ${card.y} ${card.x + 8} ${card.y}" fill="${headerColor}"/>`
    + `<text x="${card.x + 16}" y="${card.y + 21}" fill="${headerInk}" `
    + `font-size="12" font-weight="800">${escapeXml(state.documentNote.title)}</text>`
    + `${lineMarkup}</g>`;
}
```

Emit the root canvas as:

```js
const palette = resolveDocumentPalette(state);
<svg xmlns="http://www.w3.org/2000/svg"
  width="${layout.canvasWidth}"
  height="${layout.canvasHeight}"
  viewBox="0 0 ${layout.canvasWidth} ${layout.canvasHeight}"
  data-document-background="${palette.background}"
  data-canvas-ink="${palette.canvasInk}">
  <rect width="${layout.canvasWidth}" height="${layout.canvasHeight}" fill="${palette.background}"/>
```

Pass `palette` only to functions that draw directly on the canvas. Replace
hard-coded heading, dimension, and guide colours with `canvasInk`,
`canvasMuted`, or `guide`. Do not recolour card body text, status colours,
antenna masts, or tower paint bands. Append
`${documentNoteCard(state, geometry)}` after
`${helicopterView(state, geometry)}`.

- [ ] **Step 5: Run SVG contracts**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: PASS; blank notes are absent, note geometry is contained, dark
background ink is light, and existing dense SVG contracts remain green.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: render tower workflow notes and backgrounds"
```

---

### Task 3: Note & Appearance dashboard editor and PNG parity

**Files:**
- Create: `frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx`
- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes:
  - `BACKGROUND_PRESETS`
  - `MAX_NOTE_CHARACTERS`
  - `isHexColor(value)`
  - `resolveDocumentPalette(plan)`
- Produces:
  - `TowerPlanDocumentEditor({plan, onChange})`
  - Page-level PNG conversion that fills with the resolved background.

- [ ] **Step 1: Write failing source-wiring contracts**

Extend the page contract:

```js
assert.match(page, /TowerPlanDocumentEditor/);
assert.match(page, /title="Note & Appearance"/);
assert.match(page, /resolveDocumentPalette\(plan\)\.background/);
assert.doesNotMatch(page, /context\.fillStyle = '#ffffff'/);
```

Read the new editor source and assert the required accessible controls:

```js
const editor = readFileSync(
  new URL('../features/tower-plan/TowerPlanDocumentEditor.jsx', import.meta.url),
  'utf8',
);
assert.match(editor, /Note header/);
assert.match(editor, /Header colour/);
assert.match(editor, /Workflow note/);
assert.match(editor, /Background/);
assert.match(editor, /MAX_NOTE_CHARACTERS/);
assert.match(editor, /BACKGROUND_PRESETS/);
assert.match(editor, /aria-invalid/);
```

- [ ] **Step 2: Run the page contract and verify failure**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because the editor and page wiring do not exist.

- [ ] **Step 3: Build the focused editor**

Create `TowerPlanDocumentEditor.jsx`. Use local strings for partially typed hex
values and synchronize them when saved plan colours change:

```jsx
export default function TowerPlanDocumentEditor({ plan, onChange }) {
  const [headerHex, setHeaderHex] = useState(plan.documentNote.headerColor);
  const [backgroundHex, setBackgroundHex] = useState(plan.backgroundColor);
  const updateNote = (changes) => onChange({
    documentNote: { ...plan.documentNote, ...changes },
  });
  const selectPreset = (preset) => onChange({
    backgroundPreset: preset.id,
    backgroundColor: preset.color || plan.backgroundColor,
  });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tower-note-title">Note header</Label>
          <Input
            id="tower-note-title"
            value={plan.documentNote.title}
            onBlur={() => updateNote({
              title: plan.documentNote.title.trim() || 'WORKFLOW NOTE',
            })}
            onChange={(event) => updateNote({ title: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tower-note-header-color">Header colour</Label>
          <div className="flex gap-2">
            <Input
              aria-label="Header colour picker"
              type="color"
              value={plan.documentNote.headerColor}
              onChange={(event) => {
                setHeaderHex(event.target.value);
                updateNote({ headerColor: event.target.value });
              }}
            />
            <Input
              id="tower-note-header-color"
              aria-invalid={!isHexColor(headerHex)}
              value={headerHex}
              onChange={(event) => setHeaderHex(event.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tower-workflow-note">Workflow note</Label>
        <Textarea
          id="tower-workflow-note"
          maxLength={MAX_NOTE_CHARACTERS}
          value={plan.documentNote.text}
          onChange={(event) => updateNote({ text: event.target.value })}
        />
        <p className="text-right text-xs text-muted-foreground">
          {plan.documentNote.text.length} / {MAX_NOTE_CHARACTERS}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Background</legend>
        <div className="grid gap-2 sm:grid-cols-5">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={plan.backgroundPreset === preset.id}
              onClick={() => selectPreset(preset)}
            >
              <span style={{ backgroundColor: preset.color || plan.backgroundColor }} />
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
```

Required behaviour:

- `Note header` commits on change and normalizes to `WORKFLOW NOTE` on blur.
- Native colour inputs always receive valid stored hex values.
- Hex text inputs may temporarily be invalid; show a concise inline message
  and set `aria-invalid="true"`.
- Commit a hex value only after `isHexColor(value)` succeeds.
- Textarea uses `maxLength={MAX_NOTE_CHARACTERS}` and displays
  `{plan.documentNote.text.length} / {MAX_NOTE_CHARACTERS}`.
- Preset buttons use `aria-pressed` and display both a swatch and label.
- Selecting Custom reveals the custom colour and hex controls.
- The component returns plan patches only; it does not own persistence.

- [ ] **Step 4: Wire editor and background-aware PNG export**

In `TowerPlanGeneratorPage.jsx`:

- import `Palette` from `lucide-react`;
- import `TowerPlanDocumentEditor`;
- import `resolveDocumentPalette`;
- add a Card immediately after Project Data:

```jsx
<Card>
  <CardHeader className="border-b border-border">
    <SectionTitle icon={Palette} title="Note & Appearance" />
  </CardHeader>
  <CardContent>
    <TowerPlanDocumentEditor plan={plan} onChange={editPlan} />
  </CardContent>
</Card>
```

Change `svgToPng(svg)` to `svgToPng(svg, backgroundColor)`. Fill the canvas
with `backgroundColor`, then draw the image. Call it with:

```js
const png = await svgToPng(
  renderTowerPlanSvg(plan),
  resolveDocumentPalette(plan).background,
);
```

- [ ] **Step 5: Run focused contracts and lint**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: PASS with editor wiring, accessible labels, PNG background parity,
and lint clean.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower note and background controls"
```

---

### Task 4: Interactive large preview with zoom and pan

**Files:**
- Create: `frontend/src/features/tower-plan/towerPlanPreviewTransform.js`
- Create: `frontend/src/features/tower-plan/TowerPlanPreviewDialog.jsx`
- Modify: `frontend/src/features/tower-plan/TowerPlanPreview.jsx`
- Modify: `frontend/src/__tests__/towerPlanDocument.test.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces:
  - `clampZoom(value: number): number`
  - `zoomAroundPoint(transform, nextZoom, point): {zoom, x, y}`
  - `clampPan(transform, viewport, documentSize): {zoom, x, y}`
  - `TowerPlanPreviewDialog({open, onOpenChange, source, alt})`
- Consumes: `towerPlanSvgDataUrl(plan)` from the existing SVG renderer.

- [ ] **Step 1: Write failing transform and dialog contracts**

Add pure math tests:

```js
import {
  clampPan,
  clampZoom,
  zoomAroundPoint,
} from '../features/tower-plan/towerPlanPreviewTransform.js';

it('clamps preview zoom and keeps the pointer anchored', () => {
  assert.equal(clampZoom(0.2), 0.5);
  assert.equal(clampZoom(3), 2.5);
  assert.deepEqual(
    zoomAroundPoint({ zoom: 1, x: 0, y: 0 }, 2, { x: 100, y: 80 }),
    { zoom: 2, x: -100, y: -80 },
  );
});

it('clamps panning while keeping part of the document visible', () => {
  assert.deepEqual(
    clampPan(
      { zoom: 1, x: -5000, y: 5000 },
      { width: 1000, height: 700 },
      { width: 1900, height: 1200 },
    ),
    { zoom: 1, x: -1800, y: 600 },
  );
});
```

Extend the source contract:

```js
assert.match(preview, /TowerPlanPreviewDialog/);
assert.match(preview, /onClick=.*setOpen\(true\)/s);
assert.match(dialog, /Zoom In/);
assert.match(dialog, /Zoom Out/);
assert.match(dialog, />Fit</);
assert.match(dialog, />Reset</);
assert.match(dialog, /onWheel/);
assert.match(dialog, /onPointerDown/);
assert.match(dialog, /onPointerMove/);
assert.match(dialog, /onPointerUp/);
assert.match(dialog, /aria-live="polite"/);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because transform helpers and the dialog do not exist.

- [ ] **Step 3: Implement pure preview transform helpers**

Create `towerPlanPreviewTransform.js`:

```js
export const MIN_PREVIEW_ZOOM = 0.5;
export const MAX_PREVIEW_ZOOM = 2.5;

export function clampZoom(value) {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, Number(value) || 1));
}

export function zoomAroundPoint(transform, nextZoomValue, point) {
  const nextZoom = clampZoom(nextZoomValue);
  const ratio = nextZoom / transform.zoom;
  return {
    zoom: nextZoom,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  };
}
```

Implement `clampPan()` with a 100-pixel visible-edge allowance. Calculate the
scaled document dimensions and clamp x/y so at least that edge remains within
the viewport. Return the transform unchanged when viewport dimensions are not
positive.

- [ ] **Step 4: Build the preview dialog**

Create `TowerPlanPreviewDialog.jsx` with existing Dialog primitives and
lucide-react `Maximize2`, `Minus`, `Plus`, `Scan`, and `RotateCcw` icons.

Required state:

```js
const [transform, setTransform] = useState({ zoom: 1, x: 0, y: 0 });
const [fitScale, setFitScale] = useState(1);
const viewportRef = useRef(null);
const dragRef = useRef(null);
```

Required behaviours:

- Zoom is a factor relative to the fitted document size. `100%` means the
  whole SVG fits the modal viewport; `50%` and `250%` are relative to that
  baseline.
- `fitDocument()` reads the viewport rectangle, stores
  `fitScale = Math.min(width / 1900, height / 1200)`, and sets
  `zoom = 1` with the fitted document centred.
- `useLayoutEffect` calls `fitDocument()` whenever `open` becomes true.
- a `ResizeObserver` recalculates Fit only while the dialog is in fit mode;
- wheel direction adjusts zoom by 0.1 and calls `zoomAroundPoint()` using
  pointer coordinates relative to the viewport;
- pointer down stores the pointer ID and origin, captures the pointer, and
  sets a grabbing cursor;
- pointer move applies the delta and calls `clampPan()` with document size
  `{width: 1900 * fitScale, height: 1200 * fitScale}`;
- pointer up releases capture and clears drag state;
- Zoom In/Out move by 0.1;
- Reset sets `{zoom: 1, x: centeredX, y: centeredY}`;
- Fit recalculates the contained scale;
- zoom percentage is exposed through `aria-live="polite"`;
- dialog close clears drag state but does not mutate the plan.

Use a viewport with `overflow-hidden`, a technical checker/grid backdrop, and
an image rendered at an intrinsic CSS size of `1900px x 1200px`. Apply:

```jsx
style={{
  transform: `translate(${transform.x}px, ${transform.y}px) scale(${fitScale * transform.zoom})`,
  transformOrigin: 'top left',
}}
```

- [ ] **Step 5: Wire the compact preview trigger**

In `TowerPlanPreview.jsx`:

- add local `open` state;
- render the image inside a semantic button with an accessible expand label;
- keep `aspect-[19/12]`;
- make the existing maximize overlay visible on keyboard focus;
- render:

```jsx
<TowerPlanPreviewDialog
  alt={alt}
  onOpenChange={setOpen}
  open={open}
  source={source}
/>
```

- [ ] **Step 6: Run focused tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: PASS with transform math, dialog wiring, accessibility labels, and
lint clean.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- frontend/src/features/tower-plan/towerPlanPreviewTransform.js frontend/src/features/tower-plan/TowerPlanPreviewDialog.jsx frontend/src/features/tower-plan/TowerPlanPreview.jsx frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add zoomable tower plan preview"
```

---

### Task 5: Integrated regression and browser verification

**Files:**
- Modify if a defect is found: only the files introduced or changed in Tasks
  1-4.
- Test: `frontend/src/__tests__/towerPlanDocument.test.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes all Task 1-4 interfaces.
- Produces a verified Tower Visualizer feature ready for code review.

- [ ] **Step 1: Run the complete frontend test suite**

Run:

```powershell
node --test src/__tests__/*.test.js
```

Expected: all frontend tests pass with zero failures.

- [ ] **Step 2: Run lint, production build, and whitespace validation**

Run:

```powershell
npm run lint
npm run build
git diff --check
```

Expected: lint and build exit 0; `git diff --check` emits no errors. Existing
Vite chunk-size advisories are non-blocking unless this feature introduces a
new warning.

- [ ] **Step 3: Verify the authenticated page in a real browser**

Use the local frontend and backend, then validate:

1. login as the local test operator;
2. open `/tower-plan-generator`;
3. type a short note, customize its title and header colour, and confirm the
   note appears below Helicopter View;
4. clear the note and confirm the SVG card disappears;
5. test all four presets and one custom light and dark colour;
6. confirm direct-on-canvas headings remain readable on Blueprint Navy;
7. open the large preview from mouse and keyboard;
8. exercise Zoom In, Zoom Out, wheel zoom, drag pan, Fit, Reset, Escape, and
   reopen-to-Fit;
9. switch Four-leg, Three-leg, and Monopole and confirm containment;
10. download SVG and PNG and confirm note/background parity.

Capture one light-background and one dark-background screenshot for review.

- [ ] **Step 4: Fix only reproduced regressions with a failing test first**

For every browser defect, add a focused regression to
`towerPlanDocument.test.js` for pure behaviour or
`towerPlanContracts.test.js` for SVG/source wiring. Run the focused test to
observe failure, apply the smallest fix, then rerun the focused and full
suites.

- [ ] **Step 5: Commit browser-verified refinements if needed**

If Step 4 changed files:

```powershell
git add -- frontend/src/features/tower-plan frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: refine tower document preview"
```

If Step 4 changed nothing, do not create an empty commit.

- [ ] **Step 6: Request final code review**

Review the complete range from the design commit through `HEAD`. Treat any
Critical or Important finding as blocking. Add a failing regression before
fixing a blocking finding, rerun all verification commands, and request a
focused re-review of the correction.
