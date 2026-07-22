# Release Changelog

This is the compact release history. Current architecture and rules are documented in their permanent contracts; it must not be used as a second specification.

## v20.46.4 — Match overlap blend and closed contours

- Preserved the v20.46.3 Match-only fill/outline separation and puck cleanup.
- Replaced the artificial diagonal contested-cell treatment with separate Blue and Red translucent fill layers on shared coordinates, restoring the natural overlap appearance.
- Restored complete per-area perimeter edges beside occupied coordinates; player-occupied cells themselves still render no local defensive outline.
- Kept Engine, MatchState, defensive geometry, Editor Mode and Manual Multiplayer unchanged.

## v20.46.3 — Match occupied-square render cleanup

- Replaced the Match-only defensive-area DOM path with separate combined-fill and per-owner outline layers derived from the existing calculated overlays.
- Removed Match rendering of the owner-source tile, selected-cell tile and ball aura instead of hiding them through additional overrides.
- Player-occupied coordinates now receive combined defensive fill only; outline cells are rendered only on empty coordinates and cannot draw a side toward an occupied coordinate.
- Kept player hitboxes transparent, restored the Match ball to its original opaque presentation, and preserved Editor Mode, Manual Multiplayer, Engine, MatchState and defensive geometry.

## v20.46.2 — Player Area Underlay

- Made defensive presentation treat every player-occupied board square as fill-only: no defensive perimeter, inner seam, border or shadow may surround a puck, even when another area overlaps that square.
- Simplified the ball to a premium white puck with no football pattern.
- Preserved individual defensive-area ownership/perimeters elsewhere, gameplay rules, Engine, Timeline, Editor and Manual Multiplayer behavior.

## v20.46.1 — Ball & Owner-Square Correction

- Replaced the abstract vector mark with a conventional white spherical football and black pentagon patches; it remains a fixed-ratio shared SVG for Board and Inspector.
- Removed all local border/shadow treatment from an owner's defensive source square, including when that square is part of the card's own defensive shape. The player now sits directly on team-colored defensive fill.
- Preserved individual defensive-area perimeters, gameplay rules, Engine, Timeline, Editor and Manual Multiplayer behavior.

## v20.46.0 — Individual Defensive Areas

- Replaced the Match-only defensive-overlay aggregation by team/coordinate with player-owned presentation areas. Each player's defensive shape now retains its own perimeter when it overlaps a teammate or opponent.
- Added a visual source tile beneath a player whenever their card's defensive shape does not already include their occupied square; it is presentation-only and does not alter defensive-area rules.
- Replaced the Unicode football glyph with one shared fixed-ratio SVG ball so board and Inspector rendering are geometrically centered and browser-font independent.
- Preserved Editor rendering, defensive-area rule calculation, Engine, Timeline, AI export and Manual Multiplayer behavior.

## v20.45.1 — Final Match Presentation Correction

- Restored premium team-colored Blue/Red card controls with rounded corners; action controls remain in their established team family instead of a neutral glass override.
- Corrected Match pucks and ball to true circular geometry, so the possession halo is centered and circular; the ball aura uses the same white/silver family.
- Made defensive cell seams deliberately more subdued than continuous outside-area edges while retaining intensity by same-team coverage and without numeric labels.
- Changed the Tracker label to `Start Game`, kept its existing bold treatment, and aligned `Change Possession` with `Reset Trackers` typography. These are visual/label changes only; existing callbacks and behavior are unchanged.

## v20.45.0 — Match Tactical Clarity

- Made Match Tracker turns clearly distinguish completed, current and upcoming states without changing turn state or controls.
- Applied the existing Match glass treatment to card action controls, replaced the possession yellow with a white/silver halo, and shifted Red puck/selection tones away from pink.
- Kept every defensive cell visible in Match presentation, restored stronger continuous outer edges, and scales Blue/Red overlay intensity from the already-calculated number of same-team defensive areas covering each cell.
- Deliberately adds no numeric coverage labels, rule changes, Engine changes, Timeline changes, Editor changes or Manual Multiplayer changes.

## v20.44.0 — Premium Match UI & Team Highlights

- Restored the ball to an opaque premium token and removed Match-only held-ball transparency.
- Added Match-only Blue/Red/neutral selected-team classes to the Board presentation wrapper; normal selection no longer uses the legacy yellow treatment.
- Added a Match-only dark-glass presentation route for Tracker, Dice, History, Match Over/turn prompts, dice notices and active action prompts.
- Preserved every panel's structure, positioning, controls, state and function. Editor and Manual Multiplayer remain on their prior visual route.

## v20.43.0 — Premium tactical pucks and defensive-area clarity

- Replaced Match-only CSS player figures with premium tactical pucks in the existing piece elements; position labels, hitboxes and state classes remain unchanged.
- Deduplicated defensive-overlay cells only for Match presentation, draws only continuous-region outside edges, and gives Blue/Red overlap a distinct neutral contested-cell treatment.
- Retained the previous Editor and Manual Multiplayer rendering path without changing defensive-area rule calculation.
- Extended BoardCanvas render coverage for the Match defensive-area aggregation and contested cells.

## v20.42.0 — Match Interaction Feedback & Defensive Areas

- Added Match-only glass-like styling to the existing selection, movement legality, axis/cost badge, Pass route and Group Move feedback classes.
- Added Match-only translucent Blue/Red defensive-area overlays with restrained borders so the grass and grid remain visible.
- Added no state, command, geometry, DOM interaction or rules change. Editor Mode and Manual Multiplayer retain the prior visual route.

## v20.41.1 — Match piece scale and possession clarity

- Enlarged only the Match-only tactical figure drawing from 84% to 94% of its existing logical cell; the player hitbox remains unchanged.
- Added the Match-only `ball-held` presentation class from the existing ball/player coordinate overlap and renders that ball at partial opacity.
- Kept Editor, Manual Multiplayer, Engine, Timeline, rules and all interaction ordering unchanged.

## v20.41.0 — Match Pieces 2.5D

- Added Match-only CSS tactical figures inside the existing player piece elements, with team kit, silhouette, shadow and readable label treatment.
- Added Match-only ball aura and visual possession emphasis derived from the already-rendered ball/player coordinate overlap.
- Kept the existing piece positions, hitboxes, labels, selection, inactive and Group Move state classes authoritative.
- Extended BoardCanvas render coverage for the figure, ball aura and possession class. Editor Mode and Manual Multiplayer remain unchanged.

## v20.40.0 — Match Pitch & Venue

- Added a Match-only procedural grass, lighting and venue treatment on the existing `match-presentation` boundary.
- Kept the first two pitch background layers as the existing logical square grid at the same cell geometry.
- Increased Match-only field/goal contrast without changing DOM layers, hitboxes, piece rendering or game behavior.
- Editor Mode and Manual Multiplayer remain on the prior presentation route.

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
