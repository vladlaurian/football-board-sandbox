# Release Changelog

This is the compact release history. Current architecture and rules are documented in their permanent contracts; it must not be used as a second specification.

## v21.1.0 — Free Kick Direct/Indirect playable end-to-end; new Goalkeeper Retains reposition

- Tackling foul (outside the box) → Direct Free Kick (no possession change,
  same numbered turn); Offside → Indirect Free Kick (real turn advance,
  possession changes). Both now route into the shared restart-setup engine.
- Wall position + length is its own screen, before player selection, with a
  live board highlight and a Rule-Set-configured maximum; "No Wall" is
  available on that first screen for both Free Kick types.
- Mandatory illegal-distance retreat (5 orthogonal / 4 diagonal from the
  ball) for Corner and both Free Kicks: a violator must move first, and can
  never be repositioned back into that zone — fixes a live-reported
  soft-lock and a moves-farming exploit.
- Wall-continuation Yes/No confirm when a reposition would extend the
  wall's own fixed line.
- Symmetric extra reposition moves for both sides (not defense-only), moves
  granted upfront so the attacking side (which always moves first) already
  has its share.
- `diceModifiers.stackCap` of `0` now means no maximum, everywhere it's
  used — previously meant "clamp every situational modifier to zero."
- Free Move / Free Ball work for either team through any restart setup or
  the new Goalkeeper Retains reposition window (global testing convenience).
- New: Goalkeeper Retains untracked reposition (`src/engine/gkRepositionRules.mjs`)
  — Rule-Set-configured move count per side (0 disables), goalkeeper's own
  team first, real movement legality (Speed/diagonal/axis), never touches
  the Tracker. Three independent triggers (after Free Kick / after a corner
  header, inert until built / any catch). One piece per turn, retired for
  the rest of that phase once used.
- Inspector action buttons (Shot, Pass, Through Ball, Lofted Through Ball)
  are now disabled during a restart's execution phase when not in that
  restart type's own `availableActions`, generalized via a single shared
  family map also used by the Engine's own dispatch gate — previously only
  failed after a click, and only really surfaced for Shot.
- Live-reported fixes: the ball wasn't moved to the Free Kick execution
  spot; a stale pre-move state read during reposition could wrongly
  re-grant moves and force the turn back to defense; several
  restart/reposition rejections showed only a generic message; Skip on the
  reposition panel silently did nothing when rejected.

## v21.0.0 — Marking finished (docs/MARKING_RULES.md sections 1-8 complete)

- **Marking switch** (section 8): an already-marked attacker entering a
  different eligible defender's area offers a keep/switch decision instead of
  a silent no-op. Accepting ends the old marking (no refund) and starts a
  fresh one for the new defender with a full Speed budget, following the
  same deferred opportunity-charging rule as any other Marking. Fast exit
  ending the old marking within the same move correctly routes to a fresh
  entry decision (section 3) instead of a switch; fast exit against the new
  candidate still prevents that specific switch offer.
- **"Near miss" fast-exit explanation**: a route with the required Speed edge
  that still doesn't qualify for fast exit — because the crossing itself was
  too long (3+ orthogonal or 2+ diagonal cells) — now announces why, instead
  of the marking just silently staying active with no visible reason.
- **Regression fix (live-reported)**: a defender's own current cell was never
  counted as part of its own defensive area (only the card's listed offsets
  were), so a route that happened to pass exactly through wherever the
  marker was currently standing got its otherwise-continuous crossing split
  into two shorter pieces — the trailing short piece could then wrongly
  qualify for fast exit. Fixed in `markingRules.mjs`'s own area-cells helper
  only (Shot/Through Ball/Lofted Through Ball, which already handle body
  presence as a separate mechanic, are untouched).
- Corrected UI text for three Marking-ended reasons (`canceled`, `switched`,
  `declined-continue`) that previously all fell back to the wrong "had no
  legal cell left" message. The "Continue Marking?" modal now reads through
  `selectSinglePlayerMarkingContinuePresentation` like every other Marking
  modal (ADR-049), instead of reading canonical state directly.
- New `docs/IMPLEMENTATION_STATUS.md`: a maintained checklist of every
  mechanic's real implementation status, referenced from `CLAUDE.md`.
  Corrected several other docs that had gone stale claiming Marking, Shot,
  Goal Kick, Corner or mid-match tactic change were still unimplemented
  (`GAMEPLAY_RULES_FOUNDATIONS.md`, `GAME_ENGINE_MIGRATION_PLAN.md`,
  `TEAM_COMPOSITION_AND_FORMATIONS.md`, `ARCHITECTURE_DECISIONS.md`).
  Removed the stale `CLAUDE.md` "Approved programme" table (all four listed
  builds had already shipped) and the dead `NEXT_CHAT_PROMPT_v20_56_0.md`.

## v20.56.45 — General restart-setup engine: Corner and Goal Kick playable end-to-end

- New shared engine (`src/engine/restartSetupRules.mjs`, `state.restartSetup`)
  covering Corner, Goal Kick, and (configured, not yet triggerable) Free Kick
  Direct/Indirect and Throw-in: wall → reposition → executor → execution,
  each phase skippable via Rule Set (`wallSize`/`repositionCount` = 0).
  Kick-off and Penalty stay separate (structurally different mechanics).
- Shot's `"corner"`/`"goal-kick"` outcomes now start a restartSetup instead
  of being rejected (`applyShotConsequence` in `src/engine/shotRules.mjs`).
  The ball cell is fixed automatically, echoing which half of the goal the
  shot was aimed at (random fallback only for a dead-centre attempt).
- New Rules panel sections for all five restart types (wall size,
  reposition count, available-actions checkboxes); Free Kick/Throw-in
  labelled "not yet triggerable in a Match".
- Hardcoded per-(restart-type × action) exceptions: Corner Shot (exempt from
  the board-boundary rule, mandatory DVM, one DV if the wall was placed);
  Free-Kick-Direct Shot (no body-blocking, wall DV instead of defensive-area
  DV); Free Kick Lofted Through Ball (editable difficulty override, no
  defensive-area effect); Corner Long Pass into the box (hardcoded illegal,
  not merely disadvantaged, with an explicit UI message at target selection).
- Goal Kick only: the non-executing side cannot skip or exhaust its
  reposition turn while any of its own pieces remains inside the executing
  team's box — must move that piece first (Skip is physically disabled in
  the UI, not just rejected). Corner has no such restriction.
- Whoever already stands on an Engine-computed wall/ball cell is relocated
  automatically and for free, as early as possible (before wall/reposition
  even start), so the displaced piece stays normally repositionable rather
  than a placement the coach can no longer adjust.
- New restart-setup UI panel (same family as the Dice panel): wall
  selection, repositioning with a live local preview before Confirm,
  executor selection. Board clicks only stage a local selection; the real
  command dispatches only on Done/Confirm, mirroring Shot's own flow. The
  ordinary legal-move hover hint goes neutral while any restart phase is
  active.
- New editable Shot fields `goalKickInterval`/`cornerInterval` (1-5, default
  1 = the original exact rule): widen which low natural rolls count as Goal
  Kick and which totals at-or-below the goalkeeper's stat count as Corner.
  Neither can ever turn an actual Goal into anything else — that comparison
  is checked first, unconditionally.
- New tests: `restartSetupRules.test.mjs`, `restartSetupPresentation.test.mjs`,
  `restartActionExceptions.test.mjs`, plus extensions to
  `shotRules.test.mjs` and `ruleSets.test.mjs`. Full suite (481) passing.
- See `docs/ARCHITECTURE_DECISIONS.md` ADR-062 for the full design.

## v20.56.44 — Shot route must stay on the pitch (Build 0 of Corner work)

- `buildShotRoutePlan` (`src/engine/shotRules.mjs`) now rejects a normal
  Shot whose straight corner-to-centre line crosses the goal-line plane
  outside the goal's own width band before curving back in — a wide-angle
  shot toward the near post, reproduced live by the user. Threshold works
  out to exactly 45° to the post, from board geometry, no new Rule Set
  value.
- New `exemptFromBoardBoundary` param (unused today, every current caller
  keeps the check) — reserved for the direct Corner Shot contract
  (`SHOOTING_RULES.md` section 5), which is explicitly allowed to leave the
  board.
- New tests: 4 cases at/around the 45° threshold. Full suite (437) passing.
- This is the first of several builds toward a general restart-setup engine
  (Corner, direct/indirect Free Kick, Goal Kick, Throw-in) discussed and
  agreed but not yet started.

## v20.56.43 — Mid-Match Ready re-confirms the kick-off piece

- New Engine command `KICKOFF_READY_CONFIRMED`
  (`src/engine/kickoffReadyRules.mjs`): mid-Match, `Ready` re-lays out the
  team into its active tactic, re-validates it, then re-picks that team's
  ST under the CURRENT tactic and pins it + the ball to centre — fixes the
  pinned player sometimes no longer being an ST after a mid-restart tactic
  change. Rejected with `NOT_AT_KICKOFF_RESTART` away from a pending
  restart; `TEAM_TACTIC_INVALID` if the tactic still doesn't match — either
  way, no board change. UI only dispatches + displays the reason.
- Pre-Match `Ready` (roster validation) is unchanged; the two paths split
  on `trackerGameStarted`.
- New tests: `kickoffReadyRules.test.mjs` (4 tests). Full suite passing.
- **Correction**: v20.56.42's "Lofted Through Ball can never complete" entry
  was wrong — a test-fixture mistake (missing stat `id`), not a real bug.
  `resolveLoftedThroughBallStat` in `matchContext.mjs` already auto-resolves
  the roll stat correctly. Withdrawn; confirmed working with a corrected
  test.

## v20.56.42 — Kickoff/tactic bug-fix round on Program A

- A restart from centre re-lays out both teams into their active tactic
  (`state.activeFormation`) unconditionally, not just when freshly queued —
  matches `docs/FINALISATION_AND_RESTARTS_RULES.md` 3.2. Ball + kick-off
  piece always pinned to centre afterward. Fixes tactic/Adjust displacing
  the kick-off piece from the ball.
- Removed the forced backward/free-cost kick-off pass rule entirely — any
  pass type (Short/Long/Through Ball/Lofted Through Ball), any direction,
  normal Tracker cost. Only the piece restriction remains. Rewrote the
  Build B tests/docs asserting the old rule.
- New `state.tacticBlock`: blocks a team's actions entirely if its active
  tactic doesn't match its assigned cards' roles (banner + disabled
  buttons), until fixed from Prep.
- Fixed pre-existing bug: Editor Mode exit never reset
  `trackerGameStarted`/`currentTurn`/`score`/dice in React state, so
  re-entering Match Mode inherited stale progress. Added missing React
  mirrors for `pendingFormation`/`activeFormation`/`tacticBlock`.
- Formation preview: inset edge-hugging slots, deterministic collision
  spacing for overlapping ones.
