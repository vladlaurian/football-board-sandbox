# v20 — Separate Interception Engine

## Purpose

v20 separates **who may attempt an interception** from **how an interception roll is resolved**.

- Pass geometry determines the route, defensive-area crossings, body-blocking, eligible defenders, and their order.
- The Interception engine resolves one eligible defender's manual D20 against an attacker target value.

This is an infrastructure build. It does not yet implement the new Long Pass endpoint-only geometry.

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
- **Use standard modifiers** — controls the current preferred-foot modifier and the carried Natural 1 penalty.
- **Use progressive interceptor bonus** — controls the ordered `+0, +1, +2...` bonus.
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

## Deferred work

Not implemented in v20:

- Normal Pass / Long Pass profiles.
- Long Pass target statistic selection.
- Long Pass endpoint-only interception geometry.
- Separate origin and destination interception groups.
- Progressive-bonus reset between Long Pass endpoint groups.

## Multiplayer authority boundary

The Interception result is resolved only by the session host. When a player rolls, the shared Timeline carries the manual dice event and identity data. The host then reads the canonical pending pass action and the Interception configuration frozen into its pass plan, recomputes the result, and commits the outcome.

This prevents host/guest Rule Set drift and avoids treating a client-generated resolution object as authoritative.

## Rule Sets modal usability

The Rule Sets editor is constrained to the viewport and scrolls internally. Its title and action controls remain sticky so Save is always reachable on smaller displays.
