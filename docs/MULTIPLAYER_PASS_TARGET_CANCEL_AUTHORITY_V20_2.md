# Multiplayer Pass Target/Cancel Authority — v20.2

## Scope

v20.2 closes the remaining optimistic-write gap in the multiplayer pass preview lifecycle.

## Problem reproduced

A guest could successfully start a pass, then receive a Timeline conflict while cancelling it:

```text
PASS_CANCELLED
Timeline changed on another client
TIMELINE_OPTIMISTIC_ROLLBACK
```

The canonical Timeline rolled back, but the guest could remain in a local targeting state with a target cursor and illegal interactions.

## Authority model

The guest no longer commits `PASS_CANCELLED` directly.

```text
Guest presses Cancel
→ writes passCancelIntent
→ host validates the canonical pass/action ID and team
→ host commits PASS_CANCELLED
→ both clients hydrate the canonical Timeline
```

`PASS_TARGET_SELECTED` remains host-authoritative from v20.1.

## Rejection recovery

A rejected target or cancel intent now forces the requesting guest back to the current canonical Timeline state and clears local selection/hover state.

## Perceived latency

Host-authoritative commands include explicit transient feedback:

- `Sending pass target…`
- `Cancelling pass…`

This distinguishes network confirmation latency from an application freeze and prevents repeated requests while one intent is pending.

## Interception prompt

The pre-roll Interception prompt now shows the offensive target and statistic, for example:

```text
Target 13 — Passing
```

The label is derived from the frozen `attackerTargetStatId` in the pass plan and the global Back Stats schema.
