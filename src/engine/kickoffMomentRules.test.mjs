import assert from "node:assert/strict";
import test from "node:test";
import { isKickoffMoment } from "./kickoffMomentRules.mjs";

test("isKickoffMoment is true before the Match has started its first turn", () => {
  assert.equal(isKickoffMoment({ tracker: { gameStarted: false, currentTurn: 0 } }), true);
  assert.equal(isKickoffMoment({ tracker: { gameStarted: true, currentTurn: 0 } }), true);
});

test("isKickoffMoment is false during ordinary live play", () => {
  assert.equal(isKickoffMoment({ tracker: { gameStarted: true, currentTurn: 3 }, kickoffRestart: null }), false);
});

test("isKickoffMoment is true while a post-goal kickoffRestart is pending", () => {
  assert.equal(isKickoffMoment({ tracker: { gameStarted: true, currentTurn: 5 }, kickoffRestart: { team: "red", pieceId: "B-0" } }), true);
});
