## v20.11.4 — Guest interaction reconciliation and cancellable MOVE

**Sandbox:** `v20.11.4`  
**Git/package:** `20.11.4`

- Preserves the working v20.11.3 normal MOVE Host Authority lifecycle.
- Uses the canonical active interaction piece for movement preview/cursor when Guest local selection is cleared.
- Keeps the active MOVE/PASS card visible in Inspector for the controlling Guest.
- Adds canonical `CANCEL MOVE` before the first physical movement step.
- Cancelling MOVE removes its last Tracker activation, refunds the action, clears MOVE authorization, and closes `activeMovement`.
- After any physical MOVE step, `activeMovement` is closed and cancellation is no longer available.

## v20.11.3 — Normal MOVE vertical Host Authority migration

**Sandbox:** `v20.11.3`  
**Git/package:** `20.11.3`

- Rebuilt from the known v20.10.2 baseline; invalid v20.11.0–v20.11.2 builds are not used as a code base.
- Migrates only normal `MOVE` through a complete two-phase Host Authority lifecycle.
- `START_MOVE` is sent as `actionStartIntent` with mode `normal-move`; only Host activates Tracker economy.
- Tracker canonical state now records `activeMovement` with piece, team, kind and Timeline group.
- Interaction Layer reconstructs the active MOVE piece independently of local Inspector selection.
- Guest destination clicks are sent through `normalMoveCommitIntent`; only Host evaluates and commits the physical move.
- The canonical active movement closes after the Host commits the destination.
- `GROUP_MOVE`, Bonus Move, Free Move, Auto Move and 3/2 are intentionally unchanged in this build.

## v20.10.2 — Interaction Layer engine-boundary correction

**Sandbox:** `v20.10.2`  
**Git/package:** `20.10.2`  
**Base:** `v20.10.1`

- Preserved the canonical derived Interaction Layer introduced in v20.10.
- Removed the incorrect `effectiveSelectedId` bridge that fed canonical active-piece presentation into generic pointer, touch, hover, movement, Pass, and Interception input.
- Added a separate `activeInteractionPieceId` presentation prop for board highlighting.
- Restored `CANCEL PASS` to the Pass button position on the canonical passer card while keeping cancellation bound to `actionResolution`.
- Restored `END B.A.` to the Inspector card controls while keeping completion bound to `actionContinuation`.
- Kept the general resolution engine, Pass Engine, Interception Engine, Host Authority, Timeline, intents, and game design unchanged.
- Added a regression invariant that an active canonical piece never replaces local selection.

## v20.9 — Host-authoritative guest safety tools

**Sandbox:** `v20.9`  
**Git/package:** `20.9.0`

- Migrated guest Free Move start, movement, and end to host-authoritative intents.
- Migrated guest Free Ball placement to a host-authoritative one-shot intent.
- Prevented normal ball selection and movement in Match Mode unless Free Ball is active.
- Preserved unrestricted ball editing in Editor Mode.
- Kept the Free Move piece selected until Free Move is explicitly ended.

## v20.8 — Local inspection, persistent prompts, and progressive Bonus Move

**Sandbox:** `v20.8`  
**Git/package:** `20.8.0`  

- Pass cursor feedback is local to the player controlling Pass.
- Opponent Pass and Bonus Action no longer block player selection or card inspection.
- Informational action prompts are draggable and remember their individual browser positions.
- Bonus Move remains active after partial movement; the player stays selected and `END B.A.` remains available.
- Free Move and Free Ball ignore turn/continuation locks while remaining limited to the local player's team in multiplayer.
- Added the canonical documentation rule to the development workflow.

# Multiplayer Changelog — frozen legacy history

This file preserves the multiplayer implementation history. It is not an active implementation plan: automated Multiplayer is frozen while the Single Player Game Engine migration is open. The retained legacy model is documented in [`MULTIPLAYER_ARCHITECTURE.md`](MULTIPLAYER_ARCHITECTURE.md).

## v20.7 — Host-authoritative action starts and atomic Bonus Pass

**Sandbox:** `v20.7`  
**Git/package:** `20.7.0`  
**Base:** `v20.6`

Problem: v20.6 made dice host-authoritative but guests could still commit `BONUS_CARD_ACTION_STARTED` and `PASS_TARGETING_STARTED`. Repeated Natural 20 → Bonus Action → Pass chains could race with host writes and leave stale targeting.

Changes:

- introduced semantic `actionStartIntent` for normal Pass and Bonus Action starts;
- host validates owner, piece, action, continuation, canonical revision, active resolution and possession;
- Bonus Pass starts atomically through `BONUS_PASS_TARGETING_STARTED`;
- stale requests restore canonical state and clear pending UI;
- corrected interception branches that referenced undefined `before.tracker`;
- added tests preventing direct guest action-start commits and covering repeated Bonus Action chains.

## v20.6 — Canonical dice, turn progression and Bonus Move atomicity

**Sandbox:** `v20.6`  
**Git/package:** `20.6.0`

Problem evidence included guest `DICE_ROLLED`, `timeline-conflict`, optimistic rollback, `RESOLUTION_ABORTED: not host`, repeated target intents at one revision, Turn 2 regression and incomplete Bonus Move continuation.

