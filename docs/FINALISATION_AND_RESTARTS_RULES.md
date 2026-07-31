# Finalisation and Restarts Rules

## Status and scope

This document is the agreed game-rule contract for results that interrupt or
restart play: Goal, goal kick, throw-in, corner, free kick, penalty and kick-
off. v20.56.26 implements the first offline Single Player routing slice:
normal Shot records Goal, Goal Kick or Corner in canonical MatchState and Goal
updates the canonical score. Detailed placement/repositioning restrictions
remain the next restart-setup slice; they are not silently implemented by UI.

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

One attacker is placed in the cell adjacent to the centre point with the ball
in that player's cell. That player must play one Short Pass backwards. This
first pass is free, is not counted in the Tracker and is the only action that
player may perform during that kick-off sequence. After it, play continues
under ordinary game rules.

## 4. Goal kick

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

A Corner does not itself begin a new numbered turn. The attacking team chooses
the corner in the opponents' half, and the ball is placed in that corner cell.
The executor is deliberately not selected or placed yet.

The restart resets the Tracker action economy only. The defending coach may
first place an optional one-player wall. If used, that player must be in the
fifth cell after the ball. The ball cell is not counted: the first counted
cell is the one adjacent to the ball, so the wall player's centre is exactly
five cells centre-to-centre from the ball cell. The wall player is fixed once
placed.

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

## 7. Free kick

After a foul, the entitled team restarts from the cell occupied by the fouled
player. The ball is placed in that cell first. The defending coach then places
a wall of one to four defenders. The wall is continuous and parallel to the
goal line. Its closest player is in the fifth cell after the ball: that player's
centre is exactly five cells centre-to-centre from the ball cell. The ball cell
is not counted; the first counted cell is the one adjacent to it. Every other
wall player continues the wall laterally and may never be closer to the ball.
The wall is fixed once placed.

Each coach may then reposition up to five outfield players in turn, beginning
with the attacking team. Only after the final repositioning does the attacking
coach choose the executor and place that player in the ball cell. The
defending coach therefore cannot infer the intended execution from the
attacker's selected card statistics while placing the wall or its players.

Free kick resets the Tracker action economy only; it does not begin a new
numbered turn. The execution consumes its normal Tracker and personal action
cost.

The executor may choose:

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
