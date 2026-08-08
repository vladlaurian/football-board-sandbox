import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";

// Tackling Build 1 (docs/TACKLING_RULES.md section 1.1, superseded per the
// live design session — eligibility is defensive-area-only now, every
// attempt auto-walks toward the carrier first). Reactive proximity-entry
// and Marking-delayed Tackling are not covered — see
// docs/IMPLEMENTATION_STATUS.md.

function state(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 10, y: 6 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 6 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 14, y: 6 },
    ],
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 1,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {},
      turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

// card-red-1's defensiveArea offset {dx:0, dy:-4} — team B transform
// boardDx=dy=-4, boardDy=-dx=0 — projects from (14,6) onto exactly (10,6),
// the attacker's cell. The only two cells on a legal single-axis approach
// from (14,6) toward (10,6)'s proximity are the same-row cells (11,6) and
// (9,6) — every other neighbour is a diagonal-or-mixed offset from (14,6).
function context(overrides = {}) {
  return {
    boardSettings: { cols: 20, rows: 12, boxWidth: 6, boxDepth: 3 },
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ name: "Ball Control", value: 10 }] },
      { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 5 }], defensiveArea: [{ dx: 0, dy: -4 }] },
    ],
    ruleSet: { diceModifiers: { stackCap: 20 } },
    ...overrides,
  };
}

function openDefensePhase(rawState = state(), matchContext = context()) {
  return applyGameCommand({ state: rawState, context: matchContext, command: { id: "phase-end-attack", type: "TRACKER_PHASE_ENDED", payload: { team: "blue" } } });
}

function startTackle(rawState, matchContext) {
  return applyGameCommand({ state: rawState, context: matchContext, command: { id: "tackle-start", type: "TACKLING_STARTED", payload: { pieceId: "red-1" } } });
}

function rollAndResolve(natural, rawState, matchContext, extra = {}) {
  const pending = rawState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: rawState, context: matchContext,
    command: {
      id: `tackle-roll-${natural}`, type: "GAMEPLAY_ROLL_SUBMITTED",
      payload: { rollEvent: { id: `roll-${natural}`, requestId: pending.requestId, actionId: pending.actionId, team: "red", dieType: 20, natural, subjectId: "red-1" }, createdAt: 1000, ...extra },
    },
  });
  assert.equal(rolled.accepted, true, `roll should be accepted: ${rolled.reason}`);
  const rollEventId = rolled.nextState.actionResolution.lastRollEvent.id;
  const resolved = applyGameCommand({
    state: rolled.nextState, context: matchContext,
    command: { id: `tackle-resolve-${natural}`, type: "TACKLING_RESOLUTION_DUE", payload: { rollEventId } },
  });
  assert.equal(resolved.accepted, true, `resolution should be accepted: ${resolved.reason}`);
  return { rolled, resolved, rollEventId };
}

test("defense-phase start freezes eligibility from the defensive-area overlap only", () => {
  const opened = openDefensePhase();
  assert.deepEqual(opened.nextState.tacklingEligibility, [{ defenderId: "red-1" }]);
});

test("a defender whose defensive area does not cover the carrier is not eligible", () => {
  const far = context({ gameplayCards: [context().gameplayCards[0], { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 5 }], defensiveArea: [{ dx: 0, dy: 1 }] }] });
  const opened = openDefensePhase(state(), far);
  assert.deepEqual(opened.nextState.tacklingEligibility, []);
});

test("TACKLING_STARTED auto-walks the defender to the nearest legal proximity cell and opens the roll", () => {
  const opened = openDefensePhase();
  const started = startTackle(opened.nextState, context());
  assert.equal(started.accepted, true);
  const defender = started.nextState.pieces.find(piece => piece.id === "red-1");
  assert.equal(defender.x, 11);
  assert.equal(defender.y, 6);
  assert.equal(started.nextState.actionResolution.kind, "tackling");
  assert.equal(started.nextState.actionResolution.status, "awaiting-interception-roll");
  assert.equal(started.nextState.tracker.usedActions.red, 1, "the Tracker action is consumed once the roll truly opens");
});

