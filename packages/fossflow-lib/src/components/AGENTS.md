# components

## Purpose

Every React component in the library — the isometric canvas, its scene layers, and the whole editor UI.

## Ownership

Owns presentation and local component state. Owns no model mutation logic: components call `useScene()`, which dispatches reducers.

## Local Contracts

**Layout convention**: one PascalCase directory per component, containing an identically named `.tsx` (`Renderer/Renderer.tsx`, `UiOverlay/UiOverlay.tsx`). Child components live in a nested `components/` subfolder. Follow this exactly — the build and the absolute-import aliases assume it.

**The two halves**, composed by `Isoflow.tsx` as `<Renderer/>` + `<UiOverlay/>`:

- `Renderer/` — the diagram canvas
- `UiOverlay/` — the chrome on top of it

Both `Renderer/` and `SceneLayers/` contain `ConnectorLabels, Connectors, Nodes, Rectangles, TextBoxes`. Check which tree you are in before editing — the names repeat.

`ItemControls/` (the selection side panel) holds `ItemControlsManager.tsx` plus `ConnectorControls`, `IconSelectionControls`, `NodeControls`, `RectangleControls`, `TextBoxControls`, and shared `components/`.

Other top-level directories: Circle, ColorSelector, ConnectorHintTooltip, ContextMenu, Cursor, DebugUtils, DragAndDrop, ExportImageDialog, Grid, HelpDialog, HotkeySettings, IconButton, IsoTileArea, Label, Lasso, Loader, MainMenu, MarkdownEditor, PanSettings, SceneLayer, SettingsDialog, Svg, ToolMenu, TransformControlsManager, ZoomControls.

**Rules:**

- **Never write to a store directly.** Entity changes go through `useScene()` → reducers. Read state with a zustand selector, not the whole store.
- Positioning uses the projection helpers in `utils/renderer.ts` and the `useIsoProjection` hook — never hand-rolled isometric math. Tile-space vs screen-space is a real distinction; see the coordinate contract in the package doc.
- MUI is the component toolkit. **Raw values live in `src/styles/tokens.ts`; `src/styles/theme.ts` turns them into a theme via `createAppTheme(mode)`. A raw hex in a component is a bug.**
- **Both modes, every time.** Read the theme *reactively* — `useTheme()` or the `sx` callback form (`bgcolor: (theme) => ...`). The module-level `theme` export is light-mode-only and cannot follow a mode change; it exists for back-compat and for genuinely mode-independent data (`config.ts`'s default node colour).
- **Diagram content colours are data, not theme.** User-chosen node/connector colours must never invert with mode. Only chrome and canvas ground (`customPalette.diagramBg` / `gridLine`) respond.
- Props get an interface; no `any`; arrow functions need an explicit `return` (`arrow-body-style: ["error","always"]`).
- `MarkdownEditor/` wraps react-quill. Its editor root is `.ql-editor`, which the interaction layer special-cases to suppress hotkeys while typing — don't break that selector.
- `DebugUtils/` renders only when `enableDebugTools` is set, and is the one place with snapshot tests (`__tests__/__snapshots__/`).

## Work Guidance

- Known rough edges, left as-is unless you are fixing them deliberately: `SceneLayers/Connectors/Connector.tsx:100` — "the original x coordinates of each tile seems to be calculated wrongly"; `Lasso/Lasso.tsx:22` — commented-out TODO about enforcing at least one node in `getBoundingBox()`, and the Lasso mode is not registered in the interaction mode map.
- Prefer adding to an existing component directory over creating a near-duplicate; the `Renderer`/`SceneLayers` overlap is already confusing.

## Verification

The only component tests here are `DebugUtils/__tests__/` (with snapshots). `npm test` is green (18 suites, 99 tests). A theme change will churn the DebugUtils snapshots via emotion class hashes — verify the diff is only class names before running `jest -u`. See the package doc for why `npm run lint` is currently red for non-code reasons (`ff-kf6.6`).

Visual changes need manual review via `npm run dev:lib` + `npm run dev`, or the `src/examples/` playground (`BasicEditor`, `DebugTools`, `ReadonlyMode`).

## Child DOX Index

None. The subdirectories are components under the conventions above and need no separate contracts.
