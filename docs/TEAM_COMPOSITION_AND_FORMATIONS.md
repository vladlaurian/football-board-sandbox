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
prepared layout for Start New. v20.56.19 replaces editable formation slots with
the approved standard catalogue and validates each selected formation's exact
starter-role recipe. v20.56.21 corrects that catalogue so every default starter
remains in its own half and outside the centre circle, and replaces role-wide
Adjust zones with local formation-slot adjustment. v20.56.22 gives Prep's
mutable controls an explicit selected-team boundary and requires a separate
transient Ready confirmation from both teams before Start New. v20.56.23
records the future separation between Workspace formation, active Match tactic
and live board coordinates; that separation is now implemented — a coach may
pick a new tactic at any time, but it only lands on the live board at the next
kickoff moment (`pendingFormation`/`activeFormation`, `FORMATION_TACTIC_CONFIRMED`,
applied automatically at kickoff after a Goal and available via the
mid-match Adjust button, both gated by the shared kickoff-moment predicate).
Substitutions remain future work. Manual Multiplayer remains a frozen legacy
path and keeps its existing puck-label behavior.

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

A standard formation contains eleven board coordinates plus an ordered
`starterRoleRecipe`. The recipe is a requirement of the formation's neutral
starter slots, not an authority for a player role; a player's role remains
exclusively `card.position`.

Applying a formation:

- moves the relevant starter pucks to the template coordinates;
- keeps every card in its team and never alters `card.position`;
- maps matching assigned cards into matching neutral formation slots;
- retains unmatched assigned cards in remaining temporary slots rather than
  detaching them; those slots are visibly red and cannot become Ready;
- never infers or changes a player's actual role.

The standard catalogue is fixed: the old Formation `Save` controls are removed.
Adjust is the approved mechanism for personalising a selected formation's
starting coordinates. Old pair form `[label, coordinate]` remains readable for
legacy import compatibility, but no longer becomes a selectable custom slot.

### Standard formation catalogue

`4-4-2 (2 CM)`, `4-4-2 (2 CDM)`, `4-4-2 (2 CAM)`, `4-4-1-1`,
`4-2-3-1 Wide`, `4-2-1-3 ATT`, `4-3-3 Holding`, `4-3-3 Attack`,
`4-3-3 Double Pivot`, `4-1-4-1`, `4-5-1`, `4-1-3-2`, `4-2-4`,
`3-4-3 Wide`, `3-4-1-2`, `5-4-1`, `4-2-2-2`,
`4-1-2-1-2 Narrow`, `4-3-2-1`, `3-5-2 Double Pivot`,
`3-5-2 Balanced`, and `3-5-2 Midfield Control` are the only selectable
standard formations. Their exact role recipes are centralized in
`src/board/standardFormations.mjs` and tested there through the pure
compatibility planner.

## 3. Roster and legal composition

At Ready validation, each team must have:

- 11 starters on the board;
- one goalkeeper reserve;
- six outfield reserves.

Every starter and reserve has an assigned card. There can be at most eleven
players and at most one goalkeeper on the board for a team.

The Ready validator reads card roles only and requires the eleven starter roles
to match exactly the selected formation's `starterRoleRecipe`. The old generic
starter minima, maxima and wide-player requirements no longer apply.

When a different formation is selected, it is always displayed live. If the
already assigned starter roles do not fit its recipe, Prep reports each missing
and excess role, marks the affected slots red, and lists all standard
formations that can contain the currently assigned roles. Card assignment and
formation switching remain available for correction; Adjust, Ready and Start
New are blocked once a complete roster still has a formation mismatch.

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

### Blocking dependency (not yet satisfiable)

Substitutions depend on a canonical interruption/restart lifecycle for
throw-in, goal kick, corner and free kick. None of these exist in the Engine
today — only the post-goal kick-off restart (`state.kickoffRestart`) and
match start are represented anywhere in the code.
`docs/GAME_ENGINE_MIGRATION_PLAN.md` already places Substitution after these
interruptions in its own sequencing. Building Substitutions before that
lifecycle exists would only allow triggering one at kick-off (match start or
post-goal), never at the stoppages this section describes — that contradicts
the rule itself, so Substitutions stay out of scope until that lifecycle is
built.

