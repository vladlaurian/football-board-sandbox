# Release Changelog

This is the compact release history. Current architecture and rules are documented in their permanent contracts; it must not be used as a second specification.

## v20.39.0 — Match Presentation Foundation

- Added the explicit `presentationMode` boundary to `BoardCanvas`.
- Activated its Match presentation wrapper only for offline Single Player Match; Editor Mode and the retained Manual Multiplayer path keep the Editor presentation route.
- Added a focused render assertion for the Match presentation class.
- Kept pitch geometry, player/ball appearance, all board input, Engine/Timeline behavior and Firebase paths unchanged. This build creates the stable visual boundary for later 2.5D presentation work.

## v20.38.0 — Phase 8C.2c.2

- Extracted the Card Editor form, Cards Panel/Card Library and Assign Card modal into explicit UI components with controller props.
- Retained every existing Workspace operation, card-library mutation path, browser file action and Manual Multiplayer synchronization at the `main.jsx` controller boundary.
- Added component render coverage for all three UI surfaces, including the Card Editor Front/Back previews and Assign preview.

## v20.37.1 — Card render Back-context correction

- Restored the missing Back-card numeric-text presentation helper in the extracted Canvas context.
- Added a Front-and-Back render regression test to prevent the card-opening crash.

## v20.37.0 — Phase 8C.2c.1

- Extracted the shared visual card renderer, layout interaction presentation, special-text fit and defensive-area preview from `main.jsx`.
- Preserved the existing `CardPreview` presentation contract and all layout-edit callbacks.

## v20.36.0 — Phase 8C.2b

- Added pure structural Card Library planners for save/upsert, clone preparation, deletion with puck detachment and Reset Cards.
- Kept the visual Card Editor, Timeline/History adapter and Manual Multiplayer synchronization unchanged.

## v20.35.0 — Phase 8C.2a

- Added pure structural Workspace planners for board settings, formations, scenarios, Rule Sets and card assignment/removal.
- Kept visual card-editor controls and Manual Multiplayer unchanged.

## v20.34.0 — Phase 8C.1

- Defined `WorkspaceSnapshot` for future-Match setup only.
- Prevented Cloud/backup persistence from restoring partial Match runtime.

## v20.32.0–v20.33.0 — Phase 8A/8B

- Routed remaining offline Match administration and manual placeholder declarations through Engine commands.
- Added the Single Player command gateway and canonical state publication boundary.

## v20.25.0–v20.31.0 — Pass completion

- Migrated offline Single Player Pass start, target, route, interceptor choice, requested dice, deterministic result and all current consequences into the Game Engine.
- Kept the direct goalkeeper target ban approved but pending; goalkeeper route blocking is active.
- Added canonical Extra Roll behavior and History cursor following.

## v20.21.0–v20.24.1 — Bonus Action and Match lifecycle

- Established generic Bonus Action continuation and Engine-owned Bonus MOVE / End B.A.
- Moved phase closure and automatic numbered-turn advancement into the Engine.
- Migrated Match start/restart; Match Over remains presentation-only.

## v20.17.0–v20.20.1 — Movement family

- Migrated 3/2, path blocking, Free Move and Group Move into the offline Single Player Engine.
- Preserved approved differences: Group Move may cross players; Free Move remains administrative and unrestricted.

## v20.12.0–v20.16.0 — Engine foundation

- Created the command-driven Game Engine kernel, MatchContext and Free Ball vertical slice.
- Migrated normal MOVE, including progressive movement and unified card/board entry.

## v20.1–v20.11.6 — legacy Multiplayer history

- Built and corrected the Host Authority, semantic-intent and Interaction Layer approach.
- Automated Multiplayer is now frozen while the Single Player architecture is completed. Detailed historical entries and rejected approaches remain in [`MULTIPLAYER_CHANGELOG.md`](MULTIPLAYER_CHANGELOG.md).
