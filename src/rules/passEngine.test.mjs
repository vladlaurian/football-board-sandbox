import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPassPlan,
  cardStat,
  opponentBlockingPassOrigin,
  resolveInterceptionRoll,
  segmentIntersectsOpenRect,
  traversedCells,
} from "./passEngine.mjs";

test("a segment which only touches a square corner does not enter it", () => {
  assert.equal(segmentIntersectsOpenRect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 0 }), false);
  assert.equal(segmentIntersectsOpenRect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 }), true);
  assert.deepEqual(traversedCells({ x: 0, y: 0 }, { x: 2, y: 2 }, { cols: 3, rows: 3 }).map(cell => [cell.x, cell.y]), [[0, 0], [1, 1]]);
});

test("an opponent square blocks defensive-line visibility but a teammate does not", () => {
  const passer = { id: "p", team: "A", x: 1, y: 1 };
  const defender = { id: "d", team: "B", x: 5, y: 1, cardId: "d-card" };
  const blocked = { id: "block", team: "A", x: 4, y: 1 };
  const target = { x: 7, y: 1 };
  const cardById = { "p-card": { passiveAttributes: [{ name: "Pass", value: 10 }] }, "d-card": { defensiveArea: [{ dx: 0, dy: -1 }] } };
  const plan = buildPassPlan({ passer: { ...passer, cardId: "p-card" }, passerCard: cardById["p-card"], pieces: [passer, defender, blocked], cardById, settings: { cols: 12, rows: 8 }, target, cornerId: "top-right", rules: { pathMode: "corner-to-center", modifierCap: 4 } });
  assert.equal(plan.defensiveAreaCrossings.length, 1);
  assert.equal(plan.interceptors.length, 0);
});

test("a corner-to-centre pass cannot begin from a corner shared with an opponent square", () => {
  const passer = { id: "passer", team: "A", x: 5, y: 5 };
  const diagonalOpponent = { id: "red-diagonal", team: "B", x: 4, y: 4 };
  const teammate = { id: "blue-diagonal", team: "A", x: 4, y: 4 };
  const sharedOrigin = { x: 5, y: 5, cornerId: "top-left" };
  assert.equal(opponentBlockingPassOrigin(sharedOrigin, passer, [passer, diagonalOpponent])?.id, "red-diagonal");
  assert.equal(opponentBlockingPassOrigin(sharedOrigin, passer, [passer, teammate]), null);

  const cardById = { "pass-card": { passiveAttributes: [{ name: "Passing", value: 10 }] } };
  const blockedPlan = buildPassPlan({
    passer: { ...passer, cardId: "pass-card" },
    passerCard: cardById["pass-card"],
    pieces: [passer, diagonalOpponent],
    cardById,
    settings: { cols: 12, rows: 12 },
    target: { x: 8, y: 5 },
    cornerId: "top-left",
    rules: { pathMode: "corner-to-center" },
  });
  assert.equal(blockedPlan.originBlocked, true);
  assert.equal(blockedPlan.originBlocker.pieceId, "red-diagonal");
});

test("centre-to-centre passing is not affected by corner-origin blockers", () => {
  const passer = { id: "passer", team: "A", x: 5, y: 5, cardId: "pass-card" };
  const opponent = { id: "red-diagonal", team: "B", x: 4, y: 4 };
  const cardById = { "pass-card": { passiveAttributes: [{ name: "Passing", value: 10 }] } };
  const plan = buildPassPlan({
    passer,
    passerCard: cardById["pass-card"],
    pieces: [passer, opponent],
    cardById,
    settings: { cols: 12, rows: 12 },
    target: { x: 8, y: 5 },
    cornerId: null,
    rules: { pathMode: "center-to-center" },
  });
  assert.equal(plan.originBlocked, false);
});

test("roll results enforce natural results and the strict greater-than interception rule", () => {
  assert.equal(resolveInterceptionRoll({ natural: 1, passerPass: 0 }).outcome, "pass-continues");
  assert.equal(resolveInterceptionRoll({ natural: 20, passerPass: 99 }).outcome, "natural-20-interception");
  assert.equal(resolveInterceptionRoll({ natural: 10, interception: 1, orderModifier: 0, passerPass: 11 }).outcome, "pass-continues");
  assert.equal(resolveInterceptionRoll({ natural: 10, interception: 1, orderModifier: 1, passerPass: 11 }).outcome, "interception");
});

test("normal Pass gameplay reads the established Passing card attribute", () => {
  const card = { passiveAttributes: [{ name: "Passing", value: 14 }], bonuses: [{ name: "Long Pass", value: 19 }] };
  assert.equal(cardStat(card, "Pass"), 14);
});

test("interception resolution exposes its unclamped modifier and cap", () => {
  const result = resolveInterceptionRoll({ natural: 12, interception: 3, orderModifier: 1, nonDominantPenalty: 1, passerPass: 16, modifierCap: 4 });
  assert.equal(result.rawModifier, 5);
  assert.equal(result.modifier, 4);
  assert.equal(result.capped, true);
  assert.equal(result.modifierCap, 4);
});
