# Continuation prompt — v20.46.3

Continue the Football Board Sandbox from `v20.46.3`.

## Mandatory constraints

- Read all relevant documentation and inspect the exact render path before implementing anything.
- Do not stop at the first plausible cause. Trace every DOM/CSS layer that can affect the reported visual result.
- Automated Multiplayer remains frozen; Manual Multiplayer and Editor Mode must remain unchanged.
- No refactor, renaming, file movement or unrelated visual changes.

## Implemented Match-only correction

- `BoardCanvas` now derives a Match-only render model from the existing defensive overlays without changing defensive geometry or rules.
- Defensive fill is consolidated once per coordinate. Blue/Red overlap is represented by one contested fill layer.
- Defensive outlines remain per owner but are rendered only on empty cells. An empty outline cell cannot draw a border side toward any player-occupied coordinate.
- The former `def-area-owner-source`, Match `selected-cell`, and `match-ball-aura` elements are not rendered in Single Player Match Presentation.
- Player and ball hitboxes remain interactive but visually transparent.
- The ball remains a 60%-cell premium white puck at its original opaque presentation.

## Required manual verification

1. Check GK, CB, RW and every other puck in Match Mode: no local square, border, outline, background tile or rectangular shadow may surround the puck.
2. Check players under overlapping areas: combined fill remains beneath the puck, with no local contour.
3. Check empty defensive-area cells: each individual area remains tactically readable through its perimeter.
4. Select players and the ball; test possession, card, inactive and Group Move states. No rectangular layer may reappear.
5. Verify the ball is an opaque white puck without aura or square.
6. Verify Editor Mode and Manual Multiplayer are unchanged.
7. Run `npm test` and `npm run build` in an environment where dependencies are installed.
