# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and retained Manual Multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v20.56.25` |
| Git/package version | `20.56.25` |
| Documentation build | `v20.56.25` |
| Build name | `Final_Board_v20_56_25_continue_game_scope_lock` |
| Base build | `Final_Board_v20_56_24_canonical_modifier_tracker` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v20.56.25`. The repository version is in `package.json` as `20.56.25`. The browser title is `Sandbox v20.56.25`.

## Current release

v20.56.25 restores the agreed Continue Game contract for offline Single Player
Match Mode. Continue Game is available without a preceding Start New Game or
Prep/Ready acknowledgement: it starts from the current board if no tracked Match
exists, or resets canonical action/tracker state while preserving the board if a
Match exists. Start New Game remains the separately gated new-match path.
Manual Multiplayer retains its existing Continue availability. The development
workflow now treats every approved scope as a scope lock, including protected
behaviours that must not be changed without explicit approval.

v20.56.24 implements the canonical Single Player team modifier Tracker.
MatchState owns complete AV/AVM/DV/DVM tokens with same-tier cancellation,
per-team capacity, roll scope and expiry. The selected Tracker capacity is
persisted for future Matches and frozen in MatchContext at Match start.
Interception and Lofted Through retain their accepted AV/AVM behavior through
this model; existing formula-local modifiers remain local formula facts.
Tracker projects token rows beneath team actions and above turns. Timeline,
Undo/Redo, Replay and AI Export use the same canonical token state. Manual
Multiplayer and Firebase remain unchanged.

v20.56.12 established the Ready acknowledgement flow. v20.56.11 established
the underlying Prep and Selection Rules foundation. v20.56.10 is its
documentation-only contract base; v20.56.9 makes the assigned card the only
Single Player authority for a player's football role, while pucks remain neutral
board identities and formations are coordinate-only templates.

v20.56.8 is the immediately preceding documentation-only Penalty contract:
Match Penalty clearance, pure roll, goalkeeper catch, Natural effects, hidden
ordered shoot-out lists, coin toss, early finish and sudden death are defined.

The v20.52.5 audit accepts the Single Player Engine foundation: implemented mechanics are command-driven and testable without UI, MatchContext is frozen per active match, Timeline/Undo/Redo/Replay/AI Export share the canonical cursor state, Manual Multiplayer matches the v20.46.6 baseline, and Firebase has no newly introduced rule or deterministic-resolution logic. It does not reopen automated Multiplayer.

Older releases are summarized in [`docs/CHANGELOG.md`](docs/CHANGELOG.md). Their durable technical consequences live in the appropriate architecture and subsystem documents, not in this README.

## First time here?

Use this order before touching the project:

1. Read this README completely.
2. Read [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).
3. Read [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md).
4. For Match Mode work, read [`docs/GAME_ENGINE_ARCHITECTURE.md`](docs/GAME_ENGINE_ARCHITECTURE.md) and [`docs/GAME_ENGINE_MIGRATION_PLAN.md`](docs/GAME_ENGINE_MIGRATION_PLAN.md).
5. Read the permanent technical document for the system being changed.
6. Inspect the relevant code and tests.
7. Explain the proposed change and wait for approval before implementation.

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
  engine/       pure command-driven Game Engine kernel and gateway
  game/         shared game-state helpers
  match/        action resolution, continuations, delayed execution
  prep/         Single Player future-Match Prep panel
  multiplayer/  retained legacy authority, session Timeline and tracing
  rules/        Pass, Interception and Rule Set engines
  timeline/     Timeline, recording and AI Analysis export
  tracker/      turns, actions and Tracker state
  workspace/    future-Match setup snapshot and pure Workspace operations

docs/
  active architecture, rule and workflow contracts
  CHANGELOG.md
  NEXT_CHAT_PROMPT_v20_56_0.md
```

## Documentation roles

