# Historical continuation prompt — v20.42.0

This completed handoff was superseded by `v20.43.0` after premium-puck and defensive-area clarity verification.

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
- Match Pitch & Venue, Match Pieces 2.5D and Match Interaction Feedback are paint-only layers inside this boundary. v20.42 styles existing UI state classes only; it does not decide their conditions or affect their DOM input behavior.

## Next direction, subject to a fresh narrow proposal

The approved Match Presentation Mode 2.5D roadmap has completed its board/piece/interaction layers. The next candidate is Match panel presentation: refine Tracker, Dice, History, Match Over and active-action prompts for Match Mode only, without changing their layout controls, state or functionality. Inspect and propose before implementation.

## v20.42.0 verification

- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.42.0

1. In Editor Mode, confirm defensive areas, Move/Pass feedback and all board visuals retain their prior presentation.
2. In Single Player Match, enable defensive areas and confirm Blue/Red overlays are translucent, team-readable and do not hide the grid or grass.
3. Start Move and hover legal then illegal squares. Confirm the new feedback is clear and click behavior is unchanged.
4. Test Pass with clear, risk and blocked routes; route badges and lines must remain distinguishable and selectable as before.
5. Test Group Move eligibility/locks, INACTIVE, Bonus Move, Free Move and Free Ball.
6. Test Undo/Redo, End Turn, automatic turn change and Match Over.
7. Create or join an ordinary Manual Multiplayer session. Its existing visuals and manual behavior must remain unchanged. Do not test or alter automated multiplayer behavior.
