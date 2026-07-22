# Continuation prompt — v20.45.1

Continue the Football Board Sandbox from `v20.45.1`.

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
- Match defensive overlays are presentation-only. `BoardCanvas` aggregates existing overlay cells by coordinate and uses their Blue/Red coverage only for visual opacity and border hierarchy. It does not change defensive-area calculation, geometry, rules, legality, Engine or Timeline.

## Completed presentation boundary

- Match has premium circular tactical pucks and a circular ball. A player holding the ball has a centered white/silver possession halo; the ball aura is the same family.
- Card action controls retain premium team identity: Blue card controls are Blue, Red card controls are Red, with rounded corners and white text.
- Defensive cells preserve a subtle internal grid seam. Continuous area edges are stronger and brighter; same-team overlap increases fill intensity. There are intentionally no numeric overlap labels.
- Tracker label/weight treatment is Match-only presentation: `Start Game` remains bold, while `Change Possession` matches `Reset Trackers` typography. Existing callback behavior is unchanged.
- This presentation pass is closed by user direction. Do not continue visual refinements unless a new issue is reported and approved. Return next to the agreed architecture/separation audit or an approved gameplay mechanic.

## v20.45.1 verification

- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.45.1

1. Display a defensive area of several cells. Internal cell seams must remain visible but clearly quieter than the strong outside perimeter.
2. Display overlapping same-team defensive areas. The overlap must be stronger in fill, without a louder inner grid or numeric label.
3. Open Blue and Red player cards in Single Player Match. All player action controls must be rounded, white-text, premium Blue or Red according to the selected player.
4. Put the ball on a player. Confirm ball and puck are true circles and the white/silver possession halo is centered and circular. No yellow possession halo may remain.
5. In Tracker, confirm `Start Game` is white and bold, and `Change Possession` matches `Reset Trackers` in normal font weight/size. All three controls must have rounded boxes.
6. Confirm starting or restarting an existing Match still follows the existing behavior despite the `Start Game` label.
7. Test Move, Pass, Group Move, Undo/Redo and End Turn. No gameplay behavior may change.
8. In Editor Mode and Manual Multiplayer, confirm the existing presentation and behavior remain unchanged.
