# Tackling Rules

## Status and scope

**Build 1 (the normal defensive action, section 1.1, plus the shared roll/
equality/Natural-20/Natural-1/inactivity/foul core in sections 3-7) is
implemented — `src/engine/tacklingRules.mjs`.** See
`docs/IMPLEMENTATION_STATUS.md` for the exact split of what shipped. Sections
1.1, 3, 4, 5, 6 and 7 below have been rewritten to match what actually
shipped, which supersedes this document's original text in several places
(confirmed live during the build). Sections 1.2 and 1.3 (the reactive forms)
and section 2 (their decision window) are **not implemented** and still
describe the original, pre-Build-1 design — they need their own rewrite pass
once built, since Build 1 changed the eligibility model they were written
against.

Tackling is available only to the team currently defending. It may be a normal
defensive action or a defensive reaction. Foul, free kick and penalty restart
procedures are defined by
[`FINALISATION_AND_RESTARTS_RULES.md`](FINALISATION_AND_RESTARTS_RULES.md).
Shared inactive-player, reaction and canonical-authority rules remain in
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md). Marking is
defined by [`MARKING_RULES.md`](MARKING_RULES.md).

## 1. Two forms of Tackling

### 1.1 Defensive action

During the defense phase, a defending player may use Tackling as a normal
defensive action against an attacking player that possesses the ball.

**Eligibility** is frozen from the **start of that defense phase**: a
defender may Tackle only if, at that exact moment, the ball carrier stood
inside that defender's own defensive area. There is no separate
distance-based eligibility route — a defender whose defensive area does not
reach the carrier is never eligible, regardless of how close they physically
stand. If several defenders' areas cover the carrier at once, every one of
them is independently eligible. Moving during the defense phase can never
grant a defender a new eligibility it did not have at the phase's start.

**Execution.** Clicking Tackling for an eligible defender does not open the
roll directly. The defender first auto-walks toward the carrier, along
whichever single legal straight or 45-degree-diagonal axis (this engine's
only legal movement shape) reaches an empty cell in the carrier's 8-cell
proximity area soonest — with no distance cap. Only once that lands does the
roll open; it consumes the ordinary normal Tracker action and personal
action cost at that point, never before.

Before that, two things can stop the attempt short, at no Tracker/personal/
team action cost, each its own canonical, Undo/Redo-able step:

- the carrier is no longer inside the defender's defensive area (checked
  fresh at this exact moment, since the defender may have repositioned since
  the frozen eligibility snapshot) — a "move into range" notice opens
  instead;
- every legal approach axis is blocked by some body, teammate or opponent —
  a "path blocked" notice opens instead, naming the blocking piece when one
  specific axis is nameable.

A coach who sees either notice may reposition the defender with an ordinary
Move (its own normal Tracker cost) and try Tackling again from the new
position — eligibility itself stays frozen from phase start regardless, but
execution is always re-checked fresh.

### 1.2 Defensive reaction on proximity entry

When an attacking ball carrier enters the first cell of an active defender's
proximity area, Tackling reaction eligibility opens automatically. “Automatic”
means that Engine/MatchState opens a canonical decision window; it does not
mean that a roll is forced without the defending coach's choice.

The attacking movement pauses at that reaction point. The defending coach may
start the Tackling or defer it as defined in section 3.

If the ball carrier enters the proximity areas of several defenders at once,
every such defender is an eligible reactive tackler. The defending coach
chooses their resolution order. Resolve them sequentially; a successful
Tackling, foul, restart or any other possession-ending outcome clears the
remaining reaction queue. A failed or deferred attempt leaves any later
eligible defender available in the chosen sequence.

### 1.3 Delayed reaction after Marking

Marking never permits an immediate Tackling as the continuation of the same
Marking reaction. It creates a delayed Tackling opportunity with exactly one
intervening attacking action.

If a marked attacker possesses the ball, the attacking team completes one
subsequent action. That action may belong to the marked attacker or to a
teammate. After it completes, Engine opens the Marking-derived Tackling window
only when the same attacker still possesses the ball and remains inside the
marker's defensive area.

This is a Marking-specific defensive-area eligibility route. It does not need
to satisfy the ordinary three-orthogonal/two-diagonal phase-start distance
route. It gives the attacker one action to pass, dribble, move, escape the
defensive area or otherwise avoid the Tackling risk.

If the ball is no longer with the marked attacker, or the attacker has left the
marker's defensive area, the delayed window ends. No Tackling is offered from
that Marking.

## 2. Tackling decision window

Every reactive Tackling opportunity is represented by one canonical Engine
decision for the defending team. The UI presents:

- the defender's Tackling statistic;
- the attacking ball carrier's fixed Ball Control target;
- all relevant AV, AVM, DV and DVM;
- the eligibility source: proximity entry or Marking.

The defending coach chooses one of:

- **Tackle now** — starts the canonical Tackling roll;
- **Not now** — does not tackle at that window; after the next attacking action,
  Engine asks again if the same attacker still possesses the ball and remains
  eligible for that defender;
- **Not again this attack phase** — suppresses further reactive Tackling prompts
  for that exact defender-attacker pair until the current attack phase ends.

The final option does not disable any other defender's reaction, does not
prevent a future Marking switch and does not prevent Tackling as a normal
defensive action in the following defense phase.

## 3. Roll and equality

The defending player rolls D20 and adds its Tackling bonus (plus any active
AV/AVM/DV/DVM applied to the roll). The total is compared with the attacking
ball carrier's fixed Ball Control attribute — except when the natural roll is
1 or 20, which override the total comparison entirely (section 6).

