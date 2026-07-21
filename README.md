# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and host/guest multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v20.7` |
| Git/package version | `20.7.0` |
| Build name | `Final_Board_v20_7_multiplayer_action_start_authority_fix` |
| Base build | `v20.6` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v20.7`. The repository version is defined in `package.json` as `20.7.0`. The browser title is `Sandbox v20.7`.

## v20.7 release summary

v20.7 closes the remaining optimistic guest writes at the beginning of repeated Bonus Action chains.

- Guest action starts use semantic `actionStartIntent` requests.
- The host validates ownership, piece, action type, continuation identity, canonical revision, active-resolution compatibility, and possession.
- Bonus Action Pass starts atomically as `BONUS_PASS_TARGETING_STARTED`.
- Stale action-start requests are rejected and transient guest UI is restored from canonical Timeline state.
- Invalid `before.tracker` references in interception branches were corrected.
- Regression coverage protects repeated Natural 20 → Bonus Action → Pass chains.

See [`docs/MULTIPLAYER_CHANGELOG.md`](docs/MULTIPLAYER_CHANGELOG.md) for release history and [`docs/MULTIPLAYER_ARCHITECTURE.md`](docs/MULTIPLAYER_ARCHITECTURE.md) for the current authority model.

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
- [`MULTIPLAYER_CHANGELOG.md`](docs/MULTIPLAYER_CHANGELOG.md): historical multiplayer fixes from v20.1 through v20.7.
- [`ACTION_RESOLUTION_ENGINE.md`](docs/ACTION_RESOLUTION_ENGINE.md): generic action-resolution lifecycle.
- [`INTERCEPTION_ENGINE.md`](docs/INTERCEPTION_ENGINE.md): interception resolver and its boundary with Pass.
- [`RULE_SETS_EDITOR.md`](docs/RULE_SETS_EDITOR.md): editable rules, schema and runtime effects.
- [`GLOBAL_BACK_STATS.md`](docs/GLOBAL_BACK_STATS.md): global card-stat schema and per-card values.

## Mandatory development rules

Before changing code:

1. Read this README.
2. Read `docs/DEVELOPMENT_WORKFLOW.md`.
3. Read the system document relevant to the feature.
4. Read `docs/ARCHITECTURE_DECISIONS.md` before changing architectural boundaries.
5. For multiplayer work, read both multiplayer documents.

Do not create one documentation file per patch. Update the current system document and append the release entry to the appropriate changelog. Add a new document only for a genuinely independent subsystem.

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
- current-system documentation updates;
- changelog/history entry;
- tests and production build where the environment permits them;
- no `node_modules`, `dist`, temporary files or secrets in the release archive.
