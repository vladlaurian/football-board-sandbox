import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerRollPromptPresentation, selectSinglePlayerShotPresentation, selectSinglePlayerShotTargetPresentation } from "./matchPresentationSelectors.mjs";
import { dispatchSinglePlayerGameCommand } from "./singlePlayerController.mjs";
import { atomicTimelineTransactionId, redoAtomicTimelineTransaction, redoTimeline, undoAtomicTimelineTransaction, undoTimeline } from "../timeline/timelineEngine.mjs";
import { buildShotRoutePlan } from "./shotRules.mjs";

function context(overrides = {}) {
  return createMatchContext({
    id: "shot-test-context",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
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
  const withState = { ...confirmed.nextState, teamModifierTokens: [{ id: "blue-av", team: "blue", modifierType: "advantage", availableFromTurn: 1, expiresAfterTurn: 1 }] };
  const withToken = selectSinglePlayerRollPromptPresentation(withState, matchContext, { team: "blue", selectedModifierType: "advantage" });
  assert.equal(withToken.modifierSources.some(source => source.source === "team-modifier-token"), true);
  assert.equal(withToken.modifier, base.modifier + 1);
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
      // "Both" removes the non-dominant-foot DVM so these tests isolate the
      // defensive-area cap without an incidental foot penalty.
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Both", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK", passiveAttributes: [{ id: "stat:reflexes", name: "Reflexes", value: 10 }, { id: "stat:diving-saves", name: "Diving Saves", value: 10 }] },
      ...FAR_DEFENDER_COLUMNS.map(px => ({ id: `red-far-card-${px}`, position: "DF", defensiveArea: [{ dx: 0, dy: 14 - px }] })),
    ],
    ...overrides,
  });
}

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
  const { resolved } = resolveShot(7, fiveDefenderState(), fiveDefenderContext());
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
