# Continuation prompt — v20.46.0

Continue the Football Board Sandbox from `v20.46.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture and presentation boundary

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Manual Multiplayer was audited as a frozen hybrid legacy system. Retain its working manual lifecycle and synchronization; do not change it before a separately approved clean-room phase.
- `BoardCanvas` has a view-only `presentationMode`: offline Single Player Match supplies `match`; Editor and frozen Manual Multiplayer supply `editor`.
- Defensive-area calculation remains upstream in `main.jsx` and uses each card's existing player-centric geometry. Match presentation only carries `ownerId` and source coordinates with each calculated cell. It groups cells by owner to draw that one player's perimeter; it does not merge ownership, alter a rule, change legality or write MatchState.

## Completed visual correction

- Each player's defensive area is rendered separately in Match. It keeps a subtle cell grid, a stronger perimeter around that player's own shape and translucent overlap with every other area.
- When a defensive shape does not itself include its player's occupied square, a visual source tile in that team's color anchors the shape to the player. This is a view-only tile.
- The ball is a shared fixed 1:1 SVG, not a browser emoji. Board and Inspector now use the same geometric ball; Match pucks and possession halo remain circular.
- This defensive-clarity correction was approved because it fixes tactical information, not visual polish. Do not reopen general Match presentation work without a new reported issue and explicit approval.

## Next direction, subject to a fresh narrow proposal

After user verification, return to the agreed architecture/separation roadmap or an approved gameplay mechanic. Keep presentation closed unless testing shows that individual defensive ownership is still not readable.

## v20.46.0 verification

- Board render coverage uses player-owned overlapping areas and asserts a source tile plus individual-perimeter variables.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.46.0

1. Turn on defensive areas for two or more players on the same team. Trace each area from its player/source square to its own full outer perimeter; the shapes must no longer collapse into one team-union shape.
2. Use the three Blue defenders case from the reported screenshots. Confirm you can identify each individual Blue shape and where it begins/ends.
3. Create Blue/Red overlap and multiple-player overlap. Confirm Blue and Red remain distinct and every player's own perimeter remains visible; no grey/contested union cell should replace them.
4. Check a player whose card area omits the central/source square. The square under that player must carry the same team-color fill as the rest of their defensive area.
5. Inspect the board ball and the Inspector Match Ball. Both must be a symmetric SVG football with no emoji baseline or upper imbalance. Put ball on a player and confirm the possession halo remains circular and centered.
6. Test Move, Pass, Group Move, Undo/Redo and End Turn. No gameplay behavior may change.
7. In Editor Mode and Manual Multiplayer, confirm defensive-area rendering and behavior remain unchanged.
