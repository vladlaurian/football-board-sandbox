# Historical continuation prompt — v20.40.0

This completed handoff was superseded by `v20.41.0` after Match Pieces 2.5D verification.

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
- v20.40 applies Match Pitch & Venue only through that `match` CSS boundary. The pitch keeps the same logical square-grid layers and geometry; only colors, lighting, field/goal contrast and outer framing change.

## Next direction, subject to a fresh narrow proposal

Continue the approved Match Presentation Mode 2.5D roadmap. The next candidate is Match player and ball presentation: replace only the visual drawing of pieces with mature tactical 2.5D figures, preserving the same positions, hitboxes, labels, selection classes and existing feedback. No Engine, rules, external assets, WebGL, Editor or Manual Multiplayer changes. Inspect and propose before implementation.

## v20.40 verification

- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.40

1. In Editor Mode, compare the board against v20.39. It must retain the existing visual presentation and controls.
2. In Single Player Match, inspect the pitch: grass, field lines, goals and outer venue frame should look richer, while all square cells remain readable.
3. Test Move, Pass, Group Move, Free Move, Free Ball and Bonus Action. Coordinates, previews and rules must be unchanged.
4. Verify Pass routes, legal/illegal destination highlights, Group Move zone/eligibility and ruler markers are still clearly visible over the new grass.
5. Test Undo/Redo, End Turn, automatic turn change and Match Over.
6. Create or join an ordinary Manual Multiplayer session. It must retain the existing presentation and manual behavior. Do not test or alter automated multiplayer behavior.
