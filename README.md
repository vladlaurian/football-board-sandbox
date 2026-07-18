# Football Board Sandbox

## v17.8 — AI export semantic cleanup

### What changed

- Replaced the ambiguous exported tracker field `startingTeam` with `currentAttackingTeam`.
- Added immutable `matchContext.openingAttackingTeam`, derived from the actual `MATCH_STARTED` event instead of the mutable current-possession field.
- Removed the duplicated top-level `teams` object. Team identity and attack directions now have one canonical location: `matchContext.teams`.
- `MATCH_STARTED` is now exported in `turn_1`, using its post-start state, instead of appearing incorrectly in `turn_0`.
- Bumped the AI Analysis Export schema to version 2 because its external field names and canonical location changed.
- Added regression coverage for Red opening the match, Blue taking possession later, the immutable opening team, the mutable current attacking team, and `MATCH_STARTED` turn labeling.

### Why it changed

The Tracker’s internal legacy field `startingTeam` is reused by the current gameplay UI as the team currently attacking after a possession change. Exporting that field under its literal name made it look like the team that started the match had changed, which is false and misleading for an AI analysis.

The AI export must distinguish the opening attacking team from the team currently attacking at any point in the match. It must also have one canonical team mapping and a coherent first-turn boundary.

### Problems resolved

- An AI can no longer misread a possession change as a changed match starter.
- The initial and final states clearly show the attacking team at those moments.
- The opening attacking team remains stable for the entire match.
- Team metadata no longer has two redundant sources that could diverge.
- The match-start event is aligned with the first playable turn.

### Impact

- This changes only the compact AI Analysis Export schema; Full Replay, Match Timeline, Tracker behavior, multiplayer, Firebase, History, Undo, Redo, and `Situație` are unchanged.
- Existing AI export files use schema version 1 and remain historical files. New exports use schema version 2; they are not imported by the Sandbox, so no migration or compatibility risk exists inside the application.
- The internal Tracker field is intentionally left untouched in this small corrective build. Its broader internal rename belongs to the planned structural refactor, where it can be done consistently across UI, state, Firebase, and multiplayer rather than as a risky partial rename.

### Verification focus

1. Start a match with Red attacking.
2. Use `Change Possession` so Blue attacks.
3. Export AI Analysis.
4. Confirm `matchContext.openingAttackingTeam` is `red`, while `finalState.tracker.currentAttackingTeam` is `blue`.

## v17.7 — AI Analysis Export foundation

### What changed

- Added `Export AI Analysis` immediately after `Save Match` and before `Import Match`.
- The new export creates a compact JSON file for an external AI analysis workflow; it does not replace or alter `Save Match` / Full Replay.
- Each exported match explicitly identifies Blue as attacking right and Red as attacking left.
- The AI export includes a gameplay-only card snapshot: player identity, position, passive attributes, bonuses, preferred foot, special ability, and defensive area. It intentionally omits card images, URLs, visual layout, colors, and other presentation data.
- Timeline entries are converted into semantic events linked by the existing timeline `groupId` where one exists. A `MOVE` activation and its physical movement therefore share the same `actionId` while remaining separate History / Undo steps in the app.
- The export includes compact initial/final gameplay states, pitch geometry, tracker action economy, phase and turn, possession when it can be identified from the ball position, movement origin/destination, and the tracker actions added by an event.
- Unlinked physical moves are explicitly exported as `MANUAL_MOVE`; the export never guesses a dribble, a legal outcome, an opponent, a probability, or a football result that the current sandbox has not automated.
- The ruleset is explicitly marked `MANUAL_UNAUTOMATED`. It records the tracker limits and die type, while declaring that formulas, probabilities, and outcomes are not yet automated.
- Added focused tests for direction mapping, compact card data, action linkage, action economy, normal movement, and `MANUAL_MOVE` classification.

### Why it changed

Full Replay is optimized for faithful playback: it stores snapshots before and after every timeline step. An AI analysis needs a smaller and clearer account of what the game knows: who acted, what changed, which action steps belong together, and which facts are still manual rather than rule-resolved.

This version establishes that semantic foundation without pretending that the current sandbox already has a complete rules engine. It gives external analysis useful tactical context now and leaves a clean, versioned place for future configurable rules such as Dribble, Tackle, Pass, Shot, and Offside.

### Problems resolved

- AI analysis no longer has to infer the Blue/Red team mapping or attack direction from board coordinates.
- A card's gameplay values can be shared with an AI without exporting artwork or editor-only data.
- A selected `MOVE` action and the actual movement can be recognized as one linked action without changing the two-step History flow.
- A free/unexplained physical move is not falsely represented as a named football mechanic.
- Old and future gameplay rules are not conflated: this export states plainly that its current rules are manual and unautomated.

