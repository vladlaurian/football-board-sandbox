# Lofted Through Ball Rules

## Status and authority

This is the player-rule contract for the implemented offline Single Player
Lofted Through Ball. It is extracted from the accepted Engine behavior and
tests in v20.56.23; it does not add a rule. The authoritative implementation
is `src/engine/loftedThroughBallRules.mjs`.

## 1. Action and legal target

- Only the active player in possession may use Lofted Through Ball.
- It consumes one normal Tracker action and one personal action when committed,
  or it may be the implemented card action of a Bonus Action.
- It targets a free board cell. The default maximum range is 32 cells,
  centre-to-centre. The default physical route is corner-to-centre, although a
  Rule Set may use centre-to-centre.
- The selected origin cannot be body-blocked. The target cannot contain an
  active player. The passer and target cannot stand in an active opposing
  defensive area. The route may cross defensive areas; each crossed opposing
  defensive area imposes one configured Disadvantage stack on the roll.
- The selected physical foot also applies its configured Disadvantage when it
  is non-dominant. The final modifier is subject to the frozen global cap.

## 2. Roll

The passer rolls a manual D20:

```text
D20 + Lofted Through statistic + applicable modifiers
vs the frozen Lofted Through difficulty
```

The default difficulty is 16. A total strictly above it succeeds. Equality
fails by default, but the frozen Rule Set may define equality as success.

- Natural 20 always succeeds.
- Natural 1 always fails.
- An available earned Advantage or Major Advantage may be applied to this roll
  through the existing canonical one-roll opportunity system.

The configured Natural-1 and Natural-20 consequences are frozen at Match
start. Defaults are a Bonus Action for the recovering team after a Natural 1,
and a Bonus Action for the passer's team after a Natural 20.

## 3. Successful Lofted Through

On success, the ball is placed in the target cell and the normal recovery race
is evaluated. The passer cannot recover the ball.

Nearest players are compared centre-to-centre; tied nearest players are
compared by Speed. The defending team wins a tie on distance and Speed. Equal
eligible defenders are chosen by the defending coach.

- If the attacking team wins the race, the ball remains free at the target and
  the attacking team receives the one-use established 3/2 opportunity.
- If the defending team wins, it receives the selected recovering player and
  the recovery proceeds canonically.

## 4. Failed Lofted Through

On failure, the ball does not first move to the target. The defending team
recovers with the defender closest to the physical trajectory itself; equal
closest defenders are separated by Speed, then by defending-coach choice.
That defender takes possession and the next canonical recovery/turn outcome
follows.

## 5. Natural outcomes and recovery

Natural effects are applied after the recovery result required by the action.
The default Natural 1 gives the recovering team its Bonus Action. The default
Natural 20 gives the passing team its Bonus Action; an already active parent
Bonus Action is replaced while retaining its required resume policy. A Rule
Set may instead select no Natural effect or the allowed current-turn roll
Advantage/Major Advantage outcome for Natural 20.

All targeting, rolling, recovery choice, result and continuation facts are
canonical MatchState facts and are retained by Timeline, Undo/Redo, Replay and
AI Export. Manual Multiplayer remains unchanged.
