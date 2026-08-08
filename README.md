# Football Board Sandbox

Interactive football board and match sandbox with card editing, Match Mode, Timeline/Undo/Redo, Rule Sets, replay/export, and retained Manual Multiplayer.

## Current build

| Field | Value |
|---|---|
| Sandbox version | `v21.1.0` |
| Git/package version | `21.1.0` |
| Documentation build | `v21.1.0` |
| Build name | `Final_Board_v21_1_0_free_kick_and_gk_reposition` |
| Base build | `Final_Board_v21_0_0_marking_finished` |
| Modes | Editor Mode and Match Mode |

The visible Sandbox label is defined in `src/main.jsx` as `v21.1.0`. The repository version is in `package.json` as `21.1.0`. The browser title is `Sandbox v21.1.0`.

## Current release

v21.1.0 makes Direct and Indirect Free Kick fully playable end-to-end for
the first time, and adds a new untracked-reposition mechanic after a
Goalkeeper Retains — plus a long list of fixes found through live testing.

- **Free Kick Direct/Indirect triggers wired**: a Tackling foul outside the
  box now goes straight into the shared restart-setup engine as a Direct
  Free Kick (no possession change — same numbered turn, Tracker-only reset);
  an Offside call does the same as an Indirect Free Kick, but as a real
  turn advance (possession changes to the defending team). The general rule,
  confirmed live: possession change → new turn; no possession change → same
  turn, tracker reset only.
- **Wall position + length redesign**: the coach now picks the wall's own
  lateral position and length (up to the Rule Set's configured maximum, or
  "No Wall") on a dedicated screen *before* picking which players fill it,
  with a live board highlight. The player-selection screen that follows
  requires exactly that confirmed count, not the Rule Set's maximum.
- **Mandatory illegal-distance retreat**: a defending player standing closer
  to the ball than the legal minimum (5 cells orthogonally, 4 diagonally)
  must be repositioned first, before any other of that side's players, and
  can never be repositioned back into that zone — closes a live-reported
  soft-lock and an exploit that let the coach farm extra reposition moves.
  Applies to Corner and both Free Kicks; Goal Kick's own box rule got the
  same treatment.
- **Wall-continuation confirm**: repositioning a defender to a cell that
  would extend the wall's own fixed line opens a Yes/No confirmation instead
  of silently joining it — the player is never actually counted as part of
  the wall for that restart.
- **Symmetric extra reposition moves**: when illegal-distance/box violators
  outnumber the configured reposition count, both sides are granted the same
  number of extra moves (not just the defending side), computed upfront so
  the attacking side — which always moves first — already has its share
  before its very first move.
- **Modifier cap `0` now means no maximum**, everywhere the cap is used
  (Shot, Tackling, Pass, Interception, Lofted Through Ball) — previously it
  meant "clamp every situational modifier to zero," which silently capped a
  large wall's own disadvantage stack at whatever else already used up the
  default ±4. The card's own base stat was never affected either way.
- **Free Move / Free Ball are a global testing-engine convenience**: both
  now work for either team through any restart setup or the new Goalkeeper
  Retains reposition window, instead of being blocked mid-flow.
- **New: Goalkeeper Retains untracked reposition** (`src/engine/gkRepositionRules.mjs`).
  Up to a Rule-Set-configured number of alternating moves per side (0
  disables it), the goalkeeper's own team first, using real movement
  legality — Speed, diagonal cost, axis lock, the same cursor/indicator as
  an ordinary Move — but none of it touches the Tracker. Three independent
  Rule Set checkboxes decide when it triggers: after a Free Kick, after a
  corner header (inert until that mechanic exists), or any time the
  goalkeeper catches the ball. Exactly one piece per turn, and a piece used
  on any turn is retired for the rest of that phase.
- **Inspector action buttons now respect a restart's `availableActions`**:
  Shot (or any other mechanic not listed for that restart type) is disabled
  during execution instead of only failing after a click — generalized
  across every mechanic, not hardcoded to Shot, using the same family map
  the Engine's own dispatch gate enforces.
