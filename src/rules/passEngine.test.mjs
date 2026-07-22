import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInterceptorChoice,
  buildPassPlan,
  cardStat,
  interceptorChoiceCandidates,
  interceptorPriorityDistanceSquared,
  isGoalkeeperPiece,
  opponentBlockingPassOrigin,
  passRequiresInterceptionSequence,
  segmentIntersectsOpenRect,
  traversedCells,
} from "./passEngine.mjs";
import { resolveInterceptionRoll } from "./interceptionEngine.mjs";

test("interceptor priority uses passer-square to defender-square distance for all four pass origins", () => {
  const passer = { id: "passer", team: "A", x: 5, y: 5, cardId: "pass-card" };
  const near = { id: "near", team: "B", x: 8, y: 7, cardId: "def-card" };
  const far = { id: "far", team: "B", x: 11, y: 8, cardId: "def-card" };
  const defensiveArea = [];
  for (let dx = -12; dx <= 12; dx += 1) {
    for (let dy = -12; dy <= 12; dy += 1) defensiveArea.push({ dx, dy });
  }
  const cardById = {
    "pass-card": { passiveAttributes: [{ name: "Passing", value: 12 }] },
    "def-card": { defensiveArea },
  };
  const orders = ["top-left", "top-right", "bottom-left", "bottom-right"].map(cornerId => buildPassPlan({
    passer,
    passerCard: cardById["pass-card"],
    pieces: [passer, near, far],
    cardById,
    settings: { cols: 24, rows: 18 },
    target: { x: 16, y: 5 },
    cornerId,
    rules: { pathMode: "corner-to-center", modifierCap: 4 },
  }).interceptors.map(item => item.defender.id));
  assert.deepEqual(orders, [
    ["near", "far"],
    ["near", "far"],
    ["near", "far"],
    ["near", "far"],
  ]);
  assert.equal(interceptorPriorityDistanceSquared(passer, near), 13);
  assert.equal(interceptorPriorityDistanceSquared(passer, far), 45);
});

test("equally distant interceptors require defender choice and receive order modifiers after selection", () => {
  const interceptors = [
    { defender: { id: "left" }, priorityDistanceSquared: 9, orderModifier: 0 },
    { defender: { id: "right" }, priorityDistanceSquared: 9, orderModifier: 1 },
    { defender: { id: "far" }, priorityDistanceSquared: 16, orderModifier: 2 },
  ];
  assert.deepEqual(interceptorChoiceCandidates(interceptors, 0).map(item => item.defender.id), ["left", "right"]);
  const chosen = applyInterceptorChoice(interceptors, 0, "right", 4);
  assert.deepEqual(chosen.interceptors.map(item => item.defender.id), ["right", "left", "far"]);
  assert.deepEqual(chosen.interceptors.map(item => item.orderModifier), [0, 1, 2]);
  assert.equal(chosen.selection.reason, "defender-choice-equal-distance");
  assert.deepEqual(chosen.selection.candidatePieceIds, ["left", "right"]);
});

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

test("gameplay reads stable global stat IDs before legacy labels", () => {
  const card = { passiveAttributes: [{ id: "stat:passing", name: "Renamed Passing", value: 15 }], bonuses: [{ id: "stat:interception", name: "Renamed Interception", value: 12 }] };
  assert.equal(cardStat(card, "stat:passing"), 15);
  assert.equal(cardStat(card, "stat:interception"), 12);
});

test("interception resolution exposes its unclamped modifier and cap", () => {
  const result = resolveInterceptionRoll({ natural: 12, interception: 3, orderModifier: 1, nonDominantPenalty: 1, passerPass: 16, modifierCap: 4 });
  assert.equal(result.rawModifier, 5);
  assert.equal(result.modifier, 4);
  assert.equal(result.capped, true);
  assert.equal(result.modifierCap, 4);
});


test("teammate direct hit still resolves eligible interception reactions", () => {
  assert.equal(passRequiresInterceptionSequence({ directHit: { team: "blue" }, interceptors: [{ defender: { id: "B-1" } }] }, "blue"), true);
  assert.equal(passRequiresInterceptionSequence({ directHit: { team: "red" }, interceptors: [{ defender: { id: "B-1" } }] }, "blue"), false);
  assert.equal(passRequiresInterceptionSequence({ directHit: null, interceptors: [{ defender: { id: "B-1" } }] }, "blue"), true);
  assert.equal(passRequiresInterceptionSequence({ directHit: { team: "blue" }, interceptors: [] }, "blue"), false);
});


test("zero modifier cap disables progressive and final modifiers", () => {
  const result = resolveInterceptionRoll({ natural: 12, interception: 3, orderModifier: 5, previousNaturalOnePenalty: -2, passerPass: 12, modifierCap: 0 });
  assert.equal(result.modifierCap, 0);
  assert.equal(result.modifier, 0);
  assert.equal(result.total, 12);
  assert.equal(result.capped, true);
});

test("maximum total modifier clamps negative totals symmetrically", () => {
  const result = resolveInterceptionRoll({ natural: 12, interception: 0, orderModifier: 0, previousNaturalOnePenalty: -7, passerPass: 20, modifierCap: 4 });
  assert.equal(result.rawModifier, -7);
  assert.equal(result.modifier, -4);
  assert.equal(result.modifierCap, 4);
  assert.equal(result.capped, true);
});


test("pass plan freezes Interception rules for canonical multiplayer resolution", () => {
  const passer = { id: "passer", team: "A", x: 1, y: 1, cardId: "pass-card" };
  const passerCard = { passiveAttributes: [{ id: "stat:passing", name: "Passing", value: 12 }] };
  const plan = buildPassPlan({
    passer,
    passerCard,
    pieces: [passer],
    cardById: { "pass-card": passerCard },
    settings: { cols: 20, rows: 12 },
    target: { x: 6, y: 1 },
    cornerId: null,
    rules: {
      actions: {
        pass: { pathMode: "center-to-center", longPassThreshold: 15 },
        interception: {
          defenderRollStatId: "stat:tackling",
          useStandardModifiers: false,
          useProgressiveBonus: false,
          modifierCap: 2,
          equalRollOutcome: "interception",
        },
      },
    },
  });
  assert.deepEqual(plan.interceptionRules, {
    defenderRollStatId: "stat:tackling",
    useStandardModifiers: false,
    useProgressiveBonus: false,
    modifierCap: 2,
    equalRollOutcome: "interception",
  });
});

test("a goalkeeper physically blocks a pass route instead of becoming its direct recipient", () => {
  const passer = { id: "passer", team: "A", x: 3, y: 5, cardId: "pass-card" };
  const goalkeeper = { id: "gk", team: "B", x: 5, y: 5, cardId: "gk-card" };
  const cardById = {
    "pass-card": { passiveAttributes: [{ id: "stat:passing", name: "Passing", value: 12 }] },
    "gk-card": { position: "GK" },
  };
  const plan = buildPassPlan({
    passer,
    passerCard: cardById["pass-card"],
    pieces: [passer, goalkeeper],
    cardById,
    settings: { cols: 20, rows: 12 },
    target: { x: 9, y: 5 },
    cornerId: "top-left",
    rules: { pathMode: "corner-to-center" },
  });
  assert.equal(isGoalkeeperPiece(goalkeeper, cardById), true);
  assert.deepEqual(plan.directHit, { pieceId: "gk", team: "red", entryT: plan.directHit.entryT });
  assert.equal(plan.goalkeeperRouteBlocked, true);
  assert.deepEqual(plan.goalkeeperBlocker, { pieceId: "gk", team: "red", entryT: plan.directHit.entryT });
});
