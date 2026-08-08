import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { buildShotRoutePlan } from "./shotRules.mjs";
import { planLoftedThroughBall } from "./loftedThroughBallRules.mjs";
import { buildPassPlan } from "../rules/passEngine.mjs";
import { applyGameCommand } from "./gameEngine.mjs";

// Hardcoded per-(restart-type x action) exceptions from
// docs/SHOOTING_RULES.md sections 4-5 and 7, wired into the general
// restartSetup engine (restartSetupRules.mjs). Only the exception's own
// NUMBERS are Rule-Set-editable (freeKick*.loftedThroughBallDifficultyOverride);
// which exceptions apply to which (type, action) pair is hardcoded.

function context(overrides = {}) {
  return createMatchContext({
    id: "restart-exception-context",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17, smallDepth: 3, smallWidth: 9 },
    gameplayCards: [
      { id: "blue-card", name: "Blue ST", position: "ST", preferredFoot: "Right", passiveAttributes: [{ id: "stat:finishing", name: "Finishing", value: 7 }, { id: "stat:long-shot", name: "Long Shot", value: 7 }] },
      { id: "red-gk-card", name: "Red GK", position: "GK" },
      { id: "red-def-card", name: "Red DF", position: "DF", defensiveArea: [{ dx: 0, dy: 1 }] },
    ],
    ...overrides,
  });
}

function state(overrides = {}) {
  return createGameState({ gameMode: "match", pieces: [], ...overrides });
}

test("Corner Shot: exempt from the board-boundary rule, mandatory DVM, and one DV only when the wall was placed", () => {
  const shooter = { id: "blue-wide-angle", team: "A", cardId: "blue-card", x: 17, y: 10 };
  const noWallState = state({
    pieces: [{ id: "ball", team: "BALL", x: 17, y: 10 }, shooter],
    restartSetup: { type: "corner", team: "blue", phase: "execution", executorId: "blue-wide-angle", wallPlaced: 0 },
  });
  const noWallPlan = buildShotRoutePlan({ state: noWallState, context: context(), shooter, target: { side: "right", depth: 0, y: 4 }, cornerId: "bottom-right" });
  assert.equal(noWallPlan.exitsBoard, false, "Corner Shot must be exempt from the board-boundary rule");
  assert.equal(noWallPlan.legal, true);
  assert.ok(noWallPlan.modifierSources.some(source => source.reason === "Corner execution"), "must carry the mandatory Corner-execution DVM");
  assert.equal(noWallPlan.modifierSources.some(source => source.reason === "Wall player"), false, "no wall DV when the optional wall was not placed");

  const withWallState = { ...noWallState, restartSetup: { ...noWallState.restartSetup, wallPlaced: 1 } };
  const withWallPlan = buildShotRoutePlan({ state: withWallState, context: context(), shooter, target: { side: "right", depth: 0, y: 4 }, cornerId: "bottom-right" });
  assert.equal(withWallPlan.modifierSources.filter(source => source.reason === "Wall player").length, 1);
});

test("a normal Shot (no restartSetup) is unaffected by the Corner/Free-Kick exception machinery", () => {
  const shooter = { id: "blue-wide-angle", team: "A", cardId: "blue-card", x: 17, y: 10 };
  const rawState = state({ pieces: [{ id: "ball", team: "BALL", x: 17, y: 10 }, shooter] });
  const plan = buildShotRoutePlan({ state: rawState, context: context(), shooter, target: { side: "right", depth: 0, y: 4 }, cornerId: "bottom-right" });
  assert.equal(plan.exitsBoard, true);
  assert.equal(plan.legal, false);
  assert.equal(plan.modifierSources.some(source => source.reason === "Corner execution"), false);
});

test("Free Kick Direct Shot: bodies never block the route, defensive-area crossings add no DV, each wall player adds its own DV", () => {
  const shooter = { id: "blue-st", team: "A", cardId: "blue-card", x: 10, y: 5 };
  // A body sitting directly on the route would ordinarily block it; a
  // defender's own defensive area also ordinarily crossed by the route.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 10, y: 5 },
      shooter,
      { id: "red-gk", team: "B", cardId: "red-gk-card", x: 18, y: 0 },
      { id: "red-blocker", team: "B", cardId: "red-def-card", x: 15, y: 3 },
    ],
    restartSetup: { type: "freeKickDirect", team: "blue", phase: "execution", executorId: "blue-st", wallPlaced: 3 },
  });
  const plan = buildShotRoutePlan({ state: rawState, context: context(), shooter, target: { side: "right", depth: 0, y: 2 }, cornerId: "top-right" });
  assert.equal(plan.originBlocker, null);
  assert.deepEqual(plan.bodyBlockers, []);
  assert.equal(plan.modifierSources.some(source => source.reason === "Defensive area"), false);
  assert.equal(plan.modifierSources.filter(source => source.reason === "Wall player").length, 3);
  assert.equal(plan.legal, true);
});