- **Natural 20**: always succeeds, regardless of total.
- **Natural 1**: always fails, regardless of total — never treated as
  equality or success.
- Any other natural roll: if the total falls inside the Rule Set's
  **Equality interval** (a band of totals at or below Ball Control, sized
  1-5 — see section 7), the result is **equality**, which wins any overlap
  with a Free Kick/Yellow/Red fault band (section 5). The frozen Rule Set
  choice decides equality's own outcome:
  - Tackling succeeds; or
  - the ball goes out of play by whichever of Throw-in or Corner is
    geometrically nearer, with possession always to the team that was
    attacking (not configurable per team).
  - Otherwise: a total above Ball Control succeeds; a total at or below
    Ball Control but outside the equality band fails.

An equality "ball out of play" result, and any foul result (section 5), are
recorded as a canonical fact for the applicable restart — `throw-in`,
`corner`, `freeKick` or `penalty` (by box location) — but that restart's
setup and execution are not implemented yet (`FINALISATION_AND_RESTARTS_RULES.md`);
see `docs/IMPLEMENTATION_STATUS.md`.

## 4. Successful Tackling

The defender needs no extra movement on success — section 1.1's automatic
pre-roll approach already placed it in the carrier's proximity before the
roll happened, so it simply takes possession from where it stands.

The dispossessed attacking player becomes inactive. Possession changes and a
new numbered turn begins with the recovering team attacking.

## 5. Failed Tackling, fouls and inactivity

On failure, the ball remains with the attacking player. The defender that
attempted Tackling becomes inactive in its current cell — **unless** the
failure is also a foul or an equality ball-out result, in which case the
stoppage of play ends any Tackling inactivity immediately (section 8's
fourth trigger) and none is created here.

**Fault determination.** Free Kick, Yellow Card and Red Card are three
independent Rule Set thresholds (1-7 each — section 7). For a given
threshold: at its minimum value (1), it checks the natural roll directly
(`natural === 1`); from 2 upward, it checks the total instead (after the
Tackling bonus) — a strong enough Tackling stat can then let a defender
avoid a card, or avoid the foul altogether, even on a bad natural roll. Red
wins any Yellow/Red overlap. Whenever the Free Kick threshold is met, the
attacking team receives the applicable Free Kick or Penalty restart fact
(by box location); whenever a card threshold is met, that card is recorded
for the defender. A card has no further gameplay effect (no sending-off, no
accumulation) — see `docs/IMPLEMENTATION_STATUS.md`.

For any inactive player Tackling did create, inactivity ends at the first of:

- the ball leaves that inactive player's own defensive area;
- possession changes;
- the numbered turn ends;
- **any stoppage of play begins** (a foul, or an equality ball-out result) —
  confirmed as a fourth trigger beyond `GAMEPLAY_RULES_FOUNDATIONS.md`
  section 3's three, so a fouling/stopped defender is never frozen through
  the outcome that follows.

While inactive, the established inactive-player contract applies: no actions,
reactions, possession, receiving, defensive area or blocking body; the
occupied cell remains unavailable as a final destination.

## 6. Natural results

Natural 20 always succeeds (section 3) and additionally grants the recovering
team the frozen Rule Set result: Bonus Action, no extra effect, AV or AVM.

Natural 1 always fails (section 3) and is then run through the same fault
determination as any other failure (section 5) — at the Free Kick/Yellow/
Red thresholds' shared default value of 1, this always meets every threshold
(since `natural === 1` is trivially true), producing a Free Kick/Penalty and
a red card. Raising any threshold to 2+ switches that specific threshold to
checking the total instead, which a strong enough bonus can clear even on a
Natural 1 — the roll still always fails, but may then avoid a card, or a
foul altogether, depending on which thresholds the total clears.

All AV/AVM effects use their mechanic-specific scope and expiry under
`MODIFIERS_AND_TRACKER_RULES.md`; they are not generic future-roll tokens.

## 7. Required Rule Set settings

The Tackling contract requires frozen Rule Set choices for:

- **Free Kick interval** (1-7, default 1);
- **Yellow Card interval** (1-7, default 1);
- **Red Card interval** (1-7, default 1);
- **Equality interval** (1-5, default 1);
- **Equality result**: Tackling succeeds, or ball out of play;
- **Natural-20 result**: Bonus Action, none, AV or AVM.

The permanent Tackling geometry is not a Rule Set value: eligibility is
always "the ball carrier inside the defender's defensive area at
defense-phase start" (section 1.1), and the automatic pre-roll approach
always uses whichever single legal axis reaches proximity soonest, with no
distance cap.

## 8. Canonical state and presentation

Engine/MatchState must own:

- the defense-phase-start Tackling eligibility snapshot;
- all active proximity and Marking-derived reactive opportunities (not
  implemented yet — section 1.2/1.3);
- multi-defender reaction ordering;
- pending reaction decisions, pair-specific deferrals and attack-phase
  suppression;
- the automatic pre-roll approach result — landed, blocked (naming the
  blocker) or out of range — pending roll and resolved Tackling facts;
- possession, inactivity reasons/expiry, cards, fouls and restart result;
- semantic Timeline and AI Export events for offered, deferred, suppressed,
  blocked, out-of-range, rolled, successful, failed, fouled and natural
  outcomes.

The UI projects these canonical facts and submits decisions or D20 values. It
does not derive proximity, defensive-area membership, approach geometry,
inactive state, restart, card or result locally.

Manual Multiplayer remains unchanged. Future multiplayer must route every
pending reactive Tackling decision to the defensive team recorded in MatchState.