### Impact

- Full Replay, Match Timeline, History, Undo, Redo, Match Mode, Editor Mode, Tracker, Dice, phases, Firebase, multiplayer synchronization, and `Situație` retain their existing behavior.
- Multiplayer export remains host-only, matching `Save Match`. The AI file is downloaded locally and never written to Firebase.
- `Export AI Analysis` does not mark a Full Replay as saved for the Match-to-Editor exit guard; `Save Match` remains the required replay-preserving export.
- Existing Match Recording files remain valid for replay. They can be used to create an AI export when loaded into the current application timeline; no old file format is changed.
- Editor = Inspector = Export remains intact: the same match card snapshot used for replay is reduced to gameplay fields for the AI export, without touching the editor or Inspector data path.

### Current limitation, by design

The v17.7 export records facts the sandbox already knows. It does not yet calculate duel probabilities, identify dribble opponents, resolve offside, infer goals, or enforce gameplay rules. Those features require a later, configurable ruleset and will be added action by action, beginning with a single tested pilot mechanic rather than a hard-coded global rewrite.

## v17.6 — Match exit guard and Replay History auto-scroll

### What changed

- Switching from Match Mode to Editor Mode now checks whether the exact current timeline revision has been exported.
- An unsaved match opens an `Unsaved Match` dialog with two explicit choices: `Save & Switch` and `Switch Without Saving`.
- `Save & Switch` exports the Match Recording immediately with the standard automatic filename, without opening the name prompt, and switches mode only after export succeeds.
- A failed export keeps both the match and the warning dialog open so the user can retry or choose the existing discard behavior deliberately.
- A timeline revision that was already saved switches directly to Editor Mode, preserving the previous behavior.
- Replay History now follows the active cursor automatically after Undo, Redo, and direct History jumps.
- Only the scrollable list inside the Replay panel moves; the panel position and page remain unchanged.
- The currently displayed replay step receives a distinct visual highlight.
- Added a focused regression test for exact timeline-revision export freshness.

### Why it changed

Leaving Match Mode closes the active timeline. Without a guard, an accidental click could discard an unexported match before the user had saved its recording. Export state must be tied to the exact timeline revision because actions, Undo, Redo, and cursor jumps can change the state after a previous save.

Long replays also moved the cursor outside the visible portion of History. Automatic nearest-item scrolling keeps navigation readable without moving the floating History window itself.

### Problems resolved

- An unsaved match can no longer be left for Editor Mode without an explicit save-or-discard decision.
- Automatic saving does not require a second filename dialog during the mode switch.
- Export failure cannot silently continue into Editor Mode.
- Saving and then changing the timeline is correctly recognized as a new unsaved revision.
- Undo, Redo, and direct replay navigation no longer require manual History scrolling to find the active step.

### Impact

- The Match Timeline remains the single source of truth for History, Undo, Redo, and Match Recording export.
- `Switch Without Saving` intentionally retains the previous Match-to-Editor behavior.
- The administrative `Editor Mode` closing transition is still handled as before and does not add a second required export after a successful `Save & Switch`.
- Replay remains local and read-only. No Firebase schema, security-rule, multiplayer protocol, Tracker, phase-system, or Situation changes are required.
- `Situație` remains independent: the warning, export, replay scrolling, and Editor switch do not create, overwrite, or select a Situation.
- Editor = Inspector = Export remains intact; no card data or rendering path was changed.

## v17.5 — Match Recording export, import, and read-only replay

### What changed

- Added `Save Match` and `Import Match` immediately after the Editor Mode / Match Mode button.
- `Save Match` exports the current unified Match Timeline as a versioned JSON Match Recording.
- Match Recording files contain the initial game state, every timeline transition, the active cursor, Tracker and phase state, dice state, board state, and the exact card definitions referenced by the match.
- The available card library is snapshotted when Match Mode starts. Export includes only cards actually referenced anywhere in that timeline, while preserving their stable start-of-match definitions.
- `Import Match` opens a dedicated `REPLAY VIEW` at step `0. Start`.
- Replay navigation uses the existing unified timeline: Undo moves one step backward, Redo moves one step forward, and History jumps directly to a selected step.
- Replay View provides local zoom, History, Tracker, Dice, and Inspector controls. Tracker and gameplay controls remain read-only.
- `Exit Replay` restores the board, card library, timeline, zoom/pan, Tracker visibility, History visibility, Inspector state, and other preserved workspace presentation state from before import.
- Imported recording files are validated by recording type, schema version, timeline structure, card snapshot structure, entry/card limits, and referenced-card completeness.
- Import warns when the recording was produced by a different application version.
- A new Match Mode warns before replacing a previous timeline revision that has not been exported.
- Added focused tests for referenced-card collection, used-card filtering, JSON recording round trips, replay origin support, and invalid recording rejection.

