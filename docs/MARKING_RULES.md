# Marking Rules

## Status and scope

This document is the agreed gameplay contract for **Marking** (`Marcaj`). It
is documentation only. Marking is not implemented in the current runtime and
must pass the Mechanic Integration Gate before any Engine build begins.

Shared reaction authority, defensive areas, possession, inactive players and
movement terminology remain defined by
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md) and
[`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). This document
adds no global reaction-chain rule and does not define Tackling; the specific
Marking-to-Tackling boundary belongs to the future Tackling contract.

## 1. Meaning of Marking

In this game, Marking is the name for an optional **passive defensive tracking
reaction**. It does not create a duel, alter attributes, restrict an action or
apply a direct bonus or penalty.

Its only gameplay effect is that the chosen defender spends its own total
Speed budget to follow the chosen attacker and keep that attacker inside the
defender's defensive area. The defensive area itself creates the relevant
gameplay pressure: Interception, the need for Dribbling when applicable,
future Tackling and other rules that explicitly use that area.

## 2. Ownership and limits

Only the defending team may declare Marking during the attacking team's
movement. Marking is a reaction and consumes neither normal Tracker action nor
personal action.

For each numbered turn:

- the defending team may accept at most two Markings in total;
- one attacker may have at most one active marker;
- one defender may actively mark at most one attacker.

An accepted Marking consumes one of the two team opportunities for that turn.
It remains consumed even if the tracking ends early. Declining a Marking does
not consume an opportunity. The count resets only when the numbered turn ends.

## 3. Trigger and defender selection

Any active attacking player, whether or not it possesses the ball, can trigger
Marking. The opportunity exists at the moment that player enters the **first
cell** of an eligible defender's defensive area during its movement.

If the first entered cell lies in several defensive areas, the defending coach
chooses exactly one eligible defender as the possible marker. The other
defenders are unavailable for that same entry; declining then creates no
second prompt for another defender in that cell.

The Engine records a canonical pending Marking decision for the defending team
and freezes the attacking player's remaining movement. The decision prompt
shows the target attacker, eligible defender or defender choices, and the
number of team Markings still available.

If the defending coach declines, no Marking is created and the attacker resumes
the pending movement normally. If the coach accepts, the defender becomes the
attacker's marker and one team opportunity is consumed.

## 4. Entry preview and first-cell decision

When the defending team still has a Marking opportunity, an attacking movement
that would enter an eligible defensive area normally stops for confirmation at
the first entered cell. The Engine may project the movement beyond that cell as
available but uncertain (`?`); it is not an illegal or prohibited route.

After the attacking coach commits movement to the first entered cell, the
defending coach receives the canonical Marking decision. No UI may move the
attacker back or refund movement after the fact.

If the defending team has already consumed both Markings for the turn, no
Marking decision is possible and the attacking movement projection behaves
normally.

The fast-exit exception in section 7 is evaluated by the Engine from the
declared intended route before this first-cell stop. A route that qualifies for
that exception remains normal and creates no Marking prompt.

## 5. Passive tracking movement

After Marking is accepted, the attacker completes the currently pending
movement. Only after that movement ends does the marker make its passive
tracking movement. The reaction then ends; attack continues with its next
choice.

If the marked attacker moves again in the same numbered turn, the active
marker again tracks only after that new attacking movement ends.

The marker has a total tracking budget equal to its Speed for the entire
numbered turn. For example, a marker with Speed 5 that uses 3 cells of legal
tracking after the first attacking movement has at most 2 cells left for every
later tracking response that turn.

Each tracking movement:

- follows the ordinary legal movement/path rules, including bodies blocking
  movement;
- may use only the shortest available movement axis and direction toward the
  marked attacker;
- allows the defending coach to choose the number of cells on an eligible
  shortest axis/direction when more than one such choice exists;
- must leave the marked attacker inside the marker's defensive area.

The marker does not receive a new normal action, personal action or fresh Speed
budget for this response.

## 6. End of Marking

Marking ends immediately when any of these occurs:

- the marker lacks sufficient remaining Speed to make a legal tracking move
  that keeps the attacker in its defensive area;
- bodies or normal movement-path legality prevent such a tracking move;
- the marked attacker uses the fast-exit rule in section 7;
- the defending coach accepts a Marking switch under section 8;
- the numbered turn ends.

When it ends because tracking is impossible, the team opportunity remains
consumed. No direct gameplay effect occurs at the end: the attacker has simply
escaped that defender's defensive area and normal gameplay resumes.

## 7. Fast exit by Speed difference

Fast exit is not a modifier and does not grant extra movement. It is a
movement-rule exception that prevents or ends Marking when the attacker has a
Speed value at least 2 higher than the relevant defender.

The exception applies only if the relevant part of the attacker's route:

- crosses at most two cells orthogonally inside that defender's defensive
  area, with the next orthogonal cell outside the area; or
- crosses at most one cell diagonally inside that defender's defensive area,
  with the next diagonal cell outside the area.

It applies in both situations below:

1. an unmarked attacker starts outside the area and only crosses through it
   using that limited route; no Marking prompt appears and no Marking is
   created;
2. an already marked attacker is inside the marker's area and uses that limited
   route to leave it; the Marking ends.

A route involving three or more orthogonal cells, or two or more diagonal
cells, inside the relevant defensive area does not qualify for fast exit.

## 8. Marking switch and a new defensive area

An attacker with an active marker cannot receive a second simultaneous marker.
When that attacker enters the defensive area of a different defender, and the
defending team still has an unused Marking opportunity, the defending coach is
offered a canonical **Marking switch** choice:

- keep the existing marker; or
- end the existing Marking and assign the new defender as marker.

Accepting the switch consumes the next team Marking opportunity. The previous
Marking ends without refund. The new defender begins with its own full Speed
tracking budget for that turn and follows the normal acceptance/timing rules.

If the coach keeps the existing marker, no second marker is created. If the
attacker has already escaped a prior Marking and then immediately enters a
different defender's area, that player is unmarked again and the ordinary
Marking trigger in section 3 applies, provided that an opportunity remains.

## 9. Canonical state and visual projection

Engine/MatchState must own:

- the two-opportunity per-team count for the numbered turn;
- every active marker-target assignment;
- each marker's consumed and remaining Speed budget;
- pending first-entry Marking decisions and pending Marking-switch decisions;
- the frozen attacker route/movement state around a decision;
- every accepted, declined, ended and switched Marking semantic event.

The UI projects those facts. It never determines a defensive-area entry,
eligibility, fast exit, Speed sufficiency, movement refund or switch locally.
Timeline, Undo/Redo, Replay and AI Export must preserve the same assignments,
choices, budgets and end reasons.

Available and active Marking information requires an explicit visual
projection. Its player-card indicator belongs beside the existing individual-
action markers. Exact iconography and CSS are a future presentation task; they
must consume the canonical state above rather than recalculate it.

Manual Multiplayer is unchanged. Any future multiplayer implementation must
route every pending Marking or switch choice to the defending team recorded in
MatchState.