Changes:

- guest dice became `diceRollIntent`; host alone commits `DICE_ROLLED`;
- turn progression reads canonical `before.tracker`, preventing stale Turn 1 → Turn 2 fallback;
- Bonus Move position and continuation completion are committed atomically;
- centralized transient cleanup is used by rollback, Undo and Redo;
- retained owner-only Pass interaction introduced in v20.5.

## v20.5 — Resolution visibility separated from UI authority

**Sandbox:** `v20.5`  
**Git/package:** `20.5.0`

Problem: a shared `pass targeting` resolution made target and route controls interactive on both browsers.

Changes:

- introduced reusable resolution ownership checks;
- separated visible canonical resolution state from owner-only interaction;
- protected target selection, route corners, touch, Cancel and internal handlers;
- rejected the v20.4 broad before/after snapshot gateway because it transferred guest UI state to the host;
- established the rule that future commands must be typed semantic requests, not client-generated snapshots.

## v20.4 — Rejected generic snapshot gateway

v20.4 attempted a global authority gateway by transmitting broad `before/after` states. The host adopted guest targeting state and could interact with the guest team's Pass. The build was abandoned. No v20.4 behavior is part of the current architecture.

Historical lesson: authority must control canonical commits without transferring local UI ownership.

## v20.3 — Bonus Action ownership and End authority

Changes:

- only the assigned team may select players, start Bonus Action or end it;
- opponent and spectator controls are rejected;
- guest `END B.A.` uses a host-authoritative intent;
- host validates continuation identity, canonical status and team ownership;
- repeated clicks are blocked while confirmation is pending.

## v20.2 — Pass Cancel authority

Problem: guest `PASS_CANCELLED` could conflict, rollback and leave a ghost target cursor.

Changes:

- Cancel became `passCancelIntent`;
- host validates action/team and commits `PASS_CANCELLED`;
- rejected target/cancel requests restore canonical state and clear local selection;
- added pending feedback and duplicate-request prevention;
- interception prompt displays the offensive target/statistic.

## v20.1 — Pass Target authority

Problem: guest target selection could optimistically create `PASS_TARGET_SELECTED` against a stale revision, causing Timeline conflict and stale targeting UI.

Changes:

- target selection became `passTargetIntent`;
- host validates action, team, destination and base revision;
- host alone commits `PASS_TARGET_SELECTED`;
- runtime intent documents remain transport-only;
- rollback clears selection, hover, target pending state and delayed-resolution UI.

## Earlier multiplayer reliability milestones

### v19.20 — Canonical-resolution diagnostics

Expanded tracer diagnostics for stale Timeline or missing canonical requests without changing gameplay rules.

### v19.19 — Canonical delayed-resolution state

Delayed host resolution stopped relying on stale render-local `gameMode` and derived context from the canonical Timeline cursor.

### v19.18 — Durable host authority during hydration

Long-lived listeners and delayed timers began reading current session authority from refs instead of stale React closures.

### v19.17 — Stale host-ownership closure diagnosis

Confirmed that listeners mounted before owner hydration retained `isSessionHost = false`, causing every later host resolution to abort as `not host`.

### v19.16 — Debug tracer and failed optimistic-commit recovery

- introduced centralized trace IDs and explicit guard reasons;
- treated runtime dice locks as advisory rather than gameplay authority;
- rolled back a failed optimistic revision only when it was still current;
- kept Timeline as the canonical multiplayer authority.

## Documentation policy

Do not create a new multiplayer document for each patch. For future releases:

1. update `MULTIPLAYER_ARCHITECTURE.md` when the current model changes;
2. append one release entry here;
3. update permanent cross-system consequences in `ARCHITECTURE_DECISIONS.md` when required;
4. keep README limited to orientation and the current release summary.

## v20.10 — Interaction Layer structural refactor

- Added a pure Interaction Layer projection for Pass, Bonus Action, and Free Move.
- Active gameplay selection is reconstructed from canonical state after Timeline hydration and multiplayer synchronization.
- Decoupled `CANCEL PASS` from selected/inspected pieces.
- Decoupled `END B.A.` from selected/inspected pieces.
- Preserved free local inspection while a canonical interaction remains active.
- Added unit coverage for host/guest visibility, ownership, reconstruction, and ghost-selection prevention.
- Host Authority, Timeline structure, semantic intents, and game design are unchanged.

## v20.11.5 — Guest END BA authority fix

- Fixed Guest `END BA` being silently rejected after an active Bonus Action.
- `validateBonusActionEndIntent` now accepts the canonical `action-active` continuation state, matching `endContinuationAction`, which already supports ending an active bonus action.
- MOVE, PASS, card selection reconciliation, and other gameplay flows are unchanged in this build.


## v20.11.6 — Guest Inspector interaction reconciliation

- Kept the Inspector anchored to the canonical active MOVE/PASS piece.
- Added a temporary requested-piece anchor across the Guest-to-Host start handoff, eliminating the empty Inspector frame before Timeline hydration.
- Prevented local target/inspection selection from replacing the active passer or mover card.
- No gameplay authority, movement, pass, or Bonus Action rules changed.
