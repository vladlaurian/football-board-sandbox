# Multiplayer Bonus Action Authority — v20.3

## Problem

During a multiplayer Bonus Action, both clients could locally select and control the team that owned the continuation. Both clients could also press `END B.A.`. A guest therefore published `BONUS_ACTION_ENDED` directly from a stale Timeline revision and repeatedly received `timeline-conflict`.

## Rules preserved

The gameplay chain is unchanged:

- a Natural 20 interception grants one Bonus Action;
- another Natural 20 may transfer the Bonus Action to the other team;
- the numbered turn does not advance while the Bonus Action chain continues;
- the turn advances only after the final Bonus Action is ended.

## Ownership guard

In multiplayer, a Bonus Action is interactive only on the client whose assigned team matches `actionContinuation.team`.

The opposing client may observe the continuation but cannot:

- select its players;
- move its players;
- start a bonus card action;
- press `END B.A.`;
- call the end function through another UI path.

Single-player behavior is unchanged.

## Host-authoritative END B.A.

A guest no longer commits `BONUS_ACTION_ENDED` or `BONUS_ACTION_DECLINED` directly.

Flow:

1. The owning guest sends `bonusActionEndIntent` containing the continuation ID, team, user, client, and local base revision.
2. The host validates the canonical continuation and the team owner.
3. Only the host records the Timeline transition.
4. The request is acknowledged as accepted or rejected.
5. A rejected request restores canonical Timeline state and clears local selection.

## Validation

The host accepts the request only when:

- the continuation still exists;
- its ID and team match the request;
- its status is `ready` or `awaiting-end-bonus-action`;
- no action resolution is active;
- the requesting user is the recorded owner of that team.

## UX

While waiting for the host, the owner sees:

`Ending Bonus Action… Waiting for host confirmation.`

Repeated clicks are blocked until acknowledgement.

## Tests

Pure tests cover:

- owner-only multiplayer control;
- opponent and spectator rejection;
- canonical continuation matching;
- team-owner validation;
- rejection during an active action or resolution.
