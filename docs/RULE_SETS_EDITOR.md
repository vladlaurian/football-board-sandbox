# Rule Sets Editor

The player-facing rules controlled by these values are documented separately:
[`PASS_AND_INTERCEPTION_RULES.md`](PASS_AND_INTERCEPTION_RULES.md),
[`THROUGH_BALL_RULES.md`](THROUGH_BALL_RULES.md) and
[`LOFTED_THROUGH_BALL_RULES.md`](LOFTED_THROUGH_BALL_RULES.md). This document
owns only Rule Set availability, normalization and editor behavior.

## Purpose and availability

The Rule Sets Editor is the visual configuration surface for gameplay rules represented by the Rule Set model. It is available from **Rules → Rule Sets** and can be edited only in **Editor Mode**. Match Mode reads the active saved Rule Set and does not expose live rule editing.

A Rule Set is normalized before use, persisted with project and match state, and locked into the Match Timeline at Match Mode start. Dice remain manual: Rule Sets configure resolution but never roll automatically.

Player stat definitions and values are not owned by Rule Sets. Stats are selected by stable global IDs from the global back-card schema; each card supplies its individual numeric value. `Show` affects rendering only.

## v20 action configuration

### v20.54.0 — Through Ball and triggered 3/2

Schema v11 adds `actions.throughBall.maxDistance` (default `16`) and `actions.threeTwo.allowMovementAfterPriorMove` (default `false`). Old Rule Sets normalize these fields to their defaults, so existing saved sets remain valid. Both are frozen in `MatchContext` at Match start. Through Ball itself uses the existing Pass path geometry setting; that geometry changes the physical corner route, never the centre-to-centre range measurement.

Rule Set schema version 8 configures common Dice Modifiers plus:

```text
Pass → geometry and pass classification
Interception → roll statistic and mathematical resolution
Group Move → zone and coordinated movement limits
```

This separation is documented in [`INTERCEPTION_ENGINE.md`](INTERCEPTION_ENGINE.md).

## Dice Modifiers

The shared Rule Set `diceModifiers` section defines Advantage, Major Advantage, Disadvantage, Major Disadvantage and the symmetric stack cap. Any dice modifier source is semantic and resolves its number from this frozen section. Advantage values are always non-negative; Disadvantage values are always non-positive.

For Pass, the origin foot is evaluated from the passer standing at the centre of their square and facing the pass destination: the origin on their left uses Left Foot; the origin on their right uses Right Foot. A non-preferred foot is a **Disadvantage on the passer’s execution**. Pass has no own roll, so the contested Interception roll receives one semantic **Advantage** for the defender, with the cause retained as the passer’s execution disadvantage. The compact origin badge therefore displays the execution effect (`LF 0` or `RF −value`) using the frozen Disadvantage value; the defender roll prompt displays the separately resolved Advantage value. Current Interception sources are progressive order (one Advantage stack per prior interceptor), this transferred execution effect, and each prior Natural 1 (one Disadvantage stack). The final sum, including the defender stat, is clamped by the shared cap.

An earned AV/AVM is a one-roll opportunity, not a permanent statistic. Its availability/expiry is canonical MatchState, never a Rule Set UI calculation. A current-turn token gained inside a Bonus Action that advances play is available in the resumed numbered turn; it is not lost merely because the Bonus Action closes.

## Group Move settings

Group Move is available only as the final normal action of the active team. Pressing it first requests an official offline Match projection of the same Engine command later used to confirm the zone; it supplies availability, frozen zone length, centred default start and drag boundary. The temporary full-width zone preview may then be positioned by dragging the band; only confirming that zone consumes the action and freezes its Rule Set values in the MatchContext. After confirmation the band disappears, while eligible candidates are highlighted and ineligible candidates inside the frozen zone show a grey outline and lock.

### Maximum Players

The maximum number of different eligible players that may make one Group Move segment. Default: `4`.

### Zone Length

The longitudinal length of the full-width zone selected on the board before confirmation. Default: `10` squares.

### Maximum Orthogonal Distance per Player

