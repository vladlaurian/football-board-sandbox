import assert from "node:assert/strict";
import test from "node:test";
import { diagonalCostForDistance, getMovementGeometry, normalizeMovementState } from "./movementState.mjs";

test("movement state recovers diagonal distance and discards inactive entries", () => {
  assert.equal(diagonalCostForDistance(4), 6);
  assert.deepEqual(normalizeMovementState({
    "A-1": { axis: "diagonal-nw-se", spent: 6, threeTwoUsed: true },
    "A-2": {},
  }), {
    "A-1": { axis: "diagonal-nw-se", spent: 6, distance: 4, threeTwoUsed: true, movementEnded: false },
  });
});

test("movement geometry keeps straight, diagonal, and mixed costs distinct", () => {
  assert.deepEqual(getMovementGeometry({ x: 1, y: 1 }, { x: 5, y: 1 }), {
    kind: "straight", axis: "horizontal", distance: 4, cost: 4,
  });
  assert.deepEqual(getMovementGeometry({ x: 1, y: 1 }, { x: 5, y: 5 }), {
    kind: "diagonal", axis: "diagonal-nw-se", distance: 4, cost: 6,
  });
  assert.deepEqual(getMovementGeometry({ x: 1, y: 1 }, { x: 3, y: 4 }), {
    kind: "mixed", axis: null, distance: null, cost: null,
  });
});
