# Multiplayer Resolution UI Authority — v20.5

## Purpose

v20.5 separates shared canonical resolution state from local interaction authority.
Both clients may observe that an action is in progress, but only the client that owns the action team may operate its controls.

## Core rule

For an active resolution:

```text
visible = resolution exists
interactive = offline OR resolution.team === myTeam
```

The reusable authority check is implemented in:

```text
src/multiplayer/resolutionAuthority.mjs
```

## Pass protections

The owner-only rule now protects:

- target selection by clicking a piece;
- target selection by clicking an empty board cell;
- touch target selection;
- route-corner selection;
- Pass Cancel;
- the internal `choosePassTarget()` handler;
- the internal `confirmPassRoute()` handler.

The opponent may observe the shared pass preview, but route buttons are disabled and targeting feedback is not interactive.

## Why v20.4 was rejected

v20.4 forwarded broad before/after snapshots through a generic authority gateway. This made the host apply the guest's targeting state as if it were locally controllable.

v20.5 returns to v20.3 and keeps the correct dedicated intents while enforcing local UI ownership. Future semantic command work must send typed commands, not complete client-generated game snapshots.

## Future action requirement

Shot, Dribble, Cross and future resolutions must use the same split:

1. canonical state is shared;
2. interactive controls require ownership of `resolution.team`;
3. handlers repeat the ownership check defensively;
4. committed gameplay changes are validated by the authoritative host flow.

## Version

- Sandbox: `v20.5`
- package: `20.5.0`