### Why it changed

History, Undo, and Redo already use one snapshot-based Match Timeline. Match Recording now serializes that same source of truth instead of creating a second replay log. Snapshot playback preserves the recorded board and gameplay state even if action implementation changes later.

Replay is intentionally isolated from normal application persistence. Loading an old match directly into the live workspace would risk marking cloud state dirty, overwriting the local card library, writing timeline navigation to Firebase, or changing the active Situation. The dedicated read-only context avoids those side effects and restores the previous workspace when closed.

### Problems resolved

- A Match Mode timeline can now be kept after leaving the page or starting another match.
- Saved matches can be reviewed step by step without manually reconstructing the board.
- Tracker actions, phase changes, dice results, card assignments, and piece movement remain aligned because replay renders the same snapshots used by History and Undo/Redo.
- Cards used by a recording remain available to Inspector even if the permanent card library changes later.
- Import cannot silently create an empty replay from an invalid file.
- Replay navigation cannot autosave imported state or publish it to a multiplayer session.

### Impact

- Normal Editor Mode, Match Mode, History, Undo, Redo, Tracker, phases, dice, and multiplayer synchronization keep their existing behavior.
- Multiplayer Match Recording export is host-only. Import is disabled until the user leaves the multiplayer session; v17.5 replay is local only and requires no Firebase schema or security-rule changes.
- `Situație` remains a separate fixed-setup system. Import, navigation, and Exit Replay do not create, select, rename, overwrite, or cloud-save a Situation.
- Match recordings are downloaded by the browser and are not automatically stored in Cloud Save or Firebase.
- Replay is read-only in v17.5. Interactive `Reia de aici` branching remains intentionally deferred until the core gameplay state is more stable.
- There is no timed autoplay in v17.5; playback is controlled through History and Undo/Redo.
- Editor = Inspector = Export remains intact: replay Inspector uses the same card objects and `CardPreview` renderer captured by Match Recording export.

### Replay controls

1. Enter Match Mode and play normally.
2. Press `Save Match`, choose a name, and keep the downloaded JSON file.
3. Outside multiplayer, press `Import Match` and select that JSON file.
4. Replay opens at `0. Start`. Press Redo to advance one step, Undo to go back one step, or click any item in the Replay/History window to jump directly to it.
5. Use Tracker, Dice, or Inspector to inspect the state at the selected step.
6. Press `Exit Replay` to restore the sandbox that was open before the import.

## v17.4 — Formation reset repair and safe puck deletion

### What changed

- Formation saves now exclude the seven structural bench reserve pucks.
- Saved formations are limited to eleven valid player positions.
- Previously saved formations that accidentally contain the reserve row are repaired when loaded by keeping the original first eleven positions.
- Formation application and Reset Position defensively normalize formation data before creating pucks.
- The puck edit dialog now offers `Șterge pucul` in Editor Mode.
- Puck deletion requires confirmation and automatically detaches any assigned card while keeping the card in the Cards library.
- Match Ball and the seven structural `SUB` reserve slots cannot be deleted.
- Multiplayer deletion writes the board and card-assignment map together.
- Added focused regression tests for formation repair and protected reserve identification.

### Why it changed

Saving a formation previously included every team puck: eleven formation players plus seven bench reserves. The reserve coordinates were converted into field coordinates during formation serialization. Reset Position then created those eighteen saved entries and added the seven structural reserves again, producing a second reserve row on the pitch.

Puck deletion also needs to preserve the separate card library. Cards are stored independently and pucks contain only a `cardId` reference, so deletion now removes the reference and the puck without deleting the card data.

### Problems resolved

- Reset Position no longer adds a duplicate row of reserves after saving a formation.
- The customized positions in an affected formation remain intact because its original first eleven entries are preserved.
- Corrupted 18-player formation data from local storage, cloud state, or imported backups is normalized before use.
- Unwanted non-structural pucks can be removed safely from the current Editor board.
- Deleting a puck cannot silently delete its attached card.
- Multiplayer cannot retain a stale card assignment for a deleted puck.

### Impact