test("a blocked approach opens a no-cost notice instead of the roll, naming every blocker across every legal axis", () => {
  // From (7,5), the carrier's (10,6) proximity ring offers candidates on
  // two genuinely different, non-colinear axes: (9,5)/(10,5)/(11,5) are all
  // on the same straight row-5 line through (8,5), and (9,7) is reachable
  // only diagonally through (8,6) — blocking both intermediate cells with a
  // different piece each must report both, not just the nearest one.
  const blockedState = state({ pieces: [
    { id: "ball", team: "BALL", x: 10, y: 6 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 6 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 7, y: 5 },
    { id: "red-2", team: "B", cardId: "card-blue-1", x: 8, y: 5 },
    { id: "red-3", team: "B", cardId: "card-blue-1", x: 8, y: 6 },
  ] });
  const blockedContext = context({ gameplayCards: [context().gameplayCards[0], { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 5 }], defensiveArea: [{ dx: -1, dy: 3 }] }] });
  const opened = openDefensePhase(blockedState, blockedContext);
  const started = startTackle(opened.nextState, blockedContext);
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionResolution.status, "blocked");
  assert.deepEqual(started.nextState.actionResolution.blockerIds.sort(), ["red-2", "red-3"]);
  assert.equal(started.nextState.tracker.usedActions.red, 0, "no Tracker action is consumed on a blocked attempt");
  const defender = started.nextState.pieces.find(piece => piece.id === "red-1");
  assert.equal(defender.x, 7, "the defender never physically moved");

  const acknowledged = applyGameCommand({ state: started.nextState, context: blockedContext, command: { id: "ack", type: "TACKLING_NOTICE_ACKNOWLEDGED", payload: {} } });
  assert.equal(acknowledged.accepted, true);
  assert.equal(acknowledged.nextState.actionResolution, null);
  assert.equal(acknowledged.nextState.tracker.usedActions.red, 0);
});

test("a piece standing exactly on a candidate landing cell is reported as a blocker too, not just path bodies", () => {
  // Reported live: a body sitting ON the only other reachable candidate
  // (not on the path to it) was silently dropped before ever being
  // checked, so it never showed up in the notice. blue-2 sits exactly on
  // (11,6), the closest candidate from the default (14,6) fixture — it
  // must be named. (The farther same-row candidate, (9,6), is also
  // unreachable, but blue-2 sitting at (11,6) is itself the first body on
  // that path too, so it is the only blocker found either way.)
  const occupiedLanding = state({ pieces: [
    ...state().pieces,
    { id: "blue-2", team: "A", cardId: "card-blue-1", x: 11, y: 6 },
  ] });
  const opened = openDefensePhase(occupiedLanding);
  const started = startTackle(opened.nextState, context());
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionResolution.status, "blocked");
  assert.deepEqual(started.nextState.actionResolution.blockerIds.sort(), ["blue-2"]);
});

test("an inactive body never blocks the approach axis, only its own cell as a landing spot", () => {
  // docs/GAMEPLAY_RULES_FOUNDATIONS.md section 3: an inactive player has no
  // body that blocks a route. red-2 sits on (12,6) (mid-path to the (11,6)
  // candidate) but is inactive — the approach must go straight through it
  // and land on (11,6) as usual.
  const withInactiveBody = state({ pieces: [
    ...state().pieces,
    { id: "red-2", team: "B", cardId: "card-blue-1", x: 12, y: 6, inactive: true },
  ] });
  const opened = openDefensePhase(withInactiveBody);
  const started = startTackle(opened.nextState, context());
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionResolution.status, "awaiting-interception-roll");
  const defender = started.nextState.pieces.find(piece => piece.id === "red-1");
  assert.equal(defender.x, 11); assert.equal(defender.y, 6);
});

test("an inactive body still blocks its own cell as a landing destination", () => {
  // From (7,5) the closest candidate is (9,5); an inactive piece sitting
  // exactly there still makes it unavailable as a destination (occupied),
  // so the approach must fall back to the next candidate on a genuinely
  // different axis, (9,7) — never crossing the inactive body's own cell.
  const onLandingCell = state({ pieces: [
    { id: "ball", team: "BALL", x: 10, y: 6 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 6 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 7, y: 5 },
    { id: "red-2", team: "B", cardId: "card-blue-1", x: 9, y: 5, inactive: true },
  ] });
  const landingContext = context({ gameplayCards: [context().gameplayCards[0], { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 5 }], defensiveArea: [{ dx: -1, dy: 3 }] }] });
  const opened = openDefensePhase(onLandingCell, landingContext);
  const started = startTackle(opened.nextState, landingContext);
  assert.equal(started.accepted, true);
  const defender = started.nextState.pieces.find(piece => piece.id === "red-1");
  assert.equal(defender.x, 9); assert.equal(defender.y, 7);
});

