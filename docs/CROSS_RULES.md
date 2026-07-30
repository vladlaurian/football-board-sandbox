# Cross Rules

This is the canonical game-rule contract for **Cross** (`Centrare`). It records
the agreed offline Match rule. It is not an implementation claim: Cross remains
an unimplemented manual action declaration until a separately approved Engine
build completes the Mechanic Integration Gate.

Shared terms such as proximity, possession, inactivity, reactions, results and
Offside are defined once in [`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md).
The generic action, pending-decision, pending-roll, Timeline and authority
contract is in [`ACTION_RESOLUTION_ENGINE.md`](ACTION_RESOLUTION_ENGINE.md).

## 1. Nature, ownership and frozen settings

Cross is a special form of Pass. It targets only the opponents' large or small
penalty area and consumes the same personal action and normal Tracker action as
Pass.

Engine/MatchState resolve the action canonically. The active Rule Set, card
statistics and every selectable Cross consequence are frozen in MatchContext at
Match start. Editor changes never affect an already started Match. Manual
Multiplayer, automated Multiplayer and Firebase authority are unchanged.

The Cross Rule Set settings are:

- minimum and maximum range, initially `6` and `16` cells;
- exactly one active neutral zone: `Z0` or `Z1`;
- goalkeeper advantage in the small box: `AV` or `AVM`;
- goalkeeper disadvantage in the rest of the large box: `DV` or `DVM`;
- Cross Claim equality: catch, miss or corner;
- goalkeeper Natural-1 and Natural-20 outcomes;
- attacking Header advantage in the small box: `AV` or `AVM`;
- attacking Header disadvantage in the rest of the large box: `DV` or `DVM`;
- Aerial Duel equality: attacker wins, attacker loses or corner;
- Aerial Duel Natural-1 and Natural-20 outcomes;
- empty-goal Header threshold, initially `8`;
- Header equality: goal or corner.

## 2. Eligibility, target and preview

A Cross is eligible only when all conditions below hold together:

1. centre-to-centre distance from crosser to target is within the frozen
   minimum and maximum;
2. target is inside the opposing large or small penalty area;
3. the centre-to-centre crosser-to-target axis makes an angle of at least 45
   degrees to the opponents' goal line.

The selected corner never changes the regulatory range or angle. While Cross
is active, a target may be temporarily placed anywhere for geometry preview.
When any eligibility condition fails, all candidate origins and routes are grey,
unavailable and cannot consume an action.

A Cross can target:

- an attacking receiver in the opponents' penalty area;
- a free target cell, provided that the cell belongs to no opposing outfield
  defensive area; this may trigger the established 3/2 rule;
- the opposing goalkeeper directly, under section 7.

The Offside contract applies because Cross is a pass: at the moment the ball
leaves the crosser, only the player who actually receives it is assessed,
including a 3/2 receiver.

## 3. Physical execution, foot and local body block

Cross executes corner-to-centre, like Pass and Long Pass. The selected corner
defines the physical route and the executing foot. It does not move the
crosser's body, range or angle.

A non-dominant-foot Cross gives:

- `AV` to every eligible origin interceptor;
- `AV` to the goalkeeper's Cross Claim roll.

The crosser's local area is the eight orthogonal and diagonal cells adjacent to
the crosser's body. If a selected physical route enters the interior of an
occupied cell in that area, the route is blocked. The occupying active body may
belong to either team and may be diagonal.

For a blocked route, that line and origin are grey and cannot be selected. A
segment that only touches the cell edge or corner, without entering the cell
interior, is not blocked. If every origin is blocked, Cross cannot be executed.

After the ball has passed this local eight-cell area, it is in the air. Bodies
and defensive areas in the aerial middle do not create a block or interception.

## 4. Origin interception

Cross can be intercepted at origin only when the crosser stands in an opposing
defender's defensive area. Geometry and sequencing are exactly the Long Pass
origin rule:

1. activate only a defender whose defensive area contains the crosser's cell;
2. for every activated defender, inspect every one of that defender's
   defensive-area cells physically crossed by the selected route;
3. the defender is eligible if it has a clear centre-to-centre route to the
   ball in at least one such crossed cell;
4. an attacking body blocks that defender-to-ball route only when the segment
   enters that body's occupied cell; a lateral, adjacent, edge-only or
   corner-only touch does not block it;
5. direct contact with an opponent has priority and does not request a
   redundant interception roll;
6. eligible interceptors form the existing progressive global sequence,
   including the existing Natural-1 carry.

The **existing Interception resolver is reused without reversing its roller**:
the interceptor rolls D20 with the established Interception statistic and
modifiers. The fixed attacker target is the crosser's `Crossing` attribute,
replacing `Long Pass` as the Long Pass attacker target. Equality, Natural 1,
Natural 20, progressive ordering and carry use the already configured
Interception rules. A non-dominant-foot Cross supplies the approved `AV` to the
interceptor.

If Cross passes origin interception, the ball is aerial until destination.

## 5. Automatic outfield interception at destination

Before any goalkeeper reaction, an opposing outfield defender automatically
intercepts when:

- the target is directly in that defender's occupied cell; or
- the target is free and inside that defender's defensive area.

This has no roll. The chosen defender takes the ball, possession changes and a
new turn begins with the recovering team attacking.

When several defenders qualify, the defender whose centre is closest to the
target cell receives the ball. Equal centre-to-centre distance is decided by the
defending coach through canonical Engine state.

Therefore a free Cross target in the opponents' penalty area is legal only if
it belongs to no opposing outfield defensive area.

## 6. Resolution order

Resolve a Cross in this exact order:

1. validate target range, target area, angle and each physical local block;
2. resolve origin Interception;
3. resolve automatic outfield interception at destination;
4. resolve direct target on the opposing goalkeeper, if applicable;
5. offer the defending coach the goalkeeper Cross Claim reaction;
6. if the goalkeeper declines or misses, identify the attacking receiver
   directly or through 3/2, then resolve one Aerial Duel where required;
7. resolve Header and its final result.

## 7. Direct target on opposing goalkeeper

A Cross directed directly into the opposing goalkeeper's cell is retained
automatically.

- It creates no Cross Claim reaction and no roll.
- The goalkeeper remains in that cell and has the ball.
- Play continues under the goalkeeper restart rule in section 9.5.

## 8. Goalkeeper reaction

Cross Claim is offered only when Cross:

- was not locally blocked;
- was not intercepted at origin;
- was not automatically intercepted by an outfield defender;
- was not directed directly onto the opposing goalkeeper.

The defensive coach chooses canonically between **Claim Cross** and **Decline**.
It is a reaction and consumes no action. The pending decision belongs to the
defending team, not to a local UI identity.

The projected prompt shows the crosser's Crossing value, goalkeeper Cross
Claiming value, active AV/AVM/DV/DVM, non-dominant-foot effect and destination
zone. A decline continues to direct reception/3/2/Aerial Duel.

## 9. Cross Claim roll and outcome

The goalkeeper rolls D20, adds Cross Claiming and every relevant AV/AVM/DV/DVM,
then compares the total with the crosser's fixed Crossing attribute.

- greater total: catch;
- lower total: miss;
- equal total: frozen Rule Set outcome — catch, miss or corner.

If equality is configured as corner, the Cross ends immediately and the
attacking team receives a corner. It is neither a catch nor a goalkeeper miss.

Natural 1 always misses. The attacking team receives the frozen next-roll
effect: `AV`, `AVM` or no bonus.

Natural 20 always catches. The goalkeeper's team receives the frozen outcome:
Bonus Action, no bonus, `AV` or `AVM`. AV/AVM take effect after possession has
changed, when that team is attacking.

## 10. Z0, Z1 and goalkeeper positional modifier

Exactly one neutral zone is active: `Z0` or `Z1`; both cannot be active.

For the right-hand goal on the current board:

- **Z0** is a 2-by-5 strip between the 11-metre line and the small-box line,
  across goal width: `M40`–`Q40` and `M41`–`Q41`.
- **Z1** is a 2-by-9 strip over the same depth, across the full small-box
  width: `K40`–`S40` and `K41`–`S41`.

The zones mirror at the left-hand goal.

For Cross Claim:

- small box: goalkeeper receives the configured `AV` or `AVM`;
- active Z0/Z1: no positional modifier;
- every other large-box cell: goalkeeper receives the configured `DV` or
  `DVM`.

## 11. Catch and goalkeeper restart

On a successful Cross Claim, the defending coach positions the goalkeeper in a
free cell adjacent to the attacking player who would have reached the Cross.
Among eligible cells, choose one closest to the goalkeeper's goal line. The
goalkeeper has the ball.

The direct-goalkeeper target is the exception: it stays in the goalkeeper's
existing cell under section 7.

The goalkeeper may restart through Short Pass, Long Pass, Through Ball or
Lofted Through Ball. Within either penalty area, that restart ignores opposing
bodies and defensive areas. Outside the large penalty area, all ordinary rules
of the chosen action apply.

## 12. Miss, receiver and goalkeeper inactivity

On a missed Cross Claim, first identify the attacking player who reaches Cross:
the direct receiver or the player that reaches the ball through the established
3/2 rule.

Place the goalkeeper automatically in the first free adjacent cell closest to
the goal line. If all adjacent cells are occupied, choose by elimination the
free cell closest to the goal line and as adjacent as possible to that attacker.
The goalkeeper becomes inactive until the entire Cross finishes.

While inactive, the goalkeeper cannot act, react, possess or receive the ball;
its body and defensive area are ignored. Its cell remains unavailable as the
final destination of a player movement or ball placement.

## 13. Receiver and Aerial Duel

If the goalkeeper declines or misses, the designated attacking player receives
the ball directly or reaches it through 3/2. Then evaluate that attacker's cell.

- Outside every opposing defensive area: proceed directly to Header.
- Inside one opposing defensive area: that defender enters Aerial Duel.
- Inside several opposing defensive areas: the defending coach chooses exactly
  one defender.

There can be only one Aerial Duel per Cross.

The attacker rolls D20 plus Heading and all relevant AV/AVM/DV/DVM against the
chosen defender's fixed Aerial attribute.

- greater total: attacker wins and proceeds to Header;
- lower total: defender wins;
- equal total: frozen Rule Set outcome — attacker wins, attacker loses or
  corner.

If equality is configured as corner, Cross ends immediately and the attacking
team receives a corner. No defender free pass occurs.

Natural 1 always loses. The defending team receives its frozen outcome: Bonus
Action, no bonus, AV or AVM; AV/AVM apply after possession changes.

Natural 20 always wins. The attacking team receives its frozen outcome: AV,
AVM or no bonus.

On defender win, that defender passes automatically and freely to the closest
teammate. Distance is centre-to-centre; equal distance is chosen by the
defending coach. The route ignores opposing bodies and defensive areas.
Possession changes and a new turn begins with the recovering team attacking.

## 14. Header and Cross finalisation

Header occurs after an Aerial Duel win, or directly when the attacking receiver
stands in no opposing defensive area. The attacker rolls D20 plus Heading, all
relevant AV/AVM/DV/DVM and the positional modifier below.

- small box: configured `AV` or `AVM`;
- active Z0/Z1: no positional modifier;
- every other large-box cell: configured `DV` or `DVM`.

If the goalkeeper declined Cross Claim, compare the total with the goalkeeper's
fixed Reflexes. If the goalkeeper missed, compare it with the frozen empty-goal
threshold, initially `8`.

Header has no special Natural-1 or Natural-20 effect.

- greater total: goal;
- lower total: goal kick;
- equal total: frozen Rule Set outcome — goal or corner.

An ordinary failed Header is always a goal kick. Only the configured equality
outcome can produce a corner.
