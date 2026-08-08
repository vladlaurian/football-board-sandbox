# Shooting Rules

## Status and scope

This document is the agreed gameplay contract for **Shot** (Șut), including
direct Shot from a Free Kick and Corner. v20.56.28 implemented only the narrow
normal-play **resolution checkpoint** described below. Goal and Goalkeeper
Retains have had their physical consequence since Builds A/B; Corner and Goal
Kick have had theirs since v20.56.45 (the restart-setup engine — see
[FINALISATION_AND_RESTARTS_RULES.md](FINALISATION_AND_RESTARTS_RULES.md)).
Direct Corner Shot's own execution-time exception (section 5) is implemented
as of v20.56.45. Direct Free Kick Shot (section 4) remains future work — Free
Kick has no trigger mechanic yet (no foul/tackling detection), so its
exception is written but unreachable in a Match.

Goal, goal kick, Corner, kick-off, wall placement and restart setup are owned
by [FINALISATION_AND_RESTARTS_RULES.md](FINALISATION_AND_RESTARTS_RULES.md).
This document fixes Shot resolution only.

### v20.56.28 implemented boundary

Offline Single Player normal play has: active Shot, a board-first attempted
target on any pitch or goal-grid cell, four corner-to-centre routes,
Pass-identical shared-corner body blocking, canonical D20 and immutable result
display. Only an opponent GoalGrid cell is a valid Shot target. Any other board
cell persists a grey, non-selectable route preview and reports “Please select a
cell inside the opponent's goal.” without a Tracker cost. Goal cells receive no
special target fill. The live pointer label displays centre-to-centre distance
and FIN/LS/DLS/MAX band. Green means legal with no defensive-area fact on that
route (at the origin or crossed along it); red means legal but with one or
more defensive-area facts; grey means blocked. Non-dominant-foot DVM and the
distant Long Shot band penalty still count in the corner's shown total
modifier number, but never turn it red by themselves — this exactly matches
Pass's own corner-colour rule, not a Shot-specific exception. A route is
selected by clicking its origin corner on the board.

The result values `goal`, `goal-kick`, `corner` and `goalkeeper-retains` are
canonical MatchState/Timeline facts only. v20.56.27 applies no score, ball,
possession, turn, goalkeeper placement or restart consequence and exposes no
fake acknowledgement/restart action. Undo/Redo or New Game is the intentional
test exit. Manual Multiplayer is excluded.

## 1. Normal Shot eligibility and physical route

Only an attacking player with possession may take a Shot at the opposing goal.
The attacker selects a physical origin corner in its own cell and a target goal
cell. The physical route is corner-to-centre of the selected goal cell.

A normal Shot route is legal only when:

- it remains inside the board for its complete route (implemented v20.56.44
  — the goal is a notch attached to the pitch only across the goal's own
  width band; at a wide-open angle, the straight line crosses the goal-line
  plane while still outside that band before curving back in at a later x,
  which is illegal for a normal Shot — see `routeExitsBoard` in
  `src/engine/shotRules.mjs`. The threshold is exactly 45° to the near post
  and is derived from board geometry, not a separate Rule Set value. A
  direct Corner Shot's own contract in section 5 is the one documented
  exception, via an explicit `exemptFromBoardBoundary` opt-out);
- it does not enter the interior of any occupied active player cell, whether
  teammate or opponent;
- its centre-to-centre shot distance does not exceed the frozen maximum.

A body contact makes that origin route invalid; it is not a deflection,
interception or later recovery event. The selected corner changes physical
route validity but never the regulatory centre-to-centre distance.

A shooter occupying a defending player's defensive area receives that owner's
DV independently of the selected origin corner. A Shot may then cross defensive
areas: each other distinct defending player's defensive area crossed by the
normal Shot route adds one DV, no matter how many cells of that same area the
route crosses. The origin owner and a crossed owner are deduplicated, so one
defender contributes at most one DV. If the Shot uses the non-dominant foot, it
also receives DVM.

## 2. Frozen distance settings

The Rule Set provides and MatchContext freezes:

- longShotNormalRangeMax, initially 11 cells;
- shotMaximumRange, initially 16 cells;
- the positional penalty for the band after normal Long Shot range: DV or DVM.

The bands are:

- from outside the penalty area through longShotNormalRangeMax, inclusive:
  normal Long Shot band;
- from longShotNormalRangeMax + 1 through shotMaximumRange, inclusive:
  distant Long Shot band;
- beyond shotMaximumRange: Shot is unavailable.

All Shot distance is measured centre-to-centre from the shooting cell to the
selected goal cell. Changing either editable distance automatically changes the
relevant band boundary.

## 3. Normal Shot roll

Inside either penalty area, the attacking player rolls D20 plus:

- Finishing;
- every relevant AV, AVM, DV and DVM.

The total is compared with the goalkeeper's fixed Reflexes.

Outside the penalty area, the attacking player rolls D20 plus:

- Long Shot;
- every relevant AV, AVM, DV and DVM.

The total is compared with the goalkeeper's fixed Diving Saves. A Shot in the
distant Long Shot band receives the frozen positional DV or DVM in addition to
all other applicable modifiers.

For either normal Shot band:

- greater total: Goal;
- lower total: goalkeeper retains the ball;
- equal total: Corner.

Natural 20 is always Goal and has no additional effect. Natural 1 always
misses the goal and produces a goal kick.

Implemented v20.56.45: `goalKickInterval` and `cornerInterval` (Rule Set,
1-5, default 1 — the rule exactly as stated above) widen these two edges.
`goalKickInterval` extends "Natural 1" to "Natural 1 through N"; `cornerInterval`
extends "total equals the goalkeeper's stat" to "total is at most N-1 below
it". Neither can ever turn a real Goal (total strictly above the goalkeeper's
stat) into anything else — that comparison is checked first, unconditionally,
in `resolveShotResult` (`src/engine/shotRules.mjs`).