- A round of live-reported fixes: the ball wasn't actually moved to the
  Free Kick execution spot (Direct and Indirect both silently left it
  wherever it was); a stale pre-move state let a defense move that actually
  cleared the last illegal-distance violator wrongly re-grant moves and
  force the turn back to defense; several restart/reposition rejection
  reasons showed only a generic "not allowed" message instead of explaining
  why; Skip on the ordinary reposition panel silently did nothing when
  rejected.

v21.0.0 closes out Marking (docs/MARKING_RULES.md, sections 1-8): the
accept/decline entry decision, passive tracking movement (locked to the exact
same single-axis rule as ordinary piece movement, after several rejected
free-pathfinding revisions), fast exit by Speed difference including its
"near miss" explanation banner, Cancel MRK, and the Marking switch (an
already-marked attacker entering a different eligible defender's area). It
also fixes a live-reported bug where a defender's own current cell wasn't
counted as part of its own area, letting a long crossing wrongly split into a
short one that qualified for fast exit. A new `docs/IMPLEMENTATION_STATUS.md`
checklist now tracks every mechanic's real implementation status, replacing
several docs' stale "not implemented" claims for things that had since
shipped (Marking itself, Shot, Goal Kick, Corner, mid-match tactic change).

v20.56.45 builds the general fixed-restart engine promised after Build 0, and
makes Corner and Goal Kick fully playable end-to-end for the first time —
plus a long list of fixes found through live testing.

- **A new shared restart-setup engine** (`src/engine/restartSetupRules.mjs`,
  `state.restartSetup`) covering Corner, Goal Kick, and (Rule-Set-configured
  but not yet triggerable) Free Kick Direct/Indirect and Throw-in. Four
  skippable phases: wall (`RESTART_WALL_SET`) → reposition
  (`RESTART_PIECE_REPOSITIONED`/`RESTART_REPOSITION_PASSED`, alternating,
  attack first) → executor (`RESTART_EXECUTOR_SELECTED`) → execution
  (restricted to the entitled executor and that type's configured action
  list). See `docs/ARCHITECTURE_DECISIONS.md` ADR-062.
- **Corner and Goal Kick are real Shot outcomes now**: `applyShotConsequence`
  starts a restartSetup instead of rejecting them. The ball cell is always
  fixed automatically, echoing which half of the goal the shot was aimed at.
- **New Rules panel sections** for all five restart types: wall size,
  reposition count, available-actions checkboxes.
- **Hardcoded per-(restart-type × action) exceptions**: Corner Shot
  (board-boundary exemption, mandatory DVM, wall DV), Free-Kick-Direct Shot
  (no body-blocking, wall DV instead of defensive-area DV), Free Kick Lofted
  Through Ball (editable difficulty override, no defensive-area effect),
  Corner Long Pass into the box (hardcoded illegal, not just disadvantaged).
- **Goal Kick's box-clearing rule**: the non-executing side cannot skip or
  exhaust its reposition turn while any of its own pieces remains inside the
  executing team's box; it must move that piece first. Corner has no such
  restriction.
- **Free relocation on Engine-computed collisions**: whoever already stands
  on a computed wall cell or the ball cell is moved automatically, for free,
  to the nearest open cell — as early as possible, so they stay a normal,
  manually-repositionable piece for the rest of the setup.
- **New restart-setup UI panel** (same family as the Dice panel): wall
  player selection, repositioning with a live local preview, executor
  selection — every board click only stages a local selection; the real
  command dispatches only on Done/Confirm.
- **Editable Shot intervals**: `goalKickInterval`/`cornerInterval` (1-5,
  Rule Set) widen which natural rolls count as Goal Kick and which totals
  count as Corner — neither can ever override an actual Goal.
- New tests across `restartSetupRules.test.mjs`,
  `restartSetupPresentation.test.mjs`, `restartActionExceptions.test.mjs`,
  and extensions to `shotRules.test.mjs`/`ruleSets.test.mjs`. Full suite
  (481 tests) passing.

---

Previous release:

v20.56.44 was "Build 0" of the Corner/restart work: it closed a real gap in
the already-documented Shot contract, live-reported by the user and
reproduced exactly (a wide-angle shot toward the near post).

- **A normal Shot's route must stay on the pitch for its complete length**
  (`docs/SHOOTING_RULES.md` section 1 — documented, never implemented until
  now). The goal is a notch attached to the pitch only across its own width
  band; at a wide-open angle, the straight corner-to-centre line crosses the
  goal-line plane while its y is still outside that band, spending a short
  stretch beyond the pitch before curving back in. `buildShotRoutePlan`
  (`src/engine/shotRules.mjs`) now computes that crossing point and folds it
  into `legal`. The threshold works out to exactly 45° to the near post,
  derived from board geometry — not a new Rule Set number.
- New `exemptFromBoardBoundary` parameter on `buildShotRoutePlan`, used as of
  v20.56.45 by the direct Corner Shot contract (`SHOOTING_RULES.md` section 5).
- New tests: 4 cases in `shotRules.test.mjs` at/around the 45° threshold,
  plus the exemption flag. Full suite (437 tests) passing.

v20.56.43 gave Prep's `Ready` a second, canonical meaning once a Match has
started: it re-confirms which piece takes a pending kick-off restart, so the
pinned player is always that team's ST **under whichever tactic is
currently active** — not whichever piece happened to be picked back when the
goal occurred.

- New Engine command `KICKOFF_READY_CONFIRMED`
  (`src/engine/kickoffReadyRules.mjs`). Rejected with `NOT_AT_KICKOFF_RESTART`
  away from a pending restart (no board change). While pending: re-lays out
  the team into its active tactic, re-validates it
  (`TEAM_TACTIC_INVALID`/`state.tacticBlock` on failure, no board change),
  then picks that team's ST under the current tactic and pins it + the ball
  to centre, updating `state.kickoffRestart.pieceId`.
- The UI only dispatches this command and displays whatever reason comes
  back (`illegalMoveMessage` gained the three new reason strings) — every
  decision is the Engine's, per the project's UI/Engine boundary. Pre-Match
  `Ready` (roster validation, before `Start New Game`) is completely
  unchanged; the two are now fully separate code paths, split on
  `trackerGameStarted`.
- New tests: `kickoffReadyRules.test.mjs` (4 tests). Full suite passing.
- **Correction to the previous release's changelog**: v20.56.42 reported a
  "Lofted Through Ball can never legally complete" bug that turned out to be
  a mistake in that investigation's own test fixture (a stat missing an
  `id` field), not a real defect — `createMatchContext`'s
  `resolveLoftedThroughBallStat` already auto-resolves the roll stat from
  any card carrying a "Lofted Through Ball" named stat with a stable id.
  Confirmed working end to end with a corrected test
  (`kickoffAnyPassType.test.mjs`). That finding has been withdrawn.

