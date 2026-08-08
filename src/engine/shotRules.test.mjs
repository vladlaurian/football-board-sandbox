import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerRollPromptPresentation, selectSinglePlayerShotPresentation, selectSinglePlayerShotTargetPresentation } from "./matchPresentationSelectors.mjs";
import { dispatchSinglePlayerGameCommand } from "./singlePlayerController.mjs";
import { atomicTimelineTransactionId, redoAtomicTimelineTransaction, redoTimeline, undoAtomicTimelineTransaction, undoTimeline } from "../timeline/timelineEngine.mjs";
import { buildShotRoutePlan, randomCornerCell, randomGoalKickCell, verticalSideFromShotTarget } from "./shotRules.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { formationStarterCoordinates } from "../board/formationLayout.mjs";

function context(overrides = {}) {
  return createMatchContext({
    id: "shot-test-context",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17, smallDepth: 3, smallWidth: 9 },
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-def-card", name: "Red DF", position: "DF", defensiveArea: [{ dx: 0, dy: 1 }] },
    ],
    ...overrides,
  });
}

function state(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      { id: "red-df", team: "B", cardId: "red-def-card", x: 17, y: 8 },
    ],
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack",
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, personalActionsByPieceId: {}, matchActionState: {},
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function selectedShot(rawState = state(), target = { side: "right", depth: 0, y: 2 }, matchContext = context()) {
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  assert.equal(started.accepted, true);
  const selected = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "shot-target", type: "SHOT_TARGET_SELECTED", payload: { shotId: "shot-1", target } } });
  assert.equal(selected.accepted, true);
  return { matchContext, selected };
}

function confirmedShot(rawState = state(), matchContext = context()) {
  const { selected } = selectedShot(rawState, undefined, matchContext);
  const legal = selected.nextState.actionResolution.routes.find(route => route.legal);
  assert.ok(legal, "fixture must have one legal corner-to-centre Shot route");
  const confirmed = applyGameCommand({ state: selected.nextState, context: matchContext, command: { id: "shot-route", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "shot-1", cornerId: legal.cornerId } } });
  assert.equal(confirmed.accepted, true);
  return { matchContext, confirmed };
}

function rolledShot(natural, rawState = state(), matchContext = context(), { createdAt = 1000, bonusModifierType = null } = {}) {
  const before = confirmedShot(rawState, matchContext);
  const pending = before.confirmed.nextState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: before.confirmed.nextState,
    context: matchContext,
    command: {
      id: `shot-roll-${natural}`,
      type: "GAMEPLAY_ROLL_SUBMITTED",
      payload: { rollEvent: { id: `roll-${natural}`, requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural, subjectId: "blue-st", reactionIndex: 0, createdAt }, createdAt, bonusModifierType },
    },
  });
  return { matchContext, confirmed: before.confirmed, rolled };
}

function resolveShot(natural, rawState = state(), matchContext = context(), options = {}) {
  const { rolled } = rolledShot(natural, rawState, matchContext, options);
  assert.equal(rolled.accepted, true);
  const action = rolled.nextState.actionResolution;
  const resolved = applyGameCommand({
    state: rolled.nextState,
    context: matchContext,
    command: { id: `shot-resolution-${natural}`, type: "SHOT_RESOLUTION_DUE", payload: { shotId: action.id, rollEventId: action.lastRollEvent.id } },
  });
  return { matchContext, rolled, resolved };
}

test("Shot exposes actual opponent GoalGrid cells and persists four Pass-style corner routes", () => {
  const base = state();
  const matchContext = context();
  const started = applyGameCommand({ state: base, context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  const targetProjection = selectSinglePlayerShotTargetPresentation(started.nextState, matchContext);
  assert.equal(targetProjection.targetOptions.length, 10);
  assert.deepEqual(targetProjection.targetOptions[0], { side: "right", depth: 0, y: 0, x: 20, boardY: 3 });
  const { selected } = selectedShot(base, undefined, matchContext);
  assert.equal(selected.nextState.actionResolution.routes.length, 4);
  assert.equal(selected.nextState.actionResolution.routes.every(route => route.endpoint.x >= 20), true);
  const presentation = selectSinglePlayerShotPresentation(selected.nextState);
  assert.equal(presentation.routes.every(route => ["clear", "risk", "blocked"].includes(route.status)), true);
});

test("Shot records an illegal board target as a grey canonical preview and keeps Tracker untouched", () => {
  const matchContext = context();
  const started = applyGameCommand({ state: state(), context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  const invalid = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "shot-target-field", type: "SHOT_TARGET_SELECTED", payload: { shotId: "shot-1", target: { x: 14, y: 5 } } } });
  assert.equal(invalid.accepted, true);
  assert.equal(invalid.nextState.actionResolution.status, "targeting");
  assert.deepEqual(invalid.nextState.actionResolution.attemptedTarget, { x: 14, y: 5 });
  assert.equal(invalid.nextState.actionResolution.targetInvalidReason, "SHOT_TARGET_MUST_BE_OPPONENT_GOAL");
  assert.equal(invalid.nextState.actionResolution.routes.every(route => !route.legal), true);
  assert.equal(invalid.nextState.tracker.usedActions.blue, 0);
  const corrected = applyGameCommand({ state: invalid.nextState, context: matchContext, command: { id: "shot-target-goal", type: "SHOT_TARGET_SELECTED", payload: { shotId: "shot-1", target: { x: 20, y: 5 } } } });
  assert.equal(corrected.accepted, true);
  assert.equal(corrected.nextState.actionResolution.status, "route-selection");
});

test("Shot always counts the shooter's occupied defensive area, then deduplicates its defender", () => {
  const matchContext = createMatchContext({
    id: "shot-origin-dv",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    gameplayCards: [
      { id: "blue-card", position: "ST", preferredFoot: "Right" },
      { id: "red-def-card", position: "DF", defensiveArea: [{ dx: -1, dy: 0 }, { dx: 0, dy: -1 }] },
    ],
  });
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 14, y: 5 },
    { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
    { id: "red-origin", team: "B", cardId: "red-def-card", x: 14, y: 4 },
  ] });
  const plan = buildShotRoutePlan({ state: rawState, context: matchContext, shooter: rawState.pieces[1], target: { side: "right", depth: 0, y: 2 }, cornerId: "top-right" });
  assert.equal(plan.defensiveAreaCrossings.filter(item => item.defenderId === "red-origin").length, 1);
  assert.equal(plan.defensiveAreaCrossings.find(item => item.defenderId === "red-origin").origin, true);
  assert.equal(plan.modifierSources.filter(item => item.defenderId === "red-origin").length, 1);
  assert.equal(plan.rollPreview.modifierSources.filter(item => item.defenderId === "red-origin").length, 1);
});

test("a non-dominant-foot route with no defensive-area facts is presented as clear, not risk", () => {
  const matchContext = context({
    gameplayCards: [{ id: "blue-card", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] }],
  });
  const rawState = state({ pieces: [{ id: "ball", team: "BALL", x: 14, y: 5 }, { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 }] });
  const { selected } = selectedShot(rawState, { side: "right", depth: 0, y: 2 }, matchContext);
  const presentation = selectSinglePlayerShotPresentation(selected.nextState);
  const nonDominantRoute = presentation.routes.find(route => route.legal && route.foot && !route.foot.dominant && (route.defensiveAreaCrossings || []).length === 0);
  assert.ok(nonDominantRoute, "fixture must have a legal non-dominant-foot route with no defensive-area facts");
  assert.equal(nonDominantRoute.status, "clear");
});