- Post-goal prompt now also fires directly from the goal dispatch.
- New tests: `tacticLegalityRules.test.mjs`, `kickoffAnyPassType.test.mjs`
  (including a full Lofted Through Ball completion through the real command
  sequence).

## v20.56.41 — Tactics preview + kickoff-gated formation application (Program A)

- Prep's `Formation` dropdown now only updates a read-only preview
  (`src/prep/FormationPreview.jsx`, `src/board/formationLayout.mjs`) — it
  never touches live pieces.
- `Selection` renamed to `Select Formation` (its only prior behavior, scroll
  to summary, was confirmed dispensable); it confirms the previewed tactic —
  applied immediately at a kickoff moment, otherwise queued in canonical
  `state.pendingFormation`.
- New `isKickoffMoment` (`src/engine/kickoffMomentRules.mjs`): before Match
  start, or during a pending post-goal `kickoffRestart`. Half-time is a
  future third case, out of scope (no such state exists yet).
- New canonical command `FORMATION_TACTIC_CONFIRMED`
  (`src/engine/formationTacticRules.mjs`), tracked via `state.activeFormation`.
  A goal now applies any queued tactic for either team
  (`applyGoalConsequence` in `shotRules.mjs`) before placing the kickoff
  piece and ball.
- Adjust is kickoff-gated; a mid-Match placement goes through the new
  canonical `ADJUST_PIECE_PLACED` command
  (`src/engine/adjustPlacementRules.mjs`) instead of the pre-Match Workspace
  path. Pre-Match Adjust is unchanged.
- Post-goal prompt: "Vrei să faci schimbări tactice?" opens Prep
  pre-selecting the entitled team on `Da`. `Continue Game` is untouched
  (frozen) and never triggers it.
- New tests: `kickoffMomentRules.test.mjs`, `formationTacticRules.test.mjs`,
  `adjustPlacementRules.test.mjs`, `tacticPresentation.test.mjs`, plus new
  `shotRules.test.mjs` cases. 417/417 passing.
- Substitutions (Program B) remain out of scope — see
  `docs/TEAM_COMPOSITION_AND_FORMATIONS.md` section 4's "Blocking dependency"
  note.

## v20.56.40 — Bench/reserve pieces are fully inert during a running Match

- Reserves (`A-R-1..7` / `B-R-1..7`) can no longer act, receive, obstruct, or
  be selected for gameplay — only inspected — since no Substitution
  mechanic exists yet to bring one onto the pitch.
- Defensive Areas overlay (`src/main.jsx`) no longer draws a reserve's
  defensive cells in either D.A. mode.
- All 7 "start an action" commands (`startPass`, `startShot`,
  `startThroughBall`, `startLoftedThroughBall`, `startNormalMove`,
  `startBonusMove`, `startFreeMove`) reject a reserve as actor at the
  Engine level.
- `passEngine.mjs`, `throughBallRules.mjs`, `loftedThroughBallRules.mjs`
  exclude reserves from every defender/interceptor/receiver/body-blocker
  role (frozen legacy Manual Multiplayer path untouched). `shotRules.mjs`'s
  Goal→Kickoff consequence can no longer pick a reserve as kickoff piece or
  match a reserve in place of the real goalkeeper.
- `evaluateGroupMovePieceEligibility` rejects a reserve outright.
- `selectSinglePlayerPieceActionPresentation` (the single ADR-049
  presentation selector) forces every action flag false for a reserve,
  disabling all of its card's action buttons while leaving Inspector
  read-only access intact.
- The documented 11-a-side / 1-goalkeeper roster cap needed no new code:
  it is already structurally unbreakable with reserves blocked from
  acting and no Substitution mechanic yet to bring one on.
- New tests: `src/engine/benchReserveEligibility.test.mjs` (12 tests).
- "Continue Game"'s kickoff behavior is unchanged and out of scope, per
  explicit user instruction. "Start New Game" formation problems deferred.

## v20.56.39 — Goalkeeper-restart exception now ignores every body, teammate or opponent

- Confirmed rule change (not a bug fix): in Goalkeeper Retains' restart,
  every body inside the goalkeeper's own penalty area is ignored, not just
  an opponent's. `docs/SHOOTING_RULES.md` and `docs/CROSS_RULES.md` updated
  from "opposing bodies" to "every body (teammate or opponent)".
- `bodyIgnoredByException` (renamed from `opponentIgnoredByException`) and
  the origin-block exemption in `buildPassPlan` no longer filter by team;
  same for `planThroughBall`'s `bodyBlocked` exemption. The direct-contact
  `ignorableBodyIds` set always excludes whoever occupies the requested
  target cell, so the intended receiver itself is never treated as an
  obstruction.
- The general Pass rule (a teammate's body along an ordinary route
  "receives directly" per `docs/PASS_AND_INTERCEPTION_RULES.md`) is a
  separate, unrelated, unchanged concept.
- Tests updated/reversed in `src/rules/passEngine.test.mjs` and
  `src/engine/goalkeeperRestartException.test.mjs`.
- See ADR-061's third note.

## v20.56.38 — Fix goalkeeper-restart exception: opposing body on the route was still redirecting the pass

- **Root cause, precisely reported and confirmed**: the exception correctly
  ignored an opposing defensive-area crossing inside the goalkeeper's own
  box, but `firstPlayerHit`/`endpointBodyContact` (Pass's mechanic that
  redirects onto the first body the route touches) were left untouched —
  an opponent's body sitting on the route inside the box still became the
  pass's effective target, sending the ball straight into that opponent
  instead of the real intended receiver.
- `firstPlayerHit`/`endpointBodyContact` (`src/rules/passEngine.mjs`) now
  accept an `ignorePieceIds` set (opposing pieces inside the box under the
  active `restartException`) and exclude them from hit-detection entirely.
  `bodyBlockingPassOrigin`'s exemption is now also correctly restricted to
  opponent bodies only, not any body regardless of team.
- New tests in `src/rules/passEngine.test.mjs` reproduce the exact reported
  scenario and confirm a teammate's body is never exempted.
- New end-to-end engine tests (`src/engine/shotRules.test.mjs`) drive the
  full Shot → Goalkeeper Retains → Continue → Pass command sequence under
  both `center-to-center` and the app's real default `corner-to-center`
  pathMode, confirming the defensive-area handling was already correct and
  isolating the body-contact gap precisely.
- See ADR-061's second amendment and the updated Mechanic Integration Gate
  rule in `docs/ACTION_RESOLUTION_ENGINE.md`.

## v20.56.37 — Fix Kick-off cell direction; investigation notes on two unreproduced reports

- **Fixed**: `applyGoalConsequence` (`src/engine/shotRules.mjs`) placed the
  entitled team's kickoff piece at the exact halfway cell
  (`floor(cols/2)`) for both teams. The rule
  (`docs/FINALISATION_AND_RESTARTS_RULES.md` 3.2) requires the cell
  *adjacent* to the centre point, in the entitled team's own attacking half
  — exactly the formula `prepareNewGamePieces` in `main.jsx` already uses
  for a Match's very first kickoff (`centerX` for blue, `centerX - 1` for
  red). `applyGoalConsequence` now uses that same formula. Test fixture in
  `src/engine/shotRules.test.mjs` updated (centre x is 9, not 10, for a
  20-column board when red is entitled).
- **Investigated, not reproduced**: two further reports from the same test
  round — (1) the goalkeeper's own restart Pass not completing after
  Goalkeeper Retains, together with duplicated/offset corner-badge
  rendering in the screenshot; (2) "Start New Game" placing pieces
  incorrectly despite selected formations. Neither was reproduced against a
  freshly restarted dev server in this session (the dev server had been
  running continuously through dozens of hot-reloads across a long session,
  which is a known source of stale/duplicated React state unrelated to
  actual code defects). No code change was made for either — retesting
  against a hard-refreshed page is needed before diagnosing further; see the
  conversation for the exact retest steps requested.

## v20.56.36 — Fix Goal's Kick-off layout bug, add Tracker score display

- **Bug fix**: v20.56.35's `applyGoalConsequence` froze `state.pieces` into
  `state.kickoffLayout` at Match start/restart and restored the full layout
  on every Goal. This broke whenever the Match was started through
  "Continue Game" (which intentionally skips Prep/formation placement) —
  the frozen snapshot held an arbitrary mid-match position instead of a
  formation, so nothing repositioned after a Goal, and the entitled team's
  kickoff piece landed on top of the scoring player.
- `applyGoalConsequence` now computes the centre cell from pure board
  geometry (`floor(cols/2), floor(rows/2)`) — correct regardless of how the
  Match started. Only the ball and the entitled team's kickoff piece move;
  every other piece stays where it is. `state.kickoffLayout` is removed
  entirely from `src/game/gameState.mjs`, `src/engine/matchLifecycleRules.mjs`
  and `src/engine/shotRules.mjs`. See ADR-061's postmortem.
- New Tracker score display: `TrackerPanel.jsx` shows `BLUE` / score / `RED`
  under the Turn row, team names in team colour, score in white, centered.
  `state.score` now syncs into React state via `applyTimelineGameState`,
  matching how `trackerCurrentTurn` already does.
- `src/engine/shotRules.test.mjs`'s Goal fixture updated to match: no
  `kickoffLayout`, asserts untouched pieces stay exactly where they were.

## v20.56.35 — Shot consequence: Goal + Kick-off (Build B), goalkeeper-restart exception, comparison-label reformat

- New canonical `state.score` (`{ blue, red }`), reset on Match start/restart.
- New `state.kickoffLayout`: a snapshot of `state.pieces` frozen at every
  Match start/restart (`matchLifecycleRules.mjs`), used to restore both
  teams' full layout for every future Kick-off instead of recomputing a
  formation (Engine cannot depend on the Editor's UI-owned formation
  pipeline). See ADR-061.
- `SHOT_CONSEQUENCE_DUE` now also accepts the `goal` outcome
  (`applyGoalConsequence` in `src/engine/shotRules.mjs`): increments the
  scoring team's score, restores every piece from `kickoffLayout`, and
  places the conceding team's ST (or any outfield piece if no ST exists)
  with the ball on the frozen centre cell. Sets `state.kickoffRestart =
  { team, pieceId }`.
- New `gameEngine.mjs` guard, `kickoffRestartActive`: blocks every command
  except the Pass set and admin commands while a kickoffRestart is pending,
  mirroring the existing `bonusActionActive` guard shape.
- `passStartRules.mjs`'s `startPass` rejects any piece other than
  `kickoffRestart.pieceId` with `KICKOFF_RESTART_WRONG_PLAYER`;
  `confirmPassRoute` rejects a Long Pass or a non-backward target with
  `KICKOFF_RESTART_MUST_BE_SHORT_PASS`/`KICKOFF_RESTART_MUST_BE_BACKWARD`,
  and treats the accepted pass as Tracker-free, exactly like a Bonus Action
  pass. `completePass`/`completeNormalInterception`/
  `completeNaturalTwentyInterception` clear `kickoffRestart` once that one
  pass resolves.
