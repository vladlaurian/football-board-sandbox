import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUATION_STATUS,
  beginContinuationAction,
  completeContinuationAction,
  normalizeActionContinuation,
} from "./actionContinuation.mjs";
import { ACTION_TRANSACTION_UNDO_MODE } from "./actionTransaction.mjs";

test("continuation permits exactly one action before end turn", () => {
  const ready = normalizeActionContinuation({ id: "bonus_1", team: "blue", nextTurn: 4 });
  const active = beginContinuationAction(ready, { type: "MOVE", pieceId: "A-1" });
  assert.equal(active.status, CONTINUATION_STATUS.ACTION_ACTIVE);
  assert.equal(active.transaction.id, "bonus_1");
  assert.equal(active.transaction.actionType, "MOVE");
  assert.equal(active.transaction.undoMode, ACTION_TRANSACTION_UNDO_MODE.ATOMIC);
  assert.equal(beginContinuationAction(active, { type: "SHOT", pieceId: "A-2" }), null);
  const complete = completeContinuationAction(active);
  assert.equal(complete.status, CONTINUATION_STATUS.AWAITING_END_TURN);
});
