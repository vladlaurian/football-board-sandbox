# Finalisation and Restarts Rules

## Status and scope

This document is the agreed game-rule contract for results that interrupt or
restart play: Goal, goal kick, throw-in, corner, free kick, penalty and kick-
off. It is documentation only. It does not claim that these procedures are
implemented in the current runtime.

It owns restart setup, possession, action-economy treatment and the required
canonical state. The mechanism that creates a result remains responsible for
its own roll and result criterion. For example, Header finalisation remains in
[`CROSS_RULES.md`](CROSS_RULES.md), while the setup of a resulting goal kick or
corner is defined here.

Shared definitions of possession, inactive players, reactions, result
categories and Offside remain in
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md). Team modifier
tokens follow [`MODIFIERS_AND_TRACKER_RULES.md`](MODIFIERS_AND_TRACKER_RULES.md).

## 1. Canonical restart principle

Every result and restart is resolved by Engine/MatchState. It must record the
result, entitled team, placement/setup state, authorised coach choices,
applicable restrictions and the restart execution. The UI projects that state
and submits commands only.

Timeline, Undo/Redo, Replay and AI Export use that same canonical state.
Manual Multiplayer is unchanged. Any future multiplayer implementation must
derive the entitled coach from the canonical team ownership of the pending
restart or decision.

All placement and coach-choice steps are part of the restart state. A restart
cannot be completed until its required placements and executing player have
been resolved canonically.

Implemented v20.56.45: whenever the Engine itself computes a cell for this
restart machinery (the wall line, or the ball cell before the executor is
placed there) and a player already happens to stand on it, that player is
relocated immediately, automatically and for free, to the nearest open cell
— never charged against any reposition allotment or Tracker action, and
never counted as part of the wall. This happens as early as possible (at
restart start for the ball cell, before wall placement for the wall line),
specifically so the displaced player is still an entirely ordinary,
manually-repositionable piece for whatever reposition phase follows, rather
than a placement the coach has no further chance to adjust
(`clearCellForPlacement` in `src/engine/restartSetupRules.mjs`).

## 2. Action economy and modifiers at a restart

Where this document says a restart **resets the Tracker**, it resets only:

- team action economy; and
- personal action usage.

It does not clear AV, AVM, DV or DVM tokens. Modifier expiry remains owned by
the mechanism that granted each token, as defined in
[`MODIFIERS_AND_TRACKER_RULES.md`](MODIFIERS_AND_TRACKER_RULES.md).

When a restart begins a new numbered turn, normal turn-transition rules apply.
When a restart explicitly does **not** begin a new numbered turn, the current
turn number and its non-action state remain; only the stated Tracker action
economy is refreshed.

Unless a restart rule below explicitly makes an execution free, executing the
chosen restart action consumes its normal Tracker and personal action cost.

## 3. Goal and kick-off

### 3.1 Goal

When a finalisation mechanism declares a Goal:

1. the canonical score is updated for the scoring team;
2. the current play ends;
3. the team that conceded the Goal is entitled to the next kick-off.

The Tracker and score history must retain the goal in the correct turn and
show the scoring team's colour. The detailed Tracker presentation for halves,
extra time, penalty shoot-out and score history is a separate future Tracker
implementation contract.

### 3.2 Kick-off setup

Kick-off occurs:

- at Match start, after a draw determines the first team;
- at the start of the second half, by the other team;
- at the start of the first extra-time half, after a draw determines the first
  team; the other team starts the second extra-time half;
- after each Goal, by the team that conceded it.

At every kick-off, both teams return to their active Match tactical formation.
Before the Match begins, that tactic is initialized from the selected Workspace
formation. A later Tactical Change may alter the active Match tactic only
through its canonical interruption command; it does not move the live board
when confirmed. Repositioning at kick-off retains every card assignment:
changing or restoring a formation never deassigns cards from players.