test("a route with a defensive-area fact is presented as risk, regardless of foot", () => {
  const matchContext = createMatchContext({
    id: "shot-risk-color",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    gameplayCards: [
      { id: "blue-card", position: "ST", preferredFoot: "Right" },
      { id: "red-def-card", position: "DF", defensiveArea: [{ dx: -1, dy: 0 }, { dx: 0, dy: -1 }] },
    ],
  });
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 14, y: 5 },
    { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
    { id: "red-origin", team: "B", cardId: "red-def-card", x: 14, y: 4 },
  ] });
  const { selected } = selectedShot(rawState, { side: "right", depth: 0, y: 2 }, matchContext);
  const presentation = selectSinglePlayerShotPresentation(selected.nextState);
  const withArea = presentation.routes.find(route => route.legal && (route.defensiveAreaCrossings || []).length > 0);
  assert.ok(withArea, "fixture must have a legal route with a defensive-area fact");
  assert.equal(withArea.status, "risk");
});

// goalTop = floor((12-5)/2) = 3, so the goal band is rows 3..7 and its
// bottom post sits at row 8. Target { side: "right", depth: 0, y: 4 } is the
// bottom-most goal cell (goalTop + 4 = 7). Shooter y=10, corner "bottom-right"
// (+1/+1) puts the origin at y=11 in every case below; only origin.x moves,
// sweeping the angle to the near (bottom) post through the 45° threshold.
function boardBoundaryShooter(x) {
  return { id: "blue-wide-angle", team: "A", cardId: "blue-card", x, y: 10 };
}
function boardBoundaryPlan(shooterX) {
  const shooter = boardBoundaryShooter(shooterX);
  const rawState = state({ pieces: [{ id: "ball", team: "BALL", x: shooterX, y: 10 }, shooter, { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 }, { id: "red-df", team: "B", cardId: "red-def-card", x: 17, y: 8 }] });
  return buildShotRoutePlan({ state: rawState, context: context(), shooter, target: { side: "right", depth: 0, y: 4 }, cornerId: "bottom-right" });
}

test("a Shot at a wide-open angle to the near post exits the board for part of its route and is illegal", () => {
  const plan = boardBoundaryPlan(17); // origin (18, 11): well under 45°
  assert.equal(plan.exitsBoard, true);
  assert.equal(plan.legal, false);
});

test("a Shot exactly at the 45° threshold to the near post is treated as exiting the board (inclusive boundary)", () => {
  const plan = boardBoundaryPlan(16); // origin (17, 11): line crosses the goal-line plane exactly at the post
  assert.equal(plan.exitsBoard, true);
  assert.equal(plan.legal, false);
});

test("a Shot at a steeper angle than 45° to the near post stays on the board and is legal", () => {
  const plan = boardBoundaryPlan(15); // origin (16, 11): comfortably over 45°
  assert.equal(plan.exitsBoard, false);
  assert.equal(plan.legal, true);
});

test("exemptFromBoardBoundary lets an otherwise-identical wide-angle route stay legal (future Corner Shot's own contract)", () => {
  const shooter = boardBoundaryShooter(17);
  const rawState = state({ pieces: [{ id: "ball", team: "BALL", x: 17, y: 10 }, shooter] });
  const plan = buildShotRoutePlan({ state: rawState, context: context(), shooter, target: { side: "right", depth: 0, y: 4 }, cornerId: "bottom-right", exemptFromBoardBoundary: true });
  assert.equal(plan.exitsBoard, false);
  assert.equal(plan.legal, true);
});

test("Shot blocks a shared origin corner exactly as the Pass physical model requires", () => {
  const blockedState = state({ pieces: [...state().pieces, { id: "blue-adjacent", team: "A", x: 15, y: 5 }] });
  const { selected } = selectedShot(blockedState);
  const shared = selected.nextState.actionResolution.routes.find(route => route.cornerId === "top-right");
  assert.equal(shared.legal, false);
  assert.ok(shared.originBlocker);
});

test("Shot route confirmation consumes exactly one normal Tracker and personal action", () => {
  const { confirmed } = confirmedShot();
  assert.deepEqual(confirmed.nextState.tracker.actionLog.blue[0], { id: "shot-route", type: "SHOT", trackerMarker: "SH", pieceId: "blue-st" });
  assert.equal(confirmed.nextState.tracker.usedActions.blue, 1);
  assert.equal(confirmed.nextState.tracker.personalActionsByPieceId["blue-st"], 1);
  assert.equal(confirmed.nextState.actionResolution.status, "awaiting-roll");
});

test("Shot rejects a route confirmation whose corner is not one of the four canonical Pass corners", () => {
  const { matchContext, selected } = selectedShot();
  const rejected = applyGameCommand({
    state: selected.nextState,
    context: matchContext,
    command: { id: "shot-route-invalid-corner", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "shot-1", cornerId: "garbage" } },
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "SHOT_ROUTE_INVALID");
  assert.equal(rejected.nextState, undefined);
});

// SHOT_CANCELLED: full cancel from targeting or route-selection, exactly
// like Pass, Through Ball and Lofted Through Ball. Reselecting the goal
// target always starts Shot over rather than only clearing the route.
test("SHOT_CANCELLED exits Shot entirely from targeting or route-selection, and is rejected once a roll is pending", () => {
  const matchContext = context();
  const { selected } = selectedShot(state(), undefined, matchContext);
  const cancelledFromTargeting = applyGameCommand({ state: selected.nextState, context: matchContext, command: { id: "shot-cancel-targeting", type: "SHOT_CANCELLED", payload: {} } });
  assert.equal(cancelledFromTargeting.accepted, true);
  assert.equal(cancelledFromTargeting.nextState.actionResolution, null);
  assert.equal(cancelledFromTargeting.events[0].type, "SHOT_CANCELLED");

  const { confirmed } = confirmedShot(state(), matchContext);
  const cancelledFromRouteSelection = applyGameCommand({
    state: { ...confirmed.nextState, actionResolution: { ...confirmed.nextState.actionResolution, status: "route-selection" } },
    context: matchContext,
    command: { id: "shot-cancel-route", type: "SHOT_CANCELLED", payload: {} },
  });
  assert.equal(cancelledFromRouteSelection.accepted, true);
  assert.equal(cancelledFromRouteSelection.nextState.actionResolution, null);

  const { rolled } = rolledShot(9);
  const rejectedAfterRoll = applyGameCommand({ state: rolled.nextState, context: matchContext, command: { id: "shot-cancel-too-late", type: "SHOT_CANCELLED", payload: {} } });
  assert.equal(rejectedAfterRoll.accepted, false);
  assert.equal(rejectedAfterRoll.reason, "SHOT_NOT_CANCELLABLE");
});

// Test 1: submitShotRoll writes the rolling team's dice result and leaves the
// opponent's untouched, exactly as Lofted Through Ball does.
test("submitShotRoll writes canonical state.dice for the rolling team only", () => {
  const { confirmed, rolled } = rolledShot(15);
  assert.equal(confirmed.nextState.dice.blueResult, null);
  assert.equal(rolled.accepted, true);
  assert.equal(rolled.nextState.dice.blueResult, 15);
  assert.equal(rolled.nextState.dice.dieType, 20);
  assert.equal(rolled.nextState.dice.blueLastDieType, 20);
  assert.equal(rolled.nextState.dice.redResult, null);
  assert.equal(rolled.nextState.actionResolution.status, "awaiting-shot-resolution");
});

// Test 2: the roll produces a shared hold descriptor with kind "shot" and an
// exact 1000 ms delay.
test("Shot roll produces a canonical result-hold descriptor with kind shot and a 1000 ms delay", () => {
  const { rolled } = rolledShot(9, state(), context(), { createdAt: 5000 });
  const delayed = rolled.events[0].metadata.delayedResolution;
  assert.equal(delayed.kind, "shot");
  assert.equal(delayed.actionId, "shot-1");
  assert.equal(delayed.createdAt, 5000);
  assert.equal(delayed.resolveAt - delayed.createdAt, 1000);
});

