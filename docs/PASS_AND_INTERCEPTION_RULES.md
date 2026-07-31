# Pass and Interception Rules

## Status and authority

This is the player-rule contract for the implemented offline Single Player
`Short Pass`, `Long Pass` and `Interception` mechanics. It is extracted from
the accepted Engine behavior and tests in v20.56.23; it does not change a
rule. Geometry and planning remain owned by `src/rules/passEngine.mjs`, the
canonical action lifecycle by `src/engine/passStartRules.mjs`, and the generic
roll calculation by `src/rules/interceptionEngine.mjs`.

Manual Multiplayer retains its legacy path and is not described as a source of
rules here.

## 1. Shared Pass rules

- Only the active player currently sharing a cell with the ball may make a
  Pass.
- A normal Pass consumes one normal Tracker action and one personal action
  when its route is confirmed. Selecting a target, selecting an execution
  corner, choosing an equal interceptor or cancelling before confirmation does
  not consume an action.
- All regulatory distances use centre-to-centre measurement. The selected
  corner is only the physical execution point: it chooses the foot and may
  change route contact, crossed cells and available origins, but never the
  measured distance or the player's board position.
- The active Rule Set freezes the Short/Long threshold and maximum distance at
  Match start. Defaults are Long above 16 cells and a maximum Pass distance of
  32 cells.
- A non-dominant execution foot is determined from the selected origin and
  route. It does not make the Pass itself roll; it grants the approved
  Advantage to an eligible interceptor's roll.
- Any active player body adjacent to a selected corner can block that physical
  origin. A blocked origin cannot be confirmed. The ball itself does not block
  a route.

## 2. Short Pass

A Pass at or below the frozen Long-Pass threshold is a Short Pass.

- Its target must be an active outfield player. A goalkeeper is never a legal
  direct target.
- There must be at least one full board cell between passer and target. A
  target sharing a side or a corner with the passer is too close.
- It follows the ground route from the selected origin to the target centre.
  The first active player body touched by that physical route is the effective
  recipient. An opponent receives/intercepts directly; a teammate receives
  directly. A selected target is not treated as an intermediate contact.
- A goalkeeper physically touched by the route blocks confirmation rather than
  becoming a legal Pass recipient.
- Every active opposing defender whose defensive-area cell is physically
  crossed by the route may become an interceptor. For each crossed area cell,
  the defender needs a clear centre-to-centre route to that cell. An attacking
  body blocks that defender-to-ball route only when the segment enters the
  body's occupied cell; a merely adjacent or corner-touching body does not.

If no direct opponent contact or eligible interceptor remains, the ball is
moved to the effective target and the Pass is complete.

## 3. Long Pass

A Pass strictly above the frozen Long-Pass threshold is a Long Pass.

- Its direct target is still an active outfield player, subject to the same
  maximum-distance and goalkeeper restrictions.
- The middle of the route is aerial. Bodies and defensive areas crossed only
  in that aerial middle do not block it and do not create an interception.
- At the launch and landing reaction groups, a defender is activated only when
  its defensive area contains the passer's occupied cell (origin group) or the
  effective receiver's occupied cell (destination group).
- Once activated, each defensive-area cell physically crossed by the selected
  route is checked individually with the same visibility rule as a Short Pass.
  A defender with at least one clear crossed cell is eligible.
- Origin-group interceptors resolve before destination-group interceptors. The
  two groups are one progressive sequence: interceptor-order Advantage and a
  carried Natural-1 Disadvantage do not reset at the receiver.
- A body physically contacted in the permitted launch/landing route has
  priority. An opponent receives the ball directly; a teammate receives it
  directly. No redundant Interception roll follows that direct contact.

## 4. Interception order and coach choice

Eligible defenders are ordered by centre-to-centre distance from the relevant
passer/endpoint square to the defender's square. If defenders have equal
priority, the defending coach chooses which one rolls first. That choice is
made before any die is rolled.

Interceptors resolve in order. A failed roll advances to the next eligible
defender. When the list is exhausted, the Pass completes. A successful normal
interception moves the ball to that defender, changes possession and starts a
new numbered turn with the recovering team attacking.

## 5. Interception roll

The defender rolls a manual D20:

```text
D20 + Interception + applicable modifiers
vs the passer's fixed target value
```

- Short Pass uses the passer's `Passing` value.
- Long Pass uses the passer's `Long Pass` value.
- Standard modifiers are active in offline Single Player. They include the
  non-dominant-foot effect and every carried Natural-1 penalty.
- Each later interceptor receives the configured progressive Advantage.
- The final modifier is capped symmetrically by the frozen Rule Set cap.
- A normal total greater than the target intercepts. Equality follows the
  frozen setting: by default the Pass continues.

Natural results override the normal comparison:

- Natural 1 always lets the Pass continue. By default the next eligible
  interceptor receives the configured carried Disadvantage.
- Natural 20 always intercepts. Its frozen consequence is normally a Bonus
  Action for the recovering team; the configured alternative may instead be
  no extra effect, next-turn Advantage or next-turn Major Advantage.

The generic result-hold remains one second between revealing a gameplay roll
and its automatic canonical consequence.

## 6. Relationship to the rulebook

This document is the single gameplay-rule home for the implemented passing
family. `INTERCEPTION_ENGINE.md` remains the technical resolver document;
`RULE_SETS_EDITOR.md` owns editable values and defaults; and
`ACTION_RESOLUTION_ENGINE.md` owns command, roll and Timeline lifecycle.
