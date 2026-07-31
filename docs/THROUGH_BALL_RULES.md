# Through Ball Rules

## Status and authority

This is the player-rule contract for the implemented offline Single Player
Through Ball. It is an extraction of accepted Engine behavior in v20.56.23 and
does not alter that behavior. The authoritative implementation is
`src/engine/throughBallRules.mjs`; common execution geometry comes from the
Pass engine.

## 1. Action and target

- Only the active player in possession may make a Through Ball.
- It consumes one normal Tracker action and one personal action on route
  confirmation. It may also be used as the implemented card action of a Bonus
  Action, where it uses that continuation's existing economy.
- The target is a free board cell, not a player. The frozen maximum distance
  defaults to 16 cells, measured centre-to-centre.
- The player chooses a physical origin corner. The route is illegal when that
  origin is body-blocked, the target is occupied, an active opposing defensive
  area contains the passer or target, an opposing defensive-area cell is
  crossed by the physical route, an active body is crossed, or the range is
  exceeded.
- A cancelled target or route consumes no action.

## 2. Ball arrival and recovery race

Once confirmed, the ball is placed in the free target cell. The passer is not
eligible to recover it.

For each team, compare the nearest eligible player to the target by
centre-to-centre distance. If players are tied at the nearest distance, retain
only the fastest tied player(s).

- The defending team wins if its best distance is shorter, or if the best
  distances are equal and its best Speed is equal to or greater than the
  attackers' best Speed.
- If several equally eligible defenders remain, the defending coach chooses
  the recovering defender.
- If the attacking team wins, the ball stays free in the target cell and the
  attacking team receives the established one-use 3/2 opportunity.
- If the defending team wins, the chosen defender takes the ball and a new
  numbered turn begins with that team attacking.

The 3/2 opportunity belongs only to another teammate of the passer, in the
same turn, for the stated target and only once. It clears when used or when the
relevant phase ends. Its normal path, range and continuation restrictions still
apply.

## 3. No roll

Through Ball has no D20 roll. Its uncertainty is the legal route and the
deterministic recovery race. It has no Interception roll.

## 4. Canonical presentation boundary

Target selection, route selection, equal-defender choice and recovery
confirmation are canonical Match decisions. Timeline, Undo/Redo, Replay and
AI Export retain the selected route, race facts and recovery outcome. Manual
Multiplayer remains unchanged.