// Test 3: SHOT_RESOLUTION_DUE is rejected when the Shot/RollEvent identity or
// status does not match.
test("SHOT_RESOLUTION_DUE rejects a mismatched identity or non-resolving status", () => {
  const { matchContext, rolled } = rolledShot(9);
  const action = rolled.nextState.actionResolution;
  const wrongShotId = applyGameCommand({ state: rolled.nextState, context: matchContext, command: { id: "bad-1", type: "SHOT_RESOLUTION_DUE", payload: { shotId: "not-shot-1", rollEventId: action.lastRollEvent.id } } });
  assert.equal(wrongShotId.accepted, false);
  assert.equal(wrongShotId.reason, "SHOT_RESOLUTION_STALE");
  const wrongRollEventId = applyGameCommand({ state: rolled.nextState, context: matchContext, command: { id: "bad-2", type: "SHOT_RESOLUTION_DUE", payload: { shotId: action.id, rollEventId: "not-the-roll" } } });
  assert.equal(wrongRollEventId.accepted, false);
  assert.equal(wrongRollEventId.reason, "SHOT_RESOLUTION_STALE");
  const { confirmed } = confirmedShot();
  const notResolving = applyGameCommand({ state: confirmed.nextState, context: matchContext, command: { id: "bad-3", type: "SHOT_RESOLUTION_DUE", payload: { shotId: confirmed.nextState.actionResolution.id, rollEventId: "anything" } } });
  assert.equal(notResolving.accepted, false);
  assert.equal(notResolving.reason, "SHOT_NOT_RESOLVING");
});

// Test 4: formula non-regression against v20.56.28's four documented outcomes.
test("Shot resolves every documented outcome without applying a physical consequence", () => {
  const cases = [[20, "goal"], [1, "goal-kick"], [4, "goalkeeper-retains"], [6, "corner"]];
  cases.forEach(([natural, expected]) => {
    const before = confirmedShot();
    const baseline = before.confirmed.nextState;
    const { resolved } = resolveShot(natural);
    assert.equal(resolved.accepted, true);
    assert.equal(resolved.nextState.actionResolution.status, "result-display");
    assert.equal(resolved.nextState.actionResolution.result.outcome, expected);
    assert.deepEqual(resolved.nextState.pieces, baseline.pieces);
    assert.equal(resolved.nextState.tracker.currentTurn, baseline.tracker.currentTurn);
    assert.equal(resolved.nextState.tracker.startingTeam, baseline.tracker.startingTeam);
    assert.equal(resolved.events[0].metadata.consequenceApplied, false);
  });
});

test("goalKickInterval widens which low natural rolls count as Goal Kick (default 1 = only Natural 1)", () => {
  const wideContext = context({ ruleSet: { actions: { shot: { goalKickInterval: 3 } } } });
  const wide = resolveShot(2, state(), wideContext);
  assert.equal(wide.resolved.nextState.actionResolution.result.outcome, "goal-kick");
  const defaultInterval = resolveShot(2, state(), context());
  assert.notEqual(defaultInterval.resolved.nextState.actionResolution.result.outcome, "goal-kick");
});

test("cornerInterval widens which totals at-or-below the goalkeeper's stat count as Corner, but never overrides an actual Goal", () => {
  const wideContext = context({ ruleSet: { actions: { shot: { cornerInterval: 3 } } } });
  // Natural 4 is documented "goalkeeper-retains" at the default interval
  // (total is 2 below the goalkeeper's stat); a interval of 3 pulls it into
  // Corner instead.
  const widened = resolveShot(4, state(), wideContext);
  assert.equal(widened.resolved.nextState.actionResolution.result.outcome, "corner");
  // Natural 20 remains an unconditional Goal regardless of the interval.
  const nat20 = resolveShot(20, state(), wideContext);
  assert.equal(nat20.resolved.nextState.actionResolution.result.outcome, "goal");
});

// Test 5: SHOT_RESOLUTION_DUE moves no pieces, changes no turn/possession/score.
test("SHOT_RESOLUTION_DUE applies no physical or Tracker consequence", () => {
  const { rolled, resolved } = resolveShot(6);
  assert.equal(resolved.accepted, true);
  assert.deepEqual(resolved.nextState.pieces, rolled.nextState.pieces);
  assert.equal(resolved.nextState.tracker.currentTurn, rolled.nextState.tracker.currentTurn);
  assert.equal(resolved.nextState.tracker.startingTeam, rolled.nextState.tracker.startingTeam);
  assert.deepEqual(resolved.nextState.tracker.usedActions, rolled.nextState.tracker.usedActions);
  assert.equal(resolved.events[0].metadata.consequenceApplied, false);
});

// Test 6: the result screen is hard-blocking.
test("Shot result screen is hard-blocking until Timeline navigation, never a fake restart control", () => {
  const { resolved } = resolveShot(20);
  const command = applyGameCommand({ state: resolved.nextState, context: context(), command: { id: "move-after-result", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-st" } } });
  assert.equal(command.accepted, false);
  assert.equal(command.reason, "ACTION_RESOLUTION_ACTIVE");
});

test("Shot consumes only the selected canonical Tracker modifier token with its submitted roll", () => {
  const { resolved } = resolveShot(4, state({
    teamModifierTokens: [{ id: "blue-av", team: "blue", modifierType: "advantage", availableFromTurn: 1, expiresAfterTurn: 1 }],
  }), context(), { bonusModifierType: "advantage" });
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.nextState.actionResolution.result.modifierSources.some(source => source.source === "team-modifier-token"), true);
  assert.equal(resolved.nextState.teamModifierTokens.length, 0);
});

// Test 7: Timeline vocabulary and atomic Undo/Redo across roll + resolution.
test("Shot target, route, roll and resolution are canonical Timeline steps with an atomic roll/result Undo/Redo", () => {
  const matchContext = context();
  const start = state();
  const begun = dispatchSinglePlayerGameCommand({
    state: start, context: matchContext,
    command: { id: "timeline-shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "timeline-shot" } },
    label: "Shot target selection",
  });
  const targeted = dispatchSinglePlayerGameCommand({
    timeline: begun.timeline, state: begun.state, context: matchContext,
    command: { id: "timeline-shot-target", type: "SHOT_TARGET_SELECTED", payload: { shotId: "timeline-shot", target: { side: "right", depth: 0, y: 2 } } },
    label: "Shot goal target",
  });
  const cornerId = targeted.state.actionResolution.routes.find(route => route.legal).cornerId;
  const routed = dispatchSinglePlayerGameCommand({
    timeline: targeted.timeline, state: targeted.state, context: matchContext,
    command: { id: "timeline-shot-route", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "timeline-shot", cornerId } },
    label: "Shot route",
  });
  const pending = routed.state.actionResolution.pendingRoll;
  const rolled = dispatchSinglePlayerGameCommand({
    timeline: routed.timeline, state: routed.state, context: matchContext,
    command: { id: "timeline-shot-roll", type: "GAMEPLAY_ROLL_SUBMITTED", payload: { rollEvent: { id: "timeline-roll", requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural: 20, subjectId: "blue-st", reactionIndex: 0 }, createdAt: 1000 } },
    label: "Blue D20: 20 (SHOT)",
  });
  const rolledAction = rolled.state.actionResolution;
  const resolved = dispatchSinglePlayerGameCommand({
    timeline: rolled.timeline, state: rolled.state, context: matchContext,
    command: { id: "timeline-shot-resolution", type: "SHOT_RESOLUTION_DUE", payload: { shotId: rolledAction.id, rollEventId: rolledAction.lastRollEvent.id } },
    label: "Shot result",
  });
  assert.deepEqual(resolved.timeline.entries.map(entry => entry.type), ["SHOT_STARTED", "SHOT_TARGET_SELECTED", "SHOT_ROUTE_CONFIRMED", "SHOT_ROLLED", "SHOT_RESOLVED"]);
  const lastEntry = resolved.timeline.entries[resolved.timeline.entries.length - 1];
  assert.ok(atomicTimelineTransactionId(lastEntry), "SHOT_RESOLVED must join the atomic roll/result transaction");
  const undone = undoAtomicTimelineTransaction(resolved.timeline);
  assert.equal(undone.state.actionResolution.status, "awaiting-roll");
  const redone = redoAtomicTimelineTransaction(undone.timeline);
  assert.equal(redone.state.actionResolution.result.outcome, "goal");
});

// Test 8: selectSinglePlayerRollPromptPresentation supports Shot and applies
// the selected token, exactly as it already does for Lofted Through Ball.
test("selectSinglePlayerRollPromptPresentation returns the Shot roll preview and applies a selected token", () => {
  const matchContext = context();
  const { confirmed } = confirmedShot(state(), matchContext);
  const base = selectSinglePlayerRollPromptPresentation(confirmed.nextState, matchContext, { team: "blue" });
  assert.ok(base);
  assert.deepEqual(base, confirmed.nextState.actionResolution.plan.rollPreview);
  // This fixture's card stat (Finishing 7) is never capped; only the
  // non-dominant-foot penalty (−3) is situational, and it alone sits well
  // under the frozen ±4 cap — confirmed live with the user, see
  // rollModifierMath.mjs.
  assert.equal(base.modifier, 4);
  assert.equal(base.capped, false);
  const withState = { ...confirmed.nextState, teamModifierTokens: [{ id: "blue-av", team: "blue", modifierType: "advantage", availableFromTurn: 1, expiresAfterTurn: 1 }] };
  const withToken = selectSinglePlayerRollPromptPresentation(withState, matchContext, { team: "blue", selectedModifierType: "advantage" });
  assert.equal(withToken.modifierSources.some(source => source.source === "team-modifier-token"), true);
  assert.equal(withToken.rawModifier, base.rawModifier + 1);
  assert.equal(withToken.modifier, 5);
  assert.equal(withToken.capped, false);
});

// Test 9: every defensive-area roll-preview source carries a frozen
// "post + name — Team" identity, never an internal defender ID.
test("plan.rollPreview.modifierSources label each defensive area by frozen identity, never an internal defender ID", () => {
  const matchContext = createMatchContext({
    id: "shot-identity",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    gameplayCards: [
      { id: "blue-card", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }] },
      { id: "red-def-card", name: "Marcus", position: "DF", defensiveArea: [{ dx: -1, dy: 0 }] },
    ],
  });
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 14, y: 5 },
    { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
    { id: "red-origin", team: "B", cardId: "red-def-card", x: 14, y: 4 },
  ] });
  const plan = buildShotRoutePlan({ state: rawState, context: matchContext, shooter: rawState.pieces[1], target: { side: "right", depth: 0, y: 2 }, cornerId: "top-right" });
  const areaSource = plan.rollPreview.modifierSources.find(source => source.source === "defensive-area");
  assert.ok(areaSource);
  assert.equal(areaSource.detail, "Defensive area: DF Marcus — Red");
  assert.doesNotMatch(areaSource.detail, /B-\d/);
  assert.equal(areaSource.defenderId, "red-origin");
});

