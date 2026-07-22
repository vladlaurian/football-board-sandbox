# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and host/guest multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v20.28.0` |
| Git/package version | `20.28.0` |
| Build name | `Final_Board_v20_28_0_dice_access_pass_roll_engine` |
| Base build | `v20.27.0 pass_interceptor_choice_engine` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v20.28.0`. The repository version is defined in `package.json` as `20.28.0`. The browser title is `Sandbox v20.28.0`.

## v20.28.0 release summary

v20.28.0 establishes the offline Single Player Match Mode dice boundary. A Pass interception roll now enters through `PASS_INTERCEPTION_ROLL_SUBMITTED -> Game Engine -> Single Player Controller -> Timeline`. The Engine accepts only the exact pending D20 request, consumes its unique RollEvent once, records the raw result and creates the established cosmetic delayed-resolution handoff. It does not calculate the interception outcome, move the ball, change possession, apply Natural 1/Natural 20, or advance another reaction.

Normal dice buttons are now unavailable in offline Match Mode unless an official pending roll requests them. `EXTRA ROLL` is the explicit administrative safety route beside the die selector: it arms one random or chosen roll, then closes automatically. Extra Roll creates a visible `EXTRA_ROLL` Timeline/AI event, consumes no Tracker action, cannot answer a pending mechanic request, and cannot resolve gameplay. Editor Mode and Manual Multiplayer retain their legacy dice controls.

## v20.27.0 release summary

v20.27.0 migrates offline Single Player Pass interceptor choice through `PASS_INTERCEPTOR_SELECTED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine accepts only the active canonical `CHOOSE_INTERCEPTOR` decision with matching Pass and decision identities. It verifies the stored decision against the equal-priority candidates in the canonical plan, applies the established deterministic reorder and modifier calculation using frozen MatchContext rules, stores the selection, and creates the canonical next interception-roll request.

The choice neither consumes another Tracker action nor moves the ball, changes possession, submits a die, resolves the interception, advances to another interceptor, or alters Bonus Action consequences. Normal Pass choice is a stepwise History entry; Bonus Pass choice remains in its existing atomic continuation transaction. The Single Player modal now sends the Engine command. Manual Multiplayer retains its existing direct selection path.

## v20.26.1 release summary

v20.26.1 is a narrow correction to offline Single Player Pass route truth. A frozen gameplay card with `position: "GK"` is now a physical route blocker: when the selected pass segment enters that goalkeeper's square, the canonical Pass plan marks the route blocked and `PASS_ROUTE_CONFIRMED` rejects it before consuming a Tracker action. The ball therefore cannot pass through or finish at a goalkeeper. In Single Player preview, such a route remains visible in grey but cannot be selected; this applies to both corner-to-center and center-to-center path modes.

The separate approved target rule remains deferred: choosing a goalkeeper square itself must later be rejected by `PASS_TARGET_SELECTED`. This build does not implement that selection rule.

The route preview also now represents the established canonical `directHit` truth: a route whose first physical hit is an opponent is red even when no separate defensive-area interception is available. This corrects the adjacent-opponent presentation defect without changing Pass resolution. Manual Multiplayer retains its legacy route interaction and presentation path.

## v20.26.0 release summary

v20.26.0 migrates offline Single Player Match Mode route confirmation through `PASS_ROUTE_CONFIRMED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine validates the current selected Pass and route for the frozen path mode, rejects an invalid route or an origin blocked by an opponent before action consumption, and constructs the established deterministic Pass plan from MatchState plus MatchContext. The plan retains the selected origin, foot, distance, Long/Short classification, requested/effective target, first-player hit, defensive-area crossings and interceptor order.

Normal Pass confirmation now consumes exactly one canonical Tracker action; Bonus Pass confirmation remains inside its atomic continuation and consumes no Tracker economy. The Engine then only declares the existing next canonical stage: `completing`, `awaiting-interceptor-choice`, or `awaiting-interception-roll`. It does not choose an interceptor, accept a die, resolve an outcome, move the ball, change possession or create/close a Bonus Action. Those remain on the legacy downstream path temporarily. Manual Multiplayer remains unchanged.

An approved deferred rule is recorded but intentionally not implemented in this build: a card with position `GK` may not be selected as a Pass target, regardless of team. v20.26.1 later refines the route aspect: a goalkeeper blocks the route rather than becoming a first-hit recipient.

## v20.25.1 release summary

v20.25.1 migrates only offline Single Player Match Mode target choice through `PASS_TARGET_SELECTED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine accepts only the current canonical targeting Pass with matching identity and an integer board coordinate inside the frozen MatchContext board. It records the existing `PASS_TARGET_SELECTED` semantic event, stores the requested target and enters `route-selection`. It does not consume Tracker economy, reject an occupied target, construct a Pass plan, select a route, roll, resolve interception, move the ball or change possession.