- Reset Position consistently rebuilds the selected formation plus exactly seven structural reserves per team.
- Deleting a current-board puck does not rewrite the selected saved formation; Reset Position can recreate it until that formation is saved again.
- Puck deletion is unavailable in Match Mode, so Match History, Undo/Redo, Tracker, and phase state are unaffected.
- No Firebase schema or security-rule changes are required.
- Editor = Inspector = Export remains intact; cards detached by puck deletion remain available in the same card library and rendering paths.

## v17.3 — Tracker available from session start

### What changed

- Tracker is available to both multiplayer participants as soon as the session is active.
- Guest no longer has to wait for the host to open Tracker first.
- Host and guest continue to open, close, and minimize their Tracker windows independently.
- New sessions initialize the shared Tracker gameplay state as available.
- Existing session snapshots with the legacy `enabled: false` value no longer disable either participant's local Tracker button.
- Flip requests, flip approvals, and local card-side toggles remain outside the Match timeline.

### Why it changed

After v17.2 separated local Tracker window visibility from shared gameplay state, the old host-activation gate was no longer meaningful. It still disabled the guest button until the host opened Tracker once, even though opening the panel is now a local presentation choice.

Flip permissions were reviewed but intentionally left outside History. A reveal communicates irreversible information: Undo can hide the card again but cannot make a participant forget it. Including session-user permissions in gameplay snapshots would add complexity without producing truthful Undo/Redo behavior.

### Problems resolved

- Guest can open Tracker immediately after joining a session.
- Host does not need to activate Tracker on behalf of the guest.
- Opening or closing Tracker on either browser does not affect the other browser.
- Older active session documents cannot keep the guest Tracker button disabled.

### Impact

- Guest Tracker remains strictly view-only.
- Shared Tracker gameplay state, Timeline, History, Undo/Redo, phases, and action synchronization are unchanged.
- No Firebase schema or security-rule changes are required.
- Match replay data remains free of user-specific flip request and permission records.
- Editor = Inspector = Export remains unchanged; card rendering and export paths were not modified.

## v17.2 — Local Tracker visibility and reliable History dragging

### What changed

- Tracker window visibility is now local to each multiplayer participant.
- Activating the Tracker for the first time still enables its shared session state and opens it for connected participants.
- Once enabled for the session, closing or reopening the host window no longer changes the guest window.
- Guest Tracker controls remain view-only; this update changes only window visibility, not gameplay permissions.
- History dragging and resizing now capture the active pointer and track its pointer ID.
- History releases drag and resize state on pointer up, pointer cancellation, or lost pointer capture.

### Why it changed

The shared Tracker `enabled` flag previously represented both session availability and the host's local window visibility. Closing the host window therefore wrote `enabled: false` to Firebase and closed the guest window as well. History also depended on receiving pointer release inside its own panel, so a fast drag outside the panel could leave it attached to the mouse.

### Problems resolved

- A host can close and reopen Tracker without changing what the guest sees.
- A guest can close and reopen its view-only Tracker without affecting the host.
- Shared Tracker gameplay state continues to synchronize while either local window is closed.
- Fast History dragging no longer remains attached after the mouse button is released outside the panel.
- History resizing uses the same reliable pointer lifecycle.

### Impact

- Multiplayer presentation state is independent per browser while Tracker gameplay data remains shared.
- Guest Tracker permissions are unchanged and remain view-only.
- No Firebase schema or security-rule changes are required.
- Timeline, phase state, Undo/Redo, and Tracker action synchronization are unchanged.
- Editor = Inspector = Export remains unchanged; card data and rendering paths were not modified.

## v17.1 — Timeline multiplayer synchronization stability

### What changed

- Match Mode now treats the revisioned timeline as the single applied gameplay source instead of independently reapplying `sharedTracker` snapshots over it.
- Stale Firebase echoes are rejected by recording ID and revision while a newer local transition is pending.
- Editor → Match and Match → Editor remain optimistic and are represented by a complete synchronized state transition.
- Closing Match Mode records the return to Editor Mode in the timeline before closing the recording.
- Tracker panel visibility is presentation state and is no longer captured, restored, or rewritten by Undo/Redo.
- Firebase timeline writes preserve the current shared Tracker visibility rather than restoring an old value from History.
- Dice values preserve `null`; an unset die can no longer become the synthetic result `0`.
- Baseline timeline state no longer creates a dice roll ID or a false dice notification.
- Remote dice notices are emitted only for a real, finite `DICE_ROLLED` result.
- Inspector actions derive their next Tracker log from the current timeline cursor, preventing older Firebase echoes from replacing PASS, SHOT, CROSS, MOVE, and later actions.
- Undo and Redo are explicitly granular: selecting MOVE and performing the movement remain two separate visible decisions.
- Added regression tests for nullable dice values, stable dice IDs, stale revision rejection, and pending mode-transition protection.