Implemented (v20.56.42) for the two kick-off moments the Engine currently
recognises — before the Match's first turn, and a pending post-goal restart
(`src/engine/kickoffMomentRules.mjs`). `FORMATION_TACTIC_CONFIRMED`
(`src/engine/formationTacticRules.mjs`) is the Tactical Change command: it
applies immediately at a kick-off moment or queues in `state.pendingFormation`
otherwise, and a goal always re-lays out both teams into whichever tactic
ends up active (`applyGoalConsequence` in `src/engine/shotRules.mjs`) —
except the one attacker with the ball, who always stays exactly at the
centre point regardless of what that tactic says for their slot. If the
newly active tactic's role recipe does not exactly match a team's assigned
cards, every action for that team is blocked (`state.tacticBlock`) until a
matching tactic is confirmed from Prep — there is no other way to reach that
state, since cards themselves cannot change once the Match has started, and
no build has substitutions yet. Half-time/extra-time kick-off is not implemented. Goal Kick and Corner are
implemented as of v20.56.45 via the shared restart-setup engine (section 9);
Free Kick and Throw-in are configured in Rules but not yet triggerable — no
foul/tackling or out-of-bounds detection exists in the Engine yet.

Since v20.56.43, Prep's mid-Match `Ready` is the canonical way to re-confirm
which piece takes the kick-off: `KICKOFF_READY_CONFIRMED`
(`src/engine/kickoffReadyRules.mjs`), while a restart is pending for that
team, re-lays out the team into its active tactic, re-validates it, and
re-picks the ST **under the currently active tactic** rather than trusting
whichever piece the original goal happened to pick — this keeps the "one
attacker... ST" invariant true even after the coach changes tactic mid
restart. See `docs/TEAM_COMPOSITION_AND_FORMATIONS.md` section 5.5.

One attacker is placed in the cell adjacent to the centre point with the ball
in that player's cell. That player is the only one who may act, and no other
command is available until it does; its pass may be Short Pass, Long Pass,
Through Ball or Lofted Through Ball, in any direction, at its ordinary normal
Tracker cost — there is no forced direction and no free activation. After it,
play continues under ordinary game rules.

## 4. Goal kick

Implemented v20.56.45 via the shared restart-setup engine (section 9,
`src/engine/restartSetupRules.mjs`), triggered by Shot's own natural-1 outcome
(`applyGoalKickConsequence` in `src/engine/shotRules.mjs`). One deliberate
difference from the paragraph below: the executing cell is not chosen by the
coach — the Engine picks it automatically, among the first three cells from
either end of the small box's width, echoing which half of the goal the shot
that missed was aimed at (falls back to random only for a dead-centre miss).
The coach's one choice is which piece executes. Wall size (0 here — Goal Kick
has none) and reposition count (7) are Rule-Set-editable.

A goal kick may be the result specified by a finalisation mechanism. The
current turn ends, possession changes and the team entitled to the goal kick
starts a new numbered turn as the attacking team.

The entitled coach places the executing player, including the goalkeeper if
desired, inside its small penalty area in a cell adjacent to the small-box
line. Starting with the team now attacking, each coach may reposition up to
seven outfield players in turn.

During this setup, the opponent may not place a player in either the large or
small penalty area of the team executing the goal kick.

The goal kick may be restarted through Short Pass, Long Pass, Through Ball or
Lofted Through Ball. The selected action consumes its ordinary normal Tracker
and personal action cost.

Within the large and small penalty areas of the team executing the goal kick,
opponents' defensive areas are ignored for that restart action. This exception
does **not** state that opponents' bodies are ignored. Outside the executing
team's large penalty area, the ordinary rules of the selected action apply.

Implemented v20.56.45: the "opponent may not place a player in the box" rule
above is actively enforced both ways — the opponent cannot reposition a piece
into the box, **and** cannot skip its reposition turn (nor exhaust its
allotted moves) while any of its own pieces is still standing inside the box,
however it got there. Running out of moves with an occupant still present
grants one more move rather than ending the turn, so the requirement can
never be exhausted around. This applies only to Goal Kick — Corner has no
such restriction, since the attacking team is meant to be able to stack the
box it is attacking.

