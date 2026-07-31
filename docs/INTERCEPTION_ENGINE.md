# v20 — Separate Interception Engine

The player-facing Short Pass, Long Pass and Interception contract is
[`PASS_AND_INTERCEPTION_RULES.md`](PASS_AND_INTERCEPTION_RULES.md). This file
owns only the resolver, frozen settings and technical integration boundary.

## Purpose

v20 separates **who may attempt an interception** from **how an interception roll is resolved**.

- Pass geometry determines the route, defensive-area crossings, body-blocking, eligible defenders, and their order.
- The Interception engine resolves one eligible defender's manual D20 against an attacker target value.

Long Pass is now a client of this generic resolver. It supplies its own attacker statistic and its approved aerial reaction-zone eligibility; it does not create a second roll engine.

## Authoritative resolver

The generic resolver lives in:

```text
src/rules/interceptionEngine.mjs
```

Its primary API is:

```js
resolveInterception({
  natural,
  defenderStatValue,
  attackerTargetValue,
  progressiveBonus,
  standardModifier,
  previousNaturalOnePenalty,
  modifierCap,
  equalRollOutcome,
})
```

The resolver does not know whether the triggering action is a Normal Pass, Long Pass, or a future action. It receives already-resolved numeric values and rule settings.

## Formula

For non-natural rolls:

```text
D20
+ defender statistic
+ progressive interceptor bonus, when enabled
+ standard modifiers, when enabled
+ previous Natural 1 penalty, when enabled
vs
attacker target value
```

The combined modifier is clamped symmetrically to `-cap ... +cap` after all enabled sources are summed.

Natural results remain invariants:

- Natural 1: pass continues.
- Natural 20: interception succeeds and the existing Natural 20 continuation applies.

Dice remain manual.

## Rule Set ownership

Rule Set schema version 3 separates the two actions:

```js
actions: {
  pass: {
    pathMode,
    longPassThreshold,
    longPassAttackerStatId,
    resolutionDelayMs,
  },
  interception: {
    defenderRollStatId,
    useStandardModifiers,
    useProgressiveBonus,
    modifierCap,
    equalRollOutcome,
  },
}
```

Pass owns geometry and pass classification. Interception owns roll resolution.

## In-game editor

The dedicated **Interception** section is available under:

```text
Rules → Rule Sets
```

It contains:

- **Defender roll statistic** — populated from the global back-card stat schema; default `stat:interception`.
- **Standard modifiers** are permanently active in offline Single Player: the preferred-foot transfer and carried Natural 1 penalty always apply where eligible.
- **Progressive interceptor bonus** is permanently active in offline Single Player: eligible rolls receive ordered `+0, +1, +2...` stacks up to the global cap.
- **Maximum total modifier** — symmetric cap displayed as `±X`.
- **Equal total outcome** — either Pass continues or Interception succeeds.

Rule Sets remain editable only in Editor Mode and are locked into Match state when Match Mode begins.

## Migration from v19.x

Old Rule Sets stored `modifierCap` and `equalRollOutcome` under `actions.pass`.

Normalization migrates them to `actions.interception` automatically. Defaults preserve the previous gameplay:

```text
Defender stat: Interception
Standard modifiers: On
Progressive bonus: On
Maximum total modifier: existing value, default ±4
Equal total: Pass continues
```

The old fields are accepted only as migration input and are not written into normalized v20 Rule Sets.

## Global-stat integration

`defenderRollStatId` stores a stable global stat ID, not a display label. Renaming the visible statistic therefore does not break the rule.

The card's `Show` state remains presentation-only and never suppresses its gameplay value.

## Timeline, multiplayer, and AI export

The existing action-resolution, Timeline, delayed-resolution, replay, and host-authoritative multiplayer flow remains unchanged.

The exact interception resolution continues to be stored with its numeric values, modifier sources, cap, and outcome. AI Analysis Rule Set snapshots now expose `actions.interception` separately from `actions.pass`. The AI Analysis export schema is version 9 and also includes the stable attacker/defender stat IDs and resolved numeric values for interception rolls.

## Compatibility

`resolveInterceptionRoll(...)` remains as a temporary compatibility wrapper in the new Interception module for legacy tests/imports. New runtime code calls `resolveInterception(...)` with generic parameter names.

## Long Pass eligibility contract

Long Pass remains one `PASS` action and one Pass plan. It is aerial through its middle: defensive areas and bodies crossed only in that middle aerial section do not create an interception.

At each permitted reaction group (origin first, then destination), eligibility follows the **same per-crossed-cell rule as Short Pass**:

1. activate an origin defender only when its defensive area contains the passer's occupied cell; activate a destination defender only when its defensive area contains the receiver's occupied cell;
2. for every activated defender, find every one of its defensive-area cells actually crossed by the physical selected-corner-to-target route;
3. test every crossed cell separately: the defender must have a clear geometric path to the ball at that concrete crossed cell;
4. an opposing body blocks only if the defender-to-ball segment actually crosses that body's occupied square; adjacent or lateral bodies do not block it. A blocked cell does not remove another clear crossed cell for that defender;
5. every defender with at least one clear crossed cell is eligible to roll, ordered by the established endpoint priority; equal defenders use the defending-coach choice.

The route's selected corner changes the physical route and therefore may change which defensive-area cell is crossed. It never changes distance measurement or the passer's body position. The selected target is a destination, not an obstruction: its ordinary receipt must not erase a separately eligible defender reaction. Conversely, a body that the route actually contacts before the requested target remains a direct reception/interception and takes precedence over a redundant roll.

The endpoint body-contact rule remains separate from interception eligibility. The eligibility boundary is not a fixed cell neighbourhood: the passer/receiver occupied cell activates the respective defender only when it belongs to that defender's defensive area, and only that defender's physically crossed defensive-area cells are then evaluated. All other defensive-area crossings are aerial middle and cannot create an interceptor. This is an Engine fact, tested independently, and never guessed by UI geometry.

Origin and destination remain one Long Pass contest: destination starts after every origin roll, so progressive stacks and carried Natural-1 disadvantage continue without reset, up to the shared global cap. The frozen plan stores the stable Long Pass attacker stat ID/value, crossed reaction cells, defender eligibility, modifiers, rolls and results, so Timeline, Undo/Redo, Replay and AI never reconstruct them from UI.

## Multiplayer authority boundary

The Interception result is resolved only by the session host. When a player rolls, the shared Timeline carries the manual dice event and identity data. The host then reads the canonical pending pass action and the Interception configuration frozen into its pass plan, recomputes the result, and commits the outcome.

This prevents host/guest Rule Set drift and avoids treating a client-generated resolution object as authoritative.

## Rule Sets modal usability

The Rule Sets editor is constrained to the viewport and scrolls internally. Its title and action controls remain sticky so Save is always reachable on smaller displays.
