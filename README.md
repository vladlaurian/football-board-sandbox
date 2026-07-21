# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and host/guest multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v20.16.0` |
| Git/package version | `20.16.0` |
| Build name | `Final_Board_v20_16_0_single_player_move_workflow_unification` |
| Base build | `v20.15.0 single_player_progressive_move` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v20.16.0`. The repository version is defined in `package.json` as `20.16.0`. The browser title is `Sandbox v20.16.0`.

## v20.16.0 release summary

v20.16.0 unifies the two offline Single Player entrances to normal MOVE. Confirming a direct board move no longer updates Tracker or Timeline through the old Auto Move mutation path. Instead, the Controller evaluates `NORMAL_MOVE_STARTED` and the first `NORMAL_MOVE_COMMITTED` as one unpublished sequence, then publishes both Engine-produced Timeline entries only if both succeed. Card-started MOVE and board-started MOVE therefore produce the same canonical state, including the progressive turn-scoped `moveAuthorized` right. The confirmation modal remains UI-only. Manual multiplayer and the legacy session path remain unchanged. The Cancel MOVE cursor no longer falsely appears blocked merely because the Tracker action limit is reached.

## v20.15.0 release summary

v20.15.0 restores the intended progressive normal-MOVE rule for offline Single Player. One Tracker MOVE action grants `moveAuthorized` for the rest of the active team phase. The player may then make any number of legal movement segments without extra Tracker consumption, while the Engine preserves the first movement axis and total Speed budget. `activeMovement` remains only the temporary pre-first-move interaction that supports Cancel/refund. Once a physical segment exists, the existing authorization remains until the normal turn reset; there is no End Move command. Manual multiplayer, Auto Move, 3/2, Free Move, Group Move, and Bonus Move are unchanged.

## v20.14.1 release summary

v20.14.1 fixes the v20.14.0 offline Auto Move regression: selecting a player and clicking a legal destination directly on the board again follows its unchanged pre-Engine Auto Move path after confirmation. The Phase 3 Engine interception now applies only to normal MOVE commits that were started through `NORMAL_MOVE_STARTED`; it no longer intercepts Auto Move's legacy authorization override. This restores the board-click flow without migrating or changing Auto Move rules. Manual multiplayer remains unchanged.

## v20.14.0 release summary

v20.14.0 completes Phase 3: offline Match Mode normal MOVE now dispatches `NORMAL_MOVE_STARTED`, `NORMAL_MOVE_CANCELLED`, and `NORMAL_MOVE_COMMITTED` through the pure Game Engine and Single Player Controller. The Engine owns Tracker activation/refund, normal-move legality, Speed cost, ball carry, movement-state update, and active-movement closure. A compact frozen MatchContext is created when a new offline tracked match starts, so its card-derived Speed values cannot change during the match. Existing manual multiplayer/Firebase MOVE paths, Editor Mode, Free Ball, Auto Move, Free Move, Group Move, 3/2, and Bonus Move remain unchanged.

## v20.13.0 release summary

v20.13.0 completes Phase 2: offline Match Mode Free Ball now dispatches `FREE_BALL_MOVED` through the Single Player Controller and pure Game Engine, then records the engine event in Timeline before React renders the result. The existing `BALL_MOVED` / `movementReason: "FREE_BALL"` Timeline and AI-export semantics are preserved. Editor Mode and Manual Multiplayer retain their existing paths; Firebase and automated multiplayer are unchanged.

## v20.12.0 release summary

v20.12.0 created the Phase 1 pure Game Engine kernel, including the command, event, and MatchContext contracts plus deterministic `FREE_BALL_MOVED` tests.

## Game Engine migration foundation

Automated multiplayer development is frozen while the project builds a command-driven, pure Game Engine for Single Player. Manual multiplayer remains unchanged. Match Mode will use one canonical MatchState, immutable per-match MatchContext, engine-owned transitions, and Timeline as canonical history.

Read these documents before proposing Match Mode, Timeline, Replay, AI Export, Game Engine, Controller, or future automated multiplayer work:

1. [`docs/GAME_ENGINE_ARCHITECTURE.md`](docs/GAME_ENGINE_ARCHITECTURE.md)
2. [`docs/GAME_ENGINE_MIGRATION_PLAN.md`](docs/GAME_ENGINE_MIGRATION_PLAN.md)

## v20.11.6 release summary

v20.11.6 stabilizes Guest Inspector reconciliation for canonical MOVE and PASS interactions. The Inspector now anchors to the canonical active piece, preserves the requested piece during the Guest-to-Host handoff, and does not let a volatile local selection clear or replace the active gameplay card. This removes the card flicker at PASS start, keeps the passer card open after target selection, and keeps the MOVE card open while Cancel Move is available. Gameplay authority and action engines are unchanged.

## v20.11.5 release summary

v20.11.5 is a narrow Guest `END BA` authority fix built on v20.11.4. The Host-side validator now accepts the canonical `action-active` continuation state, matching the existing continuation engine, so a Guest may end a Bonus Action after a partial Bonus Move. MOVE, PASS, card-selection reconciliation, and all other gameplay flows are unchanged in this build.

## First time here?

Use this order before touching the project:

1. Read this README completely.
2. Read [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).
3. Read [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md).
4. For Match Mode work, read [`docs/GAME_ENGINE_ARCHITECTURE.md`](docs/GAME_ENGINE_ARCHITECTURE.md) and [`docs/GAME_ENGINE_MIGRATION_PLAN.md`](docs/GAME_ENGINE_MIGRATION_PLAN.md).
5. Read the permanent technical document for the system being changed.
6. Inspect the relevant code and tests.
7. Explain the proposed change and wait for approval before implementation.

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
  engine/       pure command-driven Game Engine kernel
  match/        action resolution, continuations, delayed execution
  multiplayer/  authority checks, session Timeline, tracing
  rules/        Pass, Interception and Rule Set engines
  timeline/     Timeline, recording and AI Analysis export
  tracker/      turns, actions and Tracker state

docs/
  ACTION_RESOLUTION_ENGINE.md
  ARCHITECTURE_DECISIONS.md
  DEVELOPMENT_WORKFLOW.md
  GAME_ENGINE_ARCHITECTURE.md
  GAME_ENGINE_MIGRATION_PLAN.md
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
- [`MULTIPLAYER_CHANGELOG.md`](docs/MULTIPLAYER_CHANGELOG.md): historical multiplayer fixes from v20.1 through v20.11.6.
- [`ACTION_RESOLUTION_ENGINE.md`](docs/ACTION_RESOLUTION_ENGINE.md): generic action-resolution lifecycle.
- [`INTERCEPTION_ENGINE.md`](docs/INTERCEPTION_ENGINE.md): interception resolver and its boundary with Pass.
- [`RULE_SETS_EDITOR.md`](docs/RULE_SETS_EDITOR.md): editable rules, schema and runtime effects.
- [`GLOBAL_BACK_STATS.md`](docs/GLOBAL_BACK_STATS.md): global card-stat schema and per-card values.
- [`GAME_ENGINE_ARCHITECTURE.md`](docs/GAME_ENGINE_ARCHITECTURE.md): permanent MatchState, MatchContext, command, Engine, Controller, Timeline, and persistence contract.
- [`GAME_ENGINE_MIGRATION_PLAN.md`](docs/GAME_ENGINE_MIGRATION_PLAN.md): temporary OPEN execution checklist for the Single Player Game Engine migration.

## Mandatory development rules

- Inspect before proposing; explain before implementing; implement only after approval.
- Once approved, execute without repeating the plan or asking for another confirmation.
- Do not alter game design, rules, architecture, stable systems, or unrelated code unless explicitly approved.
- A newly discovered bug is reported, not silently fixed inside another task.
- Fix root causes; do not layer new code over failed or obsolete implementations.
- One fact has one authoritative documentation home. Other files link to it instead of duplicating it.
- Do not create one document per patch. Update the permanent system document and the appropriate changelog.
- Every Match Mode change must be reviewed for Timeline and AI Analysis Export semantics.
- Game Engine migration is command-driven: UI, Controller, timers, Firebase, and multiplayer adapters must not directly mutate or independently validate Match Mode gameplay state.
- Active matches use frozen gameplay card and Rule Set context; later Editor changes apply to future matches only.

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

Active gameplay interaction is derived from canonical Timeline state rather than authored by local selection. The canonical active piece is presentation data only and must never replace `selectedId` in generic board input. Pass, Bonus Action, and Free Move reconstruct their active-piece highlight locally on both host and guest. `CANCEL PASS` and `END B.A.` execute from canonical action state while retaining their familiar Inspector-card placement.