## 5. Throw-in

When the ball leaves through a touchline, the team entitled by the result
mechanism puts the ball back into play. The entitled coach places one player
with the ball in the off-field cell through which the ball left the board. That
player restarts play using the ordinary Short Pass rules and costs.

The result mechanism also states whether possession changes:

- if possession changes, a new numbered turn begins with the entitled team
  attacking;
- if possession does not change, no new numbered turn begins, but the Tracker
  action economy is reset exactly as for Corner.

In the second case, only team and personal actions reset; modifier tokens do
not reset.

## 6. Corner

Implemented v20.56.45 via the shared restart-setup engine (section 9,
`src/engine/restartSetupRules.mjs`), triggered by Shot's own equal-total
outcome (`applyCornerConsequence` in `src/engine/shotRules.mjs`). One
deliberate difference from the paragraph below: which corner flag (top or
bottom touchline) is not a coach choice — the Engine picks it automatically,
echoing which half of the goal the saved shot was aimed at (falls back to
random only for a dead-centre attempt). Wall size (1) and reposition count
(5) are Rule-Set-editable. Cross is not implemented yet, so it is not yet a
selectable execution; Short Pass, Long Pass, Through Ball, Lofted Through
Ball and Shot all are.

A Corner does not itself begin a new numbered turn. The attacking team chooses
the corner in the opponents' half, and the ball is placed in that corner cell.
The executor is deliberately not selected or placed yet.

The restart resets the Tracker action economy only. The defending coach may
first place an optional one-player wall. If used, that player must be in the
fifth cell after the ball. The ball cell is not counted: the first counted
cell is the one adjacent to the ball, so the wall player's centre is exactly
five cells centre-to-centre from the ball cell. The wall player is fixed once
placed.

Implemented v20.56.45: since the Corner ball cell is already on the goal
line at the touchline corner, there is no room left toward goal along the
Free Kick wall's axis. The wall player instead stays on the ball's own
column (already adjacent to the goal line) and is placed 5 cells along the
goal line itself, toward the goal's vertical centre (`cornerWallCell` in
`src/engine/restartSetupRules.mjs`) — geometrically different from Free
Kick's wall, but the same "5th cell, not counting the ball" rule.

Implemented v21.1.0: the wall's own lateral position and length (up to the
Rule Set's configured maximum) are chosen on a dedicated screen before player
selection, same as Free Kick (section 7) — including "No Wall". A defending
player standing closer to the ball than the legal minimum (5 cells
orthogonally, 4 diagonally) must be repositioned first and can never be
repositioned back into that zone; a reposition extending the wall's own
fixed line asks the coach whether to leave it there anyway. Extra reposition
moves from an illegal-distance overflow are granted symmetrically to both
sides — see section 7 for the full description, identical here.

Each coach may then reposition up to five outfield players in turn, beginning
with the attacking team. Only after those placements does the attacking coach
choose the executor and place that player in the ball cell. This order prevents
the defending coach from learning the intended executor from card statistics
before the defensive placement is complete.

After the final placement, the attacking coach executes one of:

- Short Pass;
- Long Pass;
- Through Ball;
- Lofted Through Ball;
- Cross;
- Shot.

