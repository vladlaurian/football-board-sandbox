# Dribbling Rules

## Status and scope

This document is the agreed gameplay contract for **Dribbling** (`Dribling`).
It is documentation only. Dribbling is not implemented in the current runtime
and must pass the Mechanic Integration Gate before any Engine build begins.

Dribbling is an attacking action that interacts with defensive areas, Marking,
inactivity, possession and restarts. Shared rules remain in
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md), Marking is in
[`MARKING_RULES.md`](MARKING_RULES.md), Tackling is in
[`TACKLING_RULES.md`](TACKLING_RULES.md), and restart results are in
[`FINALISATION_AND_RESTARTS_RULES.md`](FINALISATION_AND_RESTARTS_RULES.md).

## 1. Action economy and limits

Dribbling consumes both one normal Tracker action and one personal action of
the dribbling attacker. It can therefore be required during an already started
Move and consumes an additional action beyond the Move that brought the player
to the defensive-area boundary.

If the player has no eligible action remaining for a mandatory Dribble, it
cannot leave that defensive area by movement and must stop there.

The same attacker may Dribble the same defender at most once per numbered turn.
An attacker may perform at most the frozen Rule Set limit of Dribbles in one
attack phase; the current intended default is two. After using that phase
limit, the player may take other permitted actions but cannot begin or continue
a movement that requires another Dribble.

Bonus Action is outside the normal turn/phase limit and may provide the extra
Dribble permitted by its own continuation rule.

## 2. When Dribbling is mandatory

Defensive-area entry alone never requires Dribbling. A player may enter, move
inside and end movement inside an opponent's defensive area.

Dribbling becomes mandatory separately for every relevant defender in either
of these cases:

1. **Exit after starting outside:** the player began its current movement
   outside a defender's defensive area and now attempts to leave that area.
   The Dribble is required exactly at that exit boundary.
2. **Start inside:** the player begins a new movement while already inside a
   defender's defensive area. It must Dribble that defender before moving its
   first cell.

If a moving player enters a second defender's area while still moving, that
second defender is not Dribbled at entry. Dribbling that defender becomes
required only when the player later tries to leave that area, or stops there
and begins a new movement from it.

If a player begins movement in a cell shared by several defensive areas, it
must Dribble every defender whose area contains that starting cell before
moving. The attacking coach chooses the order. Failure against one defender
ends the sequence, so no later required Dribble occurs.

The attacking coach also chooses the order whenever one movement would leave
several defensive areas at once. Each required Dribble is resolved separately;
a failure ends the sequence immediately.

## 3. Roll

The attacking player rolls D20 and adds:

- its Dribbling bonus;
- every relevant AV, AVM, DV and DVM.

The total is compared with the chosen defender's fixed `1v1 Defending`
attribute.

- greater total: Dribbling succeeds;
- lower total: Dribbling fails;
- equal total: the frozen Rule Set selects one configured outcome:
  - Dribbling succeeds;
  - Dribbling fails;
  - Dribbling fails and the ball leaves by the nearest applicable touchline,
    goal line or corner result, with possession assigned to the defending team;
  - Dribbling fails and the ball leaves by the nearest applicable touchline,
    goal line or corner result, with possession assigned to the attacking team.

The Rule Set UI may present these equality options in any order. The saved,
frozen outcome — not the presentation order — is authoritative.

## 4. Successful Dribbling

A successful Dribble does not teleport the attacker. The player remains in its
current cell and uses its remaining movement points from there.

After success, the attacking coach selects a legal new movement axis and
direction. For an exit after starting outside, that new direction may differ
from the direction used before the Dribble. For a player that began inside an
area, the successful Dribble authorises the first movement direction from that
starting cell.

The selected route must follow ordinary movement/path legality. It must carry
the attacker out of the defensive area that required that Dribble.

The defender that was successfully Dribbled becomes inactive immediately. Its
body and defensive area are ignored until the end of the current attack phase,
or until an earlier reset condition supplied by another applicable mechanic.
An active Marking by that defender ends because the attacker has left its
defensive area.

## 5. Failed Dribbling

On failure, the defender takes possession and moves to the closest free cell in
the dribbler's proximity area. If several cells are equally closest, the
defending coach chooses one. If every proximity cell is occupied, expand the
search outward and use the closest free board cell; equal distances remain a
defending-coach choice.

The dribbler becomes inactive immediately. Possession changes. The recovering
team receives any relevant Natural outcome first, then starts its new numbered
turn attacking.

The inactive dribbler remains inactive throughout any immediate Bonus Action
and throughout the recovering team's attack phase in that new turn. It
reactivates when that turn enters its defense phase.

## 6. Natural results

Natural 20 always succeeds. In addition to ordinary successful Dribbling, the
attacking team receives the frozen Rule Set outcome: Bonus Action, no extra
effect, AV or AVM.

Natural 1 always fails. The defending team takes possession and receives a
Bonus Action immediately before its ordinary new numbered turn begins. The
failed dribbler is already inactive during that Bonus Action and remains so for
the ensuing attack phase, as specified in section 5.

All AV/AVM effects use their mechanic-specific scope and expiry under
[`MODIFIERS_AND_TRACKER_RULES.md`](MODIFIERS_AND_TRACKER_RULES.md); they are
not generic future-roll tokens.

## 7. Canonical state and presentation

Engine/MatchState must own:

- the frozen per-phase Dribble limit and current use count;
- same-attacker/same-defender use facts for the numbered turn;
- every mandatory-Dribble boundary and ordered multi-defender sequence;
- the paused movement position, remaining movement points and post-success
  reorientation authority;
- pending roll and selected defender;
- possession, inactivity reason/expiry, Natural outcome and restart result;
- semantic Timeline and AI Export events for required, ordered, rolled,
  successful, failed and natural Dribbling outcomes.

The UI projects that canonical state and sends commands. It must not decide
locally whether a boundary requires Dribbling, whether the player can move on,
which defender remains to be Dribbled, the result or inactivity.

Manual Multiplayer remains unchanged. Future multiplayer must route ordered
Dribble choices and rolls through canonical MatchState team ownership.
