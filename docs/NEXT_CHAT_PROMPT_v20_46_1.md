# Continuation prompt — v20.46.1

Continue the Football Board Sandbox from `v20.46.1`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture and defensive-area presentation

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Manual Multiplayer is frozen legacy compatibility and must remain unchanged.
- `BoardCanvas` has a view-only `presentationMode`: offline Single Player Match supplies `match`; Editor and Manual Multiplayer supply `editor`.
- Match defensive areas retain per-player ownership in presentation: `main.jsx` sends existing calculated cells with `ownerId` and origin coordinates; `BoardCanvas` groups only for drawing each owner's own perimeter. Rules, geometry, legality and MatchState do not change.
- A player's own occupied square is visual fill only. It must never receive a defensive-area box, border or local shadow. Other cells retain each individual area's perimeter.
- `MatchBallIcon` is a fixed conventional football SVG shared by Board and Inspector. Do not replace it with Unicode emoji or a generic abstract symbol.

## Next direction, subject to fresh approval

After verification, close Match presentation work. Return to the agreed architecture/separation roadmap or a separately approved gameplay mechanic. Do not open another visual refinement thread without a concrete user-reported issue and explicit approval.

## v20.46.1 verification

- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.46.1

1. Inspect ball on Board and in Inspector. It must clearly read as a conventional football: white spherical body with black pentagonal patches, centered and symmetric.
2. Display defensive areas. For every player, the square directly under their puck must show team-area fill but no dedicated square border, shadow or outline.
3. Confirm other cells still show each individual player's defensive perimeter, including same-team and Blue/Red overlaps.
4. Test Move, Pass, Undo/Redo and End Turn. No gameplay behavior may change.
5. In Editor Mode and Manual Multiplayer, confirm behavior remains unchanged.