The route preview and the still-legacy route-plan calculation now read Rule Set, board settings and gameplay-card data from the active MatchContext in offline Single Player. A card, rule or board-editor change made after Match start can therefore no longer alter the routes shown or calculated for that active match. Route confirmation itself remains deliberately outside the Engine until its separately approved slice. Normal target choice remains stepwise in History; a Bonus Pass target remains inside its existing atomic Bonus Action transaction. Manual Multiplayer remains unchanged.

## v20.25.0 release summary

v20.25.0 begins the Pass migration with one intentionally narrow offline Single Player Match Mode slice: starting and cancelling a Pass. `PASS_STARTED` now validates the canonical MatchState (Match started, phase ownership or ready Bonus Action, valid active ball carrier, available normal action, and no active resolution), then creates canonical `actionResolution` targeting state and emits the existing `PASS_TARGETING_STARTED` or `BONUS_PASS_TARGETING_STARTED` semantic event. It does not consume a Tracker action, select a target, choose a route, roll dice, resolve interception, or move the ball.

`PASS_CANCELLED` now clears only a cancellable canonical targeting/route-selection resolution. For Bonus Pass it restores the same Bonus Action to ready without consuming Tracker economy; normal Pass remains a normal stepwise Timeline action. Bonus Pass start and cancellation remain one atomic Undo/Redo transaction. While an Engine-created Pass resolution is active, unrelated Engine commands are rejected. The offline UI now dispatches these two commands; Manual Multiplayer retains its existing host/guest and direct mutation paths. Target selection, route creation, interceptor choice, dice, resolution and possession remain explicitly outside this build.

## v20.24.1 release summary

v20.24.1 corrects the v20.24.0 Tracker Start/Restart regression. Editor Mode is intentionally outside the Match Engine and again uses its existing unrestricted Tracker route. In offline Single Player Match Mode, pressing `Restart Game` now sends `MATCH_RESTARTED` to the Engine rather than incorrectly retrying `MATCH_STARTED`.

Restart preserves every board piece and ball position, but clears turn-scoped Tracker actions, movement state, active resolution and Bonus Action, then starts Turn 1 with the selected attacking team. It retains the existing `MATCH_STARTED` History/AI semantic event with explicit `restarted: true` metadata. Manual Multiplayer remains unchanged.

## v20.24.0 release summary

v20.24.0 migrates offline Single Player Match start through `MATCH_STARTED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine now validates Match Mode, a valid starting team, and that the Match has not already started. It creates the canonical playable first turn, clears stale interaction state, and emits the existing `MATCH_STARTED` semantic event. The Controller deliberately preserves the established Timeline convention: cursor zero is already the playable opening board while History retains the Match Started audit entry.

The build also adds a presentation-only `MATCH OVER` popup after an Engine-produced state reaches `complete`. It is triggered only by a live offline final-phase closure or final Bonus Action closure; loading a replay, Undo/Redo, or Manual Multiplayer does not show it. No halftime, extra-time, penalty, score, or Match-rule model is introduced.

## v20.23.0 release summary

v20.23.0 migrates offline Single Player `END B.A.` through `BONUS_ACTION_ENDED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine now owns validation of the canonical Bonus Action identity, its legal end states (unused, active, or awaiting explicit close), explicit decline/completion semantics, continuation removal, and resume policy.

