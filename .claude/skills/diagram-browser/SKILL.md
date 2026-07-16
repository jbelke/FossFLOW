---
name: diagram-browser
description: Build the FossFLOW Diagram Browser — the overlay surface that replaces DiagramManager, App's Load dialog, and StorageManager (epic ff-b86). Use for any work on diagram listing, cards, thumbnails, search/sort, storage quota UI, or the grid/list toggle. Also use when asked for a "dashboard" for this project — the canonical design doc rejects a dashboard; this is the surface that job actually belongs to.
---

# Diagram Browser

The headline user-facing win of the GUI overhaul. One overlay surface replacing three
half-dashboards.

## Before you write any code

1. **Read `.settings/uiUX/uiUX.md` in full.** It is authoritative — it wins over existing
   code until updated. Everything below assumes it.
2. **Read `.settings/features/feature-diagram-browser.md`** — the feature spec and its
   acceptance list.
3. **Walk the DOX chain** to every file you intend to touch: root `AGENTS.md` → each
   `AGENTS.md` between root and the target. Re-read them this session; do not rely on
   memory. See "DOX pass" below for the exit obligation.
4. **`bd ready`** and claim a bead under epic `ff-b86`. Never TodoWrite, never a markdown
   TODO — this repo tracks work in beads.

## It is not a dashboard

If the request says "dashboard," resist the frame. `uiUX.md` lists "a metrics dashboard"
as an explicit anti-persona-goal: *there is nothing to measure here.* The product truth is
**the diagram is the product; the UI is scaffolding.**

The Browser is:
- **Not a route.** The app boots straight to the canvas with the last-opened diagram
  (`App.tsx:63-91`). Do not add a landing page or interstitial.
- **An overlay** the user opens (⌘O / hamburger), acts in, and leaves.
- **Not a stats surface.** The storage quota bar is the only number, and it lives here only
  because this is the moment it becomes relevant.

## What it replaces

All three are deleted (or reduced to the new surface) by `ff-b86.7`:

| File | What it is |
| --- | --- |
| `packages/fossflow-app/src/components/DiagramManager.tsx:121-217` + its 237-line CSS | Closest fit. Server/local modal list. |
| `packages/fossflow-app/src/App.tsx:607-644` | A second, cruder list over session `localStorage`. |
| `packages/fossflow-app/src/components/StorageManager.tsx` | Quota bar, 100% inline styles, hardcoded ~5MB (`:82`). |

`DiagramManager.css` and `App.css` both define `.diagram-item` differently and both load
globally — a live collision. Zero duplicate definitions is an acceptance criterion.

## Two hard gates — check both before building

### 1. Persistence (`ff-b86.8`, P0) — this one is a data-loss bug, not a styling bug

The three half-dashboards sit on **two persistence paths that do not share state**:

- `App.tsx` writes `localStorage` directly with **hyphenated** keys — `fossflow-diagrams`,
  `fossflow-last-opened`, `fossflow-last-opened-data`. This backs the toolbar Save and the
  5s autosave.
- `services/storageService.ts` (`storageManager` singleton) backs the `DiagramManager`
  modal — `ServerStorage` if `GET /api/storage/status` reports enabled, else
  `SessionStorage` with **underscored** keys `fossflow_diagram_<id>` / `fossflow_diagrams`.

Merging the UI without merging the data yields a browser that lists a diagram which Save
silently writes somewhere else. **One persistence contract must back the Browser**, with the
key schemes reconciled or explicitly bridged by a migration for existing users' saved
diagrams.

Preserve two behaviors in any unified save path:
- **Icons are stripped before persisting** (`icons: []`; autosave keeps only
  `collection === 'imported'`) and re-merged with isopack icons on load. Drop this and you
  blow the ~5MB quota.
- `storageService.ts` hardcodes `http://localhost:3001` **only** when hostname is
  `localhost` *and* port is `3000`. Any other port silently drops to session storage.

### 2. Thumbnails (`ff-b86.1`) — blocks the card

**Do not start the card component (`ff-b86.3`) until spike `ff-b86.1` records a decision.**
This is the one real unknown and a wrong answer either blows the ~5MB storage quota or
janks the open. `ExportImageDialog` already does canvas→PNG via `dom-to-image` and is the
obvious source, but generating N previews on open will not scale. The three candidates
(generate-on-save / lazy+cache / deterministic placeholder for v1) are in the bead. Check
it first; if it's still open, do the spike or say so — don't guess and build.

## Where the code goes, and the split that will bite you

**Owner surface: `packages/fossflow-app/src/components/`.**

The two packages are different worlds:

- **`fossflow-lib`** has MUI 5, emotion, `theme.customVars`, and zustand. Styling is the
  `sx` prop — no `styled()`, no CSS modules, no co-located style files.
- **`fossflow-app` has no MUI dependency at all** and no `ThemeProvider`. It is raw CSS
  with Bootstrap-era hex.

So the Browser lands in the package that currently lacks the infrastructure it needs.
`ff-a0s.1` (mount the lib ThemeProvider at the app root) and the token epic `ff-h3x` are
its real prerequisites. **Check they've landed before building.** If they haven't, you are
either blocked or doing them first — not writing another raw-CSS surface.

Tokens flow one direction: **lib exports the theme, app consumes it.** The app never
redefines a token. A raw hex in a component is a bug.

## Conventions that are not optional

