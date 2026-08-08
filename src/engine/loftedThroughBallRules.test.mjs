import assert from "node:assert/strict";
import test from "node:test";
import { resolveLoftedThroughBallRoll, planLoftedThroughBall, resolveLoftedThroughBall } from "./loftedThroughBallRules.mjs";

// Regression coverage for the base-stat-capping bug found live: only
// AV/AVM/DV/DVM-style situational sources are ever capped — never the
// passer's own Lofted Through stat (rollModifierMath.mjs).

function context(overrides = {}) {
  return {
    boardSettings: { cols: 20, rows: 12 },
    gameplayCardsById: { "blue-card": { passiveAttributes: [{ id: "stat:lofted-through-ball", name: "Lofted Through Ball", value: 10 }] } },
    ruleSet: {
      diceModifiers: { advantage: 1, majorAdvantage: 3, disadvantage: -2, majorDisadvantage: -6, stackCap: 4 },
      actions: { loftedThroughBall: { rollStatId: "stat:lofted-through-ball", maxDistance: 32, difficultyThreshold: 16 } },
    },
    ...overrides,
  };
}

test("resolveLoftedThroughBallRoll never caps the passer's own stat, only the situational sources", () => {
  const passer = { id: "blue-1", team: "A", cardId: "blue-card", x: 2, y: 2 };
  const state = {
    pieces: [passer],
    dice: {},
    teamModifierTokens: [],
    tracker: { currentTurn: 1 },
    actionResolution: {
      kind: "lofted-through-ball",
      status: "awaiting-lofted-resolution",
      id: "lofted-1",
      passerId: "blue-1",
      team: "blue",
      target: { x: 10, y: 2 },
      bonusModifierType: null,
      lastRollEvent: { id: "roll-1", natural: 10 },
      plan: {
        rollStatValue: 10,
        // 3 crossed defensive areas at -2 each = -6 raw, capped to -4.
        disadvantageStacks: 3,
        foot: { dominant: true },
      },
    },
  };
  const result = resolveLoftedThroughBallRoll(state, context(), { payload: { loftedThroughBallId: "lofted-1", rollEventId: "roll-1" } });
  assert.equal(result.accepted, true);
  const rolled = result.event.metadata.result;
  assert.equal(rolled.rawModifier, 4, "10 (uncapped stat) + -6 (raw situational)");
  assert.equal(rolled.modifier, 6, "10 (uncapped stat) + -4 (capped situational)");
  assert.equal(rolled.capped, true, "the situational sources alone were still capped");
});

test("planLoftedThroughBall's own preview never caps the passer's stat either", () => {
  const passer = { id: "blue-1", team: "A", cardId: "blue-card", x: 2, y: 2 };
  const target = { x: 10, y: 2 };
  const state = { pieces: [passer], restartSetup: null };
  const plan = planLoftedThroughBall(state, context(), passer, target, null);
  assert.equal(plan.rollPreview.modifierSources[0], plan.rollPreview.modifierSources.find(s => s.source === "card"));
  assert.equal(plan.rollPreview.modifierSources.find(s => s.source === "card").value, 10);
  // No defenders in this fixture, so nothing to cap: modifier is the bare stat.
  assert.equal(plan.rollPreview.modifier, 10);
  assert.equal(plan.rollPreview.capped, false);
});

// Offside Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6): a
// successful Lofted Through Ball that wins its recovery race outright for
// the attacking team must flag every attacker currently offside — see the
// matching Through Ball coverage in gameEngine.test.mjs for the full
// turn-boundary-persistence scenario; this only checks the wiring at the
// point where the ball is awarded to the attacking team.
test("Corner's own Lofted Through Ball difficulty threshold can be overridden separately, without picking up Free Kick's defensive-area exemption", () => {
  const passer = { id: "blue-1", team: "A", cardId: "blue-card", x: 2, y: 2 };
  const target = { x: 10, y: 2 };
  // red-1's defensiveArea {dx:0, dy:0} (team B transform: boardDx=dy=0,
  // boardDy=-dx=0) projects onto its own cell (6,2), directly on the
  // passer-to-target route.
  const defender = { id: "red-1", team: "B", cardId: "red-card", x: 6, y: 2 };
  const sharedContext = context({
    gameplayCardsById: { ...context().gameplayCardsById, "red-card": { defensiveArea: [{ dx: 0, dy: 0 }] } },
    ruleSet: {
      ...context().ruleSet,
      actions: {
        ...context().ruleSet.actions,
        restarts: {
          corner: { loftedThroughBallDifficultyOverride: 20 },
          freeKickDirect: { loftedThroughBallDifficultyOverride: 18 },
        },
      },
    },
  });
  // disadvantageStacks is just a raw "how many areas were crossed" count,
  // unaffected by the exemption — the exemption only zeroes the actual dice
  // penalty (rollPreview's own "defensive-areas" modifier source), so that's
  // what distinguishes Corner from Free Kick below.
  const cornerState = { pieces: [passer, defender], restartSetup: { type: "corner", phase: "execution", executorId: "blue-1" } };
  const cornerPlan = planLoftedThroughBall(cornerState, sharedContext, passer, target, null);
  assert.equal(cornerPlan.difficultyThreshold, 20, "Corner uses its own configured override");
  assert.ok(cornerPlan.disadvantageStacks > 0, "the route does cross a defensive area");
  assert.ok(cornerPlan.rollPreview.modifierSources.some(source => source.source === "defensive-areas"), "Corner does NOT get Free Kick's defensive-area exemption — the crossed area still counts against the roll");

  const freeKickState = { pieces: [passer, defender], restartSetup: { type: "freeKickDirect", phase: "execution", executorId: "blue-1" } };
  const freeKickPlan = planLoftedThroughBall(freeKickState, sharedContext, passer, target, null);
  assert.equal(freeKickPlan.difficultyThreshold, 18, "Free Kick uses its own override");
  assert.ok(!freeKickPlan.rollPreview.modifierSources.some(source => source.source === "defensive-areas"), "Free Kick keeps its documented exemption from the defensive-area penalty");

  // Not executing (e.g. still just previewing, or someone else is the
  // executor) — the ordinary threshold applies regardless of restart type.
  const idleState = { pieces: [passer, defender], restartSetup: null };
  const idlePlan = planLoftedThroughBall(idleState, sharedContext, passer, target, null);
  assert.equal(idlePlan.difficultyThreshold, 16, "no active restart execution — the ordinary threshold applies");
});

test("a successful Lofted Through Ball flags every offside attacker when it wins the recovery race outright", () => {
  const passer = { id: "blue-1", team: "A", cardId: "blue-card", x: 1, y: 1 };
  const flagged = { id: "blue-2", team: "A", cardId: "blue-card", x: 11, y: 1 };
  const red1 = { id: "red-1", team: "B", cardId: "blue-card", x: 0, y: 11 };
  const red2 = { id: "red-2", team: "B", cardId: "blue-card", x: 5, y: 11 };
  const ball = { id: "ball", team: "BALL", x: 1, y: 1 };
  const state = {
    pieces: [ball, passer, flagged, red1, red2],
    dice: {}, teamModifierTokens: [], tracker: { currentTurn: 1, turnPhase: "attack" },
    actionResolution: {
      kind: "lofted-through-ball", status: "roll-resolved", id: "lofted-2", passerId: "blue-1", team: "blue",
      target: { x: 16, y: 6 }, bonusContinuationId: null,
      result: { succeeds: true, naturalEffect: "none" },
    },
  };
  const result = resolveLoftedThroughBall(state, context());
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.offsideWatch, { attackingTeam: "blue", flaggedPieceIds: ["blue-2"] });
});
