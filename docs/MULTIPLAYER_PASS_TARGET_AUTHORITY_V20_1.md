# Multiplayer Pass Target Authority — v20.1

## Problem

In multiplayer, both clients could commit gameplay Timeline entries. A guest selecting a pass destination could optimistically create `PASS_TARGET_SELECTED` from revision N while another canonical entry advanced the shared Timeline. Firestore then rejected the entry with `timeline-conflict`. The Timeline rolled back, but local targeting state was preserved, leaving a ghost target cursor and allowing interactions against stale team/possession state.

## Architecture

`PASS_TARGET_SELECTED` is host-authoritative.

1. Guest selects a destination.
2. Guest writes a transient `passTargetIntent` runtime document containing request ID, action ID, team, destination, and base revision.
3. Host validates the request against the canonical cursor state: current action must still be the same pass, in `targeting` status, for the same team.
4. Host alone commits `PASS_TARGET_SELECTED` to the Timeline.
5. Guest receives the canonical Timeline state through the existing hydration listener.
6. Stale or invalid intents are rejected and never mutate gameplay.

Runtime intent documents are transport only. They are not Timeline gameplay state and are not exported to replay or AI analysis.

## Rollback hygiene

Any failed optimistic Timeline commit now restores canonical state with `preserveLocalSelection: false` and clears:

- selected piece;
- hovered cell;
- pending pass-target intent;
- delayed-resolution timer/UI.

This prevents the cursor from remaining in pass-target mode after a rejected revision.

## Manual regression scenario

1. Create a fresh host/guest Match session.
2. Let the guest-controlled team start a pass.
3. Guest selects the destination rapidly while other session updates are arriving.
4. Confirm only the host console logs the canonical `PASS_TARGET_SELECTED` Timeline commit.
5. Confirm both clients enter route/interception resolution.
6. Repeat at least ten passes, including possession changes and Bonus Actions.
7. Confirm there is no `Timeline changed on another client` for `PASS_TARGET_SELECTED`.
8. Confirm the guest never remains with the target cursor after a rejected/stale request.
9. Confirm opponent pieces cannot be operated through stale targeting state.

Undo in multiplayer remains outside the scope of this patch.
