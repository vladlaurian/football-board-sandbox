# Continuation prompt — v20.43.0

Continue the Football Board Sandbox from `v20.43.0`.

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
- v20.43 Match presentation uses premium tactical pucks inside the existing piece elements. They preserve logical position, label, hitbox, selection and state classes.
- Defensive-area calculation remains supplied by `main.jsx`. BoardCanvas deduplicates that already-calculated cell list only for Match rendering, suppresses internal same-team borders and renders a distinct neutral contested cell when both teams cover the same square.

## Next direction, subject to a fresh narrow proposal

Continue the approved Match Presentation Mode 2.5D roadmap with Match panel presentation: refine Tracker, Dice, History, Match Over and active-action prompts for Match Mode only, without changing their layout controls, state or functionality. Inspect and propose before implementation.

## v20.43.0 verification

- BoardCanvas render coverage includes an overlapping Blue/Red defensive cell and asserts Match aggregation/contested presentation markup.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.43.0

1. In Editor Mode, confirm the original puck presentation and existing defensive-area cells remain unchanged.
2. In Single Player Match, verify Blue/Red premium tactical pucks are large, round and show their position label clearly.
3. Put the ball on a player and verify the translucent ball still reveals the puck label/team while both established click targets work.
4. Enable defensive areas with adjacent cells from the same team. The shared internal borders must disappear; only the region outline should remain.
5. Create a Blue/Red overlap. The shared cell must be visually distinct and neutral rather than blending ambiguously.
6. Test Move, Pass, Group Move, INACTIVE, Free tools, Bonus Action, Undo/Redo and End Turn.
7. Create or join an ordinary Manual Multiplayer session. It must retain the previous visual/manual behavior. Do not test or alter automated multiplayer behavior.