test("a carrier no longer inside the defender's defensive area opens the out-of-range notice, at no cost", () => {
  const moved = state({ pieces: [
    { id: "ball", team: "BALL", x: 10, y: 6 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 6 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 3, y: 3 },
  ] });
  // Eligibility stays frozen from an earlier snapshot even though red-1 has
  // since wandered off — the fresh execution-time check must catch this.
  const withFrozenSnapshot = createGameState({ ...moved, tacklingEligibility: [{ defenderId: "red-1" }] });
  const started = startTackle(withFrozenSnapshot, context());
  assert.equal(started.accepted, true);
  assert.equal(started.nextState.actionResolution.status, "out-of-range");
  assert.equal(started.nextState.tracker.usedActions.red, 0);
});

test("a successful Tackling needs no extra movement — the defender already stands adjacent from the auto-walk", () => {
  const opened = openDefensePhase();
  const started = startTackle(opened.nextState, context());
  const { resolved } = rollAndResolve(20, started.nextState, context());
  assert.equal(resolved.nextState.actionResolution.status, "result-display");
  assert.equal(resolved.nextState.actionResolution.result.success, true);
  const applied = applyGameCommand({
    state: resolved.nextState, context: context(),
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, true);
  const defender = applied.nextState.pieces.find(piece => piece.id === "red-1");
  const attacker = applied.nextState.pieces.find(piece => piece.id === "blue-1");
  const ball = applied.nextState.pieces.find(piece => piece.id === "ball");
  assert.equal(defender.x, 11); assert.equal(defender.y, 6);
  assert.equal(ball.x, 11); assert.equal(ball.y, 6);
  assert.equal(attacker.inactive, true);
  assert.equal(applied.nextState.tracker.startingTeam, "red");
  assert.equal(applied.nextState.tracker.currentTurn, 2);
  assert.equal(applied.nextState.actionResolution, null);
});

test("an ordinary failure (default thresholds, natural not 1) continues via the result screen with no card", () => {
  // natural 5 + Tackling 5 = 10, below Ball Control 10... equal actually —
  // use natural 3 to land clearly below the equality band (default interval 1: 9 vs 10).
  const opened = openDefensePhase();
  const started = startTackle(opened.nextState, context());
  const { resolved } = rollAndResolve(3, started.nextState, context());
  assert.equal(resolved.nextState.actionResolution.result.success, false);
  assert.equal(resolved.nextState.actionResolution.result.foul, false);
  const applied = applyGameCommand({
    state: resolved.nextState, context: context(),
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, true);
  assert.equal(applied.nextState.pieces.find(piece => piece.id === "red-1").inactive, true);
  assert.equal(applied.nextState.disciplinaryCards.length, 0);
  assert.equal(applied.nextState.actionResolution, null);
});

test("Natural 1 at default thresholds always fouls with a red card, and (outside the box) proceeds into a Direct Free Kick's own restart setup", () => {
  const opened = openDefensePhase();
  const started = startTackle(opened.nextState, context());
  const { resolved } = rollAndResolve(1, started.nextState, context());
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.success, false);
  assert.equal(result.foul, true);
  assert.equal(result.cardType, "red");
  // The attacker (fouled player) stands at (10,6) — boardSettings here put
  // the penalty area at x<3 or x>=17, so this foul is outside the box: a
  // Direct Free Kick, no longer frozen.
  assert.equal(result.restartType, "freeKick");
  const freeKickContext = context({ ruleSet: { diceModifiers: { stackCap: 20 }, actions: { restarts: { freeKickDirect: { wallSize: 4, repositionCount: 5, availableActions: ["short-pass", "long-pass", "through-ball", "lofted-through-ball", "shot"], loftedThroughBallDifficultyOverride: 18 } } } } });
  const applied = applyGameCommand({
    state: resolved.nextState, context: freeKickContext,
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, true);
  assert.equal(applied.nextState.actionResolution, null);
  assert.equal(applied.nextState.restartSetup?.type, "freeKickDirect");
  assert.equal(applied.nextState.restartSetup?.team, "blue", "the team fouled (blue, the attacker's own) is entitled to the restart");
  assert.deepEqual(applied.nextState.restartSetup?.ballCell, { x: 10, y: 6 });
  const ball = applied.nextState.pieces.find(piece => piece.id === "ball");
  assert.deepEqual({ x: ball.x, y: ball.y }, { x: 10, y: 6 }, "the ball piece is placed at the restart spot");
  assert.equal(applied.nextState.disciplinaryCards.length, 1);
  // No change of possession (the fouled team already had the ball) — same
  // numbered turn, tracker-only reset, confirmed live with the user as the
  // general rule (contrast with Indirect Free Kick's real turn advance).
  assert.equal(applied.nextState.tracker.currentTurn, 1, "still the same numbered turn");
  assert.equal(applied.nextState.tracker.startingTeam, "blue", "startingTeam is untouched");
  assert.equal(applied.nextState.tracker.turnPhase, "attack", "the entitled (fouled) team is active again");
  assert.deepEqual(applied.nextState.tracker.usedActions, { blue: 0, red: 0 }, "Tracker action economy resets");
  assert.deepEqual(applied.nextState.movementStateByPieceId, {}, "individual movement state resets");
});

test("a penalty-area Tackling foul still freezes the result screen (Penalty execution isn't built yet)", () => {
  const boxState = state({ pieces: [
    { id: "ball", team: "BALL", x: 2, y: 6 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 2, y: 6 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 6, y: 6 },
  ] });
  const boxContext = context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 5 }], defensiveArea: [{ dx: 0, dy: -4 }] },
  ] });
  const opened = openDefensePhase(boxState, boxContext);
  const started = startTackle(opened.nextState, boxContext);
  const { resolved } = rollAndResolve(1, started.nextState, boxContext);
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.foul, true);
  assert.equal(result.restartType, "penalty", "attacker at x:2 is inside the x<3 penalty area");
  const applied = applyGameCommand({
    state: resolved.nextState, context: boxContext,
    command: { id: "consequence-penalty", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, false);
  assert.equal(applied.reason, "TACKLING_RESULT_FROZEN");
  assert.ok(resolved.nextState.actionResolution, "the frozen result screen is still there");
});