When it is eventually taken up, the agreed shape (from user direction,
2026-08-01) is:

- A substitution may be *requested* at any time, but is only *performed* at
  the next qualifying stoppage (fault, throw-in, goal kick, corner,
  half-time, post-goal kick-off), mirroring real football.
- The coach is prompted to pick the outgoing player, then the incoming
  reserve.
- The incoming player's placement is limited using the attack-direction
  relative convention already fixed for the zone map in Section 6 below (a
  team's own goalkeeper, standing in their own goal facing the direction of
  attack, defines that team's left/right — not literal board side, since it
  must stay correct however the board is oriented):
  - `LB`, `LWB`, `LM`, `LW`: only the first 6 cells from that team's own-left
    touchline, counted inward.
  - `RB`, `RWB`, `RM`, `RW`: only the first 6 cells from that team's
    own-right touchline, counted inward.
  - `CB`, `CDM`, `CM`, `CAM`, `ST`: any remaining cell not covered above.
  - `GK`: only the exact centre of that team's own goal.
- After placement, the team is re-checked against the currently selected
  tactic. If ineligible, the coach is prompted to change tactic before
  `Ready` is accepted; until `Ready`, any placement can still be reversed.
- `Ready` locks the substitution irreversibly and consumes one substitution
  (and one in-play window where applicable) from the limits already defined
  above in this section.
- Up to 3 substitutions may be queued in one stoppage/window before `Ready`.
- The `Substitution` control becomes `Done Subs` while a substitution
  sequence is open; pressing it again closes the sequence without confirming
  (equivalent to not yet pressing `Ready`).
- Outgoing and incoming pucks carry a distinct highlight (gold for incoming,
  grey for outgoing) until `Ready` is pressed, at which point every
  substitution highlight clears.

None of this is implemented. This note exists only so the direction is not
lost before the interruption lifecycle exists.

## 5. Prep and Selection Rules

`Prep` is a movable, resizable, minimizable and closable panel in the second
application bar, immediately before `Tracker`. It is a Single Player Match
Mode surface; its Editor Mode button remains visibly blocked. It does not
itself start a Match. Since v20.56.41, `Prep` is also reachable during an
already-started Match (its toggle button carries no Match-started gate) — a
tactic may be picked at any time, but it only lands on the real board at a
kickoff moment (see 5.7/5.8).

The panel always exposes these controls:

`Team` · `Formation` · `Select Formation` · `Adjust` · `Substitution` · `Ready`

### 5.1 Team and Formation

- `Team` selects Blue or Red as the team currently being prepared.
- `Formation` selects a spatial formation template for that team. Since
  v20.56.41 this only updates a read-only preview
  (`src/prep/FormationPreview.jsx`) labeling each slot with its required
  position code — it never touches the real board. `Select Formation`
  confirms it (see 5.7/5.8). Before v20.56.41 the board updated immediately
  on selection; that behavior is retained only for the instant-apply case
  (a kickoff moment).
- While Single Player Prep is open, its selected team owns Prep mutation:
  formation application, Adjust movement and card assignment/removal may alter
  only that team. The other team remains inspectable but cannot be changed
  until it is selected in Prep. This is a UI preparation boundary, not a
  gameplay ownership change.

### 5.2 Card assignment and the live summary

Card assignment to every puck in the full eighteen-player roster (eleven
starter pucks, the goalkeeper reserve and six outfield reserves) is done
directly on the pucks, on the board — the existing card-inspection/assignment
affordance remains the card selection surface. Before v20.56.41, Prep had a
separate `Selection` button whose only effect was to scroll to the summary
below; confirmed with the user that this served no other purpose, it was
dropped and the control was repurposed as `Select Formation` (see 5.1/5.7).
Prep still shows the same live information popup for the selected team.

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

`Adjust` does not generate a role-based layout and never moves a player merely
because the button was pressed. It reads the selected formation's stable neutral
starter-slot coordinate; the player's card remains the sole role authority.

