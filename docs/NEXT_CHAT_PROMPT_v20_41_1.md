# Historical continuation prompt — v20.41.1

This completed handoff was superseded by `v20.42.0` after Match Interaction Feedback & Defensive Areas verification.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture and presentation boundary

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Manual Multiplayer was audited as a frozen hybrid legacy system. Retain its working manual lifecycle and synchronization; do not change it before a separate approved clean-room phase.
- `BoardCanvas` has a view-only `presentationMode`: offline Single Player Match supplies `match`; Editor and frozen Manual Multiplayer supply `editor`.
- Match Pitch & Venue and Match Pieces 2.5D are paint-only layers within that boundary. Tactical figures draw at 94% of their existing cell, but their hitboxes remain the original cell-sized wrappers. A ball sharing a player coordinate receives only the `ball-held` opacity treatment; it remains independently selectable by its established hitbox.

## Next direction, subject to a fresh narrow proposal

Continue the approved Match Presentation Mode 2.5D roadmap. The next candidate is interaction feedback presentation: refine only selection, legal/illegal movement, Pass paths, Group Move eligibility and inactive treatment so they remain more legible over the new Match visuals. Preserve their current classes, state conditions and behavior; do not modify Engine/rules, Editor or Manual Multiplayer. Inspect and propose before implementation.

## v20.41.1 verification

- BoardCanvas render coverage asserts Match figure, possession, `ball-held` and ball-aura markup.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.41.1

1. In Editor Mode, confirm pieces and ball retain the v20.41.0 puck appearance and normal interaction.
2. In Single Player Match, confirm tactical figures are visibly larger but their silhouette stays within each logical square.
3. Place the ball on a player through normal gameplay or Free tools. The ball must be translucent enough to identify the player's team and position label beneath it.
4. Confirm ball and player remain separately selectable by their established targets; test Move and Free Ball from that shared square.
5. Verify selected, INACTIVE, Group Move eligible/ineligible and lock states remain legible.
6. Test Pass, Group Move, Bonus Action, Undo/Redo and End Turn.
7. Create or join an ordinary Manual Multiplayer session. Its old puck presentation and manual behavior must remain unchanged. Do not test or alter automated multiplayer behavior.
