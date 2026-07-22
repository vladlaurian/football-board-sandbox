# Continuation prompt — v20.45.0

Continue the Football Board Sandbox from `v20.45.0`.

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
- The `match-ui-presentation` app class is offline Single Player Match only. It is a CSS presentation route for existing panels and card controls; it must not own their state, layout controls or callbacks.
- Match defensive overlays are presentation-only. `BoardCanvas` aggregates the existing overlay cells per coordinate, retains Blue/Red coverage counts for opacity, and does not change defensive-area calculation, rules, geometry or legality. This first clarity pass intentionally uses no numeric coverage labels.

## Current visual state

- Match uses premium tactical pucks; the ball is opaque and possession has a white/silver halo.
- Normal selection is Blue, true Red or neutral-white; the legacy yellow possession treatment is removed from Match presentation.
- Tracker turns visually distinguish completed, current and future states. Card action controls follow the Match dark-glass route.
- Defensive cells retain a subtle individual border. Stronger exterior borders preserve each continuous same-team area, and increasing coverage makes Blue/Red cells visibly stronger. Blue/Red contested cells retain both colors.
- Editor and Manual Multiplayer stay on their existing visual route.

## Next direction, subject to a fresh narrow proposal

Collect user feedback from real Match play on defensive-overlay readability. If color intensity alone is not sufficient, propose one small visual-only option for overlap labels or another visual aid; do not add it without approval. Otherwise, return to the agreed architecture/separation roadmap or a separately approved gameplay mechanic. Do not assume a new scope.

## v20.45.0 verification

- `BoardCanvas` render coverage includes same-team overlap aggregation and its visual coverage variable.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.45.0

1. In Single Player Match, inspect Tracker turns: completed turns, the current turn and unplayed turns must be clearly different. Confirm the Tracker behavior is unchanged.
2. Select several player cards and check their action buttons (including team actions, Free tools, status and turn controls). They must use the Match premium glass style and retain their existing enabled/disabled behavior.
3. Put the ball on a player. Confirm the player has a white/silver possession halo only—no yellow outline remains. Confirm normal Blue/Red selection still works.
4. Select a Red player. Its puck and selection highlight must read as red, not pink.
5. Display defensive areas for multiple players of the same team. Every covered square must retain a subtle cell outline; the outer boundary must be stronger; squares shared by two or more same-team areas must be visibly stronger. There are no numbers in this build.
6. Display Blue/Red defensive overlap. Confirm both colors remain visible and the overlap remains readable.
7. Test a normal Move, Pass preview, Group Move, Undo/Redo and End Turn. No gameplay behavior may change.
8. In Editor Mode and Manual Multiplayer, confirm the existing presentation and manual behavior remain unchanged.
