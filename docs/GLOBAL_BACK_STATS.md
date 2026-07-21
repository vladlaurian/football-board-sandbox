# v19.24 — Global Back-Card Stats

## Purpose

Attributes and Bonuses displayed on the back of player cards now share one authoritative global structure. This removes structural drift between cards while preserving the two properties that legitimately differ from player to player: the numeric value and whether the stat is shown on that card.

This document is the permanent technical reference for the v19.24 card-stat architecture.

## Source of truth and data ownership

`cardState.backStatsSchema` is the authoritative registry for back-card Attributes and Bonuses. It owns:

- which stats exist;
- each stat's stable ID;
- display name;
- section: Attribute or Bonus;
- order;
- shared titles and visual presentation;
- shared back-zone layout for Attributes and Bonuses.

Each card owns only:

- `value`;
- `showOnCard`.

The card lists may remain materialized in compatibility projections used by old exports, Timeline snapshots, imports, or gameplay records, but they are not a second authoring source of truth. They must be derived from the global schema plus the card's individual values.

`showOnCard` is presentation state only. A stat with Show set to Off still keeps its numeric gameplay value and remains available to the rule engine.

## Global editor operations

The following operations apply to every card because they modify the global schema:

- add an Attribute or Bonus;
- rename;
- move up or down;
- delete;
- change section titles;
- change colors, fonts, font sizes, alignment, or spacing;
- change the position or size of the back Attributes/Bonuses zones;
- paste/apply layout actions that target either global back-stat zone.

Delete is destructive and requires explicit confirmation. Once confirmed, the stat definition and the corresponding per-card value/Show entry are removed from every card.

## Adding a new Attribute or Bonus

Adding a stat is always global. The application creates the new stat on every existing card and initializes it with:

- `Value = 10`;
- `Show = On`.

Every card created later also receives the complete current global schema with the same defaults for any newly initialized stat. After creation, only Value and Show may be edited independently on each card.

A new stat must never exist on only the currently selected card.

## Properties that remain individual per card

The following are not globalized by this architecture:

- numeric Attribute values;
- numeric Bonus values;
- Show state for each Attribute and Bonus;
- Preferred Foot;
- Defensive Area;
- Special Ability;
- player identity, position, image, Stars, and other player-specific content.

## Migration and safety

Before the first migration, the previous local card library is copied to:

`football-board-player-cards-v1-pre-global-stats-v1`

The migration validates that existing cards have:

- identical Attribute names and order;
- identical Bonus names and order;
- identical shared presentation for the back Attributes and Bonuses zones.

Value and Show differences are expected and ignored by structural validation. Existing values and Show states must be preserved exactly. If an entry is legitimately missing during a compatible migration, it defaults to `Value = 10`, `Show = On`.

If validation fails, the migration must stop before applying the new schema and identify the inconsistent cards rather than silently overwriting data.

## Gameplay lookup and stable IDs

Pass and Interception request values through stable global stat IDs, including:

- `stat:passing`;
- `stat:interception`.

The gameplay accessor resolves the stat definition from the global schema and the numeric value from the relevant card. Display names are not the permanent gameplay contract, so a future label change must not break Pass or Interception.

Legacy display-name lookup remains only as a compatibility path for old recordings, imports, and materialized card snapshots. New gameplay code should use stable IDs.

## Removed legacy systems

The following were removed from active editing, rendering, and new saved data:

- Attributes Front;
- Bonuses Front;
- `frontAttributeFields`;
- `frontBonusFields`;
- Duplicate Content;
- duplicate blocks;
- all Duplicate buttons;
- duplicate-content attachment to Custom Layout Zones.

Old imported data containing removed fields may be ignored during normalization so it does not break import, but those fields are not restored as active functionality or written into the new format.

## Stars and front-layout compatibility

The current Stars system is independent from the removed Attributes Front and Bonuses Front data. Stars continue to use `starsFront` and their dedicated renderer.

For saved-layout compatibility, the existing internal front-layout key historically named `attributes` is retained because it currently positions the Stars zone. Its legacy name does not mean front Attributes still exist. Removing or renaming that key without a dedicated layout migration could move or lose saved Stars placement.

## Layout Zones

Custom Layout Zones remain available as empty movable and resizable containers. Their old ability to receive Duplicate Content is removed.

The existing Apply/Copy Layout behavior remains available for individual card zones. Back Attributes and Bonuses no longer need per-card cloning because their layout and presentation are already global.

## Inspector and exports

Editor, Inspector, and PNG export continue to use the shared `CardPreview` rendering path. Therefore:

- Stars remain visible and positioned consistently;
- Attributes/Bonuses back rendering uses the global schema plus per-card Value/Show;
- removed front stats and Duplicate Content do not create alternate rendering paths;
- Inspector and PNG export remain visually aligned with the editor.

Gameplay/AI export projections must materialize the values needed by Match Mode from the same schema-plus-card-value source. Front stats, Duplicate Content, and Stars are not gameplay-stat sources.