---

Previous release:

v20.56.42 was a bug-fix and rule-change round on top of Program A, found
through live testing:

- **A restart from the centre now re-lays out both teams into their active
  tactic** (`state.activeFormation`), not just when a tactic was freshly
  queued — matching `docs/FINALISATION_AND_RESTARTS_RULES.md` 3.2's
  "both teams return to their active Match tactical formation" rule, which
  Build B had deviated from. The ball and the entitled kick-off piece are
  always pinned to centre afterward regardless of what that tactic says for
  their slot — fixes the reported bug where confirming a tactic or using
  Adjust during a pending restart moved the kick-off piece away from the
  ball. Adjust also now refuses to move that specific piece while the
  restart is pending. Continue Game is unaffected (never records an active
  tactic).
- **The kick-off's forced pass is no longer forced.** Removed the "must be a
  backward Short Pass, free of Tracker cost" rule entirely. The entitled
  piece must still act first, but its pass may be Short Pass, Long Pass,
  Through Ball or Lofted Through Ball, any direction, at ordinary Tracker
  cost — exactly like any other pass. This rewrites specific Build B tests
  and doc text that asserted the old forced-pass contract.
- **New tactic-legality gate.** If the tactic that ends up active for a team
  doesn't exactly match that team's assigned cards' roles (only reachable by
  confirming an incompatible tactic mid-Match, since cards are locked once
  the Match starts), every action for that team is blocked — disabled
  action buttons plus a persistent on-screen banner — until a matching
  tactic is confirmed from Prep.