### Why it changed

v17.0 still applied two multiplayer state streams during Match Mode: the new timeline and the legacy `sharedTracker/sharedDice` projection. Firebase could return an older snapshot after a local action, temporarily reverse the game mode, close the Tracker panel, or replace the Tracker action log while History remained correct.

### Problems resolved

- Entering Match Mode no longer displays `RED rolled 0 (D20)` when no die was rolled.
- Real dice rolls can produce fresh notifications instead of being masked by a baseline event.
- Editor/Match switching is no longer visibly reversed while waiting for Firebase.
- PASS → SHOT → CROSS → MOVE accumulates instead of overwriting the previous Tracker action.
- Tracker dots retain their action types instead of falling back to `•` because of a missing log entry.
- History, Tracker, host, and guest hydrate from the same applied timeline state.
- Undo/Redo no longer closes the Tracker window.

### Impact

- Multiplayer gameplay state has one authoritative application path during an active Match recording.
- The legacy shared Tracker projection remains available for Editor Mode and compatibility, without competing with the active timeline.
- Timeline export/replay remains deterministic because UI panel visibility is no longer embedded in gameplay snapshots.
- No Firebase schema or rule changes are required beyond the v17.0 `timelineEntries` permission.
- Editor = Inspector = Export remains unchanged; card rendering and export paths were not modified.

## v17.0 — Unified Match Timeline

### What changed

- Replaced the separate visual History, local Undo/Redo snapshots, and tracker MOVE rollback with one Match Mode timeline.
- Entering Match Mode starts a new recording boundary from the exact current board, movement, tracker, phase, game mode, and dice state.
- History is now a visual projection of the same entries used by Undo and Redo.
- Undo and Redo operate on complete game state instead of restoring only player positions and movement usage.
- MOVE activation and the resulting movement are stored as consecutive timeline decisions, allowing granular Undo and Redo.
- GROUP MOVE and FREE MODE movements use the same timeline state model.
- PASS, SHOT, CROSS, DRIBBLE, TACKLING, 3/2, END TURN, turn changes, possession changes, tracker resets, dice results, board-setting changes, piece status, labels, and card assignments can be represented by the same timeline.
- Clicking a History entry moves the shared cursor through the same timeline instead of applying an unrelated partial snapshot.
- A new action after Undo replaces the abandoned Redo branch cleanly.
- In multiplayer, timeline entries are stored separately from the session document and the current board, tracker, phase, movement, dice, card assignments, cursor, and revision are committed together.
- Multiplayer Undo, Redo, History navigation, and History clearing are host-authoritative.
- Removed the legacy MOVE rollback payload based on `startX`, `startY`, and `startMovementState`.
- Added focused modules for game-state snapshots, the timeline engine, future Match Recording files, and multiplayer timeline hydration.
- Added automated tests for Undo, Redo, action sequencing, branch replacement, cursor navigation, replay forks, recording payloads, multiplayer hydration, and stable dice identities.

### Why it changed

The previous implementation had three independent histories:

- a local position/movement Undo stack;
- a different visual History snapshot list;
- a Firebase tracker action log with a special MOVE-only rollback.

Those systems could disagree about player positions, movement usage, consumed actions, phases, Group Move, Free Mode, and dice. They were especially unsafe in multiplayer because a local snapshot could be written back over newer shared state.

### Problems resolved

- Consecutive Undo steps can restore the player position and then return the consumed MOVE action.
- Restoring History no longer combines an old board with the current tracker and phase.
- Removing a MOVE through the timeline also restores a carried ball.
- GROUP MOVE rollback no longer depends on the legacy tracker-only rollback payload.
- An older team action cannot be removed while later global timeline actions remain applied.
- Dice History stores the actual completed result rather than a stale React state value.
- Loading a situation can retain the matching board settings in its timeline state.
- Match Mode multiplayer changes use revision checks and serialized writes instead of independent action/board writes.

### Impact

- The Tracker and History now describe the same ordered match state.
- The phase system and movement state travel together through Undo/Redo.
- Reconnecting multiplayer clients can hydrate the active timeline and cursor.
- Future gameplay systems can add one timeline transition instead of implementing separate History, Undo, Redo, and Firebase rollback paths.
- The data model is prepared for a future export/import replay feature with checkpoints and `Fork From Here`; v17.0 does not yet expose replay export controls in the UI.
- Card rendering remains on the existing shared Editor = Inspector = Export path; no alternate card renderer was introduced.

### Firebase note

