# Gameplay Rules Foundations

This is the canonical game-rule document for stable general concepts shared by
multiple future Match mechanics. It describes the intended board-game rule,
not a claim that every rule below is already implemented. Technical Engine,
MatchState, Timeline, MatchContext, authority and projection requirements stay
in [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md).

## Status and scope

The document records the agreed foundation for future offline Single Player
mechanics. It does not implement, reopen or modify any existing mechanic.

At this document's creation:

- Pass, Long Pass, Through Ball and Lofted Through Ball retain their own
  established contracts;
- `inactive` exists in current MatchState as a technical boolean, but it does
  not yet record the game-rule reason or expiry condition specified here;
- Tracker recognises `SHOT`, `CROSS`, `DRIBBLE` and `TACKLING` action markers,
  but those mechanics remain manual declarations rather than implemented rule
  resolvers;
- Manual Multiplayer and automated Multiplayer/Firebase are outside this
  document's implementation scope.

Every future mechanic using one of these rules must complete the Mechanic
Integration Gate before it is implemented. A MatchContext freezes its
applicable Rule Set at Match start; it must never read later Editor changes.

## 1. Shared board terms

### 1.1 Proximity area

A player's **proximity area** is the eight cells directly adjacent to its
occupied cell: the four orthogonal neighbours and the four diagonal neighbours.
It is a named gameplay concept and is distinct from that player's defensive
area.

### 1.2 Possession

The ball is in a player's possession when the ball and that player occupy the
same board cell.

### 1.3 Measurement and physical routes

Unless a mechanic explicitly says otherwise, a gameplay distance and a
positional comparison use cell centre to cell centre. A selected execution
corner is a physical foot/origin: it can alter a route, a physical contact or
an available execution point, but not the player's regulatory body position or
a centre-to-centre threshold.

## 2. Turn and phase vocabulary

A numbered turn contains two phases:

1. **Attack phase**: the attacking team performs its actions and the defending
   team may perform reactions provided by the applicable mechanic.
2. **Defense phase**: the defending team performs its defensive actions.

Existing Tracker economy, personal-action limits, Bonus Action rules and
possession transitions remain authoritative until a separately approved
mechanic explicitly extends them. A reaction is not an action and does not
consume normal Tracker or personal-action economy unless its own rule says so.

## 3. Inactive player

An **inactive player** is temporarily ignored as an active board participant
for the duration and expiry condition stated by the mechanism that made the
player inactive.

While inactive, the player:

- has no defensive area for gameplay evaluation;
- has no body that blocks a route or movement path;
- cannot possess or receive the ball;
- cannot perform an action or reaction.

The player's occupied cell remains unavailable as a finishing cell: neither a
player nor the ball may end in that cell. The player remains visibly present on
the board. The triggering mechanism defines exactly when inactivity ends.

Future implementation must persist the inactivity reason and expiry condition
canonically in MatchState so Timeline, Undo/Redo, Replay and AI Analysis Export
all restore the same state.

## 4. Reactions

A **reaction** is a gameplay response to a specified situation. It is not
marked or charged as a normal action. It can be automatic or may present a
decision to the authorised defensive coach, according to its own rule.

The planned reactions are:

- Interception — already defined by [`INTERCEPTION_ENGINE.md`](INTERCEPTION_ENGINE.md);
- goalkeeper Cross Claim — defined by [`CROSS_RULES.md`](CROSS_RULES.md), not
  yet implemented;
- Marking — not implemented;
- defensive Tackling — not implemented.

There is deliberately no global Engine rule stating that two reactions may
never occur consecutively. The restriction intended to prevent a defender from
using Marking and then immediately Tackling will be defined specifically by
those two mechanic contracts.

For any reaction requiring a coach choice, the pending decision is canonical
and belongs to the relevant team. A UI only projects that decision and submits
the chosen command; it does not determine entitlement or resolution locally.

## 5. Result and restart vocabulary

The general Match result categories are:

- **Goal**;
- **goal kick** (`aut de poartă`);
- **throw-in** (`aut de margine`);
- **corner**;
- **foul**, including any consequent free kick or penalty.

The mechanism that produces a result must create a semantic canonical event.
The detailed setup, positioning, restart action, scoring and tracker effects
for each category are deferred to their dedicated future contracts. This
document does not silently define those procedures before they are agreed.

## 6. Offside

This game uses the real-football positional rule, simplified only by not
modelling off-ball interference. At the exact moment a teammate plays or
touches the ball, assess only the player who will actually receive/play that
ball, including a player who reaches it through an applicable 3/2 resolution.

That effective recipient is offside only when all conditions below are true:

1. the recipient is in the opponents' half; the halfway line counts as onside;
2. the recipient is nearer to the opponents' goal line than the ball;
3. the recipient is nearer to the opponents' goal line than the second-last
   opponent.

Being level with the ball or with the second-last opponent is onside. A player
in its own half when the ball is played is onside. A backward pass or a pass to
a player level with the ball cannot create offside because the recipient is not
nearer to goal than the ball.

No offside offence exists when the ball is received **directly** from a goal
kick, throw-in or corner. Offside applies to a direct free kick and to ordinary
passes after any teammate has subsequently played the ball. These exceptions
and the positional tests follow [IFAB Law 11](https://www.theifab.com/laws/latest/offside/).

The game does not, at present, model the additional IFAB offences where an
offside-positioned player does not receive the ball but obstructs an opponent,
blocks vision or otherwise interferes with play.

## 7. Deferred mechanic contracts

The following need their own agreed rule and implementation contracts before
they can change Match gameplay:

- Cross implementation (its rule contract is [`CROSS_RULES.md`](CROSS_RULES.md));
- Finalisation, Shot, Header, goal scoring and goal-kick resolution;
- Marking;
- Tackling, fault and discipline;
- Dribbling;
- full throw-in, corner, free-kick and penalty procedures;
- half, extra-time, penalty-shoot-out and score-history automation in Tracker.

This list is a scope boundary, not an implementation authorization.