- The Shot result screen's Continue button now also appears for the `goal`
  outcome (`confirmShotConsequence`, renamed from
  `confirmShotGoalkeeperRetains`), dispatching the same
  `SHOT_CONSEQUENCE_DUE` command.
- **Goalkeeper-restart exception** (docs/SHOOTING_RULES.md): after
  Goalkeeper Retains, that goalkeeper's own next restart ignores opposing
  bodies and defensive areas inside its own penalty area. New shared
  geometry, `insideOwnPenaltyArea(settings, cell, team)` in
  `src/rules/passEngine.mjs` (large and small box), threads an optional
  `restartException: { team, pieceId }` into `buildPassPlan`,
  `planThroughBall` and `planLoftedThroughBall`; each mechanic's own
  terminal completion path clears `state.goalkeeperRestartException` once
  that restart resolves. Direct body contact at the pass's endpoint/target
  is untouched — the exception only relaxes defensive-area/body-block
  geometry, never who may legally receive the ball.
- **Comparison-label reformat**: `RollPromptCard`'s `comparisonLabel` prop
  and `renderRollBreakdown`'s trailing "vs" line now read value-first —
  `13 — GK Noah Diving Saves`, `12 — Difficulty` — identically pre- and
  post-roll, across Shot, Lofted Through Ball and Pass/Interception.
  `passTargetLabel` gains the attacker's identity, which it was missing
  entirely before.
- Goal Kick and Corner are untouched and remain the terminal ADR-058
  checkpoint with no Continue control — each is a separate future build.
- New tests: `src/engine/shotRules.test.mjs` (Goal consequence,
  kickoffRestart guard/wrong-player/direction/Tracker-free enforcement),
  `src/rules/passEngine.test.mjs` and the new
  `src/engine/goalkeeperRestartException.test.mjs` (Through Ball and Lofted
  Through Ball exception coverage).

## v20.56.33 — Shot consequence: Goalkeeper Retains (Build A)

- First of four separately approved builds extending Shot's terminal
  `result-display` checkpoint (v20.56.27, ADR-058) into a real physical
  consequence. This build covers **only** the `goalkeeper-retains` outcome;
  Goal, Goal Kick and Corner are unchanged and stay terminal.
- New Engine command `SHOT_CONSEQUENCE_DUE` (`applyShotConsequence` in
  `src/engine/shotRules.mjs`): the ball moves to the goalkeeper's own cell and
  a new numbered turn begins for the goalkeeper's team — the same
  mid-turn-possession-loss pattern Pass's `completeNormalInterception`
  already established for an intercepted Pass. Any other outcome is rejected
  with `SHOT_CONSEQUENCE_OUTCOME_INVALID`.
- The Goalkeeper Retains result screen gets a **Continue** button
  (`confirmShotGoalkeeperRetains` in `main.jsx`), exactly like Lofted Through
  Ball's and Pass's own non-terminal result screens, and dispatches
  `SHOT_CONSEQUENCE_DUE` on click. An earlier version of this build used a
  timed 1000 ms auto-advance with no button instead; browser testing showed
  that reads as too abrupt and inconsistent with every other result screen's
  exit pattern, so it was reverted in favor of the Continue button before
  this delivery.
- ADR-058 is updated: the "no exit but Undo/Redo or new match" clause now
  applies only to Goal/Goal Kick/Corner, which remain unimplemented. The
  Continue button is not a fake control under rule 11 because it performs
  the real canonical consequence.
- Fixes a real display gap on all three pre-roll prompts (Shot, Lofted
  Through Ball, Pass/Interception): `renderRollBreakdown`'s "vs {comparison}"
  line only ever appeared after `natural` existed, i.e. after the roll — so
  the goalkeeper's fixed save stat, Lofted's Difficulty, and the defender's
  Passing target were invisible before rolling. `RollPromptCard` gains an
  unconditional `comparisonLabel` line shown regardless of roll state; all
  three call sites now use it, replacing Interception's previously bespoke
  `extra` line.
- No change to targeting, route, roll, modifier cap, or any other outcome.

## v20.56.32 — Uniform hold and shared result/decision/prompt components

- Lofted Through Ball gains the same 1000 ms roll-result hold Pass and Shot
  already had. `submitLoftedThroughBallRoll` now only writes the roll and
  opens `createSinglePlayerRollResultHold()`; a new command,
  `LOFTED_THROUGH_BALL_RESOLUTION_DUE`, performs the succeed/fail math
  (unchanged) once the hold elapses, handled by the new
  `resolveLoftedThroughBallRoll` in `loftedThroughBallRules.mjs`. The
  downstream `status: "roll-resolved"` name is unchanged, so nothing else in
  the consequence flow moved.
- The 8 hand-written result/decision modal blocks (Pass interceptor choice,
  Shot result, Lofted result, Lofted recoverer choice, Lofted recovered,
  Through Ball recoverer choice, Through Ball recovered, passResultNotice)
  are replaced by two shared components in `main.jsx`, `ActionResultModal`
  and `ActionDecisionModal`. Every title is now the bare action name
  ("Shot", "Lofted Through Ball") — no "resolution"/"result"/"recovered"
  suffix.
- The 3 separate pre-roll prompts (Pass/Interception, Lofted Through Ball,
  Shot) are replaced by one shared `RollPromptCard` component.
- `docs/ACTION_RESOLUTION_ENGINE.md`'s Mechanic Integration Gate gains a
  permanent rule, "Mandatory shared hold and UI components", requiring every
  future mechanic to reuse this same two-command hold split and the same
  three shared components.
- No physical rule, targeting, route geometry or Tracker cost changed.

## v20.56.31 — Pass verdict and Shot cancel-button correction

- `PASS_TARGET_SELECTED`'s canonical route `verdict` never checked
  `plan.originBlocked`. Before v20.56.30 this was invisible because
  origin-blocked routes were filtered out before display; once v20.56.30
  started showing them (per the shared corner-badge contract), an
  origin-blocked corner showed whatever its unrelated risk/clear check
  produced instead of the grey "blocked" badge Through Ball, Lofted Through
  Ball and Shot already used. `verdict` now includes `originBlocked`.
- Shot's Inspector action-row control had no working way to cancel an active
  Shot: it stayed disabled instead of becoming "CANCEL SHOT", unlike Pass's
  control which already becomes "CANCEL PASS". `selectSinglePlayerInspectorActionPresentation`
  gains a `shotCancellable` case mirroring `passCancellable` exactly.
- No physical rule, targeting, route geometry or Tracker cost changed.

## v20.56.30 — Shared roll-cap, corner-badge and cancel contracts

- `src/rules/rollModifierMath.mjs` adds one shared `sumAndCapRollModifier`.
  Shot and Lofted Through Ball now include the rolling subject's own card
  stat inside the capped sum instead of adding it back after capping; Pass's
  pre-roll Interception prompt gets the same fix so it never disagrees with
  the actual resolution. `resolveInterception` is refactored onto the same
  function with an identical numeric result (verified by its existing tests).
- `selectRouteCornerBadges` in `matchPresentationSelectors.mjs` is the one
  shared corner-badge projection for Pass, Through Ball, Lofted Through Ball
  and Shot. Pass now shows an origin-blocked corner disabled instead of
  removing it, matching the other three mechanics.
