# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

# Project

FossFLOW — an isometric diagramming PWA and the React library behind it. npm workspaces monorepo, TypeScript throughout, Node >=18 / npm >=9.

## Layout

- `packages/` — all shipping code; see the workspace rail for the dependency direction
- `.settings/` — design and product specs (UI/UX reference, feature specs). Intent, not code; ships nothing
- `.beads/` — the beads issue tracker (`bd`, `ff-` prefix). Local-only: `bd init` excluded it via `.git/info/exclude`
- `.claude/` — Claude Code harness config. `settings.json` (hooks) and `skills/<name>/SKILL.md`, agent playbooks that operationalize a spec into a working procedure. A skill restates no rule it does not make actionable; the spec in `.settings/` stays the source of truth. Current: `skills/diagram-browser/` for epic `ff-b86`
- Root-owned docs: `README.md`, `CONTRIBUTORS.md`, `ISOFLOW_ENCYCLOPEDIA.md` (codebase tour), `ISOFLOW_TODO.md` (roadmap with code pointers), `LLM-GENERATION-GUIDE.md` + `icon-list-generation-guide.md` (compact JSON diagram format for LLM generation)
- Root-owned deploy surface: `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf`, `compose.yml` / `compose.dev.yml` / `compose.local.yml`, `.env.example`

## Work Tracking

Beads is the tracker — see the Beads Issue Tracker section below for commands. Project-specific rules:

- `bd list --label gui-overhaul` is the GUI overhaul. Children use hierarchical IDs (`ff-h3x.1` under epic `ff-h3x`).
- Every epic maps to exactly one spec in `.settings/features/`. Keep them in sync in the same session; drift between a spec and its epic is the failure this pairing exists to prevent.
- `ISOFLOW_TODO.md` is the legacy roadmap and predates beads. Don't add new work to it.

## Commands

Run from the repo root:

- `npm install` — install all workspaces
- `npm run build` — `build:lib` then `build:app`; the order is mandatory
- `npm run dev` — app dev server on :3000 (requires `npm run build:lib` at least once)
- `npm run dev:lib` / `npm run dev:backend` — watch lib / run backend
- `npm test`, `npm run lint` — `--workspaces --if-present`; only `fossflow-lib` defines either, so both cover the lib alone
- `npm run docker:build` / `npm run docker:run`

## Repo-Wide Rules

- TypeScript for all new code; no `any`; interfaces for component props
- Style is enforced by root `.eslintrc` (airbnb + airbnb-typescript + prettier) and `.prettierrc`: single quotes, semicolons, no trailing comma, printWidth 80, tabWidth 2
- `arrow-body-style: ["error", "always"]` — every arrow function needs an explicit `return`
- `no-param-reassign` is relaxed only for a variable named `draft` (immer)
- Shared compiler options live in `tsconfig.base.json`; every package tsconfig extends it
- Conventional commits (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`)
- `.nvmrc` says 16.19.0 and contradicts the `engines` floor of Node 18 and the Node 22 Docker images; trust `engines`

## CI

- `.github/workflows/docker.yml` — builds/pushes `stnsmith/fossflow` (amd64 + arm64) on push to main/master; PRs build without pushing
- `.github/workflows/pages.yml` — builds lib + app and deploys `packages/fossflow-app/build/` to GitHub Pages on main/master
- `.circleci/config.yml` — on `v*` tags only: `npm ci`, `npm run test`, `npm run build`, then publishes to npm
- `.github/workflows/ethicalcheck.yml` — third-party API scanner pointed at an unrelated external demo API; it tests nothing in this repo

## Verification

Run `npm run build` from the root — it is the only check that currently exercises this repo end to end. `npm test` and `npm run lint` reach only `fossflow-lib`, and `npm test` fails before running any test because `packages/fossflow-lib/jest.config.js` is not valid JavaScript. Treat a green `npm test` as impossible until that file is fixed.

## Child DOX Index

- `packages/AGENTS.md` — the workspace rail: the three packages, their dependency direction, and cross-package build order
- `.settings/AGENTS.md` — design and product specs: the authoritative UI/UX reference and one feature spec per beads epic

Root owns the deploy surface (Dockerfile, entrypoint, nginx, compose), CI, the shared lint/prettier/tsconfig baseline, and the root-level docs listed above. Everything under `packages/` is owned by the workspace rail and its children. Design intent is owned by `.settings/`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
