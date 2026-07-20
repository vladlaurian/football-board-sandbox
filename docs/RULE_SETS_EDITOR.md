# Rule Sets Editor

## Purpose and availability

The Rule Sets Editor is the visual configuration surface for gameplay rules that are already represented by the Rule Set model. It is available from **Rules → Rule Sets** and can be edited only in **Editor Mode**. Match Mode reads the active saved Rule Set; it does not expose live rule editing.

A Rule Set is normalized before use, persisted with the project state, and used by the Pass and interception flow. Dice remain manual: Rule Sets may configure resolution rules, but they never roll automatically for a player.

The Rule Set defines resolution parameters; it does not own player stat definitions or values. Since v19.24, Pass and Interception obtain player stats through stable IDs in the global back-card stat schema and then read the relevant card's individual numeric value. The Show flag affects card rendering only and never suppresses a gameplay value. See [`GLOBAL_BACK_STATS_V19_24.md`](GLOBAL_BACK_STATS_V19_24.md).

## Pass settings

### Path Geometry

Options:

- **Corner → Center**
- **Center → Center**

This setting changes the real pass geometry. It determines the pass origin, route, traversed cells, defensive-area intersections, eligible interceptors, and the corner-selection flow.

### Long Pass Threshold

The pass is classified as Long Pass only when its measured distance is **strictly greater than** the configured threshold.

This classification is exported to preview, Timeline, and AI Analysis. A separate Long Pass gameplay engine is not implemented yet, so a classified Long Pass currently resolves through the normal Passing engine.

### Maximum Total Modifier

The editor displays this setting as a symmetric value, for example **±4**.

The configured number has two connected effects:

1. The progressive interceptor-order bonus is capped at the positive value:
   - `+0, +1, +2, ... +X, +X ...`
2. After all positive and negative modifier sources are summed, the final total modifier is clamped symmetrically to:
   - `-X ... +X`

For a setting of **±4**:

- raw `+7` becomes `+4`
- raw `+3` remains `+3`
- raw `-2` remains `-2`
- raw `-6` becomes `-4`

A configured value of `0` is valid. It produces a progressive order bonus of `+0` and clamps the final total modifier to `0`; it must not fall back to the default value `4`.

### Resolution Delay

This value controls the delay, in milliseconds, between a manual die result and the visible resolution of the action. The current delayed-resolution execution path enforces a minimum effective delay of 2000 ms; values above 2000 ms are applied as configured.

## v19.23 changes

- Renamed **Maximum stacked modifier** to **Maximum total modifier**.
- Added the visible `±` prefix so the symmetric cap is explicit in the editor.
- Preserved `0` consistently through Rule Set normalization, pass-plan construction, interceptor reordering, and interception resolution.
- Confirmed that the final modifier is clamped symmetrically to `-X ... +X`.
- Kept the progressive interceptor-order bonus positive and capped at `+X`.
- Added regression coverage for zero-cap behavior and negative clamping.
