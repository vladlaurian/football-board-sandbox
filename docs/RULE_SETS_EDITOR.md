# Rule Sets Editor

## Purpose and availability

The Rule Sets Editor is the visual configuration surface for gameplay rules represented by the Rule Set model. It is available from **Rules → Rule Sets** and can be edited only in **Editor Mode**. Match Mode reads the active saved Rule Set and does not expose live rule editing.

A Rule Set is normalized before use, persisted with project and match state, and locked into the Match Timeline at Match Mode start. Dice remain manual: Rule Sets configure resolution but never roll automatically.

Player stat definitions and values are not owned by Rule Sets. Stats are selected by stable global IDs from the global back-card schema; each card supplies its individual numeric value. `Show` affects rendering only.

## v20 action configuration

Rule Set schema version 5 configures common Dice Modifiers plus:

```text
Pass → geometry and pass classification
Interception → roll statistic and mathematical resolution
Group Move → zone and coordinated movement limits
```

This separation is documented in [`INTERCEPTION_ENGINE.md`](INTERCEPTION_ENGINE.md).

## Dice Modifiers

The shared Rule Set `diceModifiers` section defines Advantage, Major Advantage, Disadvantage, Major Disadvantage and the symmetric stack cap. Any dice modifier source is semantic and resolves its number from this frozen section. Advantage values are always non-negative; Disadvantage values are always non-positive.

For Pass, a non-preferred foot is a **Disadvantage on the passer’s execution**. Pass has no own roll, so the contested Interception roll receives one semantic **Advantage** for the defender, with the cause retained as the passer’s execution disadvantage. The compact origin badge therefore displays the execution effect (`LF 0` or `RF −value`) using the frozen Disadvantage value; the defender roll prompt displays the separately resolved Advantage value. Current Interception sources are progressive order (one Advantage stack per prior interceptor), this transferred execution effect, and each prior Natural 1 (one Disadvantage stack). The final sum, including the defender stat, is clamped by the shared cap.

## Group Move settings

Group Move is available only as the final normal action of the active team. Pressing it opens a temporary full-width zone preview, positioned by dragging the band; only confirming that zone consumes the action and freezes its Rule Set values in the MatchContext. After confirmation the band disappears, while eligible candidates are highlighted and ineligible candidates inside the frozen zone show a grey outline and lock.

### Maximum Players

The maximum number of different eligible players that may make one Group Move segment. Default: `4`.

### Zone Length

The longitudinal length of the full-width zone selected on the board before confirmation. Default: `10` squares.

### Maximum Distance per Player

The maximum one-segment distance for each chosen player. Card Speed is not used. Default: `6` squares.

### Same Direction as First Move

When enabled, every player must use the exact direction chosen by the first successful Group Move segment. When disabled, reverse movement on the same horizontal, vertical, or exact diagonal axis is allowed. Default: enabled.

Group Move may cross players deliberately, but cannot finish on a player or the ball.

## Pass settings

### Path Geometry

Options:

- **Corner → Center**
- **Center → Center**

This setting determines pass origin, route, traversed cells, defensive-area intersections, eligible interceptors, and corner-selection flow.

### Long Pass Threshold

The pass is classified as Long Pass only when measured distance is strictly greater than the configured threshold.

A separate Long Pass gameplay rule is not implemented in v20. Classified Long Passes still use the current normal route and Passing target while the profile architecture is built in the next stage.

### Resolution Delay

Controls the delay between a manual die result and visible deterministic resolution. The current delayed-resolution execution path enforces a minimum effective delay of 2000 ms; values above 2000 ms apply as configured.

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

Rule Set schema version 2 stored `modifierCap` and `equalRollOutcome` under Pass. Schema version 3 migrated those values into the Interception action automatically. Schema version 4 adds Group Move settings; older Rule Sets receive the approved Group Move defaults automatically.

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
