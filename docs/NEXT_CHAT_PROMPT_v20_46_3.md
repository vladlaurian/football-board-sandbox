# Continuation prompt — v20.46.3

Continue the Football Board Sandbox from `v20.46.3`.

## Mandatory constraints

- Work only from the attached v20.46.3 ZIP.
- Automated Multiplayer remains frozen. Manual Multiplayer remains unchanged.
- Do not implement before reading relevant documentation and inspecting the exact responsible code.
- No broad audit, refactor, renaming, formatting pass or file movement.
- Each delivered ZIP must have project files directly at ZIP root and exclude `node_modules`, `dist`, `package-lock.json` and `.git`.

## Match presentation correction completed

- `BoardCanvas` no longer creates the synthetic full-cell `def-area-owner-source` rectangle beneath defensive-area owners.
- Single Player Match Presentation no longer renders the legacy rectangular `selected-cell`; Editor and Manual Multiplayer still use their original path.
- The Match ball is the existing simple white circular vector puck, 60% of a cell, opacity 0.86, with no aura node.
- No defensive geometry, calculated area, Engine, MatchState or gameplay rule was changed.

## Mandatory visual verification

1. Inspect GK, CB, RW and other players in Single Player Match: only the circular puck may be visible; no local square under or around it.
2. Select players and the ball: Match must not create a rectangular selected-cell.
3. Check overlapping defensive areas: existing calculated fill remains under covered players, while empty cells retain tactical perimeter lines.
4. Check the ball: white circular puck, 60% of the cell, mildly transparent at 0.86, no aura or rectangular highlight.
5. Confirm Editor Mode and Manual Multiplayer are visually unchanged.

## Verification already required for delivery

- Run `npm test`.
- Run `npm run build` when dependencies are available.
- Do not claim visual success without user-side manual verification or an actual rendered-browser inspection.
