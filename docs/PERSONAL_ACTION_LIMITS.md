# Personal Action Limits

## Status

Approved and implemented in `v20.48.0` for offline Single Player Match Mode.

## Rule

- A player whose team is the attacking team for the current numbered turn may use at most **three** personal actions.
- A player whose team is defending for that numbered turn may use at most **two** personal actions.
- The actions do not need to be consecutive.
- The role is determined by the numbered turn's `tracker.startingTeam`, not by the current attack/defense phase. The counter therefore persists from the attacking phase into the defending phase and resets only for the next numbered turn.

## Canonical state and enforcement

`MatchState.tracker.personalActionsByPieceId` is the sole offline Match counter. It is normalized to a compact `{ [pieceId]: used }` map and is owned by the Game Engine.

The Engine consumes one personal action for:

- normal `MOVE` when it is activated;
- normal `PASS` when its route is confirmed;
- each player physically committed through `GROUP_MOVE_PLAYER_COMMITTED`;
- implemented/manual normal `DRIBBLE`, `SHOT`, `CROSS` and `TACKLING` declarations.

A normal MOVE may continue in any number of legal segments without consuming another personal action. This remains true after that MOVE spent the team's final normal Tracker action: the already-authorized player may spend remaining Speed until the active team phase ends or the player ends movement under the existing rules; no new normal action may begin. Cancelling it before its first physical segment refunds its personal action together with the existing Tracker action refund.

The Engine rejects a further normal action for a player at their personal maximum with `personal-actions-complete`. This is validation, not a UI-only lock.

## Explicit exclusions

The following do **not** consume a personal action:

- Rule 3/2;
- every Bonus Action, including Bonus MOVE and Bonus PASS;
- Free Move;
- Free Ball;
- Extra Roll;
- Group Move activation itself. It is a team Tracker action but has no personal actor. Only a participant moved by the committed Group Move consumes one.

## Reset points

The map clears when the existing Match rules create a new numbered turn, restart the Match, run Reset Trackers or Change Possession. It does not clear merely because attacking phase changes to defending phase. It remains intact across a Bonus Action that resumes the same numbered turn.

## UI projection

The Inspector's three-slot panel is a projection of the canonical map in offline Match Mode. It cannot be clicked there. A defending player retains a visible but muted third slot, making the two-action ceiling explicit.

Editor Mode is an unrestricted workspace, not Match gameplay. Its same panel is a manually clickable workspace marker with all three slots available for both teams; it never infers attacking or defending roles and never invokes Engine validation. Manual Multiplayer does not receive this control or the Single Player enforcement rule.

Each offline/Editor puck shows one green dot below its position label for every used personal action. This is display-only and reads the same counter rendered in the Inspector.

## Timeline and analysis

Because the map lives in MatchState, Timeline, Undo, Redo, replay and match recordings restore it automatically. AI Analysis Export includes the compact map in its state representation and reports each semantic event's actor usage and actor maximum.
