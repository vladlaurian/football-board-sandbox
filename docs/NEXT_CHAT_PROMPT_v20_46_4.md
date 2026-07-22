# Continuation prompt — v20.46.4

Continue the Football Board Sandbox from `v20.46.4`.

## Mandatory constraints

- Read all relevant documentation and inspect the exact render path before implementing anything.
- Do not stop at the first plausible cause. Trace every DOM/CSS layer that can affect the reported visual result.
- Automated Multiplayer remains frozen; Manual Multiplayer and Editor Mode must remain unchanged.
- No refactor, renaming, file movement or unrelated visual changes.

## Current Match-only defensive presentation

- `BoardCanvas` derives a Match-only render model from the existing defensive overlays without changing defensive geometry or rules.
- Player-occupied coordinates receive defensive fill but no local defensive outline.
- Defensive outlines remain per owner and are rendered only by empty area cells. Their perimeter is allowed to finish normally beside an occupied coordinate, so area boundary lines do not break near a puck.
- Blue/Red intersections use two translucent team fill layers on the same coordinate. They blend naturally; there is no diagonal contested-cell graphic.
- The former `def-area-owner-source`, Match `selected-cell`, and `match-ball-aura` elements are not rendered in Single Player Match Presentation.
- Player and ball hitboxes remain interactive but visually transparent.
- The ball remains a 60%-cell premium white puck at its original opaque presentation.

## Required manual verification

1. Check GK, CB, RW and every other puck in Match Mode: no local square, border, outline, background tile or rectangular shadow may surround the puck.
2. Check Blue/Red area intersections: overlapping cells must look like the former natural color blend, without diagonal splitting.
3. Check an area perimeter that reaches a cell beside a player: its boundary line must remain continuous and finish normally.
4. Check player-occupied cells: fill remains beneath the puck, but the occupied cell itself has no local defensive outline.
5. Select players and the ball; test possession, card, inactive and Group Move states. No rectangular layer may reappear.
6. Verify Editor Mode and Manual Multiplayer are unchanged.
7. Run `npm test` and `npm run build` in an environment where dependencies are installed.