For `advance-turn`, the Engine resets only the new numbered turn and starts it for the continuation's designated team. If that continuation would advance beyond the configured final turn, the Match enters `complete` instead of remaining incorrectly on the last numbered turn. A future `resume-phase` continuation now returns explicitly to its declared phase without resetting Tracker state. Existing `BONUS_ACTION_ENDED` and `BONUS_ACTION_DECLINED` Timeline/AI semantics remain unchanged, and the Bonus Action transaction remains atomic for Undo/Redo. Manual Multiplayer retains its existing End B.A. path.

## v20.22.1 release summary

v20.22.1 aligns offline Single Player card controls with canonical Tracker phase ownership. When a team is not active in the current Tracker phase, its gameplay card actions (Move, Group Move, Pass, Shot, Cross, Dribble and Tackling) are visibly disabled. Player selection and inspection remain available for both teams. Free Move, Free Ball, the INACTIVE control, and card-flip flows remain available as before. A canonical Bonus Action remains the deliberate exception: its owner may select its permitted individual action even when normal Tracker phase ownership differs. Manual Multiplayer is unchanged.

## v20.22.0 release summary

v20.22.0 migrates offline Single Player `END TURN` into the Game Engine through `TRACKER_PHASE_ENDED`. Engine validation now owns phase ownership, Match start, active Pass/Free Move locks, Group Move closure, and the normal-MOVE pre-first-segment lock. When attack ends, the Engine enters defense without resetting the turn. When defense ends, it automatically starts the next numbered turn, resets Tracker action economy, move authorization, Group Move state and movement state, and emits the existing canonical `PHASE_ENDED` Timeline event with automatic-turn metadata. The last configured defense ends the match phase without creating another turn.

The numbered Tracker controls are display-only in offline Match Mode because numbered turns now belong to the Engine; Editor Mode and Manual Multiplayer retain their existing controls. A `TURN X` popup announces every automatic new turn. While a normal MOVE is active before its first physical segment, every gameplay button is blocked except `CANCEL MOVE`; the Engine independently rejects all other commands. Manual Multiplayer remains unchanged.

## v20.21.1 release summary

v20.21.1 completes the offline Single Player Bonus MOVE migration. `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED` now flow through the Game Engine and Single Player Controller into Timeline. The Engine owns Bonus Action ownership, cancellation before the first physical segment, Speed, progressive segments, first-axis lock, path blocking, occupied destinations, and ball carry. Bonus MOVE never adds a Tracker action and remains active until `END B.A.`; unused Speed is allowed.

Card MOVE and direct-board player selection plus destination are equivalent offline Single Player entrances. A direct-board destination starts and commits Bonus MOVE atomically, so it has no pre-move Cancel interval. Card-started Bonus MOVE displays `CANCEL MOVE` only before its first physical segment. 3/2 remains independent before or during Bonus MOVE. Manual Multiplayer remains unchanged.

Tracker's empty action circles now use the same visible outline as active circles with a muted grey fill. They remain disabled and cannot be completed manually.

## v20.21.0 release summary

v20.21.0 establishes the offline Single Player Bonus Action foundation without migrating Bonus MOVE itself. A Bonus Action continuation now carries a compatible structured origin (`actionType`, outcome, reason, source entry, and optional parent continuation). Existing Natural 20 interception recordings retain their historical `source` string and infer the same structured origin. A later Natural 20 during an existing Bonus Action explicitly replaces the old continuation, records its parent link, and does not run the old continuation's resume policy.

While an offline Single Player Bonus Action exists, End Turn, Free Move, Free Ball, normal actions, and Group Move are blocked. The Game Engine applies the same lock to command paths. 3/2 remains independent: the Bonus Action owner may use it even outside the normal Tracker phase, with all existing 3/2 range, occupancy, path, one-use, and no-Tracker rules unchanged. It neither consumes nor ends Bonus Action. Manual Multiplayer remains on its existing path.

The next mandatory build is `v20.21.1`: migrate Bonus MOVE through the Game Engine, including both card and direct-board entrances. It is intentionally not included here.

## v20.20.1 release summary

