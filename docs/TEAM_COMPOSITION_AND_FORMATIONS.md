# Team composition, formations and substitutions

This is the canonical rule and technical contract for player roles, the match
roster, formation templates, positional zones and substitutions. It separates
the agreed future Match rules from the implemented v20.56.11 Workspace
foundation.

## Status

v20.56.9 established the ownership boundary below:

- a football role belongs exclusively to a player card;
- Single Player pucks and formation templates no longer own a role;
- a formation is a coordinate template and retains the existing card-to-puck
  links when it is applied;
- old formations stored as `[legacyLabel, coordinate]` remain readable and
  migrate by retaining their coordinate only.

v20.56.11 implements the pre-match Workspace portion only: Single Player
Prep, Selection Rules persistence, full-roster selection analysis and Ready
validation. v20.56.12 adds the explicit Ready acknowledgement. v20.56.13
restores the mode boundary and makes the Blue/Red Selection summaries permanent
inside Prep. v20.56.15 keeps Prep available throughout Single Player Match
Mode and applies a selected formation immediately to the live board while
retaining card links. v20.56.18 makes Adjust role-aware and persists its
prepared layout for Start New, while substitutions remain future work. Manual Multiplayer remains a
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

## 3. Roster and legal composition

At Ready validation, each team must have:

- 11 starters on the board;
- one goalkeeper reserve;
- six outfield reserves.

Every starter and reserve has an assigned card. There can be at most eleven
players and at most one goalkeeper on the board for a team.

The Ready validator reads card roles only and enforces:

- minimum one `ST`;
- minimum two `CB`;
- minimum two combined `CDM`, `CM` or `CAM`;
- minimum one `LM` or `LW`;
- minimum one `RM` or `RW`;

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

## 5. Prep and Selection Rules

`Prep` is a movable, resizable, minimizable and closable panel in the second
application bar, immediately before `Tracker`. It is a Single Player Match
Mode pre-start surface; its Editor Mode button remains visibly blocked. It does
not itself start a Match.

The panel always exposes these controls:

`Team` · `Formation` · `Selection` · `Adjust` · `Substitution` · `Ready`

### 5.1 Team and Formation

- `Team` selects Blue or Red as the team currently being prepared.
- `Formation` selects a spatial formation template for that team. The board
  updates immediately, using the existing stable puck identities and keeping
  their assigned cards. This is functional in v20.56.11.

### 5.2 Selection

`Selection` allows card assignment to every puck in the full eighteen-player
roster: eleven starter pucks, the goalkeeper reserve and six outfield
reserves. The existing card-inspection/assignment affordance remains the card
selection surface; Prep adds a live information popup for the selected team.

Prep permanently shows a live summary for both teams, Blue first and Red
second: current total stars, active limits, count at the `Y`-star value,
assigned cards and legal/invalid state. When an active Selection Rule is
violated, the affected fact is red. `Ready` refuses to acknowledge an illegal
selection and states the exact failed criterion. This summary and validation
never automatically assigns, detaches or replaces a card.

### 5.3 Selection Rules

`Selection Rules` is a dedicated menu placed before `Rules`. It is a
team-construction policy, not a gameplay Rule Set. Its selected values are
saved in Workspace. It is editable only in Editor Mode; immediately on entry
to Match Mode it remains available only for visual inspection. It does not
alter the gameplay Rule Set frozen in MatchContext when a Match starts.

There are three checkbox-controlled modes:

1. **Total Stars Cap** — if checked, the configured maximum total stars is
   enforced across all eighteen cards. If unchecked, its value is disabled and
   has no effect.
2. **Maximum X Players at Y Stars** — if checked, the configured player-star
   cap is enforced across all eighteen cards: no card may have more than `Y`
   stars and at most `X` cards may have `Y` stars. If unchecked, both values
   are disabled and have no effect.
3. **Free Selection** — if checked, it automatically unchecks and disables both
   constrained criteria. If unchecked, those criteria become available and
   can be enabled independently or together. If both constrained criteria are
   unchecked, Free Selection checks itself automatically.

Therefore the state is always either Free Selection, or at least one active
selection criterion.

With Free Selection active, the Prep Selection window explicitly says `Free
Selection enabled`. With one or both criteria active, it shows every active
limit and, where relevant, the current number of `Y`-star cards. The permanent
Prep summaries recalculate after each card assignment.

### 5.4 Adjust

`Adjust` first builds a complete layout plan from `piece.cardId → card.position`
only; puck labels never participate. Each role has an explicit central anchor
inside its approved zone, mirrored for Red. The plan is rejected without moving
any piece if a starter lacks a valid role card or its target cannot remain in
that role's zone.

For duplicate roles, the default vertical layout is:

- CB: two starters at centre −2 and +2; three at centre, −2 and +2;
- CDM and CM: two starters at centre −3 and +3; three at centre, −3 and +3;
- other duplicate roles use the same symmetric ±3 pattern unless their zone
  requires a nearest legal free-cell fallback.

