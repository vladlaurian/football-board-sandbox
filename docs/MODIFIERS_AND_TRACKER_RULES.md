# Modifiers and Tracker Rules

## Status and scope

This document is the agreed gameplay contract for team roll modifiers and their
Tracker representation. It is documentation only at this stage. The current
runtime has a narrower legacy implementation and must not be treated as having
implemented this full contract until an approved engine build does so.

## Two distinct limits

The game has two separate modifier limits:

- The **team modifier capacity** is the maximum number of active modifier
  tokens a team may hold. Its default is 3 and it is editable in Tracker
  Settings.
- The existing Rule Set `diceModifiers.stackCap` remains a separate numeric cap
  applied to a final roll modifier. It is not the Tracker token capacity.

The selected team modifier capacity is frozen in `MatchContext` when the Match
starts. It is not changed by later Tracker Settings or Rule Set edits.

## Modifier types and values

The possible modifier tokens are:

- AV (Advantage);
- AVM (Major Advantage);
- DV (Disadvantage);
- DVM (Major Disadvantage).

Their numeric values are taken from the active Rule Set `diceModifiers` and
are frozen in `MatchContext` at Match start. The current default values are
AV +1, AVM +3, DV -1 and DVM -3.

## Receiving a modifier

When a mechanic grants a modifier to a team, resolve it in this exact order:

1. If the team already holds the exact opposite modifier at the same tier, one
   pair cancels and the incoming modifier is not added:
   - AV cancels one DV;
   - AVM cancels one DVM.
2. Otherwise, if the team modifier bar is already at capacity, the incoming
   modifier is not received.
3. Otherwise, the incoming modifier occupies one available Tracker slot.

No other token cancellation exists. In particular, AV does not cancel DVM and
AVM does not cancel DV. Different token types may still offset each other
numerically when an applicable roll is calculated. That arithmetic is not a
token cancellation and does not remove either token from the Tracker bar.

## Ownership, application and expiry

There is no universal rule such as “the next roll consumes a modifier.” Every
mechanic that grants one must define all of the following:

- recipient team;
- exact token type;
- eligible roll or class of rolls;
- whether application is automatic or chosen by that team’s coach;
- exact expiry condition.

This keeps modifiers football-specific. For example, a Cross Claim Natural 1
may grant the attacking team AV specifically for the resulting header
finalisation roll; it must not silently become AV for an unrelated interception
on a later turn.

If a mechanic does not explicitly give an expiry condition, its modifier
expires at the start of the next numbered turn. A mechanic may explicitly
carry a modifier into a later turn, but its state must always record that
condition so no modifier can remain active indefinitely by accident.

## Turn and restart lifecycle

An action-economy reset resets only team and personal actions. It does not
clear active modifier tokens. In particular, the reset associated with a
Corner restart does not clear modifiers.

All active modifier tokens are cleared on Match lifecycle resets, including:

- Match start;
- Match restart;
- leaving Match Mode for Editor Mode.

Normal turn progression clears each modifier only according to its own expiry
condition.

## Canonical state and Tracker projection

The Engine/MatchState is the authority for each active modifier token. A token
must carry enough canonical information to determine its type, owning team,
granting mechanic, eligible roll scope and expiry condition.

The Tracker displays that canonical state. It does not independently calculate
or retain modifiers. Timeline, Undo/Redo, Replay and AI Export therefore use
the same state and preserve the same expiry behaviour.

For future manual or automated multiplayer, modifier ownership belongs to a
team in canonical MatchState, never to a local UI instance.

## Current implementation note

The current v20.56.3 runtime exposes only legacy positive roll opportunities
(AV/AVM) and does not yet implement this complete token-capacity,
cancellation, DV/DVM, lifecycle or Tracker model. A future approved engine
build must migrate it without introducing UI-local gameplay authority.