test("raising Free Kick to 2+ lets a strong bonus rescue Natural 1 from a foul, though it is still a failure", () => {
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { freeKickInterval: 3, yellowCardInterval: 3, redCardInterval: 3 } } };
  const strongContext = context({ ruleSet, gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 15 }], defensiveArea: [{ dx: 0, dy: -4 }] },
  ] });
  const opened = openDefensePhase(state(), strongContext);
  const started = startTackle(opened.nextState, strongContext);
  const { resolved } = rollAndResolve(1, started.nextState, strongContext);
  const result = resolved.nextState.actionResolution.result;
  // natural 1 + 15 = 16, comfortably above the freeKick/card threshold of 3.
  assert.equal(result.success, false, "Natural 1 is still always a failure");
  assert.equal(result.foul, false);
  assert.equal(result.cardType, null);
});

test("a failing roll whose total falls in the equality band goes out of play instead of an ordinary loss", () => {
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { equalityInterval: 3 } } };
  const equalContext = context({ ruleSet });
  const opened = openDefensePhase(state(), equalContext);
  const started = startTackle(opened.nextState, equalContext);
  // natural 8 + Tackling 5 = 13... use natural values so total sits inside (10-3, 10] = (7,10].
  const { resolved } = rollAndResolve(4, started.nextState, equalContext);
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.total, 9);
  assert.equal(result.success, false);
  assert.equal(result.outOfPlay, true);
  const applied = applyGameCommand({
    state: resolved.nextState, context: equalContext,
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, false, "equality's out-of-play result also freezes the screen");
});

test("equality band overlapping a fault band still resolves as equality", () => {
  // freeKickInterval=9 (total-based) would also catch total=9 as a foul —
  // equality must win.
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { equalityInterval: 3, freeKickInterval: 9, yellowCardInterval: 9, redCardInterval: 9 } } };
  const overlapContext = context({ ruleSet });
  const opened = openDefensePhase(state(), overlapContext);
  const started = startTackle(opened.nextState, overlapContext);
  const { resolved } = rollAndResolve(4, started.nextState, overlapContext);
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.total, 9);
  assert.equal(result.outOfPlay, true);
  assert.equal(result.foul, undefined);
});

test("Natural 20 always succeeds even against a much higher Ball Control", () => {
  const highControl = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ name: "Ball Control", value: 30 }] },
    context().gameplayCards[1],
  ] });
  const opened = openDefensePhase(state(), highControl);
  const started = startTackle(opened.nextState, highControl);
  const { resolved } = rollAndResolve(20, started.nextState, highControl);
  assert.equal(resolved.nextState.actionResolution.result.success, true);
});