When a coach selects one eligible starter while Adjust is active, only the
local 5×5 area centred on that slot's formation coordinate is highlighted. Blue
uses blue highlight; Red uses red highlight. The player may be placed only in
that area and never on an occupied player cell. Reserves and the ball are not
adjusted. Normal movement preview/cursor presentation is suppressed only during
this local Adjust interaction; the existing board-coordinate display setting is
not changed by Adjust.

The formation catalogue is authored in Blue coordinates and mirrored for Red.
Every template keeps starters in their own half and outside the actual centre
circle. Forwards use the nearest legal own-half cells to the centre circle;
they are not placed in the opposing half or inside the circle.

The Ready validator checks roster composition and all other setup legality.
Adjust does not change card roles or card assignment. It is available only in
Single Player Prep; Manual Multiplayer receives neither the control nor its
movement path. Reopening Adjust only re-enters its highlight/move mode; it does
not reset the board. `Reset [team] default layout` deliberately reapplies that
team's selected formation. Selecting a new Formation invalidates that team's
prepared Adjust layout.

Since v20.56.41, Adjust is additionally enabled only at a kickoff moment (see
5.7). Before the Match Timeline has started, it keeps this exact pre-Match
Workspace behavior. Once the Timeline has started (a pending post-goal
restart), a placement instead goes through the canonical Engine command
`ADJUST_PIECE_PLACED` (`src/engine/adjustPlacementRules.mjs`), reading the
anchor from `state.activeFormation[team]` — so Undo/Redo/Replay/AI-export see
it, per section 7. `Reset [team] default layout` remains a pre-Match-only
convenience and is hidden outside that case.

### 5.5 Ready and Match start

Before the Match starts, `Ready` validates the selected team's full roster,
active Selection Rules and legal composition. Blue and Red acknowledge
independently.

- `No` changes nothing.
- `Yes` closes Prep, visibly marks that team Ready, and directs the user to
  prepare the other team or, when both are Ready, to use `Start New Game` in
  Tracker.
- A formation application, Adjust movement or card assignment/removal
  invalidates only the changed team's Ready acknowledgement. The other team's
  Ready state remains intact.
- Ready state is transient preparation UI: it is neither WorkspaceSnapshot nor
  a Timeline, replay or AI-export event.

**Once the Match has started (v20.56.43), `Ready` is a different, canonical
action entirely** — pressing it dispatches the Engine command
`KICKOFF_READY_CONFIRMED` (`src/engine/kickoffReadyRules.mjs`); the pre-Match
validation above does not run. Away from a pending post-goal kick-off
restart, it is rejected (`NOT_AT_KICKOFF_RESTART`) and nothing happens.
While a restart is pending for that team, the Engine: re-lays out the team
into its active tactic (so a piece pinned by an earlier tactic change
returns to its real slot), re-validates the tactic
(`state.tacticBlock`/`TEAM_TACTIC_INVALID` if it fails, with no board
change), then picks whichever piece is that team's ST **under the currently
active tactic** — not whatever was picked back when the goal happened — and
pins it and the ball to centre. The UI only dispatches the command and
displays whatever reason comes back; it makes none of these decisions
itself.

`Start New Game` requires both team acknowledgements. If either team is not
Ready, its Tracker request is rejected with:

`Please prepare your team from Prep Menu.`

`Start New Game` reapplies both selected formation templates without changing
`cardId`, then places the selected starting team's first stable starter `ST`
in the adjacent cell on the opponent half with the ball in that same cell.
Blue uses the exact central mirror of Red's adjacent cell. A prepared Adjust
layout is retained instead of applying that team's formation template again. It
starts a fresh Timeline and frozen MatchContext. `Continue
Game` preserves all board coordinates but resets all Match runtime and starts
turn one through the canonical restart command. The selected starting team must
have a starter `ST`; otherwise Start New Game is rejected explicitly. `Continue
Game` does not require Prep or Ready.

### 5.6 Substitution control