// Test 10: dedup/origin DV is unaffected by the capped rollPreview (already
// verified by the dedup test above, kept as its own regression here too).
test("dedup regression: a single defender at both origin and route contributes exactly one DV to rollPreview", () => {
  const matchContext = createMatchContext({
    id: "shot-dedup-preview",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    gameplayCards: [
      { id: "blue-card", position: "ST", preferredFoot: "Right" },
      { id: "red-def-card", position: "DF", defensiveArea: [{ dx: -1, dy: 0 }, { dx: 0, dy: -1 }] },
    ],
  });
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 14, y: 5 },
    { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
    { id: "red-origin", team: "B", cardId: "red-def-card", x: 14, y: 4 },
  ] });
  const plan = buildShotRoutePlan({ state: rawState, context: matchContext, shooter: rawState.pieces[1], target: { side: "right", depth: 0, y: 2 }, cornerId: "top-right" });
  assert.equal(plan.rollPreview.modifierSources.filter(source => source.source === "defensive-area").length, 1);
});

// Tests 13-15: symmetric, MatchContext-frozen cap of 4 (or a configured value).
// Each defender sits at (px, 5) with a single-cell defensive area offset that
// lands exactly on the shooter's own square (14, 5), so each contributes one
// origin DV regardless of the selected route corner.
const FAR_DEFENDER_COLUMNS = [9, 10, 11, 12, 13];

function fiveDefenderState(overrides = {}) {
  return state({
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      ...FAR_DEFENDER_COLUMNS.map(px => ({ id: `red-far-${px}`, team: "B", cardId: `red-far-card-${px}`, x: px, y: 5 })),
    ],
    ...overrides,
  });
}

function fiveDefenderContext(overrides = {}) {
  return context({
    gameplayCards: [
      // "Both" removes the non-dominant-foot DVM, and a zero card stat keeps
      // these tests isolated to the defensive-area cap — the shooter's own
      // stat is never part of the capped bucket (see the regression test
      // below), so this zero is only for isolating the DV-stacking math,
      // not because a non-zero stat would shift the capped total.
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Both", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 0 }, { id: "stat:long-shot", name: "Long Shot", value: 0 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      ...FAR_DEFENDER_COLUMNS.map(px => ({ id: `red-far-card-${px}`, position: "DF", defensiveArea: [{ dx: 0, dy: 14 - px }] })),
    ],
    ...overrides,
  });
}

