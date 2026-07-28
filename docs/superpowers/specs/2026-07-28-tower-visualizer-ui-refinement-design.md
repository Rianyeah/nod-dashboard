# Tower Visualizer UI Refinement Design

## Goal

Refine the Tower Plan Generator workbench into a clearer, NOD Dashboard-consistent Tower Visualizer without changing its RF grouping, auto-fill, export, or tower geometry behavior.

## Approved UX Changes

### Header and navigation

- Rename the page, sidebar item, breadcrumb, route-loading label, and visible page heading from `Tower Plan Generator` to `Tower Visualizer`.
- Keep the `Tools` badge only.
- Remove the conditional `Auto-filled` badge and the header subtitle `Multi-type engineering plan · RF grouping · Deterministic export`.

### Search Site ID

- Rename the card title from `Auto-fill Site ID` to `Search Site ID`.
- Replace its card subtitle with `Ketik site id dan Enter`.
- Remove the explanatory caption below the search input.
- Preserve search debounce, exact-match-on-Enter behavior, auto-fill review dialog, and all accessibility labels/keyboard behavior.

### Project and prompt controls

- Rename `Data proyek` to `Project Data` and remove its description.
- Keep all engineering fields in their current order except `Visual style` and `Custom style`.
- Move `Visual style` and `Custom style` into a two-column row at the top of `Prompt generator`, before the revision instruction.
- Do not change the persisted state shape or prompt-generation semantics.

### Engineering preview and SVG output

- Retain only the `Engineering preview` title in the preview card header; remove its deterministic-source subtitle and the valid/issue status badge.
- Make SVG text inherit the NOD Dashboard primary face (`Inter, system-ui, sans-serif`) by defining it at the SVG root so preview and exported SVG use the same font family as the application.
- Move lattice-tower foot labels outside the tower silhouette. Each label is placed to the projected left or right of its foot according to its horizontal relation to the tower center, with a short leader line; this prevents label overlap with steel legs and base plates. Monopole labeling remains unchanged.

## Non-Goals

- No changes to the Site ID API, antenna grouping, CID rules, persistence schema, validation rules, export formats, or tower dimensions.
- No complete language rewrite of existing engineering field labels.

## Verification

- Update Tower Plan contracts for the renamed copy, removal of obsolete metadata, moved prompt controls, Inter SVG font, and exterior foot-label geometry.
- Run the focused Tower Plan contracts, full frontend contract suite, lint, production build, and a browser check of the authenticated Tower Visualizer route.