- **Fixed a pre-existing bug, exposed by this work:** leaving Match Mode for
  Editor Mode never reset `trackerGameStarted`/`currentTurn`/`score`/dice
  results in React state (only the canonical Timeline snapshot was reset),
  so re-entering Match Mode silently inherited the previous Match's stale
  progress — surfacing as an incorrect "Not a kick-off moment" message
  immediately after a fresh Editor↔Match round trip. Also added missing
  React state mirrors for `pendingFormation`/`activeFormation`/`tacticBlock`
  so they no longer reset unexpectedly at that same boundary.
- Formation preview: pushed edge-hugging slots (e.g. GK) inward and added
  deterministic collision spacing for slots that land on top of each other
  (e.g. ST/CAM in some formations) — cosmetic only, the real board is
  unaffected.
- Post-goal tactic-change prompt now also fires directly from the goal
  dispatch itself, not only through a state-change effect.
- New tests: `tacticLegalityRules.test.mjs`, `kickoffAnyPassType.test.mjs`
  (includes a full Lofted Through Ball completion through the real command
  sequence, confirming it works end to end), plus updated assertions in
  `shotRules.test.mjs`, `formationTacticRules.test.mjs`,
  `adjustPlacementRules.test.mjs`. Full suite passing.

---

Previous release:

v20.56.41 was Program A: a Prep tactic can be previewed without ever touching
the live board, and lands on the real board only at a kickoff moment.

- **Formation preview.** The `Formation` dropdown in Prep now only updates a
  small read-only preview (`src/prep/FormationPreview.jsx`) showing each
  slot's required position code (e.g. `RM`, `LW`) — it never mutates live
  pieces. The preview is computed with the same pure layout function the
  Engine uses (`src/board/formationLayout.mjs`), so what the coach sees is
  exactly what will land on the board.
- **`Selection` → `Select Formation`.** Confirmed with the user that
  `Selection`'s only behavior (scroll to the summary block) was safe to
  drop — validation runs independently regardless. The button now confirms
  the previewed tactic: applied immediately at a kickoff moment, otherwise
  queued in canonical `state.pendingFormation` (Engine/MatchState, visible to
  Timeline/Undo-Redo/Replay/AI-export) for the next one.
- **Kickoff moment** (`src/engine/kickoffMomentRules.mjs`): before the Match
  has started its first turn, or while a post-goal `kickoffRestart` is
  pending. Half-time/extra-time are a future third case — deliberately out
  of scope, since no such state exists in the Engine yet.
- **New canonical Engine command `FORMATION_TACTIC_CONFIRMED`**
  (`src/engine/formationTacticRules.mjs`): applies a tactic to the real board
  or queues it, and records `state.activeFormation[team]` either way. A
  queued tactic is applied for whichever team(s) queued one — automatically,
  for both sides — the moment a goal creates the next kick-off
  (`applyGoalConsequence` in `src/engine/shotRules.mjs`), before the entitled
  team's kickoff piece and the ball are placed at centre.
- **Adjust is now kickoff-gated.** Enabled only at a kickoff moment, on top
  of the existing formation-exact-roles requirement. A placement made while
  the Match Timeline has started goes through a new canonical command,
  `ADJUST_PIECE_PLACED` (`src/engine/adjustPlacementRules.mjs`), instead of
  the pre-Match Workspace path — Undo/Redo/Replay/AI-export see it
  correctly. Pre-Match Adjust is unchanged.
- **Post-goal prompt.** "Vrei să faci schimbări tactice?" appears once per
  kick-off restart. `Da` opens Prep pre-selecting the entitled team; `Nu`
  dismisses. `Continue Game`'s kickoff behavior is unchanged (frozen, per
  explicit user instruction) — this prompt only ever fires for `Start New
  Game` matches.
- New tests: `kickoffMomentRules.test.mjs`, `formationTacticRules.test.mjs`,
  `adjustPlacementRules.test.mjs`, `tacticPresentation.test.mjs`, plus new
  cases in `shotRules.test.mjs`. 33 new tests, full suite 417/417 passing.