v20.20.1 corrects the offline Single Player Group Move integration without changing its approved game rules. End Turn now clears the active Group Move interaction from canonical MatchState before the next phase is recorded in Timeline; the opposing team is therefore no longer blocked by the Group Move Engine lock. The confirmed zone remains canonical for Engine validation but disappears visually after confirmation and at End Turn.

The temporary zone is now positioned only by dragging the full-width band, rather than by clicking the pitch. After confirmation, players of the active team inside that frozen zone are marked directly: eligible players receive a clear highlight, while ineligible candidates receive a grey outline and a lock. The cursor preview calls the same pure Group Move evaluator used by the Engine, shows the Group Move maximum instead of card Speed, respects the first established direction, and deliberately permits a route through another player while retaining destination restrictions. Manual Multiplayer and Editor Mode remain unchanged.

## v20.20.0 release summary

v20.20.0 migrates offline Single Player Group Move into the pure Game Engine. Pressing GROUP MOVE opens only a local, repositionable full-width zone preview; no Tracker action or Timeline entry is created yet. Confirming the zone dispatches `GROUP_MOVE_ZONE_CONFIRMED`, consumes the final normal action, locks the zone into canonical MatchState, and records `GROUP_MOVE_ACTIVATED`. Eligible players are then selected by moving them one at a time through `GROUP_MOVE_PLAYER_COMMITTED`; each segment records the existing `GROUP_MOVE_PIECE` semantic event and shares the same Timeline group.

The Group Move Rule Set editor now configures maximum players (default 4), zone length (10), maximum movement distance per player (6), and whether every player must use the first movement direction (default yes). Players must begin inside the confirmed zone, belong to the active team, have no ball, and have made no gameplay movement earlier in the turn; Free Move does not disqualify them. Group Move deliberately may cross players to support line movement and offside tactics, but cannot finish on a player or the ball. The first successful segment fixes horizontal, vertical, or exact diagonal orientation and optionally direction. End Turn remains the only normal closure. Manual Multiplayer, including its legacy Group Move behavior, remains unchanged.

The Rule Set modal buttons New, Duplicate, Load, and Save Rule Set now have an explicit pressed-state visual response without changing their behavior.

## v20.19.0 release summary

v20.19.0 migrates offline Single Player Free Move into the pure Game Engine through `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, and `FREE_MOVE_ENDED`. Free Move is an explicit administrative correction: it appears in Timeline History, Undo/Redo, Replay, and AI Analysis, where it is marked `FREE_MODE` and `MANUAL_CORRECTION`; it never consumes a Tracker action. While active it locks all other offline Match Mode actions, including Free Ball and Engine commands, until the same player ends Free Move. It has no distance, path, axis, phase, or Speed restriction; it may share the ball square but cannot finish on another player. Crucially, it moves only the selected player: the ball remains where it is, whether the player began on the ball or is later placed onto it. Editor Mode, Free Ball outside this temporary lock, and Manual Multiplayer retain their existing paths.

## v20.18.0 release summary

v20.18.0 introduces one pure movement-path rule for offline Single Player. Normal MOVE, 3/2, Bonus Move, and Group Move may not pass through a co-player or opponent; the destination remains subject to the existing occupancy rule. The shared path rule checks every intermediate horizontal, vertical, or diagonal square and deliberately ignores the ball. Free Move remains an unrestricted administrative safety tool: it does not use path blocking, distance, axis, phase, or Tracker restrictions, while retaining the existing no-two-players-on-one-square invariant. Editor Mode, Free Ball, and Manual Multiplayer remain unchanged.

## v20.17.0 release summary

v20.17.0 migrates the offline Single Player 3/2 action into the pure Game Engine as `THREE_TWO_MOVE_COMMITTED`. The Engine owns active-phase validation, target-ball validation, range, occupancy, one-use-per-player state, the legacy post-3/2 movement consequence, semantic Timeline event, and rejection safety. The explicitly approved rule is now that 3/2 does not consume a Tracker action and remains available after the active team has exhausted its normal Tracker actions; it remains unavailable before Match start, outside that team's active phase, after prior use by that player, or where another player occupies the ball square. Clicking the ball with a player selected is an offline Single Player entry to the same Engine command. Manual multiplayer and its existing 3/2 path remain unchanged.

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