The maximum one-segment horizontal or vertical distance for each chosen player. Card Speed is not used. Default: `6` squares.

### Maximum Diagonal Distance per Player

The maximum one-segment exact diagonal distance for each chosen player. Card Speed is not used. Default: `4` squares.

The Engine classifies the actual Group Move geometry first, chooses exactly one of these frozen limits, then returns that limit with its official destination projection. The UI does not choose a limit or calculate one itself.

### Same Direction as First Move

When enabled, every player must use the exact direction chosen by the first successful Group Move segment. When disabled, reverse movement on the same horizontal, vertical, or exact diagonal axis is allowed. Default: enabled.

Group Move may cross players deliberately, but cannot finish on a player or the ball.

## Pass settings

### Path Geometry

Options:

- **Corner → Center**
- **Center → Center**

This setting determines the execution origin, route, traversed cells, defensive-area intersections, eligible interceptors, and corner-selection flow. It never changes the measured distance: all pass classification is centre-to-centre.

#### Pass coordinate contract

Pass has two deliberately separate coordinate meanings:

- **body / board position:** the centre of the passer's square. This is the sole reference for distance, Short/Long classification, maximum range, and whether the passer or receiver occupies a defensive area;
- **execution trajectory:** the selected corner of the passer's square. It selects the foot, sets the pass line and determines physical route contact.

The selected corner never changes a player's board position or range. It can change the line, because Left and Right Foot are different physical execution angles.

In offline Match, a corner is unavailable when any active player body occupies one of the three neighbouring cells sharing that corner. Team does not matter: a teammate can physically obstruct the selected foot exactly as an opponent can. The adjacent body is a blocked origin, not an automatic receiver/interceptor. This corner rule applies to every future corner-origin execution mechanic; Manual Multiplayer retains its historical behavior.

### Long Pass Threshold

The pass is classified as Long Pass only when centre-to-centre distance is strictly greater than the configured whole-square threshold. The default is `16`.

`≤ threshold` is Short Pass; `> threshold` is Long Pass. Both require an active outfield player as target; a goalkeeper is not a direct target.

### Maximum Pass Distance

No Pass may exceed this whole-square centre-to-centre distance. The default is `32`, and the value cannot be lower than the Long Pass threshold. A farther selected target produces a canonical blocked preview with the maximum-distance reason; it consumes no action and cannot be confirmed. The editor accepts temporary empty text while a value is being replaced, but normalizes on blur/save; saved Rule Sets never contain an empty or fractional pass limit.

### Invalid target preview

Selecting an empty square or goalkeeper in offline Match does not relax that rule. The Engine records a blocked Pass preview with the canonical reason, so the board can show every trajectory and origin badge in grey. No Tracker action is consumed and route confirmation remains rejected until the player selects an active outfield target.

Offline Short Pass also requires one full board cell between passer and requested target. The target cell may not share either a side or a corner with the passer's cell; this applies regardless of the target occupant's team. It is a permanent Engine legality rule, not a Rule Set setting, and prevents an adjacent diagonal pair from creating a corner-only route with no traversed board cell. Manual Multiplayer retains its historical targeting rule.

Short Pass retains the ground route: bodies and goalkeeper route blocking use the established route semantics. Its attacker target is the stable `stat:passing` value, whose visible global name may be renamed to **Short Pass**.

Long Pass is aerial. It ignores defensive areas and bodies in the middle of the route. A player body matters only in the launch/landing neighbourhood when the actual selected-corner-to-target-centre trajectory touches that body cell, including edge/corner contact; merely being adjacent does not matter. A launch-adjacent body instead disables the shared execution corner before route confirmation. The first remaining such body is the direct contact: an opponent intercepts directly and a teammate receives directly.

