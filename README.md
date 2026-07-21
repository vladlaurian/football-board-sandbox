# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and host/guest multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v20.9` |
| Git/package version | `20.9.0` |
| Build name | `Final_Board_v20_9_guest_free_tools_authority` |
| Base build | `v20.8` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v20.9`. The repository version is defined in `package.json` as `20.9.0`. The browser title is `Sandbox v20.9`.

## v20.9 release summary

v20.9 makes guest Free Move and Free Ball host-authoritative, restores one-shot Free Ball behavior in Match Mode, prevents normal ball selection in Match Mode, and formalizes release archive and post-build reporting rules.

## First time here?

Use this order before touching the project:

1. Read this README completely.
2. Read [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).
3. Read [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md).
4. Read the permanent technical document for the system being changed.
5. Inspect the relevant code and tests.
6. Explain the proposed change and wait for approval before implementation.

After approval, implement immediately. Do not repeat the plan, request approval again, or stop at an acknowledgement.

## Quick start

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm test
```

## Project map

```text
src/
  board/        board rendering, geometry, formations, movement state
  cards/        card rendering and gameplay-card projection
  game/         shared game-state helpers
  match/        action resolution, continuations, delayed execution
  multiplayer/  authority checks, session Timeline, tracing
  rules/        Pass, Interception and Rule Set engines
  timeline/     Timeline, recording and AI Analysis export
  tracker/      turns, actions and Tracker state

docs/
  ACTION_RESOLUTION_ENGINE.md
  ARCHITECTURE_DECISIONS.md
  DEVELOPMENT_WORKFLOW.md
  GLOBAL_BACK_STATS.md
  INTERCEPTION_ENGINE.md
  MULTIPLAYER_ARCHITECTURE.md
  MULTIPLAYER_CHANGELOG.md
  RULE_SETS_EDITOR.md
```

## Documentation roles

- [`DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md): mandatory implementation and release workflow.
- [`ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md): permanent architectural decisions and invariants.
- [`MULTIPLAYER_ARCHITECTURE.md`](docs/MULTIPLAYER_ARCHITECTURE.md): current multiplayer model, intent flows, authority boundaries, cleanup rules, and open storage refactor.
- [`MULTIPLAYER_CHANGELOG.md`](docs/MULTIPLAYER_CHANGELOG.md): historical multiplayer fixes from v20.1 through v20.9.
- [`ACTION_RESOLUTION_ENGINE.md`](docs/ACTION_RESOLUTION_ENGINE.md): generic action-resolution lifecycle.
- [`INTERCEPTION_ENGINE.md`](docs/INTERCEPTION_ENGINE.md): interception resolver and its boundary with Pass.
- [`RULE_SETS_EDITOR.md`](docs/RULE_SETS_EDITOR.md): editable rules, schema and runtime effects.
- [`GLOBAL_BACK_STATS.md`](docs/GLOBAL_BACK_STATS.md): global card-stat schema and per-card values.

## Mandatory development rules

- Inspect before proposing; explain before implementing; implement only after approval.
- Once approved, execute without repeating the plan or asking for another confirmation.
- Do not alter game design, rules, architecture, stable systems, or unrelated code unless explicitly approved.
- A newly discovered bug is reported, not silently fixed inside another task.
- Fix root causes; do not layer new code over failed or obsolete implementations.
- One fact has one authoritative documentation home. Other files link to it instead of duplicating it.
- Do not create one document per patch. Update the permanent system document and the appropriate changelog.
- Every Match Mode change must be reviewed for Timeline and AI Analysis Export semantics.

The complete contract is in [`DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

## Core invariants

- Timeline is the canonical gameplay history used by Undo/Redo, replay, multiplayer hydration and analysis export.
- In multiplayer, the host publishes canonical gameplay transitions; guests send typed semantic intents.
- Shared resolution state does not grant shared UI control. Interactive controls require ownership of the active team.
- Transient UI state is never canonical gameplay state and must be cleared on rejection, rollback, Undo, Redo and resync.
- One logical gameplay action should produce one atomic canonical transition whenever an intermediate state would be invalid.
- Match Mode changes must be reviewed for Timeline semantics and AI Analysis export.
- Editor, Inspector and PNG export must continue to share the same card-rendering source.

## Multiplayer debugging

Enable structured multiplayer tracing with one of:

```js
window.DEBUG_MULTIPLAYER = true
window.__DEBUG_MULTIPLAYER__ = true
localStorage.setItem("DEBUG_MULTIPLAYER", "true")
```

Reload after setting `localStorage`. Logs are emitted under `[MultiplayerTrace]`.

## Release checklist

Every build must record and verify:

- visible Sandbox version in `src/main.jsx`;
- browser title in `index.html`;
- Git/package version in `package.json`;
- build name and base build in this README;
- relevant permanent documentation updates;
- changelog/history entry when behavior or implementation changed;
- relevant tests, full available tests, and production build where the environment permits them;
- unchanged hashes for code files in a documentation-only build;
- no `node_modules`, `dist`, temporary files, logs, caches, package lock, or secrets in the release archive.

A version is not considered updated until the Sandbox label, browser title, package version, README record, and archive name agree. Documentation-only consolidation may retain the application version when no runtime behavior changes, but the README build name and base build must still identify the delivered archive accurately.

### v20.10 — Interaction Layer Refactor

Active gameplay interaction is now derived from canonical Timeline state instead of depending on local selection or Inspector state. Pass, Bonus Action, and Free Move reconstruct their active piece locally on both host and guest. `CANCEL PASS` and `END B.A.` are canonical interaction controls and remain available independently of which card is inspected.
