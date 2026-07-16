# FossFLOW UI / UX — Canonical Reference

**Status:** authoritative. When a design decision conflicts with existing code, this doc wins until updated. Read this before touching any UI surface.

**Stack decision (locked):** MUI 5 + Emotion + a real token layer. No Tailwind, no new UI runtime dependencies. The `fossflow` lib stays publishable to npm with an unchanged public API.

---

## The one-line product truth

FossFLOW is a canvas tool. **The diagram is the product; the UI is scaffolding.** Every pixel of chrome competes with the thing the user came to draw. When in doubt, remove chrome, don't add it.

---

## Persona

### Sam — infrastructure engineer / architect

Draws AWS/GCP/Azure/K8s topology to explain a system to other engineers. Lives in the canvas. Reaches for the chrome only to *start*, *find*, *save*, or *ship* a diagram — four moments, each currently ugly.

**Job:** _"Get me onto the canvas fast, keep me there, and never lose my work."_

**Emotion target:** _"This feels like a tool, not a demo."_

**Anti-patterns:**
- A metrics dashboard. There is nothing to measure here.
- Chrome that competes with the canvas for attention.
- A modal that traps them away from the diagram.
- Losing work to a `localStorage` quota with no warning.

---

## Current-state problems (the "why" of the overhaul)

Established by audit, 2026-07-15. These are the defects the overhaul exists to fix:

1. **Two unrelated design languages stacked vertically.** `fossflow-app` is raw CSS with Bootstrap-era hex (`#007bff`, `#28a745`, `#dc3545`) and inline `style={{backgroundColor:'#2196F3'}}` that doesn't even match its own CSS. `fossflow-lib` is MUI with `secondary.main: #df004c`. They share zero tokens.
2. **The app package has no `ThemeProvider`.** It lives entirely outside MUI, so it cannot see a token even if one existed.
3. **`theme.ts` is not a design system.** Only `secondary.main` is set; primary/background/text/error/warning/success are all MUI defaults. All 25 shadow levels are generated as `0px 10px 20px {i-10}px rgba(0,0,0,0.25)` — producing negative spreads. Spacing is never configured. `MuiToolbar` hardcodes `backgroundColor: 'white'`. `MuiSvgIcon` is hard-locked to 17×17, blocking any icon scale.
4. **No dark mode.** No `palette.mode`, no `prefers-color-scheme`, no toggle. A diagramming tool without dark mode is a 2026 defect.
5. **Three overlapping half-dashboards.** `DiagramManager` (server/local list), `App.tsx`'s Load dialog (a cruder second list over session `localStorage`), and `StorageManager` (a quota bar with no home). Same job, three implementations, two of them colliding on the same `.diagram-item` class name in globally-loaded CSS.
6. **Hand-rolled modals.** Four inline modals in `App.tsx` with no focus trap, no Esc, no `role="dialog"`, background not inert — next to a lib that already uses MUI `Dialog` correctly.
7. **Accessibility is effectively absent.** Six `aria-label`s repo-wide, **zero `role=`**, no `tabIndex`, no focus traps, no focus restoration. `window.confirm`/`alert` for every destructive flow.
8. **Zero responsive.** No `@media`, no `useMediaQuery`, no `theme.breakpoints` anywhere. `.dialog` is `min-width: 400px`; the toolbar is a non-wrapping 7-button flex row that overflows on narrow viewports.
9. **Positional selectors carry meaning.** `button:first-child` = confirm (blue), `:last-child` = cancel (grey) in `App.css`; same pattern in `DiagramManager.css` where first = Load (green), last = Delete (red). Reordering buttons silently changes their color and implied severity.
10. **Emoji as iconography** (🌐 📂 💾) in the app vs `@mui/icons-material` in the lib.

---

## Token contract

All tokens live in `packages/fossflow-lib/src/styles/tokens.ts` and are consumed **only** through `theme.*`. A raw hex in a component is a bug.

### Palette

Semantic names, never literal color names. Both modes must be defined for every token.

| Token | Role |
| --- | --- |
| `primary` | Primary action. One per surface, max. |
| `secondary` | FossFLOW brand accent (`#df004c` today — preserve it; it is the only existing brand equity). |
| `error` / `warning` / `success` / `info` | Status only. Never decoration. |
| `background.default` | App chrome background. |
| `background.paper` | Panels, cards, dialogs. |
| `customPalette.diagramBg` | The canvas itself (`#f6faff` light). **Must** get a dark-mode value — it is currently hardcoded. |
| `customPalette.defaultColor` | Default node color (`#a5b8f3`). |

### Rules

- **Contrast:** every text/background pair meets WCAG AA (4.5:1 body, 3:1 large/UI). Verify in **both** modes — a token that passes light and fails dark is not done.
- **Never** infer state from position. Severity is a prop (`color="error"`), not a `:last-child`.
- **Never** use color as the sole carrier of meaning — pair with an icon or label.
- **Spacing:** configure the scale explicitly. Consume via `theme.spacing(n)`. Never re-parse `theme.spacing()` back into an int (as `UiOverlay.tsx:60-65` does today).
- **Shadows:** hand-author the levels actually used; delete the generated negative-spread ramp.
- **Elevation is semantic:** canvas (0) < floating panel (1) < menu (2) < dialog (3). Don't reach past what the layer means.

### Dark mode