Multiplayer v17.0 uses the `sessions/{code}/timelineEntries` subcollection. Deployed Firestore rules must allow the same session participants who can update the session to read and write these timeline documents.

## v16.6 — Reliable player and ball hitboxes

- Player interaction now uses an explicit hitbox covering the full occupied grid cell.
- The Match Ball uses a separate centered hitbox with higher priority when it overlaps a player.
- The ball target is compact with mouse/pen and larger on coarse touch screens, so it remains practical to select without blocking the player cell.
- Mouse, pen, and touch now share the same pointer-event path.
- Removed the previous pseudo-element hitbox workaround.
- No gameplay behavior was changed.

## v16.5 — Easier player/ball selection

- Player selection now covers the entire occupied grid cell.
- When the ball overlaps a player, only the compact central area of the ball selects the ball.
- Clicking elsewhere in that cell selects the player.
- No gameplay behavior was changed.

## v16.4 — Ball follows player

- When the Match Ball shares a cell with a player, moving that player also moves the ball.
- Selecting and moving the Match Ball removes it from the player and leaves all other behavior unchanged.

## v16.3 — Keep moved player selected

- After a player completes a movement, that player remains selected.
- This applies to normal MOVE, GROUP MOVE, and Free Mode movement because they share the same movement commit path.
- Match Ball keeps its existing deselection behavior.
- No other gameplay behavior was changed.

## v16.2 — Clear Free Mode active state

- The FREE MODE button now changes its label to `FREE MODE: ON` while active.
- Added a strong high-contrast border and glow so the active state remains unmistakable even when every other action button is already locked.
- The active FREE MODE button keeps full opacity and cannot be confused with disabled controls.
- No gameplay behavior was changed.

# Football Board Sandbox v16.1

Source build of the football board sandbox.




## v16.1 — Free Mode always available

- Updated error messages to use the new `Free Mode` name instead of `FREE`.
- FREE MODE remains available after END TURN and can be activated even while GROUP MOVE authorization is still active.
- No other gameplay behavior was changed.


## v16.0 — Legal Group Move and persistent Free Mode

- GROUP MOVE now uses the normal movement engine: Speed, axis locking, diagonal cost, 3/2 state, and movement-ended restrictions remain active.
- FREE was renamed FREE MODE and now toggles a persistent free-placement mode for the selected player.
- While FREE MODE is active, all action buttons and END TURN are locked, the active player remains selected after each placement, and other players cannot be selected.
- The Match Ball can still be selected while FREE MODE is active; the locked player can be reselected, and the mode ends only by pressing FREE MODE again.
- Added the `Exit FREE MODE first.` feedback message.
- Updated the in-app Sandbox version and package version to v16.0.

## v15.8 — Group Move continuation and End Turn locking

- END TURN now becomes disabled as soon as that team has ended its phase.
- GROUP MOVE now remains a valid movement authorization after consuming the final tracker action.
- While GROUP MOVE is active, all other action buttons (including FREE) are locked; END TURN remains available.
- Multiplayer tracker ownership remains unchanged: the host continues to control tracker editing.
- Updated the in-app Sandbox version and package version to v15.8.

## v15.7 — Reopen ended phases and restore tablet tap movement

- Removing the latest tracker action now reopens that team's phase when `END TURN` had already advanced the turn flow.
- Removing a MOVE after `END TURN` again restores the player position and movement state recorded when MOVE was activated.
- Reopening the attack phase from defense or complete, and reopening the defense phase from complete, is synchronized through the shared tracker state.
- Restored one-finger tablet movement: after selecting a piece, tapping an empty destination cell now executes the same movement flow used on desktop.
- Preserved two-finger board pan/zoom, piece taps, ruler touch behavior, FREE, GROUP MOVE, 3/2, and direct MOVE confirmation.
- Updated the in-app Sandbox version and package version to v15.7.

## v15.6 — Inspector compaction, completed-action messaging, and selection consistency

- Further reduced the Inspector header, title, window controls, status row, and action-row height without resizing the rendered card.
- Added a smaller dedicated font for `GROUP MOVE`.
- When the active team has used every tracker action but has not pressed `END TURN`, movement and action attempts now show: `All actions are complete. Press END TURN to finish your turn.`
- Kept the existing post-`END TURN` phase messages unchanged.
- Unified Inspector content with the board's actual selected piece, preventing the Match Ball from appearing in Inspector while a player remains selected on the pitch.
- Updated the in-app Sandbox version and package version to v15.6.

## v15.5 — Compact Inspector controls and direct MOVE confirmation

