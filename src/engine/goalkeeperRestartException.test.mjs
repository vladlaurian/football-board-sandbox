import test from "node:test";
import assert from "node:assert/strict";
import { createMatchContext } from "./matchContext.mjs";
import { planThroughBall } from "./throughBallRules.mjs";
import { planLoftedThroughBall } from "./loftedThroughBallRules.mjs";

// Goalkeeper Retains' restart exception (docs/SHOOTING_RULES.md): inside the
// executing goalkeeper's own penalty area, every body (teammate or opponent)
// and every defensive area is ignored for that goalkeeper's one restart.
// These mirror the equivalent Pass coverage in src/rules/passEngine.test.mjs
// for the other two mechanics that can also execute a Goalkeeper Retains
// restart.
const boardSettings = { cols: 20, rows: 12, boxDepth: 6, boxWidth: 8, smallDepth: 3, smallWidth: 4 };

function state(pieces) {
  return { pieces };
}

test("Through Ball's goalkeeper-restart exception ignores an opposing defensive area and body inside the goalkeeper's own penalty area", () => {
  const matchContext = createMatchContext({ id: "tb-exception", boardSettings, gameplayCards: [
    { id: "gk-card", name: "GK", position: "GK" },
    { id: "def-card", name: "DF", defensiveArea: [{ dx: 0, dy: 0 }] },
  ] });
  const passer = { id: "gk", team: "A", x: 2, y: 5, cardId: "gk-card" };
  const defender = { id: "red-def", team: "B", x: 2, y: 6, cardId: "def-card" };
  const rawState = state([passer, defender]);
  const target = { x: 2, y: 8 };

  const withoutException = planThroughBall(rawState, matchContext, passer, target, "top-left");
  assert.equal(withoutException.legal, false);
  assert.equal(withoutException.areaBlocked, true);
  assert.equal(withoutException.bodyBlocked, true);

  const withException = planThroughBall(rawState, matchContext, passer, target, "top-left", { team: "blue", pieceId: "gk" });
  assert.equal(withException.areaBlocked, false);
  assert.equal(withException.bodyBlocked, false);

  const wrongPiece = planThroughBall(rawState, matchContext, passer, target, "top-left", { team: "blue", pieceId: "someone-else" });
  assert.equal(wrongPiece.areaBlocked, true);
});

// docs/SHOOTING_RULES.md and docs/CROSS_RULES.md: the exception ignores
// EVERY body inside the box, teammate or opponent alike, not just an
// opponent's.
test("Through Ball's goalkeeper-restart exception ignores a teammate's body too, inside the goalkeeper's own penalty area", () => {
  const matchContext = createMatchContext({ id: "tb-exception-teammate", boardSettings, gameplayCards: [
    { id: "gk-card", name: "GK", position: "GK" },
    { id: "mate-card", name: "CB" },
  ] });
  const passer = { id: "gk", team: "A", x: 2, y: 5, cardId: "gk-card" };
  const teammate = { id: "blue-mate", team: "A", x: 2, y: 6, cardId: "mate-card" };
  const rawState = state([passer, teammate]);
  const target = { x: 2, y: 8 };

  const withoutException = planThroughBall(rawState, matchContext, passer, target, "top-left");
  assert.equal(withoutException.bodyBlocked, true, "control: without the exception, a teammate's body still blocks the route");

  const withException = planThroughBall(rawState, matchContext, passer, target, "top-left", { team: "blue", pieceId: "gk" });
  assert.equal(withException.bodyBlocked, false, "with the exception active, a teammate's body is ignored too");
});

test("Through Ball's goalkeeper-restart exception does not apply outside the goalkeeper's own penalty area", () => {
  const matchContext = createMatchContext({ id: "tb-exception-outside", boardSettings, gameplayCards: [
    { id: "gk-card", name: "GK", position: "GK" },
    { id: "def-card", name: "DF", defensiveArea: [{ dx: 0, dy: 0 }] },
  ] });
  const passer = { id: "gk", team: "A", x: 12, y: 5, cardId: "gk-card" };
  const defender = { id: "red-def", team: "B", x: 12, y: 6, cardId: "def-card" };
  const rawState = state([passer, defender]);
  const plan = planThroughBall(rawState, matchContext, passer, { x: 12, y: 8 }, "top-left", { team: "blue", pieceId: "gk" });
  assert.equal(plan.areaBlocked, true);
});

test("Lofted Through Ball's goalkeeper-restart exception ignores an opposing defensive-area crossing inside the goalkeeper's own penalty area", () => {
  const matchContext = createMatchContext({ id: "lofted-exception", boardSettings, gameplayCards: [
    { id: "gk-card", name: "GK", position: "GK", passiveAttributes: [{ id: "stat:lofted-through-ball", name: "Lofted Through Ball", value: 10 }] },
    { id: "def-card", name: "DF", defensiveArea: [{ dx: 0, dy: 0 }] },
  ] });
  const passer = { id: "gk", team: "A", x: 2, y: 5, cardId: "gk-card" };
  const defender = { id: "red-def", team: "B", x: 2, y: 6, cardId: "def-card" };
  const rawState = state([passer, defender]);
  const target = { x: 2, y: 8 };

  // A crossed defensive area is a roll-modifier penalty for Lofted Through
  // Ball, not a hard block (that's passerInDefensiveArea/targetInDefensiveArea
  // instead) — so the exception is verified against crossedDefenderIds and
  // its resulting Disadvantage stack, not against `legal`.
  const withoutException = planLoftedThroughBall(rawState, matchContext, passer, target, "top-left");
  assert.equal(withoutException.crossedDefenderIds.length, 1);
  assert.equal(withoutException.disadvantageStacks, 1);

  const withException = planLoftedThroughBall(rawState, matchContext, passer, target, "top-left", { team: "blue", pieceId: "gk" });
  assert.equal(withException.crossedDefenderIds.length, 0);
  assert.equal(withException.disadvantageStacks, 0);

  const wrongPiece = planLoftedThroughBall(rawState, matchContext, passer, target, "top-left", { team: "blue", pieceId: "someone-else" });
  assert.equal(wrongPiece.crossedDefenderIds.length, 1);
});

test("Lofted Through Ball's goalkeeper-restart exception does not apply outside the goalkeeper's own penalty area", () => {
  const matchContext = createMatchContext({ id: "lofted-exception-outside", boardSettings, gameplayCards: [
    { id: "gk-card", name: "GK", position: "GK", passiveAttributes: [{ id: "stat:lofted-through-ball", name: "Lofted Through Ball", value: 10 }] },
    { id: "def-card", name: "DF", defensiveArea: [{ dx: 0, dy: 0 }] },
  ] });
  const passer = { id: "gk", team: "A", x: 12, y: 5, cardId: "gk-card" };
  const defender = { id: "red-def", team: "B", x: 12, y: 6, cardId: "def-card" };
  const rawState = state([passer, defender]);
  const plan = planLoftedThroughBall(rawState, matchContext, passer, { x: 12, y: 8 }, "top-left", { team: "blue", pieceId: "gk" });
  assert.equal(plan.crossedDefenderIds.length, 1);
});