test("the shooter's own Finishing/Long Shot stat is never capped — only the situational sources are", () => {
  // Same five-defender situational rig (raw -5, capped to -4), but with a
  // high own stat this time: only the situational -5 is ever capped, so the
  // stat's own full +10 must still show up in the total, uncapped.
  const highStatContext = fiveDefenderContext({ gameplayCards: [
    { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Both", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 10 }, { id: "stat:long-shot", name: "Long Shot", value: 10 }] },
    { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
    ...FAR_DEFENDER_COLUMNS.map(px => ({ id: `red-far-card-${px}`, position: "DF", defensiveArea: [{ dx: 0, dy: 14 - px }] })),
  ] });
  const { confirmed } = confirmedShot(fiveDefenderState(), highStatContext);
  const plan = confirmed.nextState.actionResolution.plan;
  assert.equal(plan.attackerStat, 10);
  assert.equal(plan.rollPreview.rawModifier, 5, "10 (uncapped stat) + -5 (raw situational)");
  assert.equal(plan.rollPreview.modifier, 6, "10 (uncapped stat) + -4 (capped situational)");
  assert.equal(plan.rollPreview.modifierCap, 4);
  assert.equal(plan.rollPreview.capped, true, "the situational sources alone were still capped");
});

test("five distinct defensive areas produce a raw −5 that is capped symmetrically to the frozen ±4 stackCap", () => {
  const matchContext = fiveDefenderContext();
  const rawState = fiveDefenderState();
  const { confirmed } = confirmedShot(rawState, matchContext);
  const plan = confirmed.nextState.actionResolution.plan;
  assert.equal(plan.rollPreview.modifierSources.filter(source => source.source === "defensive-area").length, 5);
  assert.equal(plan.rollPreview.rawModifier, -5);
  assert.equal(plan.rollPreview.modifier, -4);
  assert.equal(plan.rollPreview.modifierCap, 4);
  assert.equal(plan.rollPreview.capped, true);
});

test("the cap changes the resolved outcome exactly where the raw modifier would not", () => {
  // natural 14: capped total = 14 − 4 = 10 (corner); the uncapped total would
  // have been 14 − 5 = 9 (goalkeeper-retains) — the cap changes the outcome.
  const { resolved } = resolveShot(14, fiveDefenderState(), fiveDefenderContext());
  assert.equal(resolved.accepted, true);
  const result = resolved.nextState.actionResolution.result;
  assert.equal(result.rawModifier, -5);
  assert.equal(result.modifier, -4);
  assert.equal(result.capped, true);
  assert.equal(result.total, 10);
  assert.equal(result.outcome, "corner");
});

test("prompt and result agree exactly under the cap, including a selected Tracker token", () => {
  const token = { id: "blue-dv", team: "blue", modifierType: "disadvantage", availableFromTurn: 1, expiresAfterTurn: 1 };
  const rawState = fiveDefenderState({ teamModifierTokens: [token] });
  const matchContext = fiveDefenderContext();
  const { confirmed } = confirmedShot(rawState, matchContext);
  const prompt = selectSinglePlayerRollPromptPresentation(confirmed.nextState, matchContext, { team: "blue", selectedModifierType: "disadvantage" });
  assert.equal(prompt.capped, true);
  assert.equal(prompt.modifier, -4);
  const { resolved } = resolveShot(7, rawState, matchContext, { bonusModifierType: "disadvantage" });
  assert.equal(resolved.nextState.actionResolution.result.modifier, prompt.modifier);
  assert.equal(resolved.nextState.actionResolution.result.capped, prompt.capped);
});

test("the cap value comes from MatchContext frozen at Match start, not a hardcoded constant", () => {
  const matchContext = fiveDefenderContext({ ruleSet: { diceModifiers: { advantage: 1, majorAdvantage: 3, disadvantage: -1, majorDisadvantage: -3, stackCap: 2 } } });
  const { confirmed } = confirmedShot(fiveDefenderState(), matchContext);
  const plan = confirmed.nextState.actionResolution.plan;
  assert.equal(plan.rollPreview.modifierCap, 2);
  assert.equal(plan.rollPreview.rawModifier, -5);
  assert.equal(plan.rollPreview.modifier, -2);
});

// Build A (revised): Goalkeeper Retains gets a Continue button, exactly like
// Lofted Through Ball's result screen, not a second timed hold. resolveShot
// still resolves to the terminal result-display checkpoint with no hold of
// any kind — SHOT_CONSEQUENCE_DUE is dispatched only when the player clicks.
test("SHOT_RESOLUTION_DUE opens no delayed-resolution hold for any outcome, including goalkeeper-retains", () => {
  [[20, "goal"], [1, "goal-kick"], [4, "goalkeeper-retains"], [6, "corner"]].forEach(([natural, expectedOutcome]) => {
    const { resolved } = resolveShot(natural);
    assert.equal(resolved.nextState.actionResolution.result.outcome, expectedOutcome);
    assert.equal(resolved.events[0].metadata.delayedResolution, undefined);
  });
});

test("SHOT_CONSEQUENCE_DUE moves the ball to the goalkeeper's cell and starts a new turn for the goalkeeper's team", () => {
  const { resolved } = resolveShot(4);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goalkeeper-retains");
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: context(),
    command: { id: "shot-consequence-4", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  const ball = consequence.nextState.pieces.find(piece => piece.team === "BALL");
  assert.equal(ball.x, 18);
  assert.equal(ball.y, 0);
  assert.equal(consequence.nextState.tracker.currentTurn, 2);
  assert.equal(consequence.nextState.tracker.startingTeam, "red");
  assert.equal(consequence.nextState.tracker.turnPhase, "attack");
  assert.equal(consequence.nextState.actionResolution, null);
  assert.equal(consequence.events[0].type, "SHOT_CONSEQUENCE_APPLIED");
  assert.equal(consequence.events[0].metadata.outcome, "goalkeeper-retains");
  assert.equal(consequence.events[0].metadata.startedTurn, 2);
});

test("Goalkeeper Retains starts an untracked reposition phase when \"any catch\" is enabled in Rules", () => {
  const repositionContext = context({ ruleSet: { actions: { shot: { goalkeeperRetainsReposition: { count: 3, anyCatch: true } } } } });
  const { resolved } = resolveShot(4, state(), repositionContext);
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState, context: repositionContext,
    command: { id: "shot-consequence-gk-reposition", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.deepEqual(consequence.nextState.gkReposition, {
    team: "red", opponentTeam: "blue", turn: "self", remaining: { self: 3, opponent: 3 }, count: 3, activePieceId: null, usedPieceIds: [],
  });
  assert.deepEqual(consequence.nextState.gkRepositionMovementByPieceId, {});
});

test("\"after Free Kick\" only triggers when this Shot was itself a Free Kick restart's own execution, not any catch", () => {
  const freeKickContext = context({ ruleSet: { actions: { shot: { goalkeeperRetainsReposition: { count: 2, afterFreeKick: true, anyCatch: false } } } } });
  const { resolved } = resolveShot(4, state(), freeKickContext);
  const action = resolved.nextState.actionResolution;
  const asFreeKickExecution = { ...resolved.nextState, restartSetup: { type: "freeKickDirect", team: "red", phase: "execution", executorId: "red-gk" } };
  const consequence = applyGameCommand({
    state: asFreeKickExecution, context: freeKickContext,
    command: { id: "shot-consequence-fk-origin", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.ok(consequence.nextState.gkReposition, "afterFreeKick fired because the origin was a Free Kick restart");
  assert.equal(consequence.nextState.gkReposition.team, "red");

  // Same checkbox, but this Shot happened in ordinary open play (no active
  // restartSetup at all) — afterFreeKick must not fire for that.
  const openPlayConsequence = applyGameCommand({
    state: resolved.nextState, context: freeKickContext,
    command: { id: "shot-consequence-open-play", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(openPlayConsequence.accepted, true);
  assert.equal(openPlayConsequence.nextState.gkReposition, null);
});

test("Goalkeeper Retains does not start a reposition phase when every trigger checkbox is off (the default)", () => {
  const { resolved } = resolveShot(4);
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState, context: context(),
    command: { id: "shot-consequence-no-reposition", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.equal(consequence.nextState.gkReposition, null);
});

test("verticalSideFromShotTarget: below the goal's centre row is top, above is bottom, exactly on centre is null (random)", () => {
  const settings = { goalWidth: 5 }; // rows 0..4, centre = 2
  assert.equal(verticalSideFromShotTarget(settings, { y: 0 }), "top");
  assert.equal(verticalSideFromShotTarget(settings, { y: 1 }), "top");
  assert.equal(verticalSideFromShotTarget(settings, { y: 2 }), null);
  assert.equal(verticalSideFromShotTarget(settings, { y: 3 }), "bottom");
  assert.equal(verticalSideFromShotTarget(settings, { y: 4 }), "bottom");
});

test("randomCornerCell echoes the shot's targeted side instead of picking randomly, unless the shot was dead centre", () => {
  const settings = { cols: 20, rows: 12, goalWidth: 5 };
  const top = randomCornerCell(settings, "blue", { y: 0 });
  assert.deepEqual(top, { x: 19, y: 0 });
  const bottom = randomCornerCell(settings, "blue", { y: 4 });
  assert.deepEqual(bottom, { x: 19, y: 11 });
  // Dead centre: still falls back to the app's own random choice.
  const centre = randomCornerCell(settings, "blue", { y: 2 });
  assert.ok([0, 11].includes(centre.y));
});

test("randomGoalKickCell picks its end of the small box from the shot's targeted side, unless the shot was dead centre", () => {
  const settings = { cols: 20, rows: 12, goalWidth: 5, smallDepth: 3, smallWidth: 9 };
  const top = randomGoalKickCell(settings, "red", { y: 0 });
  assert.ok(top.y >= 1 && top.y <= 3);
  const bottom = randomGoalKickCell(settings, "red", { y: 4 });
  assert.ok(bottom.y >= 7 && bottom.y <= 9);
  const centre = randomGoalKickCell(settings, "red", { y: 2 });
  assert.ok(centre.y >= 1 && centre.y <= 9);
});

test("Goal Kick: a player already standing on the ball cell is cleared immediately (not at executor selection), leaving them normally repositionable", () => {
  const matchContext = context();
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      { id: "red-df", team: "B", cardId: "red-def-card", x: 17, y: 8 },
      // One of these three sits exactly where the Goal Kick's random cell
      // (x=17, y in {1,2,3} for a "top"-targeted shot) will land.
      { id: "bystander-1", team: "B", cardId: "red-def-card", x: 17, y: 1 },
      { id: "bystander-2", team: "B", cardId: "red-def-card", x: 17, y: 2 },
      { id: "bystander-3", team: "B", cardId: "red-def-card", x: 17, y: 3 },
    ],
  });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  const selected = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "shot-target", type: "SHOT_TARGET_SELECTED", payload: { shotId: "shot-1", target: { side: "right", depth: 0, y: 0 } } } });
  const legal = selected.nextState.actionResolution.routes.find(route => route.legal);
  const confirmed = applyGameCommand({ state: selected.nextState, context: matchContext, command: { id: "shot-route", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "shot-1", cornerId: legal.cornerId } } });
  const pending = confirmed.nextState.actionResolution.pendingRoll;
  const rolled = applyGameCommand({
    state: confirmed.nextState,
    context: matchContext,
    command: { id: "shot-roll", type: "GAMEPLAY_ROLL_SUBMITTED", payload: { rollEvent: { id: "roll-1", requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural: 1, subjectId: "blue-st", reactionIndex: 0, createdAt: 1000 }, createdAt: 1000 } },
  });
  const action = rolled.nextState.actionResolution;
  const resolved = applyGameCommand({ state: rolled.nextState, context: matchContext, command: { id: "shot-resolution", type: "SHOT_RESOLUTION_DUE", payload: { shotId: action.id, rollEventId: action.lastRollEvent.id } } });
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goal-kick");
  const consequence = applyGameCommand({ state: resolved.nextState, context: matchContext, command: { id: "shot-consequence", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } } });
  assert.equal(consequence.accepted, true);
  const { restartSetup } = consequence.nextState;
  const ballCell = restartSetup.ballCell;
  const ball = consequence.nextState.pieces.find(item => item.team === "BALL");
  assert.deepEqual({ x: ball.x, y: ball.y }, ballCell);
  const originalCells = { "bystander-1": { x: 17, y: 1 }, "bystander-2": { x: 17, y: 2 }, "bystander-3": { x: 17, y: 3 } };
  const bystanders = Object.keys(originalCells).map(id => consequence.nextState.pieces.find(item => item.id === id));
  const displaced = bystanders.filter(item => item.x !== originalCells[item.id].x || item.y !== originalCells[item.id].y);
  // Exactly the one bystander that was on the chosen ball cell moved; the
  // other two (never in the way) stayed exactly where they were.
  assert.equal(displaced.length, 1);
  bystanders.forEach(item => assert.ok(!(item.x === ballCell.x && item.y === ballCell.y)));
  // This is the "cleared early" guarantee: it happened during
  // SHOT_CONSEQUENCE_DUE itself, at goalKick's "reposition" phase already —
  // long before any RESTART_EXECUTOR_SELECTED command could run.
  assert.equal(restartSetup.phase, "reposition");
});

test("SHOT_CONSEQUENCE_DUE (corner) starts a restartSetup for the shooting team, at the goal's own touchline corner, without ending the turn", () => {
  const { resolved, matchContext } = resolveShot(6);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "corner");
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-corner", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  const { restartSetup, tracker } = consequence.nextState;
  assert.equal(restartSetup.type, "corner");
  assert.equal(restartSetup.team, "blue");
  assert.equal(restartSetup.phase, "wall-position");
  assert.equal(restartSetup.ballCell.x, 19);
  assert.ok([0, 11].includes(restartSetup.ballCell.y));
  const ball = consequence.nextState.pieces.find(piece => piece.team === "BALL");
  assert.deepEqual({ x: ball.x, y: ball.y }, restartSetup.ballCell);
  assert.equal(tracker.currentTurn, 1);
  assert.equal(tracker.startingTeam, "blue");
});

test("SHOT_CONSEQUENCE_DUE (goal-kick) starts a restartSetup for the defending team, inside its own small box, and begins a new numbered turn", () => {
  const { resolved, matchContext } = resolveShot(1);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goal-kick");
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-goal-kick", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  const { restartSetup, tracker } = consequence.nextState;
  assert.equal(restartSetup.type, "goalKick");
  assert.equal(restartSetup.team, "red");
  assert.equal(restartSetup.phase, "reposition");
  assert.equal(restartSetup.ballCell.x, 17);
  assert.ok(restartSetup.ballCell.y >= 1 && restartSetup.ballCell.y < 10);
  const ball = consequence.nextState.pieces.find(piece => piece.team === "BALL");
  assert.deepEqual({ x: ball.x, y: ball.y }, restartSetup.ballCell);
  assert.equal(tracker.currentTurn, 2);
  assert.equal(tracker.startingTeam, "red");
});

// Build B: Goal -> score + Kick-off.
function goalKickoffFixture() {
  const matchContext = context({
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-st-card", name: "Red ST", position: "ST" },
    ],
    // center-to-center and no required field-player target keep the
    // kickoff-restart Pass tests focused purely on direction/distance
    // validation instead of corner-route or receiver selection.
    ruleSet: { actions: { pass: { pathMode: "center-to-center", requireFieldPlayerTarget: false } } },
  });
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-st", team: "B", cardId: "red-st-card", x: 3, y: 3 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
    ],
    score: { blue: 2, red: 1 },
  });
  return { matchContext, rawState };
}

