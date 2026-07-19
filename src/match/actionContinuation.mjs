import {
  ACTION_TRANSACTION_UNDO_MODE,
  createActionTransaction,
  normalizeActionTransaction,
} from "./actionTransaction.mjs";

// A continuation is a small, explicit game-flow state that survives after an
// automated action resolves. It is intentionally separate from
// `actionResolution`: a pass can finish, while the consequence (for example a
// Natural 20 bonus action) remains available to the player and to Timeline.

export const CONTINUATION_STATUS = Object.freeze({
  READY: "ready",
  ACTION_ACTIVE: "action-active",
  AWAITING_END_TURN: "awaiting-end-turn",
});

export function normalizeActionContinuation(value) {
  if (!value || typeof value !== "object") return null;
  const team = value.team === "blue" ? "blue" : value.team === "red" ? "red" : null;
  if (!team) return null;
  const status = Object.values(CONTINUATION_STATUS).includes(value.status)
    ? value.status
    : CONTINUATION_STATUS.READY;
  const id = String(value.id || "");
  if (!id) return null;
  const transaction = normalizeActionTransaction(value.transaction) || createActionTransaction({
    id,
    actionType: value.actionType || "BONUS_ACTION",
    team,
    source: value.source || "bonus-card-action",
    undoMode: ACTION_TRANSACTION_UNDO_MODE.ATOMIC,
  });
  return {
    id,
    kind: String(value.kind || "bonus-card-action"),
    source: String(value.source || ""),
    team,
    status,
    nextTurn: Math.max(1, Number(value.nextTurn) || 1),
    sourceEntryId: String(value.sourceEntryId || ""),
    actionType: value.actionType ? String(value.actionType) : null,
    pieceId: value.pieceId ? String(value.pieceId) : null,
    transaction,
  };
}

export function createBonusCardActionContinuation({ team, nextTurn, sourceEntryId = "" } = {}) {
  const id = `continuation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return normalizeActionContinuation({
    id,
    kind: "bonus-card-action",
    source: "natural-20-interception",
    team,
    status: CONTINUATION_STATUS.READY,
    nextTurn,
    sourceEntryId,
    transaction: createActionTransaction({
      id,
      actionType: "BONUS_ACTION",
      team,
      source: "natural-20-interception",
      undoMode: ACTION_TRANSACTION_UNDO_MODE.ATOMIC,
    }),
  });
}

export function beginContinuationAction(continuation, { type, pieceId } = {}) {
  const current = normalizeActionContinuation(continuation);
  if (!current || current.status !== CONTINUATION_STATUS.READY || !type || !pieceId) return null;
  return {
    ...current,
    status: CONTINUATION_STATUS.ACTION_ACTIVE,
    actionType: String(type),
    pieceId: String(pieceId),
    transaction: { ...current.transaction, actionType: String(type) },
  };
}

export function completeContinuationAction(continuation) {
  const current = normalizeActionContinuation(continuation);
  if (!current || current.status !== CONTINUATION_STATUS.ACTION_ACTIVE) return null;
  return { ...current, status: CONTINUATION_STATUS.AWAITING_END_TURN };
}
