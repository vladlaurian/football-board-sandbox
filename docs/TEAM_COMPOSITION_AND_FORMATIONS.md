# Team composition, formations and substitutions

This is the canonical rule and technical contract for player roles, the match
roster, formation templates, positional zones and substitutions. It separates
the agreed future Match rules from the limited v20.56.9 implementation.

## Status

v20.56.9 implements only the ownership boundary below:

- a football role belongs exclusively to a player card;
- Single Player pucks and formation templates no longer own a role;
- a formation is a coordinate template and retains the existing card-to-puck
  links when it is applied;
- old formations stored as `[legacyLabel, coordinate]` remain readable and
  migrate by retaining their coordinate only.

The roster validation, substitutions and central-restart placement rules in
this document are agreed rules for a later, separately approved Match build.
They are not implemented gameplay behavior yet. Manual Multiplayer remains a
frozen legacy path and keeps its existing puck-label behavior.

## 1. One authority for a player's role

The canonical football role is `card.position`. Valid card roles are:

`GK`, `LWB`, `LB`, `CB`, `RB`, `RWB`, `LW`, `LM`, `CDM`, `CAM`, `CM`, `RM`,
`RW`, `ST`.

There is no role aliasing: `LB`, `LWB` and `CAM` are distinct card roles.
Pucks are physical board identities only. They must not independently state a
football role, determine gameplay eligibility, override a card or act as a
second source for roster validation and positional zones.

The legacy manual-session `piece.label` remains technical compatibility data
only. It is not a Single Player role source.

## 2. Formation templates

A formation is a list of up to eleven board coordinates for the stable eleven
starter puck identities. It is not a list of positions.

Applying a formation:

- moves the relevant starter pucks to the template coordinates;
- keeps their assigned cards attached;
- therefore never changes the players' actual roles;
- does not assign, detach, replace or infer a card.

The old pair form `[label, coordinate]` remains import-compatible, but its
first element is discarded. Newly saved formations store coordinates only.

## 3. Future match roster and legal composition

At Match start, each team has:

- 11 starters on the board;
- one goalkeeper reserve;
- six outfield reserves.

Every starter and reserve has an assigned card. There can be at most eleven
players and at most one goalkeeper on the board for a team.

The future Match validator reads card roles only and enforces:

- maximum one of `RB` or `RWB`;
- maximum one of `LB` or `LWB`;
- maximum one of `LM` or `LW`;
- maximum one of `RM` or `RW`;
- maximum three `CB`;
- maximum two `CDM`;
- maximum three `CM`;
- maximum two `CAM`;
- maximum two `ST`;
- `2 CDM` and `3 CM` cannot coexist.

Starting-form names such as 4-4-2, 4-2-3-1 and 3-5-2 are spatial guides, not
hard roster restrictions. Any assigned card may occupy a starter puck, but
the resulting eleven must pass the role validator.

## 4. Future substitutions

Each team may use five substitutions over the whole Match, including extra
time. There is no sixth substitution.

- During active play, a team has at most three substitution windows.
- A substitution may be requested before any restart: throw-in, goal kick,
  corner, free kick, penalty or central restart after a goal.
- Half-time and the intervals before/between extra-time halves permit
  substitutions without consuming an in-play window.
- If both coaches substitute at the same stoppage, both can complete their
  changes during that one stoppage; each consumes its own window when the
  stoppage is an in-play window.
- No normal substitution is permitted during a penalty shoot-out.
- The incoming card must be a bench reserve card. The outgoing player becomes
  permanently unavailable and cannot return.
- A goalkeeper may be replaced only by a goalkeeper.
- The incoming player begins with zero personal actions. The original restart
  then resumes exactly as it would without the substitution.
- The coach may place the incoming player in any free board cell, provided
  the completed team remains legal under the roster validator.

## 5. Positional zones for future central restarts

At a match start, start of a half or extra-time half, and after a goal, the
future central-restart system reads each card role and automatically places
the eleven inside its role zone. Coaches may then adjust their own players
inside those zones before the free backward opening Short Pass.

The following is the approved first zone map for Blue, which attacks toward
increasing column numbers. Red is mirrored in depth using `n → 45 − n`.

| Card role | Blue columns | Blue rows | Red columns |
|---|---:|---|---:|
| GK | 1–5 | M–Q | 40–44 |
| LB | 6–12 | A–K | 33–39 |
| CB | 6–10 | L–R | 35–39 |
| RB | 6–12 | S–AC | 33–39 |
| LWB | 13–17 | A–I | 28–32 |
| RWB | 13–17 | U–AC | 28–32 |
| CDM | 13–16 | J–T | 29–32 |
| CM | 17–19 | I–U | 26–28 |
| LM | 20–22 | A–I | 23–25 |
| RM | 20–22 | U–AC | 23–25 |
| CAM | 23–25 | I–U | 20–22 |
| LW | 26–30 | A–I | 15–19 |
| RW | 26–30 | U–AC | 15–19 |
| ST | 26–30 | J–T | 15–19 |

This map intentionally keeps the following depth bands separate:

- `LB/RB` may be up to two columns ahead of `CB`, but all begin on the same
  defensive line;
- `LWB/RWB` begin immediately after `LB/RB`, with no depth overlap;
- `CDM → CM → CAM → ST` do not overlap in depth;
- `LM/RM` sit between `CM` and `CAM`;
- `LW/RW` share the forward band with `ST`, but not the depth of `LM/RM`.

The automatic placement/collision-resolution algorithm remains to be defined
when central restarts are implemented. Changing a zone boundary later must be
a centralized data edit, not a rewrite of roster or Match rules.

## 6. Architecture boundary

Future roster validation, substitutions and central-restart placement are
Match rules. Their legal state, pending coach choices, action resets and
resulting board positions must be canonical in Engine/MatchState, frozen
against the active MatchContext where appropriate, and visible identically to
Timeline, Undo/Redo, Replay and AI export. UI presents choices and submits
commands only.

Manual Multiplayer/Firebase authority are explicitly outside this work until
a separately approved scope reopens them.