When a goalkeeper retains a normal Shot, it keeps the ball in its existing
cell. Its subsequent restart may use Short Pass, Long Pass, Through Ball or
Lofted Through Ball. Inside the goalkeeper's large and small penalty areas,
every body (teammate or opponent) and every defensive area is ignored for
that restart — the box is assumed crowded right after the save, so this one
distribution is unobstructed by anyone standing in it — exactly as for a
goalkeeper who retained a Cross. Outside the large penalty area, ordinary
rules resume.

Implemented v21.1.0: an optional, Rule-Set-configurable **untracked
reposition window** may open right after the retain, before the goalkeeper's
own restart action — the goalkeeper's team moves first, then alternates with
the opponent, up to a configured number of moves per side (0 disables it).
Each move uses the same movement legality as an ordinary Move (Speed,
diagonal cost, axis lock) but is never counted in any Tracker or personal
action budget. Exactly one piece may move per turn, and a piece already used
is retired for the rest of the window — it cannot be picked again on a later
turn, which would otherwise let it walk across several turns' worth of
Speed. Three independent Rule Set checkboxes decide when this window
triggers: after a Free Kick's own Goalkeeper Retains, after a corner header
(not yet built, so this checkbox is currently inert), or any time the
goalkeeper retains the ball at all. See `src/engine/gkRepositionRules.mjs`.

## 4. Direct Shot from a Free Kick

A direct free-kick Shot is available under the Free Kick restart contract. It
uses Long Shot against the goalkeeper's Diving Saves and preserves:

- the frozen normal and maximum Shot distance settings;
- the frozen positional distance penalty in the distant Long Shot band;
- the normal maximum-range prohibition;
- all otherwise relevant roll modifiers, including non-dominant-foot DVM.

For this special Shot only:

- player bodies, including every wall player, do not block the physical route;
- defensive areas crossed by the route add no DV;
- each player in the defensive wall adds one DV to the Shot roll.

The wall therefore changes difficulty through its player count, not through
route blocking or defensive-area crossings. Wall placement is limited by the
Free Kick contract.

Normal lower-than-target result remains goalkeeper retention with the same
goalkeeper restart exception in section 3. Equality produces Corner, exactly as
for a normal Shot.

Natural 20 is always Goal with no additional effect.

On Natural 1, the defending coach chooses one player from the wall to receive
the ball. The defending team receives Bonus Action immediately. After that
Bonus Action, possession changes and the defending team begins its next
numbered turn attacking.

## 5. Direct Shot from a Corner

Implemented v20.56.45 (`buildShotRoutePlan`'s `restartModifiers` in
`src/engine/shotRules.mjs`, gated on `state.restartSetup.type === "corner"`
during the execution phase for the entitled executor only).

A direct Corner Shot is available only under the Corner restart contract. It
uses Long Shot against the goalkeeper's Diving Saves and retains the ordinary
maximum Shot range.

It receives all of the following modifiers:

- a mandatory DVM for the Corner execution itself;
- the frozen distant-Long-Shot positional penalty, because the closest goal
  cell is at least twelve cells centre-to-centre from the Corner cell;
- one DV if the defending coach placed the optional one-player Corner wall.

Unlike an ordinary Shot, this physical route may leave the board through
off-field cells before returning to the selected goal cell. That exception
models a curved Corner trajectory; it does not remove ordinary body blocking
or the DV for each distinct defending defensive area crossed while the route
is on the board. Every other normal Shot condition and resolution applies,
including the maximum range, goalkeeper comparison, equality Corner, Natural
20 Goal and Natural 1 goal kick.

## 6. Canonical state and presentation

Engine/MatchState must own:

- the selected shooter, origin corner and goal-cell target;
- physical-route validity, body-block facts and distinct defensive areas crossed;
- regulatory distance, Shot band and frozen Rule Set values;
- all applied modifiers, target goalkeeper statistic and the complete result.
  Shot roll modifiers (non-dominant foot, each distinct defensive area, the
  Distant Long Shot band, and a consumed Tracker AV/AVM/DV/DVM token) sum, then
  are capped symmetrically at the frozen `diceModifiers.stackCap` (default
  ±4), the same rule Lofted Through Ball and Interception already apply. The
  uncapped per-source route facts remain a separate canonical record for AI
  Export;
- goal, goal-kick, Corner or goalkeeper-retention result;
- free-kick Shot wall count, its extra DV facts and Natural-1 receiver choice;
- Corner Shot's selected curved physical route, mandatory DVM, distance-band
  penalty and optional-wall DV;
- goalkeeper restart exception and every pending choice/roll;
- semantic Timeline and AI Export events for Shot setup, roll, result, Goal,
  restart, Natural result and free-kick-specific consequence.

The UI consumes those canonical verdicts. It does not independently calculate
Shot validity, distance classification, defensive-area DVs, wall penalty,
goalkeeper exception or result.

Manual Multiplayer remains unchanged. Future multiplayer must route the
Natural-1 wall-player choice and every other defensive choice to the entitled
team in MatchState.

Implemented v20.56.45: a Corner or Goal Kick result now starts
`state.restartSetup` (wall/reposition/executor — see
[FINALISATION_AND_RESTARTS_RULES.md](FINALISATION_AND_RESTARTS_RULES.md))
instead of resolving directly; the ball cell echoes which half of the goal
the missed/saved Shot was aimed at (top/bottom), falling back to the app's
own random choice only for a dead-centre attempt.