- Reduced the height, font size, padding, and gaps of all controls above the Inspector card without changing the card size or rendering path.
- Aligned INACTIVE, flip controls, END TURN, and FREE on the same horizontal line.
- Ensured GROUP MOVE and TACKLING fit inside their buttons without horizontal scrolling.
- Added direct board movement confirmation when a player has not yet activated MOVE: “Do you want to move this player?”
- Yes records the normal MOVE action and executes the requested legal movement; No cancels without moving or consuming an action.
- Once MOVE has been activated for that player in the current turn, later legal movement continues without another prompt.
- Kept MOVE, FREE, GROUP MOVE, and the free 3/2 flow compatible with the existing action authorization rules.
- Updated the in-app Sandbox version and package version to v15.5.



## v15.3 — Movement preview and free 3/2 access

- Movement preview is now shown immediately after selecting a player, without requiring MOVE or FREE first.
- Preview remains informational only; normal movement still requires MOVE, FREE, or GROUP MOVE authorization.
- The 3/2 rule is checked before action authorization, so an eligible player can move directly to the ball without consuming a MOVE action.
- Declining the 3/2 confirmation no longer bypasses normal movement authorization.
- Updated the in-app Sandbox version and package version to v15.3.

## v15.2 — Inspector card-action layout fix

- Kept Reset Tracker behavior unchanged: it clears tracker actions without reverting player positions.
- Removed the sticky overlay behavior from Assign Card / Edit Card / Remove Card.
- The three card-management buttons now remain in normal document flow below the Inspector card and never cover the card artwork.
- Preserved the shared Editor = Inspector = Export card-rendering path.
- Updated the in-app Sandbox version and package version to v15.2.

## v15.1 — single-player tracker and movement authorization fixes

- Restored manual tracker-dot toggling in Editor Mode.
- Match Mode keeps typed action initials and only allows removing the latest logged action.
- Hardened GROUP MOVE authorization: free team movement is now allowed only when the team’s final tracker entry is a valid GROUP MOVE that fills the tracker.
- Prevented stale or restored `groupMove.active` state from granting the attacking team unintended Editor-like movement.
- Updated the in-app Sandbox version and package version to v15.1.


## v15.0 — action workflow, tracker clarity, and movement rollback

- Promoted the match-action system to v15.0 and updated the in-app Sandbox version.
- Kept the action row on one line in this order: MOVE, GROUP MOVE, PASS, SHOT, CROSS, DRIBBLE, TACKLING.
- Moved FREE beside the ACTIVE/INACTIVE control at the top of the Inspector.
- Removing the latest MOVE action now restores that player's position and movement state to the moment MOVE was activated.
- Tracker action circles are larger, action abbreviations are white and unobstructed, and consumed actions remain fully visible.
- Match movement feedback now distinguishes an exhausted team from a player who simply has not activated MOVE.
- Exhaustion messages direct the user to wait for the opponent or advance to the next turn; when both teams are exhausted, the game explicitly requests the next turn.
- The locked movement-axis icon remains visible from actual movement state even if MOVE authorization is later removed.
- Stabilized the Inspector footer so Assign Card, Edit Card, and Remove Card are not pushed out of view by the action row or card resize calculations.
- Preserved the Editor = Inspector = Export rendering rule; no card-rendering path was forked or restyled.


## v14.6 — explicit movement-ended state

- Added an explicit `movementEnded` flag to each player movement state.
- Using the 3/2 rule after at least one normal movement sets `movementEnded: true`.
- The central movement evaluator now rejects every later destination for that player during the same turn.
- Cursor preview shows the move as unavailable instead of displaying remaining movement points.
- The locked-axis badge is hidden because no movement direction remains available.
- The flag is normalized, saved, restored, included in Undo/Redo, and synchronized through multiplayer state.
- The flag resets together with the rest of movement state when the turn changes.

## v14.5 — 3/2 repeat-use feedback and occupied ball-cell protection

- A second 3/2 attempt by the same player in the same turn now explicitly states that the 3/2 rule has already been used, in addition to the normal illegal-move explanation.
- The 3/2 confirmation is no longer shown when the ball cell is already occupied by another player.
- A player can never enter a ball cell occupied by another player through the 3/2 rule.
- The checks use the synchronized live board and movement state, so the same protection applies in multiplayer.


## v14.3 — Cumulative diagonal cost, private movement information, turn confirmation