The selected execution consumes its normal Tracker and personal action cost.
All ordinary rules of the selected action apply except that a Cross from a
Corner does not require the ordinary 45-degree angle condition. A direct Corner
Shot is the dedicated special Shot in [`SHOOTING_RULES.md`](SHOOTING_RULES.md).
A Lofted Through Ball from a Corner keeps its ordinary defensive-area-crossed
penalty (unlike Free Kick's own exemption, section 7) — its only difference
is a Rule-Set-editable difficulty threshold override, defaulting to the same
16 as the ordinary threshold so it changes nothing until a coach edits it.

Implemented v20.56.45: a Long Pass into the defending team's own penalty area
is illegal from a Corner (hardcoded, not Rule-Set-editable) — Long Pass
ignores defensive areas and only risks interception from the receiver's
immediate neighbour, which would turn a corner into an unrealistic
near-certain scoring chance. Short Pass into the box remains fully legal; if
the target would be far enough to classify as Long Pass, it is rejected
outright rather than silently upgraded (`illegalCornerLongPass` in
`buildPassPlan`, `src/rules/passEngine.mjs`). The same exception is intended
for Free Kick once it has a trigger mechanic.

## 7. Free kick

After a foul, the entitled team restarts from the cell occupied by the fouled
player (Direct) or from the offside player's own position at the moment the
offence is discovered (Indirect). The ball is placed in that cell first.

**Direct Free Kick** never changes possession — the fouled (attacking) team
already had the ball and keeps it, so this stays the same numbered turn; only
the Tracker action economy resets, exactly like Corner. **Indirect Free
Kick** does change possession (offside hands the ball to the defending team),
so it begins a real new numbered turn, exactly like Goal Kick. This follows
the general rule: a stoppage that changes possession always advances the
turn; a stoppage that doesn't only resets the Tracker within the same turn.

Implemented v21.1.0: the defending coach first picks the wall's own lateral
position and length on a dedicated screen, before choosing which players fill
it — up to the Rule Set's configured maximum (one to four defenders), or "No
Wall" entirely. The wall is continuous and parallel to the goal line; its
closest cell is the fifth cell after the ball, centre-to-centre (the ball
cell itself is not counted). Once confirmed, the wall's cells are fixed and
the coach picks exactly that many defenders to fill them.

Each coach may then reposition up to the Rule Set's configured number of
outfield players in turn, beginning with the attacking team. A defending
player standing closer to the ball than the legal minimum (5 cells
orthogonally, 4 diagonally, judged the same way as the wall's own distance)
must be repositioned first, before any other of that side's players, and can
never be repositioned back into that zone — this is a hard requirement, not
just an ordering preference, since leaving such a player in place can make
the restart's own execution unplayable. If a repositioned defender would land
in a cell that extends the wall's own fixed line, the coach is asked whether
to leave it there anyway — it is never silently counted as part of the wall
either way. If illegal-distance (or, for Goal Kick, in-box) violators
outnumber the configured reposition count, both sides — not just the
defending one — are granted the same number of extra moves, since the
attacking side always moves first and cannot be topped up after the fact.

Only after the final repositioning does the attacking coach choose the
executor and place that player in the ball cell. The defending coach
therefore cannot infer the intended execution from the attacker's selected
card statistics while placing the wall or its players.

The executor may choose from the Rule Set's own configured list for this
restart type (`availableActions`); Direct Free Kick's default includes Shot,
Indirect Free Kick's does not (an indirect free kick can never be shot
directly). The full set of options either restart type can be configured
with:

- Short Pass;
- Long Pass;
- Through Ball;
- Lofted Through Ball;
- Cross;
- Shot.

All ordinary rules of the chosen action apply, including each action's physical
body-contact and defensive-area effects, except for the following explicitly
defined cases:

- Long Pass keeps its ordinary Long Pass contact and origin/destination
  reaction rules. A body contact does not become a new Free-Kick-only route
  rejection.
- Cross from a Free Kick does not require the ordinary 45-degree angle
  condition.
- A Lofted Through Ball keeps its ordinary body and other legality rules, but
  its difficulty threshold is 18 instead of the ordinary 16. The number of
  defensive areas crossed by its route has no effect on this Free Kick Lofted
  Through Ball.
- A direct Free Kick Shot uses the special Shot contract in
  [`SHOOTING_RULES.md`](SHOOTING_RULES.md).

## 8. Penalty

### 8.1 Penalty during a Match

A foul in either the large or small penalty area produces a Penalty. Its
execution uses the 11-metre-point setup below; there is no tactical
repositioning phase.

Every outfield player in the large penalty area, including its semicircle, is
moved automatically outside both shapes. Each is placed in the nearest free
cell adjacent to the large-box line or semicircle relative to the cell it
occupied. This is only a compulsory clearance from the Penalty area, not a
coach-selected repositioning. The goalkeeper remains in its existing cell.
All other players remain where they were.

The attacking coach chooses the executor after the automatic clearance and
places that player in the cell adjacent to the 11-metre point on the
large-penalty-area side, with the ball in the executor's cell.

Penalty resets the Tracker action economy only; it does not begin a new
numbered turn. Its execution consumes its normal Tracker and personal action
cost, like Corner and Free Kick.

The executor rolls a pure D20 plus the player's `Penalty` Bonus against the
goalkeeper's fixed `GK Penalty` Attribute. No Preferred-Foot effect, defensive
area effect, AV, AVM, DV or DVM applies to this Match Penalty roll.

- total greater than `GK Penalty`: Goal; ordinary Goal and kick-off rules
  follow;
- total equal to `GK Penalty`: Corner; the ordinary Corner restart procedure
  follows;
- total lower than `GK Penalty`: the goalkeeper catches the ball, possession
  changes and the defending team starts the next numbered turn in attack.

Natural 1 is always a saved Penalty: the goalkeeper catches the ball, and the
defending team receives one Bonus Action immediately before possession changes
and its next numbered turn begins. Natural 20 is always Goal and has no extra
effect.

### 8.2 Penalties (Penalty shoot-out)

A Penalty shoot-out occurs after the Match has ended and is not a normal
numbered turn, action phase or Tracker-action sequence. All eligible players
are positioned around the centre of the field; their exact cells there have no
gameplay consequence. The active kicker and goalkeepers use the normal Penalty
positions.

The same canonical coin-toss mechanism used for Match and extra-time kick-off
decisions determines which team takes the first kick.

Before the first kick, each coach inspects its own cards and creates an ordered
hidden list of all eleven eligible players, including the goalkeeper. The
opponent cannot inspect that list or see its next player; the selected kicker
becomes visible only when that kick is executed. The coach's selection is a
canonical pending decision, not a UI-only list.

The teams take kicks alternately. The first five entries in each list are the
initial series. The shoot-out ends immediately if one team has an insurmountable
lead before both teams have taken five kicks. If the score remains level after
five kicks each, they continue alternately through entries six to eleven. No
player may take a second kick before all eleven have taken one. If the score is
still level after the full eleven-player sequence, each coach creates a new
hidden ordered list for the next sequence; the teams may use a different order.
The shoot-out ends when one team has scored one more Goal than the other from
the same number of kicks.

The physical setup and pure `D20 + Penalty` versus `GK Penalty` comparison are
the same as a Match Penalty, with only these exceptions:

- equality is a missed kick, not a Corner; no Corner is executed;
- Natural 1 is a missed kick and gives that same team one DV on its next
  Penalty execution; it does not create a goalkeeper Bonus Action;
- Natural 20 is a Goal and gives that same team one AV on its next Penalty
  execution.

Shoot-out Natural-1/Natural-20 DV or AV applies only to the recipient team's
immediate next kick, is consumed by that kick and has no effect on a goalkeeper
roll, standard Match action Tracker or any later Match action. If the shoot-out
ends before that next kick, the pending modifier expires unused.

The canonical Tracker state records the entire shoot-out: the coin-toss result,
both hidden orders (visible only to their owning coach), each selected kicker,
natural roll, applied next-kick modifier, Goal or miss, running shoot-out score
and termination condition. Its `PEN` presentation begins with five kick markers
per team and expands with later kicks when required; it is history-only and may
not edit resolved kicks, hidden future orders or the score.

## 9. Result routing boundary

Individual mechanics decide which result they create. For example, a Cross
Header normal failure creates a goal kick, while configured equality may create
a Corner. A future Tackling, Dribbling or Interception equality may similarly
select a throw-in, goal kick or Corner according to its own contract.

This document does not replace those mechanic-specific criteria. Once a
mechanic emits a result, it must use the canonical restart procedure above.
