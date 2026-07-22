# Continuation prompt — v20.22.1

We are continuing the Football Board Sandbox Game Engine migration from build `v20.22.1`.

Read these documents in full before proposing or implementing anything:

1. `README.md`
2. `docs/GAME_ENGINE_ARCHITECTURE.md`
3. `docs/GAME_ENGINE_MIGRATION_PLAN.md`
4. `docs/ARCHITECTURE_DECISIONS.md`
5. `docs/ACTION_RESOLUTION_ENGINE.md`

Non-negotiable constraints:

- Automated multiplayer development remains frozen.
- Manual Multiplayer must remain unchanged.
- Do not make cosmetic refactors, renames, formatting changes, or broad moves.
- Propose one narrow, independently testable build and wait for approval before implementation.
- At the end of an approved build, update documentation, provide exact manual tests, run focused tests, report known environment failures separately, archive the build, and provide the next complete continuation prompt.
- The release archive must place project files directly at the ZIP root; never wrap it in an additional top-level project folder.

Current architecture:

- MatchState at the Timeline cursor is canonical Single Player gameplay state.
- MatchContext is frozen per tracked match.
- UI sends commands; the pure Game Engine validates and returns next state plus semantic event; the Single Player Controller records Timeline; React renders Timeline state.
- Firebase must not gain game rules. Manual Multiplayer retains legacy paths until explicitly reopened.

Completed migrations:

- v20.13: Free Ball
- v20.14–v20.16: Normal MOVE and direct-board entry
- v20.17: 3/2
- v20.18: shared physical path blocking
- v20.19: Free Move
- v20.20–v20.20.1: Group Move Engine and UI/turn closure
- v20.21.0: Bonus Action foundation, origin chain, offline locks, and 3/2 during Bonus Action
- v20.21.1: Bonus MOVE Engine, card/direct-board equivalence, and Tracker empty-circle visual clarity
- v20.22.0: Engine-owned End Turn, automatic numbered-turn advance, and normal-MOVE interaction lock
- v20.22.1: inactive-phase card-action presentation lock

Current interaction and turn contract:

- `TRACKER_PHASE_ENDED` is the sole offline Single Player Match Mode End Turn command.
- Attack End Turn enters defense and does not reset turn-scoped state.
- Defense End Turn automatically starts the next numbered turn if it exists, clears Tracker action logs/authorizations, Group Move state and movement state, then returns to attack.
- The configured final defense enters `complete`; no extra turn exists.
- The attacking/starting team remains unchanged during normal automatic turn advance.
- Tracker numbered buttons are display-only in offline Match Mode. Editor Mode and Manual Multiplayer retain existing manual turn behavior.
- `TURN X` popup is UI-only and appears after the canonical transition has committed.
- Before a normal MOVE has physically moved, all gameplay controls except `CANCEL MOVE` are blocked. The Engine independently rejects all other commands. After the first normal Move segment, the existing progressive movement rules resume.
- Inactive Tracker phase disables only gameplay card actions: Move, Group Move, Pass, Shot, Cross, Dribble and Tackling. Selection and inspection remain possible for both teams. Free Move, Free Ball, INACTIVE and card flips remain available. A canonical Bonus Action owner remains the explicit exception.
- Group Move may close through End Turn; Free Move, Bonus Action, active Pass/resolution, and an uncommitted normal MOVE prevent End Turn.

Bonus Action contract:

- Bonus Action is canonical `actionContinuation`, never Tracker economy.
- It permits exactly one individual card action: MOVE, PASS, DRIBBLE, CROSS, SHOT, or TACKLING. GROUP MOVE is excluded.
- It ends voluntarily only through `END B.A.`; End Turn, Free Move, Free Ball, normal actions, and Group Move are blocked in offline Single Player while it exists.
- `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED` are the canonical Single Player Bonus MOVE commands.
- Card MOVE starts the action and may be cancelled only before first physical movement. Selecting a player then a direct board destination starts and commits atomically, therefore it has no pre-move Cancel interval.
- 3/2 is independent and can be used before or during Bonus MOVE by any player who has not already used 3/2 that turn. Do not write or infer a separate inactive-player rule until the product owner defines that state.

Verification status for v20.22.1:

- Focused Engine/Controller/Timeline/Tracker/authority tests passed: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/aiAnalysisExport.test.mjs src/tracker/*.test.mjs src/multiplayer/freeToolsAuthority.test.mjs src/multiplayer/bonusActionAuthority.test.mjs` (87 passing).
- Full `npm test` has one pre-existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