| Document | Authoritative role |
|---|---|
| [`DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Mandatory implementation, approval and release workflow. |
| [`ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) | Durable cross-system architectural decisions and invariants. |
| [`GAME_ENGINE_ARCHITECTURE.md`](docs/GAME_ENGINE_ARCHITECTURE.md) | MatchState, MatchContext, commands, Engine, Controller, Timeline and persistence boundaries. |
| [`GAME_ENGINE_MIGRATION_PLAN.md`](docs/GAME_ENGINE_MIGRATION_PLAN.md) | Open Single Player Game Engine migration checklist. |
| [`PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md`](docs/PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md) | Accepted final Single Player boundary audit; does not reopen Multiplayer. |
| [`PERSONAL_ACTION_LIMITS.md`](docs/PERSONAL_ACTION_LIMITS.md) | Permanent contract for per-player normal-action economy. |
| [`WORKSPACE_PERSISTENCE.md`](docs/WORKSPACE_PERSISTENCE.md) | Future-Match WorkspaceSnapshot and structural Workspace-operation boundary. |
| [`ACTION_RESOLUTION_ENGINE.md`](docs/ACTION_RESOLUTION_ENGINE.md) | Generic automated-action lifecycle. |
| [`INTERCEPTION_ENGINE.md`](docs/INTERCEPTION_ENGINE.md) | Interception resolver and its boundary with Pass. |
| [`PASS_AND_INTERCEPTION_RULES.md`](docs/PASS_AND_INTERCEPTION_RULES.md) | Player-rule contract for implemented Short Pass, Long Pass and Interception. |
| [`THROUGH_BALL_RULES.md`](docs/THROUGH_BALL_RULES.md) | Player-rule contract for implemented Through Ball. |
| [`LOFTED_THROUGH_BALL_RULES.md`](docs/LOFTED_THROUGH_BALL_RULES.md) | Player-rule contract for implemented Lofted Through Ball. |
| [`GAMEPLAY_RULES_FOUNDATIONS.md`](docs/GAMEPLAY_RULES_FOUNDATIONS.md) | Canonical shared board-game rules: proximity, possession, inactive state, reactions, result vocabulary and Offside. |
| [`CROSS_RULES.md`](docs/CROSS_RULES.md) | Canonical Cross rule: eligibility, interception order, Cross Claim, Aerial Duel and Header finalisation. |
| [`MODIFIERS_AND_TRACKER_RULES.md`](docs/MODIFIERS_AND_TRACKER_RULES.md) | Agreed future modifier capacity, cancellation, expiry and canonical Tracker contract. |
| [`FINALISATION_AND_RESTARTS_RULES.md`](docs/FINALISATION_AND_RESTARTS_RULES.md) | Agreed future result, restart, kick-off, score, wall, execution-order, Penalty and action-economy contract. |
| [`MARKING_RULES.md`](docs/MARKING_RULES.md) | Agreed future passive defensive tracking, Speed budget, fast exit and Marking-switch contract. |
| [`TACKLING_RULES.md`](docs/TACKLING_RULES.md) | Agreed future defensive action and reaction Tackling contract, including Marking delay, fouls and inactivity. |
| [`DRIBBLING_RULES.md`](docs/DRIBBLING_RULES.md) | Agreed future mandatory Dribbling, movement reorientation, inactivity and possession contract. |
| [`SHOOTING_RULES.md`](docs/SHOOTING_RULES.md) | Agreed future normal, direct-free-kick and direct-Corner Shot contract, including range, wall and goalkeeper rules. |
| [`TEAM_COMPOSITION_AND_FORMATIONS.md`](docs/TEAM_COMPOSITION_AND_FORMATIONS.md) | Canonical card-role authority, formation-coordinate contract and agreed future roster, substitutions and positional zones. |
| [`RULE_SETS_EDITOR.md`](docs/RULE_SETS_EDITOR.md) | Editable Rule Set schema and editor behavior. |
| [`GLOBAL_BACK_STATS.md`](docs/GLOBAL_BACK_STATS.md) | Global card-stat schema and card-local values. |
| [`MULTIPLAYER_ARCHITECTURE.md`](docs/MULTIPLAYER_ARCHITECTURE.md) | Frozen legacy automated-multiplayer model; reference only until reopening is approved. |
| [`MULTIPLAYER_CHANGELOG.md`](docs/MULTIPLAYER_CHANGELOG.md) | Historical Multiplayer fixes and rejected approaches. |
| [`CHANGELOG.md`](docs/CHANGELOG.md) | Compact release history. |
| [`NEXT_CHAT_PROMPT_v20_56_0.md`](docs/NEXT_CHAT_PROMPT_v20_56_0.md) | The one active handoff for a new chat. |

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

Automated Multiplayer is frozen during the Single Player migration. These tracing controls are retained only for the legacy Manual Multiplayer path:

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