Long Pass checks its origin reaction group first and its destination reaction group second. The origin group can contain only a defender whose defensive area contains the passer's occupied cell; the destination group can contain only a defender whose defensive area contains the receiver's occupied cell. For each activated defender, the actual selected-corner route is then checked against **every** defensive-area cell physically crossed by that route. Each crossed cell is tested separately using the Short Pass visibility rule: the defender must have a clear centre-to-centre line to that cell, and any attacking body blocks only when that line actually crosses its occupied cell. A blocked cell does not remove another clear crossed cell for the same defender. This applies symmetrically at passer and receiver; no defender is activated merely because its area is crossed in the aerial middle. Both groups are one progressive Interception sequence; stacks and carried Natural-1 disadvantage do not restart at reception.

### Long Pass Attacker Statistic

Long Pass always uses the global statistic named `Long Pass`. It is not an editable Rule Set choice. MatchContext resolves its stable ID once at Match start, so later visible changes cannot alter the frozen Match.

### Resolution Delay

Offline Single Player has no artificial post-roll hold. It retains only the
visible 800 ms Dice animation, then submits the canonical result immediately.
The retained Rule Set timing field belongs only to the frozen Manual
Multiplayer compatibility path.

## Interception settings

### Defender Roll Statistic

Selects the defender statistic read for every eligible interception attempt. The selector is populated from the global back-card Attributes and Bonuses schema.

Default:

```text
Interception (`stat:interception`)
```

The stable ID remains authoritative if the display name is changed.

### Use Standard Modifiers

When enabled, the current standard contextual modifiers participate in the roll:

- the current preferred-foot modifier;
- the carried penalty created by a previous Natural 1 in the same interception sequence.

When disabled, those sources contribute zero. The defender statistic, Natural 1, and Natural 20 remain active.

### Use Progressive Interceptor Bonus

When enabled, ordered interceptors receive the existing progressive bonus:

```text
+0, +1, +2, ... up to the configured cap
```

When disabled, every interceptor receives `+0` from order. Eligibility and defender-choice ordering remain unchanged.

### Maximum Total Modifier

Displayed as a symmetric value such as **±4**.

After all enabled positive and negative sources are summed, the combined modifier is clamped to:

```text
-X ... +X
```

A configured value of `0` is valid and disables all numerical modifier contribution without disabling the interception roll itself.

### Equal Total Outcome

Controls the result when:

```text
D20 + final modifier == attacker target value
```

Options:

- **Pass continues** — preserves the historical strict-greater-than rule.
- **Interception succeeds** — equality is sufficient for interception.

Natural 1 and Natural 20 override this setting.

## Migration from earlier Rule Sets

Rule Set schema version 2 stored `modifierCap` and `equalRollOutcome` under Pass. Schema version 3 migrated those values into the Interception action automatically. Schema version 4 added Group Move settings. Schema version 6 replaces its former single `maxDistance` with `maxOrthogonalDistance` and `maxDiagonalDistance`. Schema version 7 made the approved Short/Long target policy explicit. Schema version 8 removes the Long Pass attacker-stat and Interception-modifier UI variants: offline Match resolves the stable global `Long Pass` ID and keeps standard/progressive modifiers active. Schema version 9 adds maximum Pass distance, defaulting older Rule Sets to `32`. Schema version 10 normalizes pass thresholds and maximum distance to whole squares. A saved Rule Set that has the former single Group Move value migrates it into both values, preserving its existing behavior; Rule Sets with no Group Move setting receive the approved `6` orthogonal / `4` diagonal defaults automatically.

Migration defaults preserve v19.x behavior:

- Defender statistic: Interception.
- Standard modifiers: On.
- Progressive bonus: On.
- Equal total: Pass continues.
- Existing modifier cap retained.

## Saving, loading, and duplication

New, Duplicate, Load, and Save Rule Set operate on Pass, Interception, and Group Move sections. The normalized schema is stored in project state, multiplayer Match state, recordings, replay state, and AI Analysis Rule Set snapshots.

## v20 testing contract

Manual verification must cover:

- an old Rule Set opens with the same effective settings;
- Interception settings save, load, and duplicate;
- selecting a different defender statistic changes the value used in the roll;
- standard modifiers and progressive bonus can be disabled independently;
- equality follows the selected outcome;
- Natural 1 and Natural 20 remain unchanged;
- Pass geometry and Long Pass classification remain unchanged.