ST defaults use the approved column 18 for Blue / 27 for Red only between
K–S. Their wider approved zone remains legal for manual tactical Adjust moves.
All active starter role zones are highlighted; the selected player's cells have
the dominant highlight. A coach may move a starter only to an unoccupied cell
inside that card's own role zone. Reserves and the ball are not adjusted.

The Ready validator checks roster composition and all other setup legality.
Adjust does not change card roles or card assignment. It is available only in
Single Player Prep; Manual Multiplayer receives neither the control nor its
movement path. Reopening Adjust only re-enters its highlight/move mode; it does
not reset the board. `Reset [team] default layout` is the deliberate explicit
reset. Selecting a new Formation invalidates that team's prepared Adjust layout.

### 5.5 Ready and Match start

Before the Match starts, `Ready` validates the full roster, active Selection
Rules and legal composition. On success, it asks:

`Are you sure you are ready to start the Match?`

- `No` changes nothing.
- `Yes` closes Prep and confirms that the user must press `Start New Game` in
  Tracker. It does **not** start the Match or leave a persistent Prep lock.

`Start New Game` reapplies both selected formation templates without changing
`cardId`, then places the selected starting team's first stable starter `ST`
in the adjacent cell on the opponent half with the ball in that same cell.
Blue uses the exact central mirror of Red's adjacent cell. A prepared Adjust
layout is retained instead of applying that team's formation template again. It
starts a fresh Timeline and frozen MatchContext. `Continue
Game` preserves all board coordinates but resets all Match runtime and starts
turn one through the canonical restart command. The selected starting team must
have a starter `ST`; otherwise Start New Game is rejected explicitly. Start New
Game may be used without Prep or Ready.

### 5.6 Substitution control

`Substitution` is present in Prep from its first implementation, but remains
visibly disabled until the canonical interruption/restart lifecycle exists.
It must not create a local manual interruption.

### 5.7 Deferred Prep lifecycle redesign

The current live Formation control is intentionally retained as the visible
setup surface for card assignment. It is not yet the final protection model for
an active Match: a mistaken formation selection can currently reposition that
board. Do not add another local lock as a patch. A later approved Prep build
must define separate, explicit flows for preparing a **new Match** and for an
already active Match, alongside the functional Adjust surface and the canonical
restart/interruption state.

After that later lifecycle is implemented, it becomes the only substitution
entrance:

- it may be armed before a stoppage and opens automatically at the first
  eligible interruption;
- it may also be opened while the Match is already interrupted;
- the panel remains open until `Ready` confirms resumption;
- the coach moves an outgoing starter puck to the reserve line and an
  assigned reserve puck into a chosen free field cell;
- every attempted change is validated against the substitution limits and
  roster rules, with an explicit explanatory rejection when illegal;
- the post-substitution `Ready` requires confirmation and resumes the pending
  interruption only after confirmation.

## 6. Positional zones

The Adjust implementation reads each card role and automatically places the
eleven inside its role zone. A future central-restart system may reuse this
same map, but it is not implemented by Adjust.

The following is the approved first zone map for Blue, which attacks toward
increasing column numbers. Red is mirrored in depth using `n → 45 − n`.

| Card role | Blue columns | Blue rows | Red columns |
|---|---:|---|---:|
| GK | 1 | O | 44 |
| LB | 6–10 | E–G | 35–39 |
| CB | 5–9 | I–U | 36–40 |
| RB | 6–10 | W–Y | 35–39 |
| LWB | 11–14 | A–D | 31–34 |
| RWB | 11–14 | Z–AC | 31–34 |
| CDM | 10–13 | J–T | 32–35 |
| CM | 14–16 | I–U | 29–31 |
| LM | 15–18 | D–F | 27–30 |
| RM | 15–18 | X–Z | 27–30 |
| CAM | 17–18 | K–S | 27–28 |
| LW | 19–22 | A–C | 23–26 |
| RW | 19–22 | AA–AC | 23–26 |
| ST | column 18 on A–AC; plus K19, L19, K20, R19, S19, S20 | see Blue columns | column 27 on A–AC; plus K26, L26, K25, R26, S26, S25 |

The ST corridor intentionally overlaps the CAM zone. The map also contains
other spatial overlaps where distinct role rows or coach adjustment preserve
legal placement. The future automatic placement rule must select distinct
free cells within the applicable zones.

The implemented Adjust algorithm chooses central distinct free cells. A future
central-restart algorithm must use a canonical Engine/MatchState command rather
than treating this Workspace control as gameplay resolution. Changing a zone
boundary later must be a centralized data edit, not a rewrite of roster or
Match rules.

## 7. Architecture boundary

Future roster validation, substitutions and central-restart placement are
Match rules. Their legal state, pending coach choices, action resets and
resulting board positions must be canonical in Engine/MatchState, frozen
against the active MatchContext where appropriate, and visible identically to
Timeline, Undo/Redo, Replay and AI export. UI presents choices and submits
commands only.

Manual Multiplayer/Firebase authority are explicitly outside this work until
a separately approved scope reopens them.