- `palette.mode` driven by `prefers-color-scheme`, with an explicit user override persisted to `localStorage`.
- The canvas (`diagramBg`) and grid must both adapt. A light canvas in a dark shell is worse than no dark mode.
- Diagram *content* colors (node/connector colors chosen by the user) are **data, not theme** — they do not invert. Only chrome and canvas ground respond to mode.

---

## Layout & IA

The app boots **straight to the canvas** with the last-opened diagram. That is correct — do not add a landing route or an interstitial.

```
┌─────────────────────────────────────────────┐
│  AppBar: [☰] Diagram name ·edited  [⌘K] [◐] │  ← app shell (fossflow-app)
├─────────────────────────────────────────────┤
│                                             │
│              CANVAS + UiOverlay             │  ← lib, owns its own chrome
│         (ToolMenu, MainMenu, Zoom,          │
│          ItemControls, ContextMenu)         │
│                                             │
└─────────────────────────────────────────────┘

Diagram Browser  → overlay surface, ⌘O / hamburger. NOT a route.
```

### Ownership boundary — do not blur this

- **`fossflow-app` owns:** the AppBar, the Diagram Browser, storage/persistence UI, import/export, theme mode toggle.
- **`fossflow-lib` owns:** everything inside the canvas — `UiOverlay` and its children, and the theme/token definitions it exports.
- The lib **exports** the theme; the app **consumes** it. Tokens flow one direction: lib → app. The app never redefines a token.

---

## The Diagram Browser

Replaces all three half-dashboards (`DiagramManager`, App's Load dialog, `StorageManager`) with one surface.

- **Not** a route, **not** a dashboard. An overlay the user opens, acts in, and leaves.
- Grid of cards by default; list view for density. Persist the choice.
- Card: **thumbnail preview**, name, last-modified (relative: "2 hours ago"), size, storage-source badge (server/local).
- Search by name. Sort by modified/name/size.
- Storage quota lives **here**, as a quiet bar — surfaced at the moment it's relevant, not in its own orphan modal. Escalates to `warning` at 80%, `error` at 95%. Never a silent failure.
- Empty state does the real work: it's a new user's first screen. Offer "New diagram" and "Import" — never a bare "No diagrams found."
- Destructive actions get an MUI confirmation dialog with the diagram **name** in the body. Never `window.confirm`.

## Dialogs

One system: MUI `Dialog`. Delete every hand-rolled `.dialog-overlay`.

Non-negotiable per dialog: focus trap, Esc to close, focus restored to the invoking control, `role="dialog"` + `aria-labelledby`, background inert, `fullScreen` below `sm`.

Action order is fixed: **cancel left, confirm right.** Severity via `color`, never position.

## Voice

- Plain, technical, calm. Sam is an engineer.
- Say what happened and what to do: _"Couldn't save — local storage is full. Export a diagram or delete one to free space."_ Never _"An error occurred."_
- Never invent state. If save status is unknown, say "Unknown," not "Saved."
- **Be honest about persistence.** The current "Save (Session Only)" nag is ugly but truthful. Keep the truth, fix the presentation — a storage-source badge, not a parenthetical apology in a button label.
- No emoji in UI copy or as icons. Use `@mui/icons-material`.

---

## Responsive

Mobile-first is wrong here (nobody draws isometric infra diagrams on a phone), but **breaking** on a laptop is also wrong.

| Breakpoint | Behavior |
| --- | --- |
| `< sm` | Canvas is view/pan only. AppBar collapses to overflow menu. Dialogs go `fullScreen`. Don't pretend editing works. |
| `sm–md` | Toolbar wraps or overflows. ItemControls becomes a bottom sheet (currently hardcoded `width: 360px`). |
| `≥ md` | Full layout as designed. |

Consume `theme.breakpoints` / `useMediaQuery`. Never a bare `@media` in a CSS file.

## Accessibility — the floor, not the goal

- Every interactive element: reachable by keyboard, visible focus ring, accessible name.
- **Restore the MUI ripple**, or supply an equally clear press affordance. It is currently disabled globally in `theme.ts:93-105`, removing a default interaction cue for free.
- The canvas gets a documented keyboard story or an honest, labeled escape hatch. Hotkeys (`config/hotkeys.ts`) are *tool* input, not UI navigation — they are not a substitute.
- `prefers-reduced-motion` respected for all GSAP/transition work.
- No new `role`-less interactive `div`s. Ever.

---

## Authoring rules

1. **Canvas first.** Before adding chrome, ask: does this earn its pixels against the diagram? If not, cut it.
2. **Token second.** No raw hex, no magic numbers. If a token doesn't exist, add it to `tokens.ts` — don't inline it.
3. **Reuse third.** `UiElement` (floating panel) and `IconButton` are the shared primitives. Add a new primitive only when nothing fits.
4. **A11y is not a follow-up task.** A PR that adds an inaccessible control is not done, regardless of what the beads issue says.
5. **Both modes, every time.** Light and dark are one deliverable, not two.
6. **Never invent state in UI copy.** Unknown is a legitimate, shippable value.

---

## File-level breadcrumbs

- Design decisions + tokens: this file.
- Feature specs: `.settings/features/feature-*.md`.
- Agent playbooks: `.claude/skills/<name>/SKILL.md` — a spec turned into a procedure. `diagram-browser` covers epic `ff-b86`. Specs lead; a skill that contradicts this file is the one that's wrong.
- Work tracking: `bd list --label gui-overhaul` (beads, `ff-` prefix).
- Codebase tour: `ISOFLOW_ENCYCLOPEDIA.md`.
- DOX contract: root `AGENTS.md` and the nearest child.