- **Substitutions (Program B) are deliberately out of scope** — they depend
  on dead-ball states (throw-in, goal kick, corner, free kick) that don't
  exist in the Engine yet. The full agreed shape is recorded in
  `docs/TEAM_COMPOSITION_AND_FORMATIONS.md`, section 4, "Blocking dependency
  (not yet satisfiable)", for when that lifecycle is eventually built.

---

Previous release:

v20.56.40 made bench/reserve pieces (`A-R-1..7` / `B-R-1..7`) fully inert
during a running Match, since no Substitution mechanic exists yet to bring
one onto the pitch:

- The Defensive Areas overlay (`defensiveAreaOverlays` in `src/main.jsx`) no
  longer draws a reserve's defensive cells, in either D.A. mode.
- All 7 canonical "start an action" commands
  (`startPass`, `startShot`, `startThroughBall`, `startLoftedThroughBall`,
  `startNormalMove`, `startBonusMove`, `startFreeMove`) reject a reserve as
  actor at the Engine level, not just in the UI.
- `src/rules/passEngine.mjs`, `throughBallRules.mjs` and
  `loftedThroughBallRules.mjs` exclude reserves from every
  defender/interceptor/receiver/body-blocker role (the frozen legacy Manual
  Multiplayer path, `opponentBlockingPassOrigin`, is untouched per CLAUDE.md
  rule 7). The Goal→Kickoff consequence in `shotRules.mjs` can no longer pick
  a reserve as the kickoff piece, and a reserve goalkeeper can no longer be
  matched in place of the real on-pitch keeper.
- `evaluateGroupMovePieceEligibility` (`src/engine/groupMoveRules.mjs`)
  rejects a reserve outright, on top of the zone-bounds check that already
  excluded it structurally.
- `selectSinglePlayerPieceActionPresentation`
  (`src/engine/matchPresentationSelectors.mjs`) — the single ADR-049
  presentation selector the offline UI reads through — forces
  `actionAllowed`, `freeAllowed` and `groupMoveAuthorized` to `false` and
  `movementAuthorization` to blocked for a reserve. A reserve can still be
  selected and inspected (its card still shows in the Inspector), but every
  action button on that card is disabled — exactly the "can be inspected,
  not selected for action" split the user asked for.
- The already-documented 11-a-side / 1-goalkeeper roster cap
  (`docs/TEAM_COMPOSITION_AND_FORMATIONS.md`) needed no new code: with no
  Substitution mechanic yet to bring a reserve onto the pitch, and reserves
  now blocked from acting/receiving, the cap cannot be exceeded during a
  Match. It becomes meaningfully live only once Substitutions exist as a
  separate future feature.
- New tests: `src/engine/benchReserveEligibility.test.mjs` (12 tests)
  covering all 7 start-command rejections, group-move eligibility,
  `selectSinglePlayerPieceActionPresentation`, and the pass-engine
  defender/body-blocker exclusions.
- Per the user's explicit instruction, "Continue Game"'s current kickoff
  behavior (ball + ST placed at centre, nothing else resets) is unchanged —
  it is frozen and out of scope. The separate "Start New Game" formation
  problems (intertwined with future Substitutions and Tactical Change) are
  deferred until the user raises them.

---

Previous release:

v20.56.39 was a confirmed rule change, not a bug fix: in the goalkeeper's own
Goalkeeper-Retains restart, **every body inside its own penalty area is now
ignored — teammate or opponent alike**, not just an opponent's. `docs/SHOOTING_RULES.md`
and `docs/CROSS_RULES.md` previously said "opposing bodies", matching
v20.56.38's fix exactly; the user confirmed this was an intentional rule
change, not a documentation-reading error — the box is assumed crowded right
after a save, so nobody standing in it should obstruct this one restart.

- Both docs now say "every body (teammate or opponent)" instead of
  "opposing bodies" for this one restart.
- `buildPassPlan` (`src/rules/passEngine.mjs`): `bodyIgnoredByException`
  (renamed from `opponentIgnoredByException`) and the origin-block exemption
  no longer filter by team. The direct-contact `ignorableBodyIds` set always
  excludes whoever occupies the requested target cell — the intended
  receiver is never an obstruction to clear, which is what makes this safe
  (an earlier attempt without that exclusion made the pass's own destination
  invisible too, turning a successful reception into no-hit-at-all; caught
  and fixed by a test before delivery).
