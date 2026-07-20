# Multiplayer Authority Gateway — v20.4

## Purpose

v20.4 replaces the remaining guest-side direct Timeline write path with a generic host-authoritative gameplay command gateway. The goal is to prevent the same `timeline-conflict -> incomplete rollback -> ghost UI` failure from reappearing in future actions such as Shot, Dribble, Cross, movement, or new resolution buttons.

## Canonical flow

1. A guest performs a gameplay command.
2. `recordTimelineTransition()` intercepts the transition before a local Timeline commit.
3. The guest writes a single `gameplayIntent` runtime request containing the transition, requesting team, and base revision.
4. All further piece interaction is locked while the request is pending.
5. The host validates canonical revision, team ownership, and command structure.
6. Only the host commits the Timeline entry.
7. The guest receives the canonical Timeline snapshot and resets transient local UI.

Existing dedicated authority flows for Pass Target, Pass Cancel, and End Bonus Action remain in place.

## Global transient reset

`resetTransientGameplayUI(reason)` clears selection, hover, pending turn dialogs, pending movement, dedicated pass intents, Bonus Action intent, generic gameplay intent, and delayed-resolution timers. It runs after conflict, rejection, acknowledgement, or failed intent transmission.

## Future actions

New gameplay actions should record their state through `recordTimelineTransition()`. They must not write directly to Firestore Timeline collections. This automatically places them behind the host authority gateway. Action-specific rule validation is still required, but the shared revision/authority failure class is covered by the gateway.

## Diagnostics

New trace events:

- `GAMEPLAY_INTENT_SENT`
- `GAMEPLAY_INTENT_HANDLED`
- `GAMEPLAY_INTENT_BLOCKED`
- `GAMEPLAY_INTENT_FAILED`
- `TRANSIENT_GAMEPLAY_UI_RESET`

## Version

- Sandbox: `v20.4`
- package/GitHub project version: `20.4.0`