// The board fixture is cols:20, rows:12 (see context()'s boardSettings
// default), so the true geometric centre is (10, 6).
test("SHOT_CONSEQUENCE_DUE (goal) increments score and places the entitled team's ST with the ball at the board's true centre, leaving every other piece untouched", () => {
  const { matchContext, rawState } = goalKickoffFixture();
  const { resolved } = resolveShot(20, rawState, matchContext);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goal");
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-goal", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.deepEqual(consequence.nextState.score, { blue: 3, red: 1 });
  // Red is entitled (blue scored); red attacks decreasing x, so its kickoff
  // cell is adjacent to the centre line on red's own attacking side: 9, not
  // the halfway cell itself (10).
  const ball = consequence.nextState.pieces.find(piece => piece.team === "BALL");
  assert.equal(ball.x, 9);
  assert.equal(ball.y, 6);
  const redSt = consequence.nextState.pieces.find(piece => piece.id === "red-st");
  assert.equal(redSt.x, 9);
  assert.equal(redSt.y, 6);
  // No formation restore: any piece that is not the ball or the kickoff
  // piece stays exactly where it already was.
  const blueSt = consequence.nextState.pieces.find(piece => piece.id === "blue-st");
  assert.equal(blueSt.x, 14);
  assert.equal(blueSt.y, 5);
  const redGk = consequence.nextState.pieces.find(piece => piece.id === "red-gk");
  assert.equal(redGk.x, 18);
  assert.equal(redGk.y, 0);
  assert.equal(consequence.nextState.tracker.currentTurn, 2);
  assert.equal(consequence.nextState.tracker.startingTeam, "red");
  assert.equal(consequence.nextState.actionResolution, null);
  assert.deepEqual(consequence.nextState.kickoffRestart, { team: "red", pieceId: "red-st" });
  assert.equal(consequence.events[0].type, "SHOT_CONSEQUENCE_APPLIED");
  assert.equal(consequence.events[0].metadata.outcome, "goal");
  assert.equal(consequence.events[0].metadata.scoringTeam, "blue");
  assert.equal(consequence.events[0].metadata.entitledTeam, "red");
});

