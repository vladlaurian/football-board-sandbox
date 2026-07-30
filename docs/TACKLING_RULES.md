# Tackling Rules

## Status and scope

This document is the agreed gameplay contract for **Tackling**. It is
documentation only. Tackling is not implemented in the current runtime and
must pass the Mechanic Integration Gate before any Engine build begins.

Tackling is available only to the team currently defending. It may be a normal
defensive action or a defensive reaction. Foul, free kick and penalty restart
procedures are defined by
[`FINALISATION_AND_RESTARTS_RULES.md`](FINALISATION_AND_RESTARTS_RULES.md).
Shared inactive-player, reaction and canonical-authority rules remain in
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md). Marking is
defined by [`MARKING_RULES.md`](MARKING_RULES.md).

## 1. Two forms of Tackling

### 1.1 Defensive action

During the defense phase, a defending player may use Tackling as a normal
defensive action against an attacking player that possesses the ball. It
consumes the ordinary normal Tracker action and personal action cost.

Eligibility is frozen from the **start of that defense phase**. A defender may
Tackle only when, at that moment, one of the following was true:

- the ball carrier was at maximum three cells away orthogonally; or
- the ball carrier was at maximum two cells away diagonally; or
- the ball carrier stood inside that defender's defensive area.

The first two conditions are the ordinary distance route. A defender cannot
move closer during the defense phase and then acquire a new ordinary-distance
Tackling right. The third condition is the defensive-area exception: Tackling
remains legal from a greater distance only because the ball carrier was already
inside that defender's defensive area at the beginning of the phase.

### 1.2 Defensive reaction on proximity entry

When an attacking ball carrier enters the first cell of an active defender's
proximity area, Tackling reaction eligibility opens automatically. “Automatic”
means that Engine/MatchState opens a canonical decision window; it does not
mean that a roll is forced without the defending coach's choice.

The attacking movement pauses at that reaction point. The defending coach may
start the Tackling or defer it as defined in section 3.

If the ball carrier enters the proximity areas of several defenders at once,
every such defender is an eligible reactive tackler. The defending coach
chooses their resolution order. Resolve them sequentially; a successful
Tackling, foul, restart or any other possession-ending outcome clears the
remaining reaction queue. A failed or deferred attempt leaves any later
eligible defender available in the chosen sequence.

### 1.3 Delayed reaction after Marking

Marking never permits an immediate Tackling as the continuation of the same
Marking reaction. It creates a delayed Tackling opportunity with exactly one
intervening attacking action.

If a marked attacker possesses the ball, the attacking team completes one
subsequent action. That action may belong to the marked attacker or to a
teammate. After it completes, Engine opens the Marking-derived Tackling window
only when the same attacker still possesses the ball and remains inside the
marker's defensive area.

This is a Marking-specific defensive-area eligibility route. It does not need
to satisfy the ordinary three-orthogonal/two-diagonal phase-start distance
route. It gives the attacker one action to pass, dribble, move, escape the
defensive area or otherwise avoid the Tackling risk.

If the ball is no longer with the marked attacker, or the attacker has left the
marker's defensive area, the delayed window ends. No Tackling is offered from
that Marking.

## 2. Tackling decision window

Every reactive Tackling opportunity is represented by one canonical Engine
decision for the defending team. The UI presents:

- the defender's Tackling statistic;
- the attacking ball carrier's fixed Ball Control target;
- all relevant AV, AVM, DV and DVM;
- the eligibility source: proximity entry or Marking.

The defending coach chooses one of:

- **Tackle now** — starts the canonical Tackling roll;
- **Not now** — does not tackle at that window; after the next attacking action,
  Engine asks again if the same attacker still possesses the ball and remains
  eligible for that defender;
- **Not again this attack phase** — suppresses further reactive Tackling prompts
  for that exact defender-attacker pair until the current attack phase ends.

The final option does not disable any other defender's reaction, does not
prevent a future Marking switch and does not prevent Tackling as a normal
defensive action in the following defense phase.