Component layout (from `packages/fossflow-lib/src/components/AGENTS.md`, and the app should
match): one PascalCase directory per component holding an identically named `.tsx` —
`DiagramBrowser/DiagramBrowser.tsx`. Child components in a nested `components/` subfolder.
**No barrel `index.ts` files exist** — import by full path.

Imports in the lib are absolute from `src/` (`tsconfig` `baseUrl: "./src"`):

```tsx
import { useUiStateStore } from 'src/stores/uiStateStore';
import { IconButton } from 'src/components/IconButton/IconButton';
```

Named exports only. Props interfaces are named literally `interface Props`. No `any`.

**`arrow-body-style: ["error", "always"]`** — every arrow function needs an explicit
`return`, including one-line zustand selectors. This is the loudest lint tell in the repo:

```tsx
const mode = useUiStateStore((state) => { return state.mode; });
```

Prettier: single quotes, semicolons, **no trailing comma**, printWidth 80, tabWidth 2.
Conventional commits (`feat:`, `fix:`, `refactor:`).

Store rules: always read through a selector, never grab the whole store. **Never write to a
store from a component** — entity changes go through `useScene()` → immer reducers, which
mutate only a variable named `draft`. Transient UI state (the grid/list choice, search
query) belongs in `uiStateStore`.

Reuse before you add: `UiElement` (floating panel) and `IconButton` are the shared
primitives. `packages/fossflow-lib/src/components/ItemControls/components/Section.tsx` is
the structural precedent for a multi-section panel — note its `sx?: SxProps` passthrough.

## The invariants you cannot ship without

From `uiUX.md`, all of these are per-PR, not follow-up work:

- **Both modes, every time.** Light and dark are one deliverable. Every text/background
  pair meets WCAG AA (4.5:1 body, 3:1 large/UI) in *both*.
- **Dialogs**: MUI `Dialog` only. Focus trap, Esc, focus restored to the invoking control,
  `role="dialog"` + `aria-labelledby`, background inert, `fullScreen` below `sm`. Delete
  every hand-rolled `.dialog-overlay`. Cancel left, confirm right — always.
- **Never `window.confirm`/`alert`.** Delete → named confirmation dialog carrying the
  diagram's actual name in the body.
- **Never infer state from position.** Severity is a prop (`color="error"`), never a
  `:first-child`/`:last-child` rule. `App.css` and `DiagramManager.css` both do this today;
  don't carry it forward.
- **Never color alone.** Pair with an icon or label.
- **No emoji.** The app uses 🌐 📂 💾 today; use `@mui/icons-material`.
- **No role-less interactive `div`s.** Ever. Keyboard-reachable, visible focus ring,
  accessible name on every control.
- **Responsive via `theme.breakpoints` / `useMediaQuery`**, never a bare `@media`. Usable at
  320px.

## Voice

Plain, technical, calm — Sam is an infrastructure engineer. Say what happened and what to
do: *"Couldn't save — local storage is full. Export a diagram or delete one to free space."*
Never *"An error occurred."*

**Never invent state.** If save status is unknown, say "Unknown." The quota's ~5MB figure is
a guess — if it can't be measured via the StorageManager API, label it as a guess. Never a
silent failure at the cap.

The empty state does real work — it's a new user's first screen. Offer "New diagram" and
"Import," never a bare "No diagrams found."

## Verifying

**`npm test` cannot run.** `packages/fossflow-lib/jest.config.js` is not valid JavaScript
(missing comma, duplicate keys) and dies before executing a test. That's bead `ff-kf6.1`. A
green test run is impossible until it's fixed — don't claim one.

The real checks:

```bash
npm run build:lib   # MANDATORY at least once — the app imports fossflow/dist, not src
npm run dev         # app on :3000
npm run dev:lib     # webpack --watch on the lib
npm run build       # build:lib then build:app; order is mandatory
```

`npm run lint` (lib only) is `tsc --noEmit && eslint`. **`npm run build` green is an
acceptance criterion.**

Lib source edits are invisible to the app until the lib rebuilds — `App.tsx` imports
`{ Isoflow }` from `fossflow`, i.e. build output. If a change "didn't apply," this is why.

Visual review is manual: `npm run dev:lib` + `npm run dev`, or the
`packages/fossflow-lib/src/examples/` playground. There is no storybook and no visual
regression setup.

**Docker: never map to port 3000.** The frontend treats `localhost:3000` as a dev server and
calls `localhost:3001` directly, bypassing the proxy — silently downgrading the app to
session-only storage. `compose.local.yml` defaults to 4000.

## Acceptance (from the feature spec)

- The three superseded surfaces are deleted or reduced to the new one.
- One persistence contract backs the Browser; no diagram is visible that Save cannot write
  to. Icon-stripping preserved.
- Zero duplicate `.diagram-item` definitions.
- Server and local storage both work, visibly distinguished by badge.
- Search, sort, and grid/list toggle work; the view choice persists.
- Quota shown honestly; never a silent failure at the cap.
- Empty state offers actions.
- Full keyboard operation; usable at 320px.
- Light and dark both correct.
- `npm run build` green.

## DOX pass — the work isn't done without it

Every meaningful change requires updating the closest owning `AGENTS.md` when it affects
purpose, scope, structure, contracts, or operating rules. Refresh affected Child DOX
Indexes; delete stale text. Then the session-close protocol: close the bead, commit
(conventional message), `git pull --rebase`, **`git push`**. Work is not complete until the
push succeeds.
