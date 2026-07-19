export const ACTION_TRANSACTION_UNDO_MODE = Object.freeze({
  STEP: "step",
  ATOMIC: "atomic",
});

function validTeam(value) {
  return value === "blue" || value === "red" ? value : null;
}

export function normalizeActionTransaction(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const id = String(source.id || fallback.id || "").trim();
  if (!id) return null;
  const undoMode = source.undoMode === ACTION_TRANSACTION_UNDO_MODE.ATOMIC
    ? ACTION_TRANSACTION_UNDO_MODE.ATOMIC
    : ACTION_TRANSACTION_UNDO_MODE.STEP;
  return {
    id,
    actionType: String(source.actionType || fallback.actionType || "UNKNOWN"),
    team: validTeam(source.team) || validTeam(fallback.team),
    source: String(source.source || fallback.source || "gameplay"),
    undoMode,
  };
}

export function createActionTransaction({
  id,
  actionType = "UNKNOWN",
  team = null,
  source = "gameplay",
  undoMode = ACTION_TRANSACTION_UNDO_MODE.STEP,
} = {}) {
  const transactionId = String(id || `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  return normalizeActionTransaction({ id: transactionId, actionType, team, source, undoMode });
}

/**
 * Reads transaction context from any automated action state. The legacy
 * bonus continuation fallback keeps existing recordings readable, while new
 * actions should always store the explicit transaction object.
 */
export function transactionForActionState(value) {
  if (!value || typeof value !== "object") return null;
  const explicit = normalizeActionTransaction(value.transaction);
  if (explicit) return explicit;
  if (value.kind === "bonus-card-action" && value.id) {
    return normalizeActionTransaction({
      id: value.id,
      actionType: value.actionType || "BONUS_ACTION",
      team: value.team,
      source: value.source || "bonus-card-action",
      undoMode: ACTION_TRANSACTION_UNDO_MODE.ATOMIC,
    });
  }
  return null;
}

export function atomicTransactionForTransition(groupId, before, after) {
  const normalizedGroupId = String(groupId || "");
  if (!normalizedGroupId) return null;
  const candidates = [
    after?.actionResolution,
    after?.actionContinuation,
    before?.actionResolution,
    before?.actionContinuation,
  ];
  for (const candidate of candidates) {
    const transaction = transactionForActionState(candidate);
    if (
      transaction?.undoMode === ACTION_TRANSACTION_UNDO_MODE.ATOMIC
      && transaction.id === normalizedGroupId
    ) return transaction;
  }
  return null;
}