test("Free Kick (direct/indirect) Lofted Through Ball: difficulty override applies and defensive-area crossings have no effect", () => {
  const passer = { id: "blue-st", team: "A", cardId: "blue-card", x: 5, y: 5 };
  const defender = { id: "red-def", team: "B", cardId: "red-def-card", x: 8, y: 5 };
  const matchContext = context({ ruleSet: { actions: { restarts: { freeKickDirect: { loftedThroughBallDifficultyOverride: 18 } } } } });
  const restartState = state({
    pieces: [{ id: "ball", team: "BALL", x: 5, y: 5 }, passer, defender],
    restartSetup: { type: "freeKickDirect", team: "blue", phase: "execution", executorId: "blue-st", wallPlaced: 0 },
  });
  const plan = planLoftedThroughBall(restartState, matchContext, passer, { x: 8, y: 8 }, "bottom-right");
  assert.equal(plan.difficultyThreshold, 18);
  assert.equal(plan.rollPreview.modifierSources.some(source => source.source === "defensive-areas"), false);

  const ordinaryState = state({ pieces: [{ id: "ball", team: "BALL", x: 5, y: 5 }, passer, defender] });
  const ordinaryPlan = planLoftedThroughBall(ordinaryState, matchContext, passer, { x: 8, y: 8 }, "bottom-right");
  assert.equal(ordinaryPlan.difficultyThreshold, 16);
});

test("Corner: a Long Pass into the defending team's own box is illegal; the same distance as Short Pass elsewhere is unaffected", () => {
  const passer = { id: "blue-corner", team: "A", cardId: "blue-card", x: 19, y: 0 };
  const boxSettings = { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 };
  const longIntoBox = buildPassPlan({
    passer, passerCard: { preferredFoot: "Right" }, pieces: [passer], cardById: {}, settings: boxSettings,
    target: { x: 15, y: 3 }, cornerId: "top-right", rules: { actions: { pass: { pathMode: "corner-to-center", longPassThreshold: 3 } } },
    cornerLongPassBoxTeam: "red",
  });
  assert.equal(longIntoBox.isLong, true);
  assert.equal(longIntoBox.illegalCornerLongPass, true);

  const noCornerContext = buildPassPlan({
    passer, passerCard: { preferredFoot: "Right" }, pieces: [passer], cardById: {}, settings: boxSettings,
    target: { x: 15, y: 3 }, cornerId: "top-right", rules: { actions: { pass: { pathMode: "corner-to-center", longPassThreshold: 3 } } },
    cornerLongPassBoxTeam: null,
  });
  assert.equal(noCornerContext.illegalCornerLongPass, false);
});

test("PASS_ROUTE_CONFIRMED rejects a Long Pass into the box during a Corner's execution phase", () => {
  const matchContext = createMatchContext({
    id: "corner-long-pass-context",
    boardSettings: { cols: 20, rows: 12, goalDepth: 2, goalWidth: 5, boxDepth: 7, boxWidth: 17 },
    ruleSet: { actions: { pass: { pathMode: "center-to-center", longPassThreshold: 3, requireFieldPlayerTarget: false } } },
    gameplayCards: [{ id: "blue-card", position: "ST", preferredFoot: "Right" }],
  });
  const passer = { id: "blue-corner", team: "A", cardId: "blue-card", x: 19, y: 0 };
  const rawState = state({
    pieces: [{ id: "ball", team: "BALL", x: 19, y: 0 }, passer],
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack",
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, personalActionsByPieceId: {}, matchActionState: {},
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    restartSetup: { type: "corner", team: "blue", phase: "execution", executorId: "blue-corner", availableActions: ["short-pass", "long-pass"], wallSize: 1, wallPlaced: 0, repositionCount: 5, repositionRemaining: { attack: 5, defense: 5 }, repositionTurn: "attack", ballCell: { x: 19, y: 0 } },
  });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "pass-start", type: "PASS_STARTED", payload: { pieceId: "blue-corner", passId: "pass-1" } } });
  assert.equal(started.accepted, true);
  const targeted = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "pass-target", type: "PASS_TARGET_SELECTED", payload: { passId: "pass-1", x: 15, y: 3 } } });
  assert.equal(targeted.accepted, true);
  assert.equal(targeted.nextState.actionResolution.targetInvalidReason, "PASS_LONG_ILLEGAL_FROM_CORNER");
  const confirmed = applyGameCommand({ state: targeted.nextState, context: matchContext, command: { id: "pass-route", type: "PASS_ROUTE_CONFIRMED", payload: { passId: "pass-1", cornerId: null } } });
  assert.equal(confirmed.accepted, false);
  assert.equal(confirmed.reason, "PASS_LONG_ILLEGAL_FROM_CORNER");
});
