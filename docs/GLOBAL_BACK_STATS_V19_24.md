# v19.24 — Global Back-Card Stats

## Data model

- `cardState.backStatsSchema` is the authoritative definition/order registry for back-card Attributes and Bonuses.
- Every definition has a stable ID and display name.
- Card lists remain materialized for backward-compatible exports, timelines and gameplay snapshots.
- Per-card data is limited to `value` and `showOnCard`.

## Migration

- Before first migration, the previous local library is copied to:
  `football-board-player-cards-v1-pre-global-stats-v1`.
- Migration validates identical stat names/order and identical Attributes/Bonuses presentation across cards.
- If validation fails, no card is materialized into the new schema and an explicit warning is shown.
- Existing values and Show states are preserved. Missing entries default to value `10`, Show `true`.

## Editor behavior

Global across all cards:
- Add, rename, delete and order of Attributes/Bonuses.
- Titles, colors, fonts, text sizing/alignment/spacing.
- Back layout position and size for Attributes/Bonuses.
- Delete/Paste Layout actions targeting those two back zones.

Per card:
- Numeric value.
- Show checkbox.
- Preferred Foot, Defensive Area and Special Ability.

## Removed

- Attributes Front and Bonuses Front data/editing paths.
- Duplicate Content, duplicate blocks, duplicate buttons and custom-zone content attachment.
- Custom layout zones remain as empty positionable containers.
- The front `attributes` layout key is retained internally because it is the active Stars zone.

## Gameplay and export

- Pass and Interception now request stable IDs (`stat:passing`, `stat:interception`).
- Legacy name lookup remains for old recordings/imports.
- Inspector and PNG export continue through the same `CardPreview`/Stars renderer.