- Fixed the diagonal movement exploit caused by splitting movement into repeated one-cell moves.
- Movement state now stores both cumulative movement cost and cumulative distance for each piece during the turn.
- Diagonal cost is calculated against the total diagonal distance already travelled that turn. For example, two separate one-cell diagonal moves cost `1 + 2 = 3`, exactly like one two-cell diagonal move.
- Older saved/session movement states that contain only `spent` are normalized by inferring the travelled distance.
- In multiplayer, movement previews for an opponent's piece are now controlled by card visibility:
  - **Open Cards:** movement preview is visible.
  - **Private Cards:** movement preview is visible only when that attached card has been revealed/flipped for the viewer.
- Hidden opponent cards no longer expose destination highlights, movement-cost badges, Speed-based availability, or the already-locked movement-axis badge.
- Clicking a different tracker turn now opens a confirmation dialog before changing the turn:
  - `Advance Turn?` with `Yes / No` when moving forward.
  - `Reverse Turn?` with `Yes / No` when moving backward.
- Turn state, action counters, and per-piece movement usage reset only after explicit confirmation with `Yes`.

## v14.2 — Ruler, Inspector, and movement symbols

- The ruler can select empty cells and cells occupied by players or the ball.
- Ruler interaction measures the cell coordinate without selecting or moving the occupying piece.
- Deselecting a piece clears the Inspector and shows `No selection`.
- Selecting the ball displays `⚽ Match Ball` in the Inspector.
- Movement previews use axis symbols: `↔`, `↕`, `⤡`, and `⤢`.
- Speed violations show `⚠ cost / remaining`; mixed-axis and axis-change violations show `🚫`.
- A selected piece with an axis already locked during the turn displays a small axis badge when the viewer is allowed to see its movement information.

## v14.1 — Selection and multiplayer match-rule fixes

- Clicking or tapping the currently selected player or ball deselects it.
- Fixed multiplayer guests remaining effectively in Editor Mode when the shared tracker window was disabled.
- Multiplayer moves write the board position and movement consumption together in one Firebase update.
- The synchronized movement-state ref updates immediately on every session snapshot.

## v14.0 — Editor Mode / Match Mode

- Added a host-authoritative Editor Mode / Match Mode control.
- Match Mode reads the assigned card's numeric `Speed` passive attribute.
- The first movement of each player in a turn locks one axis.
- Movement accumulates across multiple selections during the same turn.
- Illegal moves are blocked and display a single `OK` dialog.
- Starting a tracked game or confirming a turn change resets per-player movement usage.
- Undo/Redo snapshots include both piece positions and movement state.
- Game mode and movement state persist in cloud saves and synchronize in multiplayer.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## v14.4 — 3/2 rule

The 3/2 possession rule is active only in Match Mode.

- A player may enter the ball cell for free when the ball is on a legal movement line at a maximum distance of 3 orthogonal cells or 2 diagonal cells.
- Valid distances are 1, 2, or 3 cells orthogonally and 1 or 2 cells diagonally.
- The rule may be used once per player per turn.
- Entering the ball cell with 3/2 does not charge the travelled cells.
- If the player had not moved earlier in the turn, all movement points remain available and no movement axis is locked by the 3/2 entry.
- If the player had already moved at least one cell, 3/2 may change to any legal orthogonal or diagonal line leading to the ball, but all remaining movement points are then lost and that player's movement ends.
- The rule remains available even when the player has no movement points remaining, provided all other 3/2 conditions are met.
- A Yes/No confirmation is shown before applying 3/2. Choosing No attempts the move using the normal movement rules.
- The used state and resulting board position are synchronized atomically in multiplayer and reset with the turn movement state.

## v14.7 — Match action authorization
- Inspector action buttons on one row: MOVE, GROUP MOVE, PASS, SHOT, CROSS, DRIBBLE, TACKLING, FREE.
- Typed tracker action log with abbreviations and latest-action removal confirmation.
- MOVE authorizes normal movement once per player per turn.
- FREE authorizes one unrestricted placement without consuming an action.
- GROUP MOVE is available only when one tracker action remains and enables unrestricted team repositioning until reset/turn change.
- PASS/SHOT/CROSS/DRIBBLE/TACKLING currently consume and label tracker actions only.
- Match movement requires MOVE, GROUP MOVE, or FREE authorization; ball and Editor Mode remain free.
- Action state is persisted and synchronized in multiplayer.

## v15.4
- Added explicit Match Mode phases: attack, defense, complete.
- Added team-colored END TURN and FREE controls with confirmation for END TURN.
- The defending team must wait for the attacking team to end its phase; only FREE remains available outside the active phase.
- After both phases end, normal actions are blocked until the next turn; FREE remains available.
- Compact team-colored action controls remove the Inspector horizontal scrollbar.
- Turn phase is included in local saves and shared tracker state for multiplayer compatibility.
