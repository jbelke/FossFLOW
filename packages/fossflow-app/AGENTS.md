# fossflow-app

## Purpose

The FossFLOW Progressive Web App: a React shell around `<Isoflow>` from `fossflow-lib`, adding a toolbar, diagram persistence, import/export, icon loading, and offline support. Private, never published. Builds to static files in `build/` via rsbuild; served by nginx in Docker and by GitHub Pages at stan-smith.github.io/FossFLOW.

## Ownership

Owns the app shell, persistence policy, and the client half of the `/api` contract. It does not own diagram rendering or editing behavior — that is `fossflow-lib`.

## Local Contracts

- **Entry**: `index.tsx` mounts `<App/>` in StrictMode inside an `ErrorBoundary`, imports `fossflow/dist/styles.css` and `react-quill/dist/quill.snow.css`, registers the service worker. `App.tsx` (~740 lines) is the whole application.
- **Lib coupling**: imports `{ Isoflow }` from `fossflow` and `Model` from `fossflow/dist/types` — build output, not source. The lib must be built first (`npm run build:lib`).
- **Icons** come from `@isoflow/isopacks/dist/{isoflow,aws,azure,gcp,kubernetes}`, flattened at startup.
- **Persistence — two independent paths that do not share state. Know which one you are touching:**
  - `App.tsx` writes `localStorage` directly with hyphenated keys: `fossflow-diagrams`, `fossflow-last-opened`, `fossflow-last-opened-data`. This is what the toolbar Save and the 5s autosave use.
  - `services/storageService.ts` (`storageManager` singleton) serves the `DiagramManager` modal, choosing `ServerStorage` if `GET /api/storage/status` reports `enabled`, else `SessionStorage` with underscored keys `fossflow_diagram_<id>` / `fossflow_diagrams`.
- **Icons are stripped before persisting** (`icons: []`; autosave keeps only `collection === 'imported'`) to stay under quota, then re-merged with isopack icons on load. Preserve this whenever you add a save path.
- **Backend base URL is hardcoded** in `storageService.ts`: `http://localhost:3001` only when hostname is `localhost` *and* port is `3000`; otherwise relative `''` through the nginx `/api/` proxy. Running the dev server on any other port silently drops to session storage.
- Autosave debounces 5s and writes only `fossflow-last-opened-data`; `QuotaExceededError` alerts and opens `StorageManager`.
- `fossflowKey` is incremented to force-remount `<Isoflow>` after loads and imports.

## Work Guidance

- **UI work here is governed by `.settings/uiUX/uiUX.md`** — read it before touching any surface. It is authoritative on design decisions and locks the stack: MUI 5 + tokens from the lib, no Tailwind. This package currently has **no ThemeProvider** and sits entirely outside MUI; a GUI overhaul (`bd list --label gui-overhaul`) is planned to fix that. Until `ff-a0s.1` lands, the app cannot read a theme token.
- The two persistence paths documented above are a live hazard for that overhaul — one browser over two disjoint key schemes is a data-loss bug, not a styling bug. See `ff-b86.8`.
- **Diagram Browser work (epic `ff-b86`) has a skill: `.claude/skills/diagram-browser/SKILL.md`.** It owns this package's `src/components/` and carries the build order, the two blocking gates (`ff-b86.8` persistence, `ff-b86.1` thumbnails), and the acceptance list. Read it alongside this doc, not instead of it.
- The build is rsbuild, but CRA leftovers remain (`reportWebVitals.ts`, `serviceWorkerRegistration.ts`, `PUBLIC_URL`, `eslintConfig: react-app` in package.json). Don't add more; don't assume CRA tooling is available.
- Known dead code — delete on sight rather than extending: `usePersistedDiagram.ts`, `minimalIcons.ts`, `paymentFlowExample.json`, `validateDiagramData` in `diagramUtils.ts`. `src/env.d.ts` is empty.
- `react-quill`'s CSS is imported without a declared dependency here; it resolves only as a transitive dep of the lib.
- `App.tsx` — the load-on-mount effect depends on `[diagramData]`, so it re-runs on every change rather than once. Account for it before adding effects nearby.
- `PUBLIC_URL` drives `assetPrefix`; GitHub Pages sets it to the repo subpath.

## Verification

None exists. No tests, no test/lint/typecheck script — the root `--if-present` scripts skip this package, and `@testing-library/*` is installed but unused. `tsconfig.json` is `noEmit` but nothing invokes `tsc`.

Verify by hand from the repo root:

```bash
npm run build:lib && npm run dev      # :3000
npm run build:app                     # static build into build/
npx tsc --noEmit -p packages/fossflow-app   # typecheck (needs the lib built)
```

## Child DOX Index

None. `src/components/` and `src/services/` are a handful of files each and stay owned by this doc.
