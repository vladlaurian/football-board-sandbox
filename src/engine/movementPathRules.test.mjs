import assert from "node:assert/strict";
import test from "node:test";
import { firstPlayerBlockingMovementPath, movementPathSquares } from "./movementPathRules.mjs";

test("movement paths enumerate horizontal, vertical, and diagonal squares", () => {
  assert.deepEqual(movementPathSquares({ x: 1, y: 1 }, { x: 4, y: 1 }), [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]);
  assert.deepEqual(movementPathSquares({ x: 2, y: 1 }, { x: 2, y: 4 }), [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }]);
  assert.deepEqual(movementPathSquares({ x: 1, y: 1 }, { x: 4, y: 4 }, { includeDestination: false }), [{ x: 2, y: 2 }, { x: 3, y: 3 }]);
});

test("movement paths block teammates and opponents but ignore the ball", () => {
  const common = { movingPieceId: "blue-1", from: { x: 1, y: 1 }, to: { x: 4, y: 1 } };
  const teammate = firstPlayerBlockingMovementPath({
    ...common,
    pieces: [{ id: "blue-1", team: "A", x: 1, y: 1 }, { id: "blue-2", team: "A", x: 2, y: 1 }],
  });
  assert.equal(teammate.piece.id, "blue-2");
  const opponent = firstPlayerBlockingMovementPath({
    ...common,
    pieces: [{ id: "blue-1", team: "A", x: 1, y: 1 }, { id: "red-1", team: "B", x: 3, y: 1 }],
  });
  assert.equal(opponent.piece.id, "red-1");
  assert.equal(firstPlayerBlockingMovementPath({
    ...common,
    pieces: [{ id: "blue-1", team: "A", x: 1, y: 1 }, { id: "ball", team: "BALL", x: 2, y: 1 }],
  }), null);
});