- `planThroughBall` (`src/engine/throughBallRules.mjs`): `bodyBlocked`'s
  exemption no longer filters by team either.
- Lofted Through Ball has no separate body-block mechanic (only the
  already-opponent-only defensive-area checks), so nothing changes there.
- The **general** Pass rule (`docs/PASS_AND_INTERCEPTION_RULES.md`: a
  teammate's body along an ordinary, non-exception route "receives
  directly" rather than blocking) is unrelated and unchanged — confirmed
  correct against the documented rule, not part of this change.
- Tests in `src/rules/passEngine.test.mjs` and
  `src/engine/goalkeeperRestartException.test.mjs` updated: the previous
  "a teammate's body is never exempted" tests are reversed to confirm a
  teammate's body is exempted too, with an explicit control case (no
  exception) proving the fixture would otherwise still block.
- See ADR-061's third note (a second amendment on top of v20.56.38's) and
  `docs/ACTION_RESOLUTION_ENGINE.md`'s updated Gate rule.

v20.56.38 fixed the first, narrower version of this same exception: an
opposing body directly on the route, inside the goalkeeper's own box, was
redirecting the pass into that opponent instead of the real target — only
the defensive-area crossing was actually being ignored at that point.

v20.56.37 corrects a second real defect in Goal's Kick-off placement, found
in the same round of live testing that produced v20.56.36.

- **Bug fix — Kick-off cell was the centre line, not adjacent to it in the
  entitled team's own attacking half.** `docs/FINALISATION_AND_RESTARTS_RULES.md`
  3.2 says the attacker is placed "in the cell adjacent to the centre point"
  — the same convention `prepareNewGamePieces` in `main.jsx` already uses for
  the very first kickoff of a Match (`strikerX = team === "blue" ? centerX :
  centerX - 1`). v20.56.36's `applyGoalConsequence` used the same `x` for
  both teams (`floor(cols/2)`), which put the entitled team in its **own**
  half instead of just past the halfway line into its attacking half.
  `applyGoalConsequence` (`src/engine/shotRules.mjs`) now mirrors
  `prepareNewGamePieces`'s exact formula.

v20.56.36 fixes a real bug found during live testing of v20.56.35's Goal
consequence, and adds the Tracker score display.

- **Bug fix — Goal's Kick-off no longer restores a bogus layout.** v20.56.35
  froze `state.pieces` into `state.kickoffLayout` at Match start/restart and
  restored the full layout from it on every Goal. This is unsound whenever a
  Match is started through "Continue Game" (`main.jsx`), which deliberately
  skips Prep/formation placement and starts from whatever is currently on the
  board (see `prepSelectionBoundary.test.mjs`'s "Offline Continue" contract) —
  the frozen snapshot then held an arbitrary mid-match position, not a
  formation. The reported symptom: after a Goal, nothing repositioned, and
  the conceding team's kickoff piece landed directly on top of the scoring
  player (the "centre" cell was wherever the ball happened to be at that
  arbitrary snapshot, right next to the goal just shot at).
  `applyGoalConsequence` (`src/engine/shotRules.mjs`) now computes the centre
  cell from pure board geometry (`floor(cols/2), floor(rows/2)`) instead,
  which is correct unconditionally. Per explicit user direction, this build
  moves only the ball and the entitled team's kickoff piece — it does not
  attempt a full formation reset for the rest of both teams, since no
  Engine-safe "committed formation" snapshot exists yet regardless of how the
  Match was started. `state.kickoffLayout` is removed entirely. See ADR-061's
  postmortem for the full account.
- **Score display**: the Tracker panel now shows the score directly under
  the Turn row — team names in each team's colour, the score itself in white,
  centered (`TrackerPanel.jsx`). Canonical `state.score` now syncs into React
  state (`applyTimelineGameState`) the same way `trackerCurrentTurn` already
  does.
- Goalkeeper-restart exception and comparison-label reformat (v20.56.35) are
  unaffected by this fix.

v20.56.33 is Build A of the Shot consequence vertical slice: **Goalkeeper
Retains** now has a real physical consequence. Its result screen shows a
Continue button — exactly like Lofted Through Ball's and Pass's own
non-terminal result screens, not a timed auto-advance — that dispatches a new
Engine command, `SHOT_CONSEQUENCE_DUE` (`applyShotConsequence` in
`src/engine/shotRules.mjs`): the ball moves to the goalkeeper's own cell and a
new numbered turn begins immediately for the goalkeeper's team, mirroring
Pass's existing `completeNormalInterception` exactly (mid-turn possession
loss to the other team already works this way for an intercepted Pass). Goal,
Goal Kick and Corner are untouched and remain the terminal ADR-058 checkpoint
with no Continue control at all — they are each a separate future build (B,
C, D). ADR-058 is updated: the Continue button is not a fake acknowledge
control under rule 11 because it performs the real canonical consequence,
the same way Lofted's own Continue button already does. The pre-roll prompt
for Shot, Lofted Through Ball and Pass/Interception also gained a permanent
fix: each now shows what its roll must beat (the goalkeeper's fixed save
stat, Lofted's Difficulty, the defender's Passing target) as an always-visible
line on `RollPromptCard`, instead of a line that only appeared after the roll
had already happened.

