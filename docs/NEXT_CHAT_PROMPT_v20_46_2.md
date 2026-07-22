# Continuation prompt — v20.46.2

Continue the Football Board Sandbox from `v20.46.2`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current defensive-area presentation rule

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. Manual Multiplayer is frozen and must remain unchanged.
- `BoardCanvas` Match presentation renders each player's defensive shape independently from existing calculated card-area cells; it does not change rules, geometry, legality or MatchState.
- Absolute visual rule: every player-occupied board square has defensive fill underneath but never a defensive border, outline, seam or shadow around it. This applies whether the fill comes from that player's own area or an overlapping area. The puck sits directly on colored area, as if on the surface.
- Other non-player squares retain each individual defensive shape's perimeter. The ball is deliberately a simple premium white puck, with no emoji or football pattern.

## Next direction

After user verification, close Match presentation work and return to the agreed architecture/separation roadmap or a separately approved gameplay mechanic. Do not reopen visual work without a concrete reported issue and explicit approval.

## v20.46.2 verification

- Board render coverage includes a player coordinate within a defensive area and asserts the player-square visual class.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.46.2

1. Inspect GK, CBs and any other player covered by defensive areas. There must be no square, border, inner seam or outline around the puck; only the team's translucent area fill appears below it.
2. Place or display overlapping Blue/Red areas under a player. The same no-border rule must still hold.
3. Confirm non-player squares still show individual defensive-area perimeters.
4. Confirm the ball is only a clean premium white puck.
5. Test Move, Pass, Undo/Redo, End Turn, Editor and Manual Multiplayer behavior.
