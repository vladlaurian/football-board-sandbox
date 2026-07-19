import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUATION_STATUS,
  CONTINUATION_RESUME_TYPE,
  beginContinuationAction,
  completeContinuationAction,
  endContinuationAction,
  normalizeActionContinuation,
} from "./actionContinuation.mjs";
import { ACTION_TRANSACTION_UNDO_MODE } from "./actionTransaction.mjs";

test("continuation permits exactly one action before explicit bonus completion", () => {
  const ready = normalizeActionContinuation({ id: "bonus_1", team: "blue", nextTurn: 4 });
  const active = beginContinuationAction(ready, { type: "MOVE", pieceId: "A-1" });
  assert.equal(active.status, CONTINUATION_STATUS.ACTION_ACTIVE);
  assert.equal(active.transaction.id, "bonus_1");
  assert.equal(active.transaction.actionType, "MOVE");
  assert.equal(active.transaction.undoMode, ACTION_TRANSACTION_UNDO_MODE.ATOMIC);
  assert.equal(beginContinuationAction(active, { type: "SHOT", pieceId: "A-2" }), null);
  const complete = completeContinuationAction(active);
  assert.equal(complete.status, CONTINUATION_STATUS.AWAITING_END_BONUS_ACTION);
  const ended = endContinuationAction(complete);
  assert.equal(ended.resumePolicy.type, CONTINUATION_RESUME_TYPE.ADVANCE_TURN);
  assert.equal(ended.resumePolicy.team, "blue");
  assert.equal(ended.resumePolicy.nextTurn, 4);
});

test("legacy end-turn continuations migrate without retaining old gameplay branching", () => {
  const continuation = normalizeActionContinuation({
    id: "legacy_bonus",
    team: "red",
    status: "awaiting-end-turn",
    nextTurn: 7,
  });
  assert.equal(continuation.status, CONTINUATION_STATUS.AWAITING_END_BONUS_ACTION);
  assert.deepEqual(continuation.resumePolicy, {
    type: CONTINUATION_RESUME_TYPE.ADVANCE_TURN,
    team: "red",
    nextTurn: 7,
    phase: "attack",
  });
});


test("a ready bonus action can be explicitly declined before any card action starts", () => {
  const ready = normalizeActionContinuation({ id: "bonus_decline", team: "red", nextTurn: 5 });
  const ended = endContinuationAction(ready);
  assert.equal(ended.declined, true);
  assert.equal(ended.continuation.status, CONTINUATION_STATUS.READY);
  assert.equal(ended.resumePolicy.type, CONTINUATION_RESUME_TYPE.ADVANCE_TURN);
  assert.equal(ended.resumePolicy.team, "red");
  assert.equal(ended.resumePolicy.nextTurn, 5);
});

test("an active bonus action cannot be ended until its action resolves", () => {
  const ready = normalizeActionContinuation({ id: "bonus_active", team: "blue", nextTurn: 3 });
  const active = beginContinuationAction(ready, { type: "PASS", pieceId: "A-1" });
  assert.equal(endContinuationAction(active), null);
  const complete = completeContinuationAction(active);
  assert.equal(endContinuationAction(complete).declined, false);
});