v20.56.32 finishes the mechanic-uniformity work: Lofted Through Ball gains the
same 1000 ms roll-result hold Pass/Shot already had (its roll submission and
its outcome resolution are now two separate Engine commands,
`LOFTED_THROUGH_BALL_ROLL_SUBMITTED` then `LOFTED_THROUGH_BALL_RESOLUTION_DUE`,
matching `resolveShotResult`'s split); the 8 hand-written result/decision modal
blocks (Pass interceptor choice, Shot result, Lofted result, Lofted recoverer
choice, Lofted recovered, Through Ball recoverer choice, Through Ball
recovered, and the passResultNotice) collapse into two shared components,
`ActionResultModal` and `ActionDecisionModal`, with every title simplified to
the bare action name ("Shot", "Lofted Through Ball") instead of a wordy
"resolution"/"result"/"recovered" suffix; and the 3 separate pre-roll prompts
(Pass/Interception, Lofted Through Ball, Shot) collapse into one
`RollPromptCard` component. All three shared components live in `src/main.jsx`
directly above `App()`. `docs/ACTION_RESOLUTION_ENGINE.md`'s Mechanic
Integration Gate gained a permanent rule (`Mandatory shared hold and UI
components`) requiring every future mechanic (Dribble, Cross, Tackling) to
reuse this same hold split and the same three components rather than writing
its own.

v20.56.31 corrects two defects found while testing v20.56.30's unification:
the canonical Pass route `verdict` never checked `originBlocked`, so a corner
blocked by the passer's own body displayed with whatever color its
(irrelevant) risk/clear check produced instead of the grey "blocked" badge
every other mechanic already used; and Shot's Inspector action-row control had
no visible way to cancel an active Shot (it stayed disabled instead of
becoming "CANCEL SHOT" the way Pass's control already becomes "CANCEL PASS").
Both are now fixed at their shared source: `PASS_TARGET_SELECTED`'s route
verdict includes `originBlocked`, and `selectSinglePlayerInspectorActionPresentation`
gained a `shotCancellable` case mirroring `passCancellable` exactly.

v20.56.30 unifies three roll/board-first behaviors across every implemented
manual D20 mechanic (Pass/Interception, Through Ball, Lofted Through Ball,
Shot) into one shared contract each, instead of duplicated per-mechanic logic:

- **Roll modifier cap** — `src/rules/rollModifierMath.mjs` exports one pure
  `sumAndCapRollModifier(sources, cap)`. A rolling subject's own card stat
  (Finishing/Long Shot, Lofted Through, Interception) is now a modifier source
  like any other: every source sums first, then the combined total is capped
  symmetrically exactly once at the frozen `diceModifiers.stackCap`. Shot and
  Lofted Through Ball previously capped situational modifiers alone and added
  the card stat back afterward, letting the cap silently drift; Pass's
  pre-roll Interception prompt had the same bug relative to its own later
  resolution. `resolveInterception` is refactored onto the same shared
  function with no numeric change. The per-source uncapped facts remain
  intact for AI Export.
- **Corner/route badge display** — `selectRouteCornerBadges(...)` in
  `matchPresentationSelectors.mjs` is the one shared projection from a
  mechanic's route/plan list to board badge props. Pass now shows a corner
  blocked by the passer's own body as a disabled badge instead of removing it
  from the list, matching Through Ball, Lofted Through Ball and Shot, which
  already displayed blocked corners this way.
- **Cancel by reselecting a target** — reselecting the already-chosen target
  during route-selection now fully cancels the action for every mechanic,
  matching Pass's existing behavior, instead of only clearing the route while
  leaving the action (and its Cancel button) active. `SHOT_CANCELLED` is a new
  Engine command; `LOFTED_THROUGH_BALL_ROUTE_CANCELLED` and
  `THROUGH_BALL_ROUTE_CANCELLED`, which only ever powered the old partial
  behavior, are removed as dead code. `main.jsx`'s Escape handler, board
  re-click detection and Inspector inline cancel now share one
  `cancelActiveResolutionTargeting()` dispatcher instead of four duplicated
  per-mechanic branches.

None of Shot's, Pass's, Through Ball's or Lofted Through Ball's own physical
rules, targeting, route geometry, Tracker cost or result formulas changed; the
four documented v20.56.28 Shot result cases remain bit-identical. Manual
Multiplayer, Firebase and Editor Mode are unchanged.

v20.56.29 gives Shot the same canonical roll contract already used by Lofted
Through Ball. `submitShotRoll` writes canonical `state.dice` for the rolling
team only and opens the shared 1000 ms result hold (`kind: "shot"`); the new
`SHOT_RESOLUTION_DUE` command performs the deterministic calculation afterward
as `SHOT_RESOLVED`. The pre-roll prompt and the result screen both read
`plan.rollPreview` / `result` through the same `selectSinglePlayerRollPromptPresentation`
and `renderRollBreakdown` conduit already used by Pass and Lofted Through Ball;
`main.jsx` no longer computes Shot modifiers locally. Every Shot roll modifier
source — non-dominant foot, each distinct defensive area, the Distant Long
Shot band, and any consumed Tracker AV/AVM/DV/DVM token — sums and is then
capped symmetrically at the frozen `diceModifiers.stackCap` (default ±4), the
same rule Lofted Through Ball and Interception already apply; the uncapped
per-source facts remain in AI Export's `routeModifierSources`. The obsolete
"Resolving interception…" prompt, which was Pass-specific dead UI during the
shared hold, is removed. `SHOT_ROLLED` and `SHOT_RESOLVED` share one atomic
Timeline transaction, so Undo returns to `awaiting-roll` and Redo restores the
same outcome in one step. The four documented v20.56.28 result cases remain
bit-identical because their fixture never exceeds the cap. Goal, Goal Kick,
Corner and goalkeeper-retains consequences remain out of scope; Manual
Multiplayer, Firebase and Editor Mode are unchanged.

v20.56.28 keeps the deliberately narrow Shot vertical slice and corrects its
board-first selection contract. A Shot can be attempted on any visible pitch
or goal-grid cell: an invalid target becomes a canonical grey preview with
the message “Please select a cell inside the opponent's goal.” and costs no
Tracker action. Goal cells are not highlighted. Live centre-to-centre distance
and Shot band follow the pointer as they do for Pass. The shooting cell's
occupied defensive area always adds its owner's DV; route crossings add other
owners, with one DV maximum per defender. Prompts and results label defensive
areas with frozen player identity rather than internal IDs.

v20.56.27 is the first deliberately narrow, playable Shot vertical slice. In
offline Single Player normal play, Shot uses actual opponent GoalGrid cells,
Pass-style corner-to-centre routes selected on the board, one canonical D20
prompt and a canonical result screen. It records Goal, Goal Kick, Corner or
goalkeeper-retains as a result only. It deliberately does **not** change score,
ball, possession, turn or restart state; the result screen blocks play until
Timeline Undo/Redo or a new match. Rule Set Shot range/band values freeze in
MatchContext. Manual Multiplayer and Firebase are unchanged.

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
