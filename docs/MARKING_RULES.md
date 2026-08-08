# Marking Rules

## Status and scope

This document is the agreed gameplay contract for **Marking** (`Marcaj`).
Sections 1–8 are implemented (`src/engine/markingRules.mjs`): the accept/
decline decision, the passive tracking response, fast exit by Speed
difference, and the Marking switch.

Shared reaction authority, defensive areas, possession, inactive players and
movement terminology remain defined by
[`GAMEPLAY_RULES_FOUNDATIONS.md`](GAMEPLAY_RULES_FOUNDATIONS.md) and
[`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). This document
adds no global reaction-chain rule and does not define Tackling; the specific
Marking-to-Tackling boundary belongs to the future Tackling contract.

## 1. Meaning of Marking

In this game, Marking is the name for an optional **passive defensive tracking
reaction**. It does not create a duel, alter attributes, restrict an action or
apply a direct bonus or penalty.

Its only gameplay effect is that the chosen defender spends its own total
Speed budget to follow the chosen attacker and keep that attacker inside the
defender's defensive area. The defensive area itself creates the relevant
gameplay pressure: Interception, the need for Dribbling when applicable,
future Tackling and other rules that explicitly use that area.

## 2. Ownership and limits

Only the defending team may declare Marking during the attacking team's
movement. Marking is a reaction and consumes neither normal Tracker action nor
personal action.

For each numbered turn:

- the defending team may accept at most two Markings in total;
- one attacker may have at most one active marker;
- one defender may actively mark at most one attacker.

An accepted Marking consumes one of the two team opportunities for that turn
— but only once it is genuinely real, not the instant the coach accepts it.
The opportunity is charged exactly once, at whichever of these happens
first:

- the attacker is already inside the newly assigned marker's defensive area
  the moment the Marking is accepted (nothing left to move for); or
- the marker's first tracking movement (section 5) actually commits legally.

Before that point the Marking is provisional. If the coach cancels it (Cancel
MRK, section 5) or it has no legal tracking move at all on its very first
response, before either of the two events above ever happened, it vanishes
exactly as if it had never been accepted — the team's opportunity count is
never touched. Once charged, it stays consumed no matter how the Marking
later ends, including a later Cancel MRK. Declining a Marking (section 3)
never consumes an opportunity, whether declining one candidate among several
or the whole list. The count resets only when the numbered turn ends.

## 3. Trigger and defender selection

Any active attacking player that does not currently possess the ball can
trigger Marking. The ball carrier can never trigger or be given a Marking.

The attacker's movement is **never truncated or interrupted**. It always
lands wherever the coach requested, in one uninterrupted action. Only after
that landing does the Engine work out whether the completed route touched
any eligible defender's area — either because the attacker already stood
inside that area before this movement started, or because the route entered
it at some point along the way — and, if so, opens the pending decision(s)
then.

If the completed route touched more than one eligible defender's area — at
the same cell where two or more areas overlap, or at different points along
the route — every eligible defender is presented to the defending coach
**together, as one list**, not asked about one at a time. They are ordered
by where each defender's area was first touched along the route (earliest
first); if two or more are tied (their areas overlap the very same cell),
the tie is broken by the higher **1vs1 Defending** card stat — this ordering
only decides the list's order, it has no other effect.

This never changes the core limits from section 2: one attacker can have at
most one active marker, and one defender can mark at most one attacker. The
defending coach picks **exactly one** defender from the list by name; that
defender becomes the attacker's marker and every other candidate is dropped
without being asked about separately. **Declining** rejects the whole list
at once — no Marking is created for any candidate, and no opportunity is
spent (see section 2, including the deferred-charging rule).

The decision shows the attacker and every eligible defender (post/name/team)
in the list, plus the defending team's remaining Marking-opportunity count.

## 4. No opportunities left, and fast exit

If the completed route touched at least one eligible defender's area (so a
decision would otherwise be due) but the defending team has already spent
both Marking opportunities this turn, no decision is offered for any of
them. The UI announces this once — "\<Team\> team has no marking left" — even
though the route may have technically touched more than one area.

The fast-exit exception in section 7 is evaluated per defender, from the
attacker's actual completed route. A defender whose specific route segment
qualifies for that exception is silently removed from the queue before any
decision opens for them — this never affects whether OTHER defenders in the
same queue get asked. If fast exit removes every defender that would
otherwise have been queued, the UI announces "X can't be marked by Y[, Z...]"
listing every defender fast exit ruled out for that route in one banner,
even though no decision ever opened for any of them.

## 5. Passive tracking movement

After Marking is accepted, the attacker completes the currently pending
movement. The marker's tracking check — whether it is the marking's first
one or a later one — is due the instant **that specific movement** ends,
never by waiting for some other action to start next. For a Normal Move
this is wired directly into the move's own commit; other action types that
can end an attacker's movement still fall back to opening it the moment the
next action tries to start, which is functionally the same result unless
the coach pauses indefinitely without acting again. The marker's **first**
tracking response opens immediately with no extra question. The reaction
then resolves (a legal move is committed, or the Marking ends); attack
continues with its next choice.

If the marked attacker moves again later in the same numbered turn, the
active marker is due another tracking check once that new movement ends.
Every check **after the first one** asks the defending coach first:

> **Do you want to continue Marking \<attacker name, post, team\> with
> \<marker name, post, team\>?**

Declining ends the Marking right here — the team's opportunity, if it was
already charged (section 2), stays consumed; it is never refunded. Accepting
proceeds straight to the free-move decision below, and never counts as a
second, separate Marking — it is the same one continuing, exactly as this
section already provided for.

The marker has a total tracking budget equal to its Speed for the entire
numbered turn. For example, a marker with Speed 5 that uses 3 cells of legal
tracking after the first attacking movement has at most 2 cells left for every
later tracking response that turn.

Each tracking movement follows the **exact same rule as ordinary piece
movement** (confirmed with the user, final revision — several earlier
attempts at a more permissive "free pathfinding" rule for Marking
specifically, up to and including an unlimited-bend cheapest-route search,
were all rejected after live testing showed the marker ending up with
tactical mobility the attacker itself never has, including repositioning
squarely in front of the attacker's own path with no real constraint): the
defending coach picks **one legal straight or diagonal axis toward the
marked attacker** (or, once already aligned with the attacker on one
coordinate, sideways along it) and any legal distance along that single
axis, exactly like any other piece's move. The axis is blocked by any body
— opponent or teammate — precisely like ordinary movement, with **no
bending, no switching, and no exception**. If every candidate axis is
blocked or off the board, the marker simply has no legal move this
response, the same way an attacker can be boxed in by opponents during an
ordinary move (see section 6). The diagonal 3-for-2 discount (docs above)
applies exactly as it does everywhere else in this engine.

This keeps the marker under the identical movement constraint as the
attacker it is tracking — neither side gets pathfinding freedom the other
lacks. It also means Marking never needed, and no longer has, any rule of
its own beyond the ordinary movement rule already defined for every piece.

Whether the chosen cell actually works is judged **at commit time, not
before**: committing a cell moves the marker immediately, like an ordinary
move, but only if the resulting defensive area still contains the marked
attacker. If it would not, the commit is **rejected outright** — the piece
does not move, no Speed is spent, and the coach sees: *"You have to have
\<attacker name, post, team\> in your defensive area or cancel your
marking."* The pending decision stays open, so the coach may immediately try
a different cell in the same response. If truly no legal cell is reachable
at all this response (every direction blocked or off the board, or no Speed
remains), the Marking ends (section 6) instead of opening a decision that
could never succeed.

**Cancel MRK**: while a Marking is active AND the attacking team's phase for
this numbered turn has not ended yet, the defending coach may end it
voluntarily via the Inspector's MRK / Cancel MRK control on the marker's own
card (see section 9) — auto-activated the instant the Marking is accepted,
and clickable from then on. Canceling before the team's opportunity was ever
actually charged (section 2) is entirely free, as if the Marking had never
existed; canceling after that point ends it like any other section-6 ending,
with the opportunity staying spent. Once the attacking team's phase ends,
that attacker cannot move again until next turn, so there is nothing left
for the Marking to react to this turn — the control goes inert (even though
the Marking itself remains technically active in canonical state until the
turn actually resets) rather than implying a decision still worth making
right now.

The marker does not receive a new normal action, personal action or fresh Speed
budget for this response.

## 6. End of Marking

Marking ends immediately when any of these occurs:

- the marker has no legal cell at all left to move into this response (every
  direction blocked or off the board) or no Speed remains;
- the marked attacker uses the fast-exit rule in section 7;
- the defending coach declines a "Continue Marking?" prompt (section 5);
- the defending coach voluntarily cancels via Cancel MRK (section 5);
- the defending coach accepts a Marking switch under section 8;
- the numbered turn ends.

The UI announces why a Marking ended for every one of these reasons, not only
fast exit. Every informational Marking banner (an ending, "X can't be marked
by Y", "no marking left", or a rejected commit's "you have to have X in your
defensive area") stays on screen for 4 seconds and never blocks the rest of
the game — only a pending decision itself (the accept/decline list, a
tracking-move decision, or "Continue Marking?") blocks other commands.

If a route would have queued or fast-exit-excused at least one defender but
the defending team already has 0 opportunities left, the UI shows **only**
"\<Team\> team has no marking left" — never also a fast-exit-specific notice
for the same route, since with zero opportunities left the distinction is
moot either way.

When a Marking ends because tracking is impossible, a Continue-Marking
decline, or fast exit, the team opportunity remains consumed **provided it
was ever actually charged** (section 2) — a Marking that never got past its
own first response before ending never touched the count, so there is
nothing to keep or refund. No direct gameplay effect occurs at the end: the
attacker has simply escaped that defender's defensive area (or the coach
chose to stop pursuing it) and normal gameplay resumes.

## 7. Fast exit by Speed difference

Fast exit is not a modifier and does not grant extra movement. It is a
movement-rule exception that prevents or ends Marking when the attacker has a
Speed value at least 2 higher than the relevant defender.

The exception applies only if the relevant part of the attacker's route:

- crosses at most two cells orthogonally inside that defender's defensive
  area, with the next orthogonal cell outside the area; or
- crosses at most one cell diagonally inside that defender's defensive area,
  with the next diagonal cell outside the area.

It applies in both situations below:

1. an unmarked attacker starts outside the area and only crosses through it
   using that limited route; no Marking prompt appears and no Marking is
   created;
2. an already marked attacker is inside the marker's area and uses that limited
   route to leave it; the Marking ends.

A route involving three or more orthogonal cells, or two or more diagonal
cells, inside the relevant defensive area does not qualify for fast exit.

This is judged against the attacker's whole movement action through that one
defensive area — from wherever it entered that area on its current locked
axis, cumulatively — never against a single fragment in isolation. Splitting
one long pass-through into several smaller commits must not let it qualify
for fast exit when the full route would not have.

For this cumulative crossing, a defender's own current cell always counts as
part of its own area, even though a card's defensive-area offsets never list
it separately (regression, confirmed live: an already-marked attacker's
historical route happened to pass through the exact cell the marker later
tracked onto; without this rule that one cell reads as "outside," splitting
one long continuous crossing into a long piece and a short trailing piece —
and the short piece alone could wrongly qualify for fast exit).

If the attacker is already marked and its current cell (where it has been
standing tracked) is itself inside the marker's area, that cell counts toward
the crossed-cell threshold, since it is genuinely part of the route it must
cross to escape. If instead this is a first-time, not-yet-marked entry check
and the attacker's movement happens to start already inside a defender's
area (section 3's "start inside" trigger), that starting cell does not count
toward the threshold — there is no active tracker on it to escape from, so
only the cells the movement actually crosses into are counted.

Case 1 above (fast exit silently skipping the Marking prompt) is still
announced to both coaches — "X can't be marked by Y" — even though no
Marking decision, and so no "Marking ended" event, ever existed. Without this
announcement the defending coach has no way to know fast exit fired at all,
and could otherwise waste a Marking opportunity trying again on the same
route.

A route can also have the Speed edge (attacker at least 2 higher) without
qualifying for fast exit, because the crossing itself was too long — three or
more orthogonal cells, or two or more diagonal cells, inside that one
defender's area before actually exiting it. This "near miss" is announced too
— to both coaches, naming the defender and the rule threshold — so a Speed
advantage that looked like it should have worked is never a silent, unexplained
non-event. It changes nothing else: case 1 still offers the ordinary Marking
decision, and case 2 still leaves the Marking active.

## 8. Marking switch and a new defensive area

An attacker with an active marker cannot receive a second simultaneous marker.
When that attacker enters the defensive area of a different defender, and the
defending team still has an unused Marking opportunity, the defending coach is
offered a canonical **Marking switch** choice:

- keep the existing marker; or
- end the existing Marking and assign the new defender as marker.

Accepting the switch consumes the next team Marking opportunity. The previous
Marking ends without refund. The new defender begins with its own full Speed
tracking budget for that turn and follows the normal acceptance/timing rules.

If the coach keeps the existing marker, no second marker is created. If the
attacker has already escaped a prior Marking and then immediately enters a
different defender's area, that player is unmarked again and the ordinary
Marking trigger in section 3 applies, provided that an opportunity remains.

## 9. Canonical state and visual projection

Engine/MatchState must own:

- the two-opportunity per-team count for the numbered turn;
- every active marker-target assignment, plus per-marking `respondedOnce`
  (has this Marking ever had its first tracking response resolved) and
  `opportunityConsumed` (has the team's count actually been charged for it
  yet) flags;
- each marker's consumed and remaining Speed budget;
- pending first-entry Marking decisions (the whole eligible-defender list),
  pending "Continue Marking?" decisions, pending tracking-move decisions, and
  pending Marking-switch decisions;
- the frozen attacker route/movement state around a decision;
- every accepted, declined, ended, canceled and switched Marking semantic
  event.

The UI projects those facts. It never determines a defensive-area entry,
eligibility, fast exit, Speed sufficiency, movement refund, containment or
switch locally. Timeline, Undo/Redo, Replay and AI Export must preserve the
same assignments, choices, budgets and end reasons.

The Inspector exposes a canonical **MRK / Cancel MRK** control on a piece's
own card: inert until that piece becomes an active marker, at which point it
shows "Cancel MRK" and, when clicked, sends the real cancel command (section
5) — it is never a cosmetic label, matching the "no fake controls" rule.

Available and active Marking information requires an explicit visual
projection. Its player-card indicator belongs beside the existing individual-
action markers. Exact iconography and CSS are a future presentation task; they
must consume the canonical state above rather than recalculate it.

Manual Multiplayer is unchanged. Any future multiplayer implementation must
route every pending Marking or switch choice to the defending team recorded in
MatchState.
