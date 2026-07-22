# Continuation prompt — v20.41.0

Continue the Football Board Sandbox from `v20.41.0`.

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
- Match Pitch & Venue and Match Pieces 2.5D are paint-only layers within that boundary. The player figure, ball aura and possession class must not alter a piece's position, hitbox, label, selection, Engine state or Timeline.

## Next direction, subject to a fresh narrow proposal

Continue the approved Match Presentation Mode 2.5D roadmap. The next candidate is interaction feedback presentation: refine only selection, legal/illegal movement, Pass paths, Group Move eligibility and inactive treatment so they remain more legible over the new Match visuals. Preserve their current classes, state conditions and behavior; do not modify Engine/rules, Editor or Manual Multiplayer. Inspect and propose before implementation.

## v20.41.0 verification

- BoardCanvas render coverage asserts Match figure, ball aura and possession markup.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.41.0

1. In Editor Mode, confirm pieces and ball retain the prior puck-style rendering and all normal behavior.
2. In Single Player Match, confirm blue/red tactical figures, their labels, shadows, ball aura and possession emphasis render correctly.
3. Select a player, move from card and board, then Cancel where applicable. Click/touch targets must remain exactly as before.
4. Put a player and ball on the same square through normal gameplay or Free tools. Both must remain selectable by their established targets; the player receives only a visual possession emphasis.
5. Verify INACTIVE, selected, active interaction, Group Move eligible/ineligible and lock states remain legible.
6. Test Pass, Group Move, Free Move, Free Ball, Bonus Action, Undo/Redo and End Turn.
7. Create or join an ordinary Manual Multiplayer session. It must retain its old puck presentation and manual behavior. Do not test or alter automated multiplayer behavior.
