# Historical continuation prompt — v20.39.0

This completed handoff was superseded by `v20.40.0` after Match Pitch & Venue verification.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture and recent decisions

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Workspace persistence is separate from Match Runtime. Card Workspace UI is componentized through controller props; Manual Multiplayer callbacks remain in `main.jsx`.
- Manual Multiplayer has been audited as a frozen hybrid legacy system: retain its working manual session lifecycle, board/card synchronization, participant state, dice and ruler now. Do not extract or delete Host Authority/timeline-intent logic until a separately approved Manual Multiplayer clean-room phase after Single Player mechanics are stable.
- `BoardCanvas` now owns a view-only `presentationMode` boundary. Offline Single Player Match supplies `match`; Editor and frozen Manual Multiplayer supply `editor`. This mode must never alter rules, input geometry, Engine, Timeline or Firebase.

## Next direction, subject to a fresh narrow proposal

Continue the approved Match Presentation Mode 2.5D roadmap. The next candidate is terrain/venue presentation for offline Single Player Match only: richer pitch, field framing and atmosphere without external assets, WebGL, rule changes, player-piece changes or Manual Multiplayer changes. First inspect the existing board CSS/component layers, propose exact scope and wait for approval.

## v20.39.0 verification

- `BoardCanvas` render coverage supplies `presentationMode: "match"` and asserts the Match-only class.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.39.0

1. In Editor Mode, inspect the board. It must retain its existing technical presentation and all normal controls.
2. Start an offline Single Player Match. The board must gain only the new outer Match presentation frame; cells, pitch, pieces and controls must remain in the same places.
3. In that Match, test Move, Pass, Group Move, Free Move, Free Ball and a Bonus Action. Their behavior must be unchanged.
4. Test Undo/Redo and History; verify the presentation does not create History entries.
5. End turns and verify the automatic next-turn flow and Match Over behavior remain unchanged.
6. Create or join an ordinary Manual Multiplayer session. Confirm its board remains on the existing presentation and normal manual use is unchanged. Do not test or alter automated multiplayer behavior.