`Substitution` is present in Prep from its first implementation, but remains
visibly disabled until the canonical interruption/restart lifecycle exists.
It must not create a local manual interruption.

### 5.7 Deferred Prep lifecycle redesign

**The formation-protection half of this section is implemented as of
v20.56.41** — see 5.1/5.4/5.8: Formation only previews until confirmed, and a
confirmed tactic reaches the real board only at a kickoff moment (Match not
yet started, or a pending post-goal restart), never by an accidental
selection mid-Match.

**The Substitution half remains fully deferred**, unchanged from the original
note below: it still depends on a canonical interruption/restart lifecycle
(throw-in, goal kick, corner, free kick) that does not exist yet — see the
"Blocking dependency" note in section 4. Once that lifecycle exists, this
becomes the only substitution entrance:

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

### 5.8 Active-Match tactic (implemented v20.56.41, extended v20.56.42)

The selected Prep formation is a future-kickoff setup value, distinct from
the pieces' current physical board position at any other moment.

At a kickoff moment (today: before Match start, or a pending post-goal
`kickoffRestart` — not yet every canonical interruption, since only these two
exist in the Engine so far), the coach creates a tactical draft:

- selecting a new formation shows its lineup on a separate tactical preview
  (`src/prep/FormationPreview.jsx`), never the live board;
- `Select Formation` confirms it through the canonical Engine command
  `FORMATION_TACTIC_CONFIRMED` (`src/engine/formationTacticRules.mjs`);
- at a kickoff moment, confirmation applies it to the real board immediately
  and records it in `state.activeFormation[team]`;
- away from a kickoff moment, confirmation instead queues it in
  `state.pendingFormation[team]` — Engine-owned MatchState, a canonical
  Timeline step, visible to Undo/Redo/Replay/AI-export;
- confirmation away from a kickoff moment does **not** move any live player
  or ball coordinate.

Since v20.56.42, a kickoff moment always re-lays out **both** teams into
whichever tactic ends up active for them (a freshly confirmed/queued one, or
whatever was already active) — this is the "return to active Match tactical
formation" restart rule (`docs/FINALISATION_AND_RESTARTS_RULES.md` 3.2), not
just an update path for a newly picked tactic. The one exception, always:
the entitled kick-off piece and the ball are pinned to the centre point
afterward, regardless of what the tactic says for that piece's slot — Adjust
also refuses to move that specific piece while the restart is pending.
Continue Game is unaffected: it never records an active tactic, so nothing
is ever reapplied for it.

If the tactic that ends up active for a team does not exactly match that
team's assigned cards' roles, `state.tacticBlock[team]` is set and every
action for that team is blocked — disabled buttons on every one of its
pieces (`selectSinglePlayerPieceActionPresentation`) and a persistent banner
in the match UI — until a matching tactic is confirmed. This is the only way
such a mismatch can occur (cards themselves are locked once the Match
starts), and it replaces the validation that the old forced kick-off pass
used to imply.

Not yet built: validating a proposed substitution as part of the same draft
(there is no Substitution mechanic yet — section 4), and extending "kickoff
moment" to every canonical interruption type (only kickoff exists today) or to
half-time/extra-time (no such state exists yet).

The active-Match Formation control never reuses the pre-Match live template
application path — see 5.1's note on the two separate code paths.

## 6. Positional zones

The following card-role map is retained for the separately approved future
central-restart system. It is not an active Adjust movement map.

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

A future central-restart algorithm must use a canonical Engine/MatchState
command rather than treating this Workspace control as gameplay resolution.
Changing a zone boundary later must be a centralized data edit, not a rewrite
of roster or Match rules.

## 7. Architecture boundary

Future roster validation, substitutions and central-restart placement are
Match rules. Their legal state, pending coach choices, action resets and
resulting board positions must be canonical in Engine/MatchState, frozen
against the active MatchContext where appropriate, and visible identically to
Timeline, Undo/Redo, Replay and AI export. UI presents choices and submits
commands only.

Manual Multiplayer/Firebase authority are explicitly outside this work until
a separately approved scope reopens them.