test("Natural 20's result names the natural roll that earned it, via the shared naturalRollOutcome line", () => {
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { natural20Result: "avm" } } };
  const avmContext = context({ ruleSet });
  const opened = openDefensePhase(state(), avmContext);
  const started = startTackle(opened.nextState, avmContext);
  const { resolved } = rollAndResolve(20, started.nextState, avmContext);
  const naturalOutcome = resolved.nextState.actionResolution.result.naturalOutcome;
  assert.equal(naturalOutcome.kind, "major-advantage");
  assert.equal(naturalOutcome.natural, 20);
  assert.equal(naturalOutcome.team, "red");
});

test("an ordinary success by total (not Natural 20) reports no natural-roll outcome", () => {
  const highStatContext = context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 15 }], defensiveArea: [{ dx: 0, dy: -4 }] },
  ] });
  const opened = openDefensePhase(state(), highStatContext);
  const started = startTackle(opened.nextState, highStatContext);
  const { resolved } = rollAndResolve(5, started.nextState, highStatContext);
  assert.equal(resolved.nextState.actionResolution.result.success, true);
  assert.equal(resolved.nextState.actionResolution.result.natural, 5);
  assert.equal(resolved.nextState.actionResolution.result.naturalOutcome, null);
});

test("Natural 20 actually grants the configured AV token, not just a displayed label", () => {
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { natural20Result: "av" } } };
  const avContext = context({ ruleSet });
  const opened = openDefensePhase(state(), avContext);
  const started = startTackle(opened.nextState, avContext);
  const { resolved } = rollAndResolve(20, started.nextState, avContext);
  const applied = applyGameCommand({
    state: resolved.nextState, context: avContext,
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, true);
  const grantedToken = applied.nextState.teamModifierTokens.find(token => token.team === "red" && token.modifierType === "advantage");
  assert.ok(grantedToken, "an advantage token must actually be granted to the recovering team");
});

test("Natural 20 set to Bonus Action actually opens a Bonus Card Action continuation", () => {
  const ruleSet = { diceModifiers: { stackCap: 20 }, actions: { tackling: { natural20Result: "bonusAction" } } };
  const bonusContext = context({ ruleSet });
  const opened = openDefensePhase(state(), bonusContext);
  const started = startTackle(opened.nextState, bonusContext);
  const { resolved } = rollAndResolve(20, started.nextState, bonusContext);
  const applied = applyGameCommand({
    state: resolved.nextState, context: bonusContext,
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.accepted, true);
  assert.equal(applied.nextState.actionContinuation?.kind, "bonus-card-action");
  assert.equal(applied.nextState.actionContinuation?.team, "red");
});

test("only the optional bonus token is capped — the defender's own Tackling stat is never capped", () => {
  // Tackling stat 15 alone, cap 4, no token chosen: the modifier must stay
  // the full 15, not be clamped down to 4.
  const highStatContext = context({
    ruleSet: { diceModifiers: { stackCap: 4 } },
    gameplayCards: [context().gameplayCards[0], { id: "card-red-1", passiveAttributes: [{ id: "stat:tackling", name: "Tackling", value: 15 }], defensiveArea: [{ dx: 0, dy: -4 }] }],
  });
  const opened = openDefensePhase(state(), highStatContext);
  const started = startTackle(opened.nextState, highStatContext);
  const { resolved } = rollAndResolve(2, started.nextState, highStatContext);
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.modifier, 15, "the bare stat is never capped");
  assert.equal(result.total, 17);
  assert.equal(result.capped, false, "no cap note should show when no token was applied");
});

test("Tackling inactivity clears at the next numbered turn", () => {
  const opened = openDefensePhase();
  const started = startTackle(opened.nextState, context());
  const { resolved } = rollAndResolve(3, started.nextState, context());
  const applied = applyGameCommand({
    state: resolved.nextState, context: context(),
    command: { id: "consequence", type: "TACKLING_CONSEQUENCE_DUE", payload: { rollEventId: resolved.nextState.actionResolution.lastRollEvent.id } },
  });
  assert.equal(applied.nextState.pieces.find(piece => piece.id === "red-1").inactive, true);
  const nextTurn = applyGameCommand({ state: applied.nextState, context: context(), command: { id: "phase-end-defense", type: "TRACKER_PHASE_ENDED", payload: { team: "red" } } });
  assert.equal(nextTurn.accepted, true);
  assert.equal(nextTurn.nextState.tracker.currentTurn, 2);
  assert.equal(nextTurn.nextState.pieces.find(piece => piece.id === "red-1").inactive, false);
});