## 3. Roll and equality

The defending player rolls D20 and adds:

- its Tackling bonus;
- every relevant AV, AVM, DV and DVM.

The total is compared with the attacking ball carrier's fixed Ball Control
attribute.

- greater total: Tackling succeeds;
- lower total: Tackling fails;
- equal total: the frozen Rule Set chooses one result:
  - Tackling succeeds;
  - Tackling fails;
  - Tackling fails and the ball leaves by the nearest applicable touchline,
    goal line or corner result, with possession assigned to the team that was
    attacking;
  - Tackling fails and the ball leaves by the nearest applicable touchline,
    goal line or corner result, with possession assigned to the team that was
    defending.

The result mechanism emits the appropriate canonical restart result. Its setup
then follows `FINALISATION_AND_RESTARTS_RULES.md`.

## 4. Successful Tackling

On success, the defender takes possession and moves to the closest free cell in
the former ball carrier's proximity area, measured from the defender's position
at the moment the Tackling was triggered. If several cells are equally closest,
the defending coach chooses one.

If every proximity cell is occupied, Tackling still succeeds. Expand the search
outward and use the closest free board cell to the former ball carrier; equal
distances are chosen by the defending coach.

The dispossessed attacking player becomes inactive. Possession changes and a
new numbered turn begins with the recovering team attacking.

## 5. Failed Tackling and inactivity

On failure, the ball remains with the attacking player. The defender that
attempted Tackling becomes inactive in its current cell.

For either inactive player created by Tackling, inactivity ends at the first of
these events:

- the ball leaves that inactive player's own defensive area;
- possession changes;
- the numbered turn ends.

While inactive, the established inactive-player contract applies: no actions,
reactions, possession, receiving, defensive area or blocking body; the
occupied cell remains unavailable as a final destination.

If a normal failed Tackling used the greater-distance defensive-area exception
(rather than the ordinary phase-start distance), it also produces a foul and a
yellow card for the tackler. The attacking team receives the applicable free
kick or Penalty restart.

## 6. Natural results

Natural 20 always succeeds. In addition to the ordinary successful-Tackling
outcome, the recovering team receives the frozen Rule Set result:

- Bonus Action;
- no extra effect;
- AV;
- AVM.

Natural 1 always fails and produces a foul plus yellow card for the tackler,
followed by the applicable free kick or Penalty restart.

If Natural 1 occurred through the greater-distance defensive-area exception,
the tackler instead receives a red card. It remains a failed Tackling and foul;
the applicable restart still follows normally.

All AV/AVM effects use their mechanic-specific scope and expiry under
`MODIFIERS_AND_TRACKER_RULES.md`; they are not generic future-roll tokens.

## 7. Required Rule Set settings

The Tackling contract requires frozen Rule Set choices for:

- equality result;
- Natural-20 result: Bonus Action, none, AV or AVM.

The permanent Tackling geometry is not a Rule Set value: ordinary action range
is three orthogonal or two diagonal cells at defense-phase start, and the
greater-distance exception requires defensive-area presence at that same
moment.

## 8. Canonical state and presentation

Engine/MatchState must own:

- the defense-phase-start Tackling eligibility snapshot;
- all active proximity and Marking-derived reactive opportunities;
- multi-defender reaction ordering;
- pending reaction decisions, pair-specific deferrals and attack-phase
  suppression;
- pending roll and resolved Tackling facts;
- possession, inactivity reasons/expiry, cards, fouls and restart result;
- semantic Timeline and AI Export events for offered, deferred, suppressed,
  rolled, successful, failed, fouled and natural outcomes.

The UI projects these canonical facts and submits decisions or D20 values. It
does not derive proximity, distance, defensive-area exception, inactive state,
restart, card or result locally.

Manual Multiplayer remains unchanged. Future multiplayer must route every
pending reactive Tackling decision to the defensive team recorded in MatchState.