- Reselecting an already-chosen target during route-selection now fully
  cancels the action for every mechanic (matching Pass's existing behavior)
  instead of only returning to targeting. Adds `SHOT_CANCELLED`; removes the
  now-unreachable `LOFTED_THROUGH_BALL_ROUTE_CANCELLED` and
  `THROUGH_BALL_ROUTE_CANCELLED` commands. `main.jsx` consolidates the
  Escape handler, board re-click detection and Inspector inline cancel into
  one `cancelActiveResolutionTargeting()` dispatcher.
- No physical rule, targeting, route geometry, Tracker cost or result formula
  changed for any mechanic; the four documented v20.56.28 Shot outcome cases
  remain bit-identical. Manual Multiplayer, Firebase and Editor Mode are
  unchanged.

## v20.56.29 — Shot roll parity: canonical dice, shared hold, capped modifiers

- `submitShotRoll` writes canonical `state.dice` for the rolling team only, in
  the exact shape Lofted Through Ball already uses.
- The new `SHOT_RESOLUTION_DUE` command performs the deterministic Shot
  calculation only after the shared 1000 ms roll-result hold (`kind: "shot"`);
  `SHOT_ROLLED` and `SHOT_RESOLVED` join one atomic Timeline transaction.
- Every Shot roll modifier source (foot, each distinct defensive area, Distant
  Long Shot band, consumed Tracker token) is summed and then capped
  symmetrically at the frozen `diceModifiers.stackCap`, matching Lofted
  Through Ball and Interception; the uncapped per-source facts remain in AI
  Export's `routeModifierSources`.
- The pre-roll prompt and result screen both read the shared
  `selectSinglePlayerRollPromptPresentation` / `renderRollBreakdown` conduit;
  `main.jsx` no longer computes Shot roll modifiers locally.
- Removes the obsolete "Resolving interception…" prompt, which was Pass-only
  dead UI during the shared hold.
- Formula non-regression: the four documented v20.56.28 outcomes are
  bit-identical because that fixture never exceeds the cap.
- Manual Multiplayer, Firebase/Automated Multiplayer, Editor Mode and every
  Shot consequence (Goal/Goal Kick/Corner/goalkeeper-retains) remain untouched.

## v20.56.28 — Shot board targeting and origin defensive-area correction

- Keeps the v20.56.27 Shot result checkpoint, but makes targeting match Pass:
  every visible board cell can be attempted, invalid cells persist a grey
  canonical preview and no goal grid receives a yellow target highlight.
- Adds live centre-to-centre Shot distance/band feedback on the board.
- Counts the shooter's occupied defensive area regardless of selected corner,
  then deduplicates each defending player to one DV. Defensive-area labels use
  frozen player identity (name, post, team), never internal defender IDs.
- Aligns Shot prompt/result information hierarchy with existing roll/result
  presentation without adding any acknowledgement or restart control.
- Manual Multiplayer, Firebase/Automated Multiplayer and Shot consequences
  remain untouched.

## v20.56.27 — Shot resolution checkpoint

- Clean implementation from v20.56.25; rejected v20.56.26 code is not reused.
- Adds offline Single Player normal-play Shot only: actual GoalGrid target
  selection, four Pass-style corner-to-centre paths, shared-origin body blocks,
  route verdict projection, canonical D20 and frozen Rule Set/MatchContext
  calculation.
- Persists a hard-blocking `result-display` state for Goal, Goal Kick, Corner
  or goalkeeper retains. The result intentionally has no physical consequence:
  score, ball, possession, turn and restart remain unchanged.
- Adds Timeline/Undo/Redo and AI export facts for every Shot step. Rule Set
  schema is v13; Shot normal Long Shot range, maximum range and distant DV/DVM
  are editable only in Editor and frozen at Match start.
- Manual Multiplayer, Firebase/Automated Multiplayer and Pass/Interception
  timing are unchanged.

## v20.56.25 — Continue Game restoration and scope lock

- Restores offline Single Player `Continue Game` without a Prep/Ready gate or
  a prior `Start New Game`: an unstarted tracker creates a normal Match from
  the current board; an existing Match restarts its canonical action/tracker
  state without changing current coordinates.
- Keeps `Start New Game` as the only Prep/Ready-gated new-match path.
- Keeps Manual Multiplayer's previous Continue availability unchanged.
- Adds the permanent workflow scope-lock rule: unapproved gates, lifecycle or
  default changes, and UI availability changes are prohibited; protected
  behaviour needs named verification before delivery.

## v20.56.24 — Canonical Modifier Tracker

- Implements canonical Single Player `teamModifierTokens` in MatchState,
  replacing the positive-only legacy roll-opportunity state while accepting it
  on old-recording normalization.
- Supports AV, AVM, DV and DVM; exact opposite tokens cancel only at the same
  tier, and each team has a frozen MatchContext capacity (default 3).
- Migrates implemented Interception and Lofted Through roll-token selection,
  consumption and expiry without changing their accepted rules or formula-local
  modifiers.
- Adds Tracker Settings persistence for team modifier capacity and displays
  canonical modifier rows below team actions and above turns.
- Adds canonical token data and transition metadata to AI analysis state.
- Manual Multiplayer, Firebase authority and gameplay Rule Set semantics are
  unchanged.

## v20.56.23 — Implemented rules extraction and roadmap consolidation

- Documentation-only build from the accepted v20.56.22 archive; runtime,
  package, Engine, Timeline, AI export, WorkspaceSnapshot, Manual Multiplayer
  and Firebase are unchanged.
- Adds permanent player-rule contracts for the implemented Short/Long Pass and
  Interception family, Through Ball and Lofted Through Ball. Their technical
  sources remain the Pass/Interception Engine, Action Resolution Engine and
  Rule Set editor documents.
- Consolidates the dependency-ordered post-v20.56.22 roadmap. It records the
  future tactical/substitution boundary: Workspace formation prepares a new
  Match, MatchState owns an active in-Match tactic, and live coordinates remain
  physical board state until an authorised restart placement changes them.

## v20.56.22 — Prep team ownership and Ready gate

- While offline Single Player Prep is open, the selected Prep team is the only
  team that may adjust a starter or change card assignment/removal. The other
  team remains available for inspection and its existing board state is not
  changed.
- Ready is an independent transient confirmation for Blue and Red. A formation,
  Adjust or card-assignment mutation invalidates only the affected team's Ready
  state; the other team remains confirmed.
- `Start New Game` now requires both teams to be Ready. Until then it keeps its
  visible Tracker control and explains: `Please prepare your team from Prep
  Menu.` `Continue Game` has no Ready dependency.
- No WorkspaceSnapshot schema, Engine, MatchContext, Timeline, AI export,
  Manual Multiplayer or Firebase behavior changes.

## v20.56.21 — Half-pitch formations and local Adjust correction

- Clean corrective build from v20.56.19; no runtime code is retained from the
  rejected v20.56.20 build.
- All 22 fixed templates now keep Blue starters in their own half, mirror Red
  into its own half, avoid the actual centre-circle geometry and retain forwards
  as close to that circle as legally possible.
- Adjust no longer applies automatic role-zone layout or hides the existing
  coordinate display. It is a selected-starter-only local 5×5 formation-anchor
  adjustment, highlighted in the selected team colour and blocked by occupied
  player cells.
- Formation incompatibilities render an explicit red lock and correct card id
  metadata for the expected/assigned role tooltip. Manual Multiplayer, Engine,
  Timeline and AI export are unchanged.

## v20.56.19 — Standard formations and recipe-based selection

- Replaces editable formation slots with the approved 22-template standard
  catalogue, including the three 3-5-2 profiles.
- A formation now carries an ordered starter-role recipe solely as a slot
  requirement. `card.position` remains the only player-role authority.
- Selecting a formation always keeps every assigned card. Matching cards are
  placed in matching slots; unmatched cards remain visibly red in temporary
  incompatible slots, with missing/excess roles and compatible formations in
  Prep.
- Ready uses the exact selected formation recipe instead of the former generic
  starter min/max position rules. Adjust is disabled for an incompatible team;
  Start New rejects an incompatible complete roster. Manual Multiplayer,
  Engine, Timeline and AI export are unchanged.

## v20.56.18 — Role-aware Adjust layout and prepared-layout persistence

- Replaces centroid-only Adjust placement with explicit `card.position` role
  anchors and a validated complete plan. CB starters use ±2 rows; CDM and CM
  use ±3 rows. ST defaults remain inside K–S on the approved central column.
- Reopening Adjust preserves existing manual positions. A visible per-team
  reset action deliberately regenerates only that team's default role layout.
- Ready now exits Adjust and removes highlights without moving pieces. The
  persisted Workspace prepared-layout marker makes Start New retain adjusted
  positions instead of reapplying that team's formation template.
- Manual Multiplayer and Firebase are unchanged.

## v20.56.17 — Adjust runtime hotfix

- Fixes the v20.56.16 React initialization error that could render a black
  screen before the application mounted. The Adjust overlay now reads only
  state already initialized at that point in `App`.
- No gameplay, zone, Tracker, Timeline, Engine, Manual Multiplayer or Firebase
  behavior changes.

## v20.56.16 — Adjust zones and Blue kick-off alignment

- Makes `Adjust` functional in offline Single Player Prep. It automatically
  places the eleven starters in distinct central cells of their approved
  `card.position` zones, visibly highlights every active zone, and restricts
  manual Adjust moves to the selected player's own zone and an unoccupied cell.
- Corrects Blue Start New Game placement to the exact central mirror of the
  already correct Red kick-off, with the ball on the starting ST's cell.
- Keeps Substitution and the interruption/restart lifecycle out of scope.
  Manual Multiplayer and Firebase are unchanged.

## v20.56.15 — Live Prep formations and kick-off possession correction

- Formation selection in Single Player Prep once again repositions the board
  immediately, before or after a Match starts, while retaining every `cardId`.
- Corrects Start New Game kick-off: the ball now occupies the same adjacent
  central cell as the starting ST, so that player begins in possession.
- Manual Multiplayer and Firebase are unchanged.

## v20.56.14 — Match start / continue lifecycle and minimum formation structure

- Replaces Tracker Start Game with equal-width `Start New Game` and `Continue
  Game` controls. New Game reapplies selected formations, preserves cards,
  resets the ball to centre and places the starting ST one cell into the
  opponent half; Continue Game preserves the current board while resetting all
  Match runtime.
- Prep is available throughout offline Single Player Match Mode. A formation
  selected while a Match is active is staged for the next New Game and cannot
  silently rewrite the live board.
- Leaving Match Mode for Editor preserves pieces/card assignment but resets
  Tracker, actions, movement, pending resolution, Bonus Action, 3/2,
  modifiers and displayed die results.
- Ready now requires among the eleven starters: at least one ST, two CB, two
  combined CDM/CM/CAM, one LM/LW and one RM/RW. Full-backs remain optional;
  existing maxima remain active.
- Manual Multiplayer and Firebase are unchanged.

## v20.56.13 — Prep mode boundary and permanent Selection summary

- Restores Prep as a Single Player Match Mode-only pre-start panel. Its Editor
  button remains visible but blocked with an explicit explanation; leaving
  Match Mode closes Prep.
- Makes Selection Rules view-only immediately on entry to Match Mode. The
  stored selection policy remains editable only in Editor and no gameplay Rule
  Set or Workspace snapshot behavior changes.
- Moves the complete live Selection summary into Prep permanently: Blue first,
  Red second, with Free Selection or active limits, stars, assignment count,
  legality and precise red violations. Removes the detached right-side panel.
- No Engine, MatchState, Timeline, Undo/Redo, Replay, AI export, Manual
  Multiplayer or Firebase behavior changed. Adjust remains unimplemented.

## v20.56.12 — Prep Ready acknowledgement and Selection feedback

- Replaces the persistent Ready lock with a live legal-state indicator: Ready
  is green only while both full rosters currently validate.
- A confirmed Ready closes Prep and opens a success dialog directing the user
  to Tracker Start Game. Prep and Selection Rules remain reusable until a Match
  is actually started, and transient Ready UI clears on Match exit.
- Changes the Prep Selection popup into a non-blocking live summary window. It
  explicitly reports `Free Selection enabled`, or every active limit and its
  current result, plus live assignment/legality errors.
- Renames the Selection Rules checkbox label from `Free Mode` to
  `Free Selection`; the underlying persisted rule schema remains unchanged.
- No Engine, MatchState, Timeline, Undo/Redo, Replay, AI export, Manual
  Multiplayer or Firebase behavior changed. Adjust remains unimplemented.

## v20.56.11 — Prep and Selection Rules

- Implements the Single Player-only movable, resizable, minimizable Prep panel
  immediately before Tracker, with Team, Formation, Selection and Ready
  functional. Adjust and Substitution remain visibly disabled with their
  approved future-scope explanations.
- Reuses the coordinate-only formation mechanism, so applying a formation
  moves the stable starter pucks and preserves every assigned card.
- Adds persisted Workspace Selection Rules: exclusive Free Mode, optional
  Total Stars Cap, and optional Maximum X Players at Y Stars.
- Adds pure full-roster analysis and Ready validation for all eighteen cards,
  plus starter/reserve/GK structure and starter-only positional composition.
  Ready confirms with the approved text and locks Prep controls only; it does
  not start a Match or write a Timeline event.
- Keeps Tracker Start Game independent of Prep/Ready. Engine, MatchState,
  Timeline, Undo/Redo, Replay and AI export require no change because this is
  pre-match Workspace state, not a gameplay command.
- Manual Multiplayer and automated Multiplayer/Firebase are unchanged.

## v20.56.10 — Prep and Selection Rules documentation

- Replaces the approved future Blue/Red positional-zone map, including the
  intentional ST/CAM overlap and the exact Red mirror cells.
- Defines Prep as a Tracker-like second-bar panel with Team, Formation,
  Selection, Adjust, Substitution and Ready controls.
- Defines the independent, checkbox-driven Selection Rules state for all
  eighteen cards: Total Stars Cap, Maximum X Players at Y Stars and exclusive
  Free Mode.
- Defines pre-match Ready validation/locking, preserves Tracker Start Game as
  the sole Match-start command and records Substitution as visibly disabled
  until canonical interruptions/restarts exist.
- No runtime source changed. Manual Multiplayer remains unchanged.

## v20.56.9 — Card-role authority and coordinate-only formations

- Makes `card.position` the only Single Player authority for a player's football role. New starter and reserve pucks are neutral; role labels are no longer created, displayed as a fallback or exported by the offline path.
- Migrates formation templates from legacy `[label, coordinate]` pairs to coordinates only. Existing saved formations remain readable and retain their coordinates.
- Applying a formation now preserves stable puck identity and assigned cards instead of reconstructing cardless player pucks.
- Adds the permanent team-composition/formations contract, including the agreed future roster, substitution and positional-zone rules. Those future Match mechanics are documented but not implemented in this release.
- Manual Multiplayer/Firebase retain their legacy label path and are otherwise unchanged.

## v20.56.8 — Penalty rules documentation

- Replaces the deferred Penalty placeholder with the Match Penalty contract:
  automatic outfield clearance from the large box and semicircle, fixed
  goalkeeper, selected executor, pure `Penalty` versus `GK Penalty` roll and
  result routing.
- Defines Match Penalty Natural 1 as goalkeeper catch plus an immediate
  defending Bonus Action, and Natural 20 as an ordinary Goal.
- Defines the full shoot-out: canonical coin toss, hidden ordered eleven-player
  lists, alternating kicks, early mathematical finish, no-repeat-before-eleven,
  new order after a complete sequence, equality as a miss, and the next-own-kick
  Natural AV/DV effects.
- Records the future global `Penalty` Bonus and `GK Penalty` Attribute without
  changing the current runtime card schema.
- No runtime source was changed. Manual Multiplayer remains unchanged.

## v20.56.7 — Free Kick and Corner rules documentation

- Corrects both wall conventions to the fifth cell after the ball (the ball
  cell is not counted), measured as exactly five cells centre-to-centre for
  the closest wall player; Free Kick wall is continuous, parallel to the
  goal line and contains one to four players, while Corner may have an optional
  one-player wall.
- Defines the shared canonical setup order: ball, defending wall, coach
  repositioning beginning with attack, then attacker executor placement.
- Defines Free Kick execution boundaries: all native action rules remain,
  Long Pass contact/reaction rules remain unchanged, and Free Kick Lofted
  Through uses threshold 18 with no effect from crossed-area count.
- Adds direct Corner Shot: mandatory DVM, normal distant-range penalty,
  optional-wall DV, and a curved route that may leave the board without
  bypassing on-board body or defensive-area effects.
- No runtime source was changed. Manual Multiplayer remains unchanged.

## v20.56.6 — Shooting rules documentation

- Added the agreed normal Shot contract: physical route, body blocking, distinct defensive-area DVs, editable range bands, goalkeeper retention and natural outcomes.
- Added direct free-kick Shot: normal distance rules, no body or defensive-area route penalty, one DV per wall player and its Natural-1 recovery sequence.
- No runtime source was changed.

## v20.56.5 — Dribbling rules documentation

- Added the agreed mandatory-Dribbling contract for defensive-area exits and movements that begin inside an area, including action cost and multi-defender ordering.
- Defines successful reorientation, defender inactivity, failure recovery, failed-dribbler inactivity, Natural-1 immediate Bonus Action and configurable equality outcomes.
- No runtime source was changed.

## v20.56.4 — Tackling rules documentation

- Added the agreed Tackling contract for phase-start action eligibility, proximity reactions, Marking-derived delayed reactions, pair-specific reaction deferral and reactive multi-defender ordering.
- Defines success, inactivity, greater-distance fouls, yellow/red Natural-1 discipline, Natural-20 outcomes, equality restart outcomes and the full-proximity fallback placement.
- No runtime source was changed.

## v20.56.3 — Marking rules documentation

- Added the agreed passive defensive-tracking contract: first-area-entry decision, one marker per attacker and defender, two consumed team opportunities per turn, and total per-turn Speed budgets.
- Defines fast exit at two orthogonal or one diagonal defensive-area cells with a Speed difference of at least two, plus canonical Marking switching to a new defender.
- Defines the required Engine-owned pending decisions, movement freeze and card-level visual projection without changing current runtime behavior.
- No runtime source was changed.

## v20.56.3 — Finalisation and restarts documentation

- Added the agreed restart contract for Goal, kick-off, goal kick, throw-in, Corner, Free Kick and Penalty setup.
- Records restart-specific action economy: Corner, non-possession-changing throw-in, Free Kick and Penalty reset only team/personal actions; modifiers remain governed by their own expiry rules.
- Separates the goal-kick defensive-area exception from the distinct Cross goalkeeper-restart body-and-area exception.
- Leaves Penalty roll, result and shoot-out resolution explicitly deferred.
- No runtime source was changed.

## v20.56.3 — Modifiers and Tracker documentation

- Added the agreed future contract for team modifier capacity, exact-tier cancellation, mechanic-owned application and expiry, and canonical Tracker ownership.
- Clarified that only AV/DV and AVM/DVM cancel as token pairs; other types may coexist and only offset numerically where an applicable roll uses them.
- Documented that action-economy resets, including Corner restart reset, do not clear modifiers.
- No runtime source was changed.

## v20.56.3 — Cross rules documentation

- Adds `CROSS_RULES.md` as the canonical Cross contract: range/angle/route eligibility, local origin obstruction, origin interception, automatic outfield interception, goalkeeper Cross Claim, Z0/Z1, Aerial Duel, Header and finalisation.
- Resolves outfield automatic-interception selection by centre-to-centre proximity, with defending-coach choice only at equal distance; a direct goalkeeper target remains in the goalkeeper's cell.
- Defines origin interception as the existing Long Pass resolver with the same interceptor roll, stack and Natural-1 carry, but with the crosser's fixed `Crossing` value replacing the Long Pass target.
- Defines configured `corner` equality at Cross Claim and Aerial Duel as an immediate attacking corner, and makes physical body blocking require route entry into the cell interior.
- No runtime code, Rule Set schema, MatchState, Tracker behavior, Manual Multiplayer or Firebase behavior changed.

## v20.56.3 — Gameplay foundations documentation

- Adds `GAMEPLAY_RULES_FOUNDATIONS.md` as the single permanent home for shared gameplay vocabulary: proximity, possession, inactive players, reactions, result categories and the agreed simplified real-football Offside rule.
- Explicitly distinguishes agreed future rules from current implementation: `inactive` has no canonical reason/expiry yet, while Shot, Cross, Dribble and Tackling remain manual declarations rather than resolver mechanics.
- Records that no global reaction-chain prohibition exists; the future Marking-to-Tackling restriction belongs to those specific mechanisms.
- No runtime code, Rule Set schema, MatchState, Tracker behavior, Manual Multiplayer or Firebase behavior changed.

## v20.56.3 — Short Pass minimum separation

- Offline Short Pass rejects a target cell touching the passer by side or corner, irrespective of target team. This removes the diagonal adjacent L-corner route with no real traversed board cell while preserving the established physical-contact rule.
- The Engine persists `PASS_TARGET_TOO_CLOSE` as a blocked route preview and rejects confirmation before Tracker consumption. Rule Set schema/editor and Manual Multiplayer remain unchanged.

## v20.56.2 — Canonical gameplay-roll result hold

- Adds one shared `1000 ms` offline Single Player hold between a revealed gameplay die face and an automatic consequence. The canonical delayed-resolution descriptor is stored with `DICE_ROLLED`, so the same deadline survives Timeline navigation without a local mechanic timer.
- Pass/Interception now uses that shared scheduler instead of resolving immediately after the die animation. Future automatic actions use `createSinglePlayerRollResultHold(...)`; Extra Roll remains immediate because it has no gameplay consequence.
- Manual Multiplayer and its frozen timing path remain unchanged.

## v20.56.1 — Long Pass route integrity

- Repairs offline Long Pass eligibility: a defender is activated only when its defensive area contains the passer or receiver at the respective endpoint, then each one of that defender's physically crossed defensive-area cells uses the Short Pass visibility test independently. The aerial middle remains excluded.
- Persists concrete crossed defensive cells, reaction points and the unified origin-before-destination interceptor stack for Timeline, Undo/Redo, Replay and AI export.
- Makes selected-target receipt distinct from an intermediate body contact in the canonical Pass route projection. Only the latter creates a coloured-to-grey split; badges and route segments consume the same Engine verdict.
- Adds a first Match → Editor safety confirmation before the existing unsaved-recording dialog.
- Manual Multiplayer, Firebase authority and `src/multiplayer/` remain unchanged.

## v20.56.0 documentation handoff

- Consolidates the active handoff into `NEXT_CHAT_PROMPT_v20_56_0.md` and removes retired prompt copies.
- Corrects the permanent Long Pass contract to require defensive-area cells actually crossed in the permitted reaction zones, rather than endpoint-cell membership.
- Marks the two v20.56.0 Pass defects as open: missed eligible Long Pass interception and selected-target grey-tail over-segmentation.
- No runtime code changed.

## v20.56.0 — Pass contact and interception projection integrity

**Acceptance correction:** post-release tests found that this release is incomplete. Its Long Pass code still uses endpoint-cell membership where the approved contract requires crossed defensive-area cells in the permitted reaction zones; ordinary selected-target receipt is also over-projected as a grey-tail contact. These defects are queued explicitly for v20.56.1 and must not be treated as accepted behavior.

- Repairs offline Long Pass origin/destination interception eligibility. Long remains aerial through the middle, while launch and landing now test the defender's actual route to the ball's physical launch/landing point; no blanket passer/receiver exception remains.
- Makes every Short and Long Pass project the persisted canonical direct contact to the board. The coloured route ends at that contact and the remaining route to the requested target is grey.
- Uses the same official route verdict for the coloured segment and its origin badge, preventing a green contact segment alongside a red risk badge.
- Adds sentinels for lateral Long Pass interception, a body genuinely blocking that reaction line, launch reaction geometry, and Short Pass direct-contact projection.
- Manual Multiplayer remains unchanged.

## v20.55.9 — Bonus Action generic-roll completion

- Repairs the missing Bonus Action authorization for canonical `GAMEPLAY_ROLL_SUBMITTED`. The Engine now admits a generic roll only when its pending request belongs to the exact active Bonus Action continuation; LT works in BA without a mechanic-specific UI bypass, and future pending-roll mechanics inherit the same rule.
- Makes rejected offline gameplay rolls explicit instead of leaving the prior die face visible as if it were a new result.
- Removes the extra offline Interception suspense timer. Every offline gameplay roll retains the same short Dice animation, then resolves immediately. Manual Multiplayer retains its frozen cooldown and delayed-resolution path.
- Adds the Engine sentinel for BA → canonical LT pending roll → selected non-20 result.

## v20.55.8 — Pending-roll Dice integrity

- Removes the offline post-roll Dice cooldown. A resolved roll no longer leaves an unrelated local delay that can survive an immediate Undo/Redo; Manual Multiplayer retains its frozen session cooldown.
- Makes offline Dice availability, forced die type and automatic panel opening project the Engine-owned `actionResolution.pendingRoll` request rather than Pass/LT-specific status branches.
- Adds Engine command `GAMEPLAY_ROLL_SUBMITTED`: the Controller sends one semantic gameplay-roll command while the Engine routes and validates it against the active pending request.
- Disables Undo/Redo only while the actual Dice animation is running, preventing an in-flight callback from applying to a restored Timeline cursor.
- Adds selector and Engine sentinels for Pass/LT pending requests, route-selection/TB no-roll states, generic submission, and the offline no-cooldown / animation-guard boundary.

## v20.55.5 — Bonus Action recovery

- Repairs draggable offline action prompts so interactive child controls, including AV/AVM selection, receive normal clicks; only non-interactive prompt surface begins a drag.
- Generalizes automatic Dice opening from Pass-only logic to every implemented canonical pending D20 roll, including Lofted Through.
- Clears roll-modifier opportunities and 3/2 opportunities canonically at Match Start, Match Restart, and Match → Editor; they cannot leak between Match lifecycles or into Editor.
- Corrects the contradictory 3/2 Bonus Action gate: an owning BA team may use a granted 3/2 opportunity under the same target/range/path/passer/one-use restrictions as normal play.
- A Natural-20 Lofted Through that replaces an existing BA inherits that BA's resume policy. Its current-turn AV/AVM is therefore tied to the actual numbered turn reached after `END B.A.`, rather than being stranded at an internal BA boundary.
- Manual Multiplayer remains unchanged.

## v20.55.4 — Bonus Action foundation recovery

- Rebuilds offline Bonus Action around one typed Engine capability contract for Move, Pass, Through Ball and Lofted Through Ball. Their UI controls project the canonical continuation state; they do not open a local substitute action.
- Repairs BA Move rejected-destination projection, preserving Engine geometry/cost/remaining Speed and preventing the `undefined` hover / render-crash path.
- Keeps targeting actions out of movement presentation, allows Free Move during a ready Bonus Action, and disables presently unimplemented BA actions instead of declaring a manual gameplay action.
- Selected AV/AVM is included in the official Engine-backed pending-roll preview. Roll prompts now include card statistic plus modifiers in `TOTAL BONUSES` for Interception as well as Lofted Through.
- Defines current-turn AV/AVM gained inside an advancing Bonus Action as belonging to the resumed numbered turn. Token expiry is Engine-owned at every implemented turn advance and emits a user-facing loss notice when an unused token actually expires.
- Manual Multiplayer remains unchanged. Pass/Interception direct-contact route integrity is intentionally deferred to the separately approved next build.

## v20.55.1 — Roll integrity and Lofted Through correction

- Gives Lofted Through Ball independent frozen geometry, correct foot projection, and trajectory-based failed-pass recovery.
- Gives Long Pass direct opponent contact priority over any interception roll.
- Standardizes Engine-owned roll source data for Lofted Through prompts/results and permits Free Move during Bonus Action.

## v20.55.0 — Lofted Through Ball and configurable natural outcomes

- Adds canonical offline Single Player Lofted Through Ball, frozen rules, D20 resolution, recovery race, and generic 3/2 opportunity.
- Adds configurable Natural 1/Natural 20/equality outcomes and canonical one-roll AV/AVM opportunities.
- Manual Multiplayer remains unchanged.

## v20.54.3 — Through Ball targeting lock and preview cleanup

- While offline Through Ball targeting or route selection is pending, the normal Inspector action row is locked; the dedicated Through Ball control remains the only cancellation route, matching the existing Pass interaction contract.
- Cancelling a selected Through Ball route keeps its target in canonical MatchState for the next targeting click, but suppresses the visual placed-ball preview until a route is selected again.
- Manual Multiplayer remains unchanged.

## v20.53.6 — Pass coordinate contract and integer limits

- Corrected offline corner-origin handling: a selected corner still determines foot and physical route, while body position, distance and defensive-area eligibility use the passer-square centre.
- An offline execution corner shared by any adjacent player body is unavailable; teammates and opponents both block that foot. This prevents an adjacent body from being silently converted into a Long Pass receiver/interceptor merely because one corner touches it. Manual Multiplayer retains its legacy opponent-only corner rule.
- Pass distance thresholds and maximum distance are now whole-square values. Rules fields accept temporary blank text while editing and normalize to valid integral values on blur/save.

## v20.53.5 — Long Pass contact projection and maximum distance

- Added Rule Set `Maximum Pass distance`, default `32`, frozen in MatchContext. Targets beyond it create the same canonical blocked preview pattern and remain Engine-illegal to confirm.
- Long Pass direct contact now preserves the selected intended destination in the projection: green/red segment to reception/interception, grey continuation to intended destination, and grey target ball.
- Manual Multiplayer remains unchanged.

## v20.53.4 — Pass invalid-target projection

- `PASS_TARGET_SELECTED` now records an Engine-owned blocked preview for an empty square or goalkeeper: all route facts persist, no action is consumed, and route confirmation remains Engine-rejected.
- The official Single Player Pass selector projects that preview as disabled grey trajectories and origin badges while the existing target-rule message remains visible.
- Corrected offline Pass Cancel to preserve the selected passer through the canonical Timeline projection.
- Manual Multiplayer remains unchanged.

## v20.53.3 — Timeline-null render hotfix

- Fixed the v20.53.2 render crash caused by reading `gameTimeline.cursor` while Timeline is still `null`.
- Added a static render-safety sentinel for the Pass hover dependency path.
- No gameplay, Rule Set, MatchState, MatchContext, Timeline semantics, or Manual Multiplayer behavior changed.

## v20.53.2 — Long Pass reception and Pass UX corrections

- Corrected Long Pass endpoint contact: a body actually touched near launch or landing becomes the direct receiver (teammate) or direct interceptor (opponent); it never rejects the Pass as blocked.
- Corrected destination Interception to evaluate the actual receiver and preserve one progressive/Natural-1 sequence across origin and reception groups.
- Removed the Long Pass attacker-stat selector and the two Interception modifier toggles from Rules. Offline MatchContext now freezes the stable global `Long Pass` statistic and the permanent active modifier contract.
- Pass Cancel now preserves the selected passer in offline Single Player; hover shows centre-to-centre distance with `SP`/`LP`; the offline button reads `PASS S/L`.
- Manual Multiplayer remains unchanged.

## v20.53.1 — Short/Long Pass

- Added the approved offline Single Player Short/Long Pass family under the existing PASS command and renamed its offline Inspector label to `PASS SHORT/LONG`.
- All Pass range classification now measures source-square centre to target-square centre. Corner selection remains execution/foot geometry only.
- Short Pass now requires an active outfield target and retains ground-route behaviour. Long Pass uses the frozen Rule Set-selected stable attacker stat, aerial middle-route semantics, endpoint-only interception groups, and an independent progressive stack for each endpoint group.
- Added the Long Pass Rule Set selector, frozen MatchContext compatibility link for one unambiguous existing `Long Pass` global stat, stable stat IDs in compact gameplay cards, canonical plan/AI fields, and Engine/UI reason projections.
- Manual Multiplayer retains its legacy planning branch and was not migrated to the new offline rule family.

## v20.53.0 — Card Editor focus stability

- Fixed the Card Editor's focus/scroll regression: nested field subcomponents had been recreated on every card update, so React remounted their inputs after each typed or deleted character.
- Stabilized the field rendering path and moved the stateful Star Menu to the card-editor module. Editing statistic names, section titles and related inputs now retains the active input and the editor's scroll position.
- Added a structural regression sentinel for the stable editor-subform boundary. No card data shape, gameplay, Match, Engine, Timeline or Manual Multiplayer behavior changed.

## v20.52.9 — Mechanic Integration Gate

- Added the permanent seven-row Mechanic Integration Gate for every future offline Match mechanic: Rule Set/compatibility, frozen MatchContext, Engine command, official projection, Timeline/Undo/Replay, AI mapping, and explicit mode-boundary/verification evidence.
- Added ADR-050 and workflow enforcement, so the gate is required both before approval and before release rather than being an informal recommendation.
- Widened the static Single Player UI sentinel: `main.jsx` must import the official presentation boundary and gateway, and cannot directly import listed Engine implementation modules.
- No runtime gameplay behavior changed; Manual Multiplayer remains unchanged.

## v20.52.8 — Group Move draft projection

- Replaced offline Group Move draft activation's local Tracker and Rule Set reads with an official presentation projection evaluated from the same Engine confirmation command.
- The projection returns availability/reason, team, frozen zone length, centred start and drag boundary. Opening, dragging and cancelling the draft remain UI-only; only `GROUP_MOVE_ZONE_CONFIRMED` consumes an action and enters Timeline.
- Added regression coverage for the projected final-action gate and frozen zone shape, plus a static sentinel against restoring the local reads in `main.jsx`.
- Manual Multiplayer remains unchanged.

## v20.52.7 — Phase 11 boundary and dependency audit

- Verified every migrated offline Match command entrance in `main.jsx` dispatches through the Single Player gateway; no direct offline mutation was found for Free Ball, Normal Move, 3/2, Free Move, Group Move confirmation/piece move, Bonus Move, Pass/Interception, dice, End Turn, Match start/restart, or Tracker administration.
- Added static regression sentinels that require those command entrances to retain a gateway dispatch and require the direct movement-preview fallbacks to stay behind the `sessionCode` boundary.
- Classified the remaining direct movement, Pass, Interception, Tracker and Firebase calculations as retained Editor or Manual Multiplayer/session compatibility code; they are not safe to delete or extract under this build.
- Recorded one separate remediation candidate: offline Group Move draft activation still repeats pre-confirmation availability and frozen zone-length reads locally. The Engine remains authoritative at confirmation, so there is no gameplay divergence in this build; the next Group Move change must replace that draft gate with an official projection.
- Manual Multiplayer and runtime gameplay behavior remain unchanged.

## v20.52.6 — Proven dead-code removal

- Removed only the unreferenced helpers classified by the v20.52.5 audit: an obsolete local browser Save/Load route with its isolated settings migration helper, unused card-zone mutation helpers, and unused view-fit helpers.
- Removed three production-unused exports (`isInsideGoalMouthY`, `clearPendingInput`, and `clampModifier`) after confirming no production or test call sites.
- No active Editor, offline Match, Engine, Timeline, Rule Set, AI Export or Manual Multiplayer route was changed. This build makes no extraction or organizational refactor.

## v20.52.5 — Code ownership audit and Editor marker reset

- Completed a static code-ownership audit of offline Match command, projection and legacy-mode boundaries. It classifies deletion candidates for a separate evidence-based cleanup build; no behavior-bearing legacy route was removed by name search.
- Leaving Match for Editor now clears the closed Match's personal-action map, so pucks no longer retain Match dots in Editor. Editor's unrestricted manual three-slot marker remains available from a clean state.
- Corrected the browser title version, which had remained at `v20.52.3` despite later runtime releases. Visible app, package and browser-title versions now agree at `v20.52.5`.
- Manual Multiplayer remains unchanged.

## v20.52.4 — Group Move geometry limits

- Replaced Group Move's single Rule Set movement limit with editable orthogonal and diagonal limits, defaulting to `6` and `4` respectively.
- Both limits are frozen in MatchContext and canonical confirmed Group Move state. The Engine selects the limit from exact movement geometry and the offline UI displays its projected value.
- Rule Sets and stored active Group Move state from earlier builds migrate their former single limit into both new limits, preserving their behavior. Timeline activation metadata records both values; existing Timeline/Undo/Redo/Replay/AI Group Move semantics remain unchanged.
- Manual Multiplayer remains unchanged.

## v20.52.3 — Action continuity and ball-cell choice

- Ready offline Bonus Action controls no longer inherit normal Tracker phase/action exhaustion locks. Their owner may select one compatible individual card action; Group Move and Free Move remain unavailable.
- Restored the established progressive normal-MOVE contract at the offline board entrance: an already-authorized player may spend remaining Speed in legal segments after the team exhausts normal Tracker actions. The player remains selected while such movement remains.
- Replaced the ambiguous ball-cell 3/2 Yes/No prompt with Engine-projected `Rule 3/2`, `Normal move`, and `Cancel` routes. Direct-board Normal Move starts and commits atomically when authorization has not yet been created, matching Inspector MOVE.
- Leaving offline Match for Editor now clears Match-only interaction locks in the closing Editor Timeline state, including Free Move. Manual Multiplayer remains unchanged.

## v20.52.2 — Normal Move projection hotfix

- Fixed the offline Match black-screen regression introduced in v20.52.0: selecting a player and hovering the board before Tracker start or while that team is inactive no longer dereferences absent preview geometry.
- Normal Move geometry remains Engine-owned. The presentation selector declares it nullable only for invalid presentation input; valid player/destination requests retain Engine geometry even when rejected by a gameplay gate.
- Added regression coverage for the pre-start and inactive-team hover states. Manual Multiplayer remains unchanged.

## v20.52.1 — Phase 10B closure

- Closes the intermediate v20.52.0 remediation. A Normal Move preview is now an evaluator-only capability; a submitted command cannot carry a preview bypass.
- Added official Free Move and Free Ball projections. Free Ball destination bounds are now Engine-validated against frozen MatchContext board settings.
- Inspector actions, End Turn, Free controls and Bonus-action control availability now use one offline Match projection. The Interceptor-choice popup reads the frozen gameplay-card snapshot.
- Added regression tests for preview-command separation and Free Move/Free Ball projection equivalence. Manual Multiplayer remains unchanged.

## v20.52.0 — Intermediate authority/projection remediation (not accepted Phase 10B closure)

- Partial implementation after the Phase 10A audit; it is superseded by v20.52.1 and must not be treated as Phase 10B closure.
- Added the Engine-backed Match presentation boundary for normal Move, 3/2, Group Move candidate/destination status, Inspector action availability and canonical dice-request availability. Offline `main.jsx` no longer imports direct movement evaluators.
- Normal Move preview reuses Engine validation, including blocked paths, speed, axis and remaining distance. Group Move preview preserves the Engine-only exception that may cross players.
- Offline Pass result presentation no longer recalculates an Interception result when its canonical Engine resolution is missing. Group Move zone configuration reads the frozen MatchContext Rule Set.
- Added selector, sentinel and static-import boundary tests. Timeline, Undo/Redo, Replay and AI Export continue to consume canonical state. Manual Multiplayer remains unchanged.

## v20.51.1 — Pass foot-orientation correction

- Corrected the central Pass origin-foot geometry: Left/Right are now evaluated from the passer facing the pass destination.
- Added explicit tests for all four origin corners with eastward and westward passes. Badge, dominant-foot detection and the transferred Interception effect use the same corrected fact.
- Manual Multiplayer remains unchanged.

## v20.51.0 — Phase 10B Pass projection integrity

- Single Player Engine now persists Pass route presentation and the pending Interception-roll breakdown in canonical MatchState; UI reads them through the official Match presentation selector.
- Removed the offline popup's legacy local Interception reconstruction and the offline board's local Pass-plan reconstruction. Manual Multiplayer retains its existing legacy route.
- Route corner badges remain compact and now resolve `LF 0` / `RF −value` from the frozen semantic Disadvantage Rule Set definition. The Interception prompt explicitly records the transferred defender Advantage caused by the passer's non-preferred-foot execution.
- Rule Set normalization and editor preserve modifier semantics: Advantage values cannot be negative and Disadvantage values cannot be positive.

## v20.50.0 — Rule Set dice modifier language

- Added editable Rule Set definitions for Advantage, Major Advantage, Disadvantage, Major Disadvantage and one shared stack cap.
- Single Player Pass Interception resolves progressive order, non-preferred-foot and prior Natural 1 sources through those definitions and freezes them in MatchContext/Timeline/AI Export.
- Rule Set v4 and older migrate their interception cap into the common stack cap. Manual Multiplayer remains unchanged.

## v20.49.0 — Editor personal-action tracker correction

- In Editor Mode, both teams can manually toggle all three Inspector personal-action slots.
- Offline Match Mode retains the Engine-enforced attack maximum of three and defense maximum of two, including the muted third defensive slot.
- Manual Multiplayer is unchanged.

## v20.48.0 — Personal Action Limits

- Added canonical `tracker.personalActionsByPieceId` to Single Player MatchState.
- The offline Engine enforces three personal actions for an attacking player and two for a defending player per numbered turn. Actions may be non-consecutive.
- Normal MOVE, normal PASS, implemented manual declarations and each physically moved Group Move participant consume one personal action. Cancelling a pre-movement normal MOVE refunds it.
- 3/2, Bonus Action, Free Move, Free Ball and Extra Roll do not consume personal actions. Group Move activation has no artificial player count.
- The counter resets only when the existing rules start a new numbered turn, restart a match, reset Tracker actions or change possession.
- Timeline, Undo/Redo, Replay and AI Analysis Export use the same canonical counter. AI export exposes the per-player usage and per-event actor maximum.
- Inspector receives a three-slot personal tracker before INACTIVE; it is automatic in offline Match Mode and manually clickable in Editor Mode. Pucks display one green dot per used personal action.
- Manual Multiplayer remains on its existing route. Its shared legacy calls deliberately do not opt into this Single Player Engine rule.

## v20.47.0 — Phase 9 pre-multiplayer engine audit

- Documentation-only audit of the application build `v20.46.7`; no runtime source files changed.
- Accepted the completed Single Player Engine/Controller/Timeline boundary and corrected the stale Phase 8 status in the migration plan.
- Verified `npm test` (231 passing) and `npm run build`.
- Compared `src/multiplayer/` with the approved v20.46.6 baseline: no differences. `src/main.jsx` differs only by the v20.46.7 version label.
- Automated Multiplayer remains frozen. The audit neither repairs nor reopens it.

## v20.46.7 — Match render-test alignment

- Updated only the stale `BoardCanvas` render assertion left from the old Match DOM path.
- The test now confirms the current Match-only defensive fill/outline structure and confirms the deliberate absence of the old ball aura, owner-source tile and player-square markup.
- No Match visual, gameplay rule, Engine, MatchState, Editor Mode or Manual Multiplayer behavior changed.

## v20.46.6 — Match defensive contour geometry correction

- Single Player Match Presentation only.
- Defensive contour segments are now calculated exclusively from each area's geometry, independent of player occupancy.
- Occupied cells no longer become holes in the contour model.
- A player inside an area receives no local square because internal sides remain absent.
- Genuine exterior sides remain visible beside a player (for example the goalkeeper's left/right sides, isolated RW perimeter, and team-area boundaries passing beside opposing players).
- Blue/red overlap fill behavior from v20.46.4/v20.46.5 is preserved.
- No Engine, MatchState, defensive geometry, Editor Mode, or Manual Multiplayer changes.
- Post-build audit: production build succeeds; one stale BoardCanvas render assertion remains and is documented for the next approved code build.

## v20.46.5 — Match defensive contour topology correction

- Corrected the v20.46.4 visual regression in Single Player Match Presentation.
- Defensive-area owner coordinates now remain part of the area topology even when the raw geometry omits that occupied coordinate.
- Adjacent cells no longer reconstruct a local square around LB, CB, GK, RW, or other area owners.
- The real external contour of each defensive area remains closed, and Blue/Red overlap fill behavior from v20.46.4 is preserved.
- No Engine, MatchState, defensive geometry, Editor Mode, or Manual Multiplayer behavior changed.

## v20.46.4 — Match overlap blend and closed contours

- Preserved the v20.46.3 Match-only fill/outline separation and puck cleanup.
- Replaced the artificial diagonal contested-cell treatment with separate Blue and Red translucent fill layers on shared coordinates, restoring the natural overlap appearance.
- Restored complete per-area perimeter edges beside occupied coordinates; player-occupied cells themselves still render no local defensive outline.
- Kept Engine, MatchState, defensive geometry, Editor Mode and Manual Multiplayer unchanged.

## v20.46.3 — Match occupied-square render cleanup

- Replaced the Match-only defensive-area DOM path with separate combined-fill and per-owner outline layers derived from the existing calculated overlays.
- Removed Match rendering of the owner-source tile, selected-cell tile and ball aura instead of hiding them through additional overrides.
- Player-occupied coordinates now receive combined defensive fill only; outline cells are rendered only on empty coordinates and cannot draw a side toward an occupied coordinate.
- Kept player hitboxes transparent, restored the Match ball to its original opaque presentation, and preserved Editor Mode, Manual Multiplayer, Engine, MatchState and defensive geometry.

## v20.46.2 — Player Area Underlay

- Made defensive presentation treat every player-occupied board square as fill-only: no defensive perimeter, inner seam, border or shadow may surround a puck, even when another area overlaps that square.
- Simplified the ball to a premium white puck with no football pattern.
- Preserved individual defensive-area ownership/perimeters elsewhere, gameplay rules, Engine, Timeline, Editor and Manual Multiplayer behavior.

## v20.46.1 — Ball & Owner-Square Correction

- Replaced the abstract vector mark with a conventional white spherical football and black pentagon patches; it remains a fixed-ratio shared SVG for Board and Inspector.
- Removed all local border/shadow treatment from an owner's defensive source square, including when that square is part of the card's own defensive shape. The player now sits directly on team-colored defensive fill.
- Preserved individual defensive-area perimeters, gameplay rules, Engine, Timeline, Editor and Manual Multiplayer behavior.

## v20.46.0 — Individual Defensive Areas

- Replaced the Match-only defensive-overlay aggregation by team/coordinate with player-owned presentation areas. Each player's defensive shape now retains its own perimeter when it overlaps a teammate or opponent.
- Added a visual source tile beneath a player whenever their card's defensive shape does not already include their occupied square; it is presentation-only and does not alter defensive-area rules.
- Replaced the Unicode football glyph with one shared fixed-ratio SVG ball so board and Inspector rendering are geometrically centered and browser-font independent.
- Preserved Editor rendering, defensive-area rule calculation, Engine, Timeline, AI export and Manual Multiplayer behavior.

## v20.45.1 — Final Match Presentation Correction

- Restored premium team-colored Blue/Red card controls with rounded corners; action controls remain in their established team family instead of a neutral glass override.
- Corrected Match pucks and ball to true circular geometry, so the possession halo is centered and circular; the ball aura uses the same white/silver family.
- Made defensive cell seams deliberately more subdued than continuous outside-area edges while retaining intensity by same-team coverage and without numeric labels.
- Changed the Tracker label to `Start Game`, kept its existing bold treatment, and aligned `Change Possession` with `Reset Trackers` typography. These are visual/label changes only; existing callbacks and behavior are unchanged.

## v20.45.0 — Match Tactical Clarity

- Made Match Tracker turns clearly distinguish completed, current and upcoming states without changing turn state or controls.
- Applied the existing Match glass treatment to card action controls, replaced the possession yellow with a white/silver halo, and shifted Red puck/selection tones away from pink.
- Kept every defensive cell visible in Match presentation, restored stronger continuous outer edges, and scales Blue/Red overlay intensity from the already-calculated number of same-team defensive areas covering each cell.
- Deliberately adds no numeric coverage labels, rule changes, Engine changes, Timeline changes, Editor changes or Manual Multiplayer changes.

## v20.44.0 — Premium Match UI & Team Highlights

- Restored the ball to an opaque premium token and removed Match-only held-ball transparency.
- Added Match-only Blue/Red/neutral selected-team classes to the Board presentation wrapper; normal selection no longer uses the legacy yellow treatment.
- Added a Match-only dark-glass presentation route for Tracker, Dice, History, Match Over/turn prompts, dice notices and active action prompts.
- Preserved every panel's structure, positioning, controls, state and function. Editor and Manual Multiplayer remain on their prior visual route.

## v20.43.0 — Premium tactical pucks and defensive-area clarity

- Replaced Match-only CSS player figures with premium tactical pucks in the existing piece elements; position labels, hitboxes and state classes remain unchanged.
- Deduplicated defensive-overlay cells only for Match presentation, draws only continuous-region outside edges, and gives Blue/Red overlap a distinct neutral contested-cell treatment.
- Retained the previous Editor and Manual Multiplayer rendering path without changing defensive-area rule calculation.
- Extended BoardCanvas render coverage for the Match defensive-area aggregation and contested cells.

## v20.42.0 — Match Interaction Feedback & Defensive Areas

- Added Match-only glass-like styling to the existing selection, movement legality, axis/cost badge, Pass route and Group Move feedback classes.
- Added Match-only translucent Blue/Red defensive-area overlays with restrained borders so the grass and grid remain visible.
- Added no state, command, geometry, DOM interaction or rules change. Editor Mode and Manual Multiplayer retain the prior visual route.

## v20.41.1 — Match piece scale and possession clarity

- Enlarged only the Match-only tactical figure drawing from 84% to 94% of its existing logical cell; the player hitbox remains unchanged.
- Added the Match-only `ball-held` presentation class from the existing ball/player coordinate overlap and renders that ball at partial opacity.
- Kept Editor, Manual Multiplayer, Engine, Timeline, rules and all interaction ordering unchanged.

## v20.41.0 — Match Pieces 2.5D

- Added Match-only CSS tactical figures inside the existing player piece elements, with team kit, silhouette, shadow and readable label treatment.
- Added Match-only ball aura and visual possession emphasis derived from the already-rendered ball/player coordinate overlap.
- Kept the existing piece positions, hitboxes, labels, selection, inactive and Group Move state classes authoritative.
- Extended BoardCanvas render coverage for the figure, ball aura and possession class. Editor Mode and Manual Multiplayer remain unchanged.

## v20.40.0 — Match Pitch & Venue

- Added a Match-only procedural grass, lighting and venue treatment on the existing `match-presentation` boundary.
- Kept the first two pitch background layers as the existing logical square grid at the same cell geometry.
- Increased Match-only field/goal contrast without changing DOM layers, hitboxes, piece rendering or game behavior.
- Editor Mode and Manual Multiplayer remain on the prior presentation route.

## v20.39.0 — Match Presentation Foundation

- Added the explicit `presentationMode` boundary to `BoardCanvas`.
- Activated its Match presentation wrapper only for offline Single Player Match; Editor Mode and the retained Manual Multiplayer path keep the Editor presentation route.
- Added a focused render assertion for the Match presentation class.
- Kept pitch geometry, player/ball appearance, all board input, Engine/Timeline behavior and Firebase paths unchanged. This build creates the stable visual boundary for later 2.5D presentation work.

## v20.38.0 — Phase 8C.2c.2

- Extracted the Card Editor form, Cards Panel/Card Library and Assign Card modal into explicit UI components with controller props.
- Retained every existing Workspace operation, card-library mutation path, browser file action and Manual Multiplayer synchronization at the `main.jsx` controller boundary.
- Added component render coverage for all three UI surfaces, including the Card Editor Front/Back previews and Assign preview.

## v20.37.1 — Card render Back-context correction

- Restored the missing Back-card numeric-text presentation helper in the extracted Canvas context.
- Added a Front-and-Back render regression test to prevent the card-opening crash.

## v20.37.0 — Phase 8C.2c.1

- Extracted the shared visual card renderer, layout interaction presentation, special-text fit and defensive-area preview from `main.jsx`.
- Preserved the existing `CardPreview` presentation contract and all layout-edit callbacks.

## v20.36.0 — Phase 8C.2b

- Added pure structural Card Library planners for save/upsert, clone preparation, deletion with puck detachment and Reset Cards.
- Kept the visual Card Editor, Timeline/History adapter and Manual Multiplayer synchronization unchanged.

## v20.35.0 — Phase 8C.2a

- Added pure structural Workspace planners for board settings, formations, scenarios, Rule Sets and card assignment/removal.
- Kept visual card-editor controls and Manual Multiplayer unchanged.

## v20.34.0 — Phase 8C.1

- Defined `WorkspaceSnapshot` for future-Match setup only.
- Prevented Cloud/backup persistence from restoring partial Match runtime.

## v20.32.0–v20.33.0 — Phase 8A/8B

- Routed remaining offline Match administration and manual placeholder declarations through Engine commands.
- Added the Single Player command gateway and canonical state publication boundary.

## v20.25.0–v20.31.0 — Pass completion

- Migrated offline Single Player Pass start, target, route, interceptor choice, requested dice, deterministic result and all current consequences into the Game Engine.
- Kept the direct goalkeeper target ban approved but pending; goalkeeper route blocking is active.
- Added canonical Extra Roll behavior and History cursor following.

## v20.21.0–v20.24.1 — Bonus Action and Match lifecycle

- Established generic Bonus Action continuation and Engine-owned Bonus MOVE / End B.A.
- Moved phase closure and automatic numbered-turn advancement into the Engine.
- Migrated Match start/restart; Match Over remains presentation-only.

## v20.17.0–v20.20.1 — Movement family

- Migrated 3/2, path blocking, Free Move and Group Move into the offline Single Player Engine.
- Preserved approved differences: Group Move may cross players; Free Move remains administrative and unrestricted.

## v20.12.0–v20.16.0 — Engine foundation

- Created the command-driven Game Engine kernel, MatchContext and Free Ball vertical slice.
- Migrated normal MOVE, including progressive movement and unified card/board entry.

## v20.1–v20.11.6 — legacy Multiplayer history

- Built and corrected the Host Authority, semantic-intent and Interaction Layer approach.
- Automated Multiplayer is now frozen while the Single Player architecture is completed. Detailed historical entries and rejected approaches remain in [`MULTIPLAYER_CHANGELOG.md`](MULTIPLAYER_CHANGELOG.md).
## v20.54.0 — Through Ball and triggered 3/2

- Added the offline Engine commands for Through Ball start, target selection, route confirmation and cancellation; only route confirmation consumes its own `THROUGH_BALL` normal action.
- Added frozen Rule Set settings for Through Ball maximum range and the approved 3/2 continuation toggle.
- Through Ball targets a free cell, uses the shared physical corner trajectory, blocks on bodies and enemy defensive areas, and resolves recovery by centre-to-centre distance, then Speed, then defence on a remaining tie.
- Replaced generic free-ball 3/2 eligibility with the temporary Through Ball opportunity: same team and turn, passer excluded, one use per player; it clears on use or phase change. Bonus Action is no longer a 3/2 exception.
- Added Inspector Through Ball and disabled Lofted Through controls inside the existing Zoom/Reset row. Manual Multiplayer is unchanged.
## v20.54.1 — Through Ball recovery and 3/2 continuity

- Replaced Through Ball's accidental ID-based defender tie-break with a canonical defender-choice state when distance and Speed remain equal.
- Recovery now preserves the target-cell arrival, shows a recovery explanation, then changes possession and begins the recovering team’s next turn through the Engine.
- Fixed the 3/2 continuation setting: it preserves the preceding movement axis, exact direction and remaining Speed; reverse movement on that axis is rejected.
- Added an explicit self-Through-Ball 3/2 explanation and repeat-target cancellation for offline Pass and Through Ball.
- Added Engine sentinel tests for frozen Through Ball range, equal defender selection/recovery handoff, and 3/2 direction continuity. Manual Multiplayer remains unchanged.

## v20.54.2 — Through Ball resolution and Match entry integrity

- Repaired the Tracker action-record contract: Engine writes canonical markers (`SP`, `LP`, `TB`, `LT`), state normalization preserves valid types, and an unknown type remains explicit `UNKNOWN` instead of being silently rewritten as `PASS`.
- Added the manual `LOFTED_THROUGH_BALL` Engine action and enabled the existing Inspector control. It consumes a normal and personal action, is recorded as `LT`, and intentionally has no board consequence until the full mechanic is approved.
- Made reselecting a Through Ball target return canonically from route selection to target selection while retaining that target; full cancellation remains explicit.
- Added Undo/Redo controls to blocking recovery/result/turn gameplay popups.
- MatchContext is now created from the exact Timeline baseline at offline Match entry, removing the save-then-immediate-Match Rule Set capture race.
- Corrected the direction restriction so it applies only to the approved continuation after 3/2, not to ordinary segmented MOVE.
- AI Export now includes Tracker markers, Through Ball maximum range, and recovery/race facts. Manual Multiplayer remains unchanged.
## v20.55.6 — Roll outcome and Bonus Action presentation cleanup

- Persists Natural-roll effect semantics for offline Interception and Lofted Through, so result prompts state the configured `none`/BA/AV/AVM consequence instead of assuming Bonus Action.
- Unifies the AV/AVM selection control and visibly records the deliberate “roll normally — save” choice.
- Clears rendered AV/AVM opportunities during Match → Editor, disables unimplemented offline action buttons in normal and Bonus Action contexts, and removes the obsolete yellow interaction highlight.
- Manual Multiplayer remains unchanged. Pass route/interception integrity remains queued separately.
## v20.55.7 — LT recovery and 3/2 BA continuity

- Corrected the omitted Engine import that prevented `LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED` from completing its recovery popup.
- Allows a canonical LT/TB 3/2 opportunity during the owning Bonus Action's `awaiting-end-bonus-action` state, without reopening other actions.
- Gives duplicate AV/AVM tokens individual selected-button identity and changes the selected control to a neutral pressed style.
- Manual Multiplayer remains unchanged.
