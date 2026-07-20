# Multiplayer Action Start Authority — v20.7

## Scope

v20.7 closes the remaining optimistic guest writes at the beginning of repeated Bonus Action chains.

The affected transitions were:

- `BONUS_CARD_ACTION_STARTED`
- `PASS_TARGETING_STARTED`

In v20.6 a guest could still write these transitions directly to Timeline. Repeated Natural 20 → Bonus Action → Pass sequences could therefore race against host commits and leave the guest in stale targeting UI.

## New semantic intent

Guests now write one runtime request:

```text
actionStartIntent
```

The request contains:

- mode: `normal-pass` or `bonus-action`
- action type
- piece ID
- team
- continuation ID when applicable
- canonical base revision
- requesting UID and client ID

The guest does not create a local optimistic Timeline transition.

## Host validation

The host accepts an action start only when:

- the requesting UID owns the piece team;
- the requested piece exists;
- the base revision equals the canonical Timeline revision;
- no incompatible resolution is active;
- a normal Pass has the ball;
- a Bonus Action continuation is canonical, ready, owned by that team, and matches the requested continuation ID.

Rejected requests restore the guest from the canonical Timeline state and clear transient UI.

## Atomic Bonus Pass start

For a Bonus Action Pass, the host now commits one transition:

```text
BONUS_PASS_TARGETING_STARTED
```

That single transition contains both:

- the continuation changing from `ready` to `action-active`;
- the new Pass resolution entering `targeting`.

There is no intermediate canonical state where the Bonus Action has started but Pass Targeting has not.

## Normal Pass start

A guest normal Pass sends `normal-pass`. The host creates `PASS_TARGETING_STARTED` and publishes the canonical resolution. Only the owner client receives interactive targeting controls; the opponent sees the shared state passively.

## Additional correction

Two pass-resolution branches referenced `before.tracker` without defining `before`. They now derive the turn preview from a canonical snapshot or delegate turn advancement to the canonical possession-resolution function.

## Regression coverage

The v20.7 tests verify:

- guest action starts use semantic intents;
- the host executes the actual start;
- Bonus Pass start and targeting are atomic;
- stale base revisions are rejected;
- repeated Bonus Action chains cannot create direct guest Timeline commits at their start boundary.
