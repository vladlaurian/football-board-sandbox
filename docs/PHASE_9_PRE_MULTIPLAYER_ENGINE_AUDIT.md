# Phase 9 — Pre-multiplayer Engine Audit

## Audit result

**Accepted.** This is a documentation-only audit of application build `v20.46.7`, completed for release `v20.47.0`.

It confirms that the current Single Player foundation is safe to continue with new Engine-first mechanics. It does **not** activate, repair, redesign, refactor, or extend Manual Multiplayer or automated Multiplayer.

## Scope and exclusions

Inspected:

- `src/engine/`, `src/game/`, `src/timeline/`, `src/match/`, `src/rules/`, `src/tracker/`, and the corresponding tests;
- Single Player gateway and UI projection routes in `src/main.jsx`;
- Firebase/session boundary in `src/main.jsx` and retained `src/multiplayer/` modules;
- Match recording, Replay, Undo/Redo and AI Export paths;
- documentation contracts and migration status.

Excluded by design:

- every automated Multiplayer repair or synchronization change;
- Host Authority changes;
- Manual Multiplayer behavior changes;
- Editor Mode behavior changes;
- gameplay-rule changes and new mechanics;
- UI/visual changes.

## Acceptance evidence

| Phase 9 requirement | Result | Evidence |
|---|---|---|
| Current implemented mechanics are Engine-backed and testable without UI | Pass | `gameEngine.mjs` dispatches serializable commands to pure rule modules; the Controller and gateway commit only accepted Engine results. `gameEngine.test.mjs`, `singlePlayerController.test.mjs` and `singlePlayerMatchGateway.test.mjs` cover accepted/rejected commands, progressive movement, Pass, Bonus Action, Tracker, Free tools, Group Move, 3/2, and lifecycle transitions. |
| `MatchContext` is frozen per match | Pass | `createMatchContext` clones and deep-freezes Rule Set, board settings and compact gameplay cards. Offline Match start creates it before command dispatch; active Workspace/Card/Rule Set mutations are locked. The Engine test proves source mutations cannot alter the frozen context. |
| Timeline, Undo/Redo, Replay and AI Export use the same state | Pass | Controller reads `timelineStateAt(timeline, cursor)`, Engine returns `nextState`, and the gateway publishes exactly that cursor state. Timeline tests cover Undo/Redo and branching; recording/replay tests restore Timeline state; AI export derives only from Timeline and its captured MatchContext/card data. |
| Manual Multiplayer remains unchanged from baseline | Pass | `src/multiplayer/` is byte-for-byte unchanged from the approved v20.46.6 archive. The only `src/main.jsx` difference from that archive is `APP_VERSION` changing to `v20.46.7`. |
| Firebase has no newly introduced rule or deterministic-resolution logic | Pass | Firebase imports and Firestore calls are confined to `src/main.jsx` session/persistence transport. Engine and Single Player Controller dependency tests reject browser, UI and Firebase APIs. No Firebase import exists in production Engine, Game, Timeline, Match or Rules modules. |

## What is actually complete

The following currently implemented Single Player behavior is genuinely inside the command-driven route:

- Match start/restart, Tracker phase/turn progression and temporary tracker administration;
- Normal Move, Bonus Move, Group Move, 3/2, Free Move and Free Ball;
- Pass targeting, routes, interception choice, manual dice submission, deterministic interception result, Pass consequence and Natural 20 Bonus Action continuation;
- piece active/inactive state and Extra Roll;
- Timeline history, Undo/Redo, Replay recording and AI Analysis export.

`DRIBBLE`, `SHOT`, `CROSS` and `TACKLING` are intentionally not claimed as implemented mechanics. Their buttons currently produce Engine-owned manual declarations so Tracker, Bonus Action, Timeline and AI Export remain honest while their actual rules are still pending.

## Boundary finding

For offline Single Player Match, `main.jsx` is now an application shell: it captures the current Timeline cursor, creates a command intent, uses `runSinglePlayerMatchCommand`, and projects the accepted cursor state back into React. It still owns local presentation, selections, notices and cosmetic delayed-resolution scheduling. Those are not competing gameplay authorities.

Direct gameplay setters still visible in `main.jsx` belong to Editor Workspace or the retained session/Manual Multiplayer branch. Offline Match handlers are explicitly gated to the Engine route when `!sessionCode && gameMode === "match"`. This is intentional isolation, not a remaining Single Player Engine bypass.

## Deliberate remaining boundary

The frozen Multiplayer code still contains legacy host/session/timeline logic in `src/main.jsx` and `src/multiplayer/`. That is not clean reusable multiplayer architecture and must not be gradually patched while building new Single Player mechanics.

When Multiplayer is eventually reconsidered, it needs a separately approved clean-room adapter phase: identity/team authorization and command transport before the already existing Engine, with Firebase/another transport publishing canonical Engine-produced Timeline transitions. This audit does not authorize that phase.

## Verification

- `npm test`: **231 passing, 0 failing**.
- `npm run build`: passed.
- Baseline comparison: `src/multiplayer/` unchanged versus `Final_Board_v20_46_6_match_geometry_contours(1).zip`.
- Runtime source changes in this release: **none**. Only documentation changed.

## Next approved-direction rule

The Single Player extraction/audit roadmap is closed. The next task should be a single new mechanic contract, beginning with `DRIBBLE`, presented for approval before implementation. Do not use this result to resume automated Multiplayer, alter Manual Multiplayer, or bundle another visual pass.
