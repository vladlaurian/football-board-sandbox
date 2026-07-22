# Continuation prompt — v20.46.3

Continue the Football Board Sandbox from `v20.46.3`.

## Mandatory constraints

- Work exclusively from the attached `Final_Board_v20_46_3_match_pucks_no_square.zip` build.
- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete relevant documentation, inspecting the exact responsible code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear approved purpose.
- Each build must be independently testable, update only canonical release documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist`, `package-lock.json` and `.git`, and a complete continuation prompt.

## Current Single Player Match presentation contract

- `BoardCanvas` activates `match-presentation` only for offline Single Player Match. Editor Mode and Manual Multiplayer remain on their previous visual route.
- Every player is only a circular puck. No player wrapper, `has-card`, selected state, Interaction Layer state, Group Move state, pseudo-element, shadow, outline or defensive overlay may expose a rectangular frame around it.
- The square `selected-cell` paint is disabled only in Match presentation; selection feedback remains attached to the circular puck.
- Every player-occupied defensive coordinate is fill-only. It has no local defensive border, outline, seam or shadow, including under overlapping areas.
- Empty defensive cells retain their individual tactical perimeters.
- The Match ball is a plain white circular puck, 60% of a cell, opacity `0.85`, with no football pattern, emoji, aura or rectangular chrome.
- These are presentation rules only. Geometry, defensive calculation, MatchState, Engine, Timeline and legality are unchanged.

## v20.46.3 implementation locations

- `src/board/BoardCanvas.jsx`: existing Match-only defensive ownership and `def-area-player-square` classification; no gameplay changes.
- `src/styles.css`: final `v20.46.3` Match-only isolation block neutralizes wrapper/state chrome, hides Match `selected-cell`, preserves fill-only occupied cells and sets the ball presentation.
- `src/board/MatchBallIcon.jsx`: shared plain vector puck remains unchanged; Match-only size/opacity/aura behavior is controlled by scoped CSS.
- `src/board/extractedComponents.test.mjs`: render assertions plus CSS regression assertions.

## Verification completed for v20.46.3

Run again after any future change:

```bash
npm test
npm run build
```

## Exact manual tests

1. In offline Single Player Match, inspect GK, CB, RW and every other player in normal, selected, card-attached, interaction-active and Group Move states. Each must remain only a circular puck with zero rectangular frame.
2. Inspect players inside one or more overlapping defensive areas. Fill must remain visible beneath the puck, with no local border or square seam around the occupied coordinate.
3. Inspect empty defensive cells. Individual area perimeters must remain visible and tactically readable.
4. Inspect the ball. It must be a small plain white circular puck, approximately 60% of a cell, subtly transparent, with no football pattern, emoji, aura or square.
5. Confirm Editor Mode and Manual Multiplayer visuals are unchanged.
6. Smoke-test Move, Pass, Undo/Redo and End Turn to confirm presentation changes did not alter behavior.
