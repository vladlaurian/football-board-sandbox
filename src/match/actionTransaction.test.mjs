import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_TRANSACTION_UNDO_MODE,
  atomicTransactionForTransition,
  createActionTransaction,
  transactionForActionState,
} from "./actionTransaction.mjs";

test("explicit action transactions preserve their generic engine context", () => {
  const transaction = createActionTransaction({
    id: "bonus_1",
    actionType: "PASS",
    team: "blue",
    source: "natural-20-interception",
    undoMode: ACTION_TRANSACTION_UNDO_MODE.ATOMIC,
  });
  assert.deepEqual(transaction, {
    id: "bonus_1",
    actionType: "PASS",
    team: "blue",
    source: "natural-20-interception",
    undoMode: "atomic",
  });
});

test("legacy bonus continuations normalize to atomic transactions", () => {
  const transaction = transactionForActionState({ id: "legacy_bonus", kind: "bonus-card-action", team: "red" });
  assert.equal(transaction.id, "legacy_bonus");
  assert.equal(transaction.undoMode, ACTION_TRANSACTION_UNDO_MODE.ATOMIC);
});

test("a transition is atomic only when its group matches the explicit transaction", () => {
  const transaction = createActionTransaction({ id: "bonus_2", undoMode: "atomic" });
  const state = { actionContinuation: { transaction } };
  assert.equal(atomicTransactionForTransition("bonus_2", {}, state)?.id, "bonus_2");
  assert.equal(atomicTransactionForTransition("different_group", {}, state), null);
});