test("a Goal applies any pendingFormation tactic queued by either team, for both sides, before the kickoff placement, then clears it", () => {
  const matchContext = context({
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-st-card", name: "Red ST", position: "ST" },
    ],
    ruleSet: { actions: { pass: { pathMode: "center-to-center", requireFieldPlayerTarget: false } } },
  });
  // Clustered off in a corner, well away from the blue-st → goal Shot route,
  // so this fixture only adds pendingFormation-consumption coverage without
  // disturbing the existing route-legality math the other Shot tests rely on.
  const blueStarters = formationById(1).players.map((_, index) => ({ id: `A-${index}`, team: "A", cardId: null, x: 1, y: index }));
  const redStarters = formationById(1).players.map((_, index) => ({ id: `B-${index}`, team: "B", cardId: index === 0 ? "red-gk-card" : index === 1 ? "red-st-card" : null, x: 3, y: index }));
  const rawState = state({
    pieces: [{ id: "ball", team: "BALL", x: 14, y: 5 }, { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 }, ...blueStarters, ...redStarters],
    score: { blue: 2, red: 1 },
    pendingFormation: { blue: 2, red: 3 },
  });
  const { resolved } = resolveShot(20, rawState, matchContext);
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-goal-tactics", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.deepEqual(consequence.nextState.pendingFormation, { blue: null, red: null });
  const expectedBlue = formationStarterCoordinates("A", formationById(2), matchContext.boardSettings);
  const expectedRed = formationStarterCoordinates("B", formationById(3), matchContext.boardSettings);
  // A-0 and B-1 are the kickoff piece / ball; both are overridden to the
  // kickoff centre cell regardless of the tactic, so check a different slot.
  const blueSlot = consequence.nextState.pieces.find(piece => piece.id === "A-3");
  const expectedBlueSlot = expectedBlue.find(coord => coord.id === "A-3");
  assert.equal(blueSlot.x, expectedBlueSlot.x);
  assert.equal(blueSlot.y, expectedBlueSlot.y);
  const redSlot = consequence.nextState.pieces.find(piece => piece.id === "B-3");
  const expectedRedSlot = expectedRed.find(coord => coord.id === "B-3");
  assert.equal(redSlot.x, expectedRedSlot.x);
  assert.equal(redSlot.y, expectedRedSlot.y);
});

test("an active kickoffRestart blocks every command except the whitelisted Pass/admin set", () => {
  const { matchContext, rawState } = goalKickoffFixture();
  const { resolved } = resolveShot(20, rawState, matchContext);
  const action = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-goal-2", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  const blocked = applyGameCommand({
    state: consequence.nextState,
    context: matchContext,
    command: { id: "blocked-shot", type: "SHOT_STARTED", payload: { pieceId: "red-gk", shotId: "irrelevant" } },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "KICKOFF_RESTART_ACTIVE");
});

test("kickoffRestart's forced pass must come from the entitled kickoff piece", () => {
  // Both pieces share the ball's cell so PASS_REQUIRES_BALL cannot mask the
  // dedicated wrong-player rejection this check exists for.
  const { matchContext, rawState } = goalKickoffFixture();
  const wrongPlayerState = { ...rawState, kickoffRestart: { team: "red", pieceId: "red-st" }, pieces: rawState.pieces.map(piece => (piece.id === "red-gk" ? { ...piece, x: 14, y: 5 } : piece)) };
  const wrongPlayer = applyGameCommand({
    state: wrongPlayerState,
    context: matchContext,
    command: { id: "wrong-player-pass", type: "PASS_STARTED", payload: { pieceId: "red-gk", passId: "pass-1" } },
  });
  assert.equal(wrongPlayer.accepted, false);
  assert.equal(wrongPlayer.reason, "KICKOFF_RESTART_WRONG_PLAYER");
});

test("kickoffRestart's entitled pass is otherwise completely ordinary: any direction, normal Tracker cost", () => {
  const { matchContext, rawState } = goalKickoffFixture();
  const { resolved } = resolveShot(20, rawState, matchContext);
  const action = resolved.nextState.actionResolution;
  const afterGoal = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "shot-consequence-goal-4", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  }).nextState;

  const started = applyGameCommand({ state: afterGoal, context: matchContext, command: { id: "kickoff-pass-start", type: "PASS_STARTED", payload: { pieceId: "red-st", passId: "kickoff-pass" } } });
  assert.equal(started.accepted, true);

  // Forward is legal now — there is no direction restriction left.
  const forward = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "kickoff-pass-target-forward", type: "PASS_TARGET_SELECTED", payload: { passId: "kickoff-pass", x: 6, y: 6 } } });
  assert.equal(forward.accepted, true);
  const trackerBefore = afterGoal.tracker.usedActions.red;
  const forwardRouted = applyGameCommand({ state: forward.nextState, context: matchContext, command: { id: "kickoff-pass-route-forward", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "kickoff-pass", cornerId: null } } });
  assert.equal(forwardRouted.accepted, true);
  // Normal Tracker cost — no more free activation for the kickoff pass.
  assert.equal(forwardRouted.nextState.tracker.usedActions.red, trackerBefore + 1);
  assert.equal(forwardRouted.nextState.actionResolution.status, "completing");
  const completed = applyGameCommand({ state: forwardRouted.nextState, context: matchContext, command: { id: "kickoff-pass-consequence", type: "PASS_CONSEQUENCE_DUE", payload: { passId: "kickoff-pass" } } });
  assert.equal(completed.accepted, true);
  assert.equal(completed.nextState.kickoffRestart, null);
  const ball = completed.nextState.pieces.find(piece => piece.team === "BALL");
  assert.equal(ball.x, 6);
  assert.equal(ball.y, 6);
});

test("SHOT_CONSEQUENCE_DUE rejects a mismatched shotId or a non-terminal status", () => {
  const { resolved } = resolveShot(4);
  const action = resolved.nextState.actionResolution;
  const wrongShotId = applyGameCommand({
    state: resolved.nextState,
    context: context(),
    command: { id: "bad-shot-id", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: "not-the-shot" } },
  });
  assert.equal(wrongShotId.accepted, false);
  assert.equal(wrongShotId.reason, "SHOT_CONSEQUENCE_STALE");
  const { rolled } = rolledShot(4);
  const notReady = applyGameCommand({
    state: rolled.nextState,
    context: context(),
    command: { id: "too-early", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: action.id } },
  });
  assert.equal(notReady.accepted, false);
  assert.equal(notReady.reason, "SHOT_NOT_CONSEQUENCE_READY");
});

