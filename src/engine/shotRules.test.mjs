import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerShotPresentation, selectSinglePlayerShotTargetPresentation } from "./matchPresentationSelectors.mjs";
import { dispatchSinglePlayerGameCommand } from "./singlePlayerController.mjs";
import { redoTimeline, undoTimeline } from "../timeline/timelineEngine.mjs";
import { buildShotRoutePlan } from "./shotRules.mjs";

function context() {
  return createMatchContext({
    id: "shot-test-context",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      { id: "red-def-card", name: "Red DF", position: "DF", defensiveArea: [{ dx: 0, dy: 1 }] },
    ],
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

function selectedShot(rawState = state(), target = { side: "right", depth: 0, y: 2 }) {
  const matchContext = context();
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  assert.equal(started.accepted, true);
  const selected = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "shot-target", type: "SHOT_TARGET_SELECTED", payload: { shotId: "shot-1", target } } });
  assert.equal(selected.accepted, true);
  return { matchContext, selected };
}

function confirmedShot(rawState = state()) {
  const { matchContext, selected } = selectedShot(rawState);
  const legal = selected.nextState.actionResolution.routes.find(route => route.legal);
  assert.ok(legal, "fixture must have one legal corner-to-centre Shot route");
  const confirmed = applyGameCommand({ state: selected.nextState, context: matchContext, command: { id: "shot-route", type: "SHOT_ROUTE_CONFIRMED", payload: { shotId: "shot-1", cornerId: legal.cornerId } } });
  assert.equal(confirmed.accepted, true);
  return { matchContext, confirmed };
}

function resolveShot(natural, rawState = state()) {
  const { matchContext, confirmed } = confirmedShot(rawState);
  const pending = confirmed.nextState.actionResolution.pendingRoll;
  return applyGameCommand({
    state: confirmed.nextState,
    context: matchContext,
    command: {
      id: `shot-roll-${natural}`,
      type: "GAMEPLAY_ROLL_SUBMITTED",
      payload: { rollEvent: { id: `roll-${natural}`, requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural, subjectId: "blue-st", reactionIndex: 0, createdAt: 1000 } },
    },
  });
}

test("Shot exposes actual opponent GoalGrid cells and persists four Pass-style corner routes", () => {
  const base = state();
  const matchContext = context();
  const started = applyGameCommand({ state: base, context: matchContext, command: { id: "shot-start", type: "SHOT_STARTED", payload: { pieceId: "blue-st", shotId: "shot-1" } } });
  const targetProjection = selectSinglePlayerShotTargetPresentation(started.nextState, matchContext);
  assert.equal(targetProjection.targetOptions.length, 10);
  assert.deepEqual(targetProjection.targetOptions[0], { side: "right", depth: 0, y: 0, x: 20, boardY: 3 });
  const { selected } = selectedShot(base);
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

test("Shot resolves every documented outcome without applying a physical consequence", () => {
  const cases = [[20, "goal"], [1, "goal-kick"], [4, "goalkeeper-retains"], [6, "corner"]];
  cases.forEach(([natural, expected]) => {
    const before = confirmedShot();
    const baseline = before.confirmed.nextState;
    const resolved = resolveShot(natural);
    assert.equal(resolved.accepted, true);
    assert.equal(resolved.nextState.actionResolution.status, "result-display");
    assert.equal(resolved.nextState.actionResolution.result.outcome, expected);
    assert.deepEqual(resolved.nextState.pieces, baseline.pieces);
    assert.equal(resolved.nextState.tracker.currentTurn, baseline.tracker.currentTurn);
    assert.equal(resolved.nextState.tracker.startingTeam, baseline.tracker.startingTeam);
    assert.equal(resolved.events[0].metadata.consequenceApplied, false);
  });
});

test("Shot result screen is hard-blocking until Timeline navigation, never a fake restart control", () => {
  const resolved = resolveShot(20);
  const command = applyGameCommand({ state: resolved.nextState, context: context(), command: { id: "move-after-result", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-st" } } });
  assert.equal(command.accepted, false);
  assert.equal(command.reason, "ACTION_RESOLUTION_ACTIVE");
});

test("Shot consumes only the selected canonical Tracker modifier token with its submitted roll", () => {
  const { matchContext, confirmed } = confirmedShot(state({
    teamModifierTokens: [{ id: "blue-av", team: "blue", modifierType: "advantage", availableFromTurn: 1, expiresAfterTurn: 1 }],
  }));
  const pending = confirmed.nextState.actionResolution.pendingRoll;
  const resolved = applyGameCommand({
    state: confirmed.nextState, context: matchContext,
    command: { id: "shot-roll-token", type: "GAMEPLAY_ROLL_SUBMITTED", payload: { bonusModifierType: "advantage", rollEvent: { id: "roll-token", requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural: 4, subjectId: "blue-st", reactionIndex: 0 } } },
  });
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.nextState.actionResolution.result.modifierSources.some(source => source.reason === "Tracker modifier token"), true);
  assert.equal(resolved.nextState.teamModifierTokens.length, 0);
});

test("Shot target, route and result are independent Timeline steps with deterministic Undo/Redo", () => {
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
    command: { id: "timeline-shot-roll", type: "GAMEPLAY_ROLL_SUBMITTED", payload: { rollEvent: { id: "timeline-roll", requestId: pending.requestId, actionId: pending.actionId, team: "blue", dieType: 20, natural: 20, subjectId: "blue-st", reactionIndex: 0 } } },
    label: "Blue D20: 20 (SHOT)",
  });
  assert.deepEqual(rolled.timeline.entries.map(entry => entry.type), ["SHOT_STARTED", "SHOT_TARGET_SELECTED", "SHOT_ROUTE_CONFIRMED", "SHOT_RESOLVED"]);
  const undone = undoTimeline(rolled.timeline);
  assert.equal(undone.state.actionResolution.status, "awaiting-roll");
  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.state.actionResolution.result.outcome, "goal");
});