test("SHOT_CONSEQUENCE_DUE is a canonical Timeline step with ordinary step Undo/Redo", () => {
  const matchContext = context();
  const start = state();
  const begun = dispatchSinglePlayerGameCommand({
    state: start, context: matchContext,
    command: { id: "consequence-timeline-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "consequence-timeline-shot" } },
    label: "Shot target selection",
  });
  const targeted = dispatchSinglePlayerGameCommand({
    timeline: begun.timeline, state: begun.state, context: matchContext,
    command: { id: "consequence-timeline-target", type: "SHOT_TARGET_SELECTED", payload: { shotId: "consequence-timeline-shot", target: { side: "right", depth: 0, y: 2 } } },
    label: "Shot goal target",
  });
  const cornerId = targeted.state.actionResolution.routes.find(route => route.legal).cornerId;
  const routed = dispatchSinglePlayerGameCommand({
    timeline: targeted.timeline, state: targeted.state, context: matchContext,
    command: { id: "consequence-timeline-route", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "consequence-timeline-shot", cornerId } },
    label: "Shot route",
  });
  const pending = routed.state.actionResolution.pendingRoll;
  const rolled = dispatchSinglePlayerGameCommand({
    timeline: routed.timeline, state: routed.state, context: matchContext,
    command: { id: "consequence-timeline-roll", type: "GAMEPLAY_ROLL_SUBMITTED", payload: { rollEvent: { id: "consequence-timeline-roll-event", requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural: 4, subjectId: "blue-st", reactionIndex: 0 }, createdAt: 1000 } },
    label: "Blue D20: 4 (SHOT)",
  });
  const rolledAction = rolled.state.actionResolution;
  const resolved = dispatchSinglePlayerGameCommand({
    timeline: rolled.timeline, state: rolled.state, context: matchContext,
    command: { id: "consequence-timeline-resolution", type: "SHOT_RESOLUTION_DUE", payload: { shotId: rolledAction.id, rollEventId: rolledAction.lastRollEvent.id } },
    label: "Shot result",
  });
  assert.equal(resolved.state.actionResolution.result.outcome, "goalkeeper-retains");
  const consequence = dispatchSinglePlayerGameCommand({
    timeline: resolved.timeline, state: resolved.state, context: matchContext,
    command: { id: "consequence-timeline-consequence", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: resolved.state.actionResolution.id } },
    label: "Goalkeeper retains — new turn",
  });
  assert.deepEqual(consequence.timeline.entries.map(entry => entry.type), ["SHOT_STARTED", "SHOT_TARGET_SELECTED", "SHOT_ROUTE_CONFIRMED", "SHOT_ROLLED", "SHOT_RESOLVED", "SHOT_CONSEQUENCE_APPLIED"]);
  const undone = undoTimeline(consequence.timeline);
  assert.equal(undone.state.actionResolution.status, "result-display");
  assert.equal(undone.state.tracker.currentTurn, 1);
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution, null);
  assert.equal(redone.state.tracker.currentTurn, 2);
});

// End-to-end: Shot -> Goalkeeper Retains -> SHOT_CONSEQUENCE_DUE -> the
// goalkeeper's own restart Pass, through the exact command sequence the real
// app dispatches (not an isolated buildPassPlan call), to prove the
// goalkeeperRestartException set by Build A actually reaches Build B's Pass
// wiring end to end.
test("the goalkeeper's own restart Pass, dispatched through the full command sequence, ignores an opposing defensive-area crossing inside its own box", () => {
  const matchContext = context({
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17, smallDepth: 3, smallWidth: 9 },
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-mate-card", name: "Red CB", position: "CB" },
      { id: "blue-def-card", name: "Blue DF", defensiveArea: [{ dx: 0, dy: 1 }] },
    ],
    ruleSet: { actions: { pass: { pathMode: "center-to-center", requireFieldPlayerTarget: false } } },
  });
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      { id: "red-mate", team: "B", cardId: "red-mate-card", x: 18, y: 2 },
      { id: "blue-def", team: "A", cardId: "blue-def-card", x: 19, y: 1 },
    ],
  });
  const { resolved } = resolveShot(4, rawState, matchContext);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goalkeeper-retains");
  const shotAction = resolved.nextState.actionResolution;
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "gk-retains-consequence", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: shotAction.id } },
  });
  assert.equal(consequence.accepted, true);
  assert.deepEqual(consequence.nextState.goalkeeperRestartException, { team: "red", goalkeeperId: "red-gk" });

  // Control: the exact same defensive-area crossing, from a passer with NO
  // active exception, must be contested — otherwise this fixture proves
  // nothing about the exception specifically. Red must be the active team
  // (defense phase, since blue is startingTeam) and hold the ball to start
  // a normal Pass at all.
  const controlState = {
    ...rawState,
    pieces: rawState.pieces.map(piece => piece.team === "BALL" ? { ...piece, x: 18, y: 0 } : piece),
    tracker: { ...rawState.tracker, turnPhase: "defense" },
  };
  const controlStarted2 = applyGameCommand({ state: controlState, context: matchContext, command: { id: "control-pass-start-2", type: "PASS_STARTED", payload: { pieceId: "red-gk", passId: "control-pass" } } });
  assert.equal(controlStarted2.accepted, true, controlStarted2.reason);
  const controlTargeted = applyGameCommand({ state: controlStarted2.nextState, context: matchContext, command: { id: "control-pass-target", type: "PASS_TARGET_SELECTED", payload: { passId: "control-pass", x: 18, y: 2 } } });
  assert.equal(controlTargeted.accepted, true);
  const controlPlan = controlTargeted.nextState.actionResolution.routePlans[0];
  assert.ok(controlPlan.interceptors.length > 0, "control fixture must actually be contested without the exception");

  // Now the real case: the goalkeeper passes with the exception active.
  const started = applyGameCommand({ state: consequence.nextState, context: matchContext, command: { id: "gk-pass-start", type: "PASS_STARTED", payload: { pieceId: "red-gk", passId: "gk-pass" } } });
  assert.equal(started.accepted, true);
  const targeted = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "gk-pass-target", type: "PASS_TARGET_SELECTED", payload: { passId: "gk-pass", x: 18, y: 2 } } });
  assert.equal(targeted.accepted, true);
  const plan = targeted.nextState.actionResolution.routePlans[0];
  assert.equal(plan.interceptors.length, 0, "the goalkeeper's own restart must ignore the opposing defensive-area crossing inside its own box");

  const routed = applyGameCommand({ state: targeted.nextState, context: matchContext, command: { id: "gk-pass-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "gk-pass", cornerId: null } } });
  assert.equal(routed.accepted, true);
  assert.equal(routed.nextState.actionResolution.status, "completing");
});

// Same scenario, but under corner-to-center pathMode (the default the real
// app uses, unlike the center-to-center simplification above) and with the
// receiving target OUTSIDE the box entirely — reproducing the user's exact
// report: "even if the receiver is outside the box, whatever is inside the
// box must still be ignored."
test("the goalkeeper's own restart Pass ignores an in-box defensive-area crossing under corner-to-center pathMode, even when the receiver is outside the box", () => {
  const matchContext = context({
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17, smallDepth: 3, smallWidth: 9 },
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-mate-card", name: "Red CB", position: "CB" },
      { id: "blue-def-card", name: "Blue DF", defensiveArea: [{ dx: 0, dy: 1 }] },
    ],
    // Deliberately no pathMode override: this is the actual default
    // (corner-to-center), the one the live app uses.
  });
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 14, y: 5 },
      { id: "blue-st", team: "A", cardId: "blue-card", x: 14, y: 5 },
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      // The receiver sits well outside the box (boxDepth 7 means red's own
      // box is x >= 13); x:8 is outside it entirely.
      { id: "red-mate", team: "B", cardId: "red-mate-card", x: 8, y: 0 },
      { id: "blue-def", team: "A", cardId: "blue-def-card", x: 19, y: 1 },
    ],
  });
  const { resolved } = resolveShot(4, rawState, matchContext);
  assert.equal(resolved.nextState.actionResolution.result.outcome, "goalkeeper-retains");
  const consequence = applyGameCommand({
    state: resolved.nextState,
    context: matchContext,
    command: { id: "gk-retains-consequence-2", type: "SHOT_CONSEQUENCE_DUE", payload: { shotId: resolved.nextState.actionResolution.id } },
  });
  assert.equal(consequence.accepted, true);

  const started = applyGameCommand({ state: consequence.nextState, context: matchContext, command: { id: "gk-pass-start-2", type: "PASS_STARTED", payload: { pieceId: "red-gk", passId: "gk-pass-2" } } });
  assert.equal(started.accepted, true, started.reason);
  const targeted = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "gk-pass-target-2", type: "PASS_TARGET_SELECTED", payload: { passId: "gk-pass-2", x: 8, y: 0 } } });
  assert.equal(targeted.accepted, true, targeted.reason);
  const plans = targeted.nextState.actionResolution.routePlans;
  assert.equal(plans.length, 4, "corner-to-center mode must produce all four corner plans");
  plans.forEach(plan => {
    assert.equal(plan.interceptors.length, 0, `corner ${plan.origin?.cornerId} must ignore the in-box crossing even though the receiver is outside the box`);
  });
});
