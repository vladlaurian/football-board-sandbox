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
  AWAITING_END_BONUS_ACTION: "awaiting-end-bonus-action",
});

export const CONTINUATION_RESUME_TYPE = Object.freeze({
  ADVANCE_TURN: "advance-turn",
  RESUME_PHASE: "resume-phase",
});

function cleanOriginValue(value) {
  return String(value || "").trim();
}

function legacyOriginForSource(source, sourceEntryId = "") {
  if (source === "natural-20-interception") {
    return {
      actionType: "PASS",
      outcome: "INTERCEPTION",
      reason: "NATURAL_20",
      sourceEntryId,
      parentContinuationId: null,
    };
  }
  return {
    actionType: "",
    outcome: "",
    reason: "",
    sourceEntryId,
    parentContinuationId: null,
  };
}

export function normalizeBonusActionOrigin(value, { source = "", sourceEntryId = "" } = {}) {
  const legacy = legacyOriginForSource(source, cleanOriginValue(sourceEntryId));
  const raw = value && typeof value === "object" ? value : {};
  return {
    actionType: cleanOriginValue(raw.actionType || legacy.actionType),
    outcome: cleanOriginValue(raw.outcome || legacy.outcome),
    reason: cleanOriginValue(raw.reason || legacy.reason),
    sourceEntryId: cleanOriginValue(raw.sourceEntryId || legacy.sourceEntryId),
    parentContinuationId: cleanOriginValue(raw.parentContinuationId || legacy.parentContinuationId) || null,
  };
}

export function normalizeContinuationResumePolicy(value, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const type = Object.values(CONTINUATION_RESUME_TYPE).includes(source.type)
    ? source.type
    : CONTINUATION_RESUME_TYPE.ADVANCE_TURN;
  return {
    type,
    team: source.team === "blue" ? "blue" : source.team === "red"
      ? "red"
      : legacy.team === "blue" ? "blue" : legacy.team === "red" ? "red" : null,
    nextTurn: Math.max(1, Number(source.nextTurn ?? legacy.nextTurn) || 1),
    phase: ["attack", "defense", "complete"].includes(source.phase) ? source.phase : "attack",
  };
}

export function normalizeActionContinuation(value) {
  if (!value || typeof value !== "object") return null;
  const team = value.team === "blue" ? "blue" : value.team === "red" ? "red" : null;
  if (!team) return null;
  // v19.6 recordings used "awaiting-end-turn". Normalize that historical
  // value at the boundary; gameplay no longer contains an END TURN branch for
  // bonus actions.
  const rawStatus = value.status === "awaiting-end-turn"
    ? CONTINUATION_STATUS.AWAITING_END_BONUS_ACTION
    : value.status;
  const status = Object.values(CONTINUATION_STATUS).includes(rawStatus)
    ? rawStatus
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
    resumePolicy: normalizeContinuationResumePolicy(value.resumePolicy, {
      team,
      nextTurn: value.nextTurn,
    }),
    sourceEntryId: String(value.sourceEntryId || ""),
    origin: normalizeBonusActionOrigin(value.origin, {
      source: String(value.source || ""),
      sourceEntryId: String(value.sourceEntryId || ""),
    }),
    actionType: value.actionType ? String(value.actionType) : null,
    pieceId: value.pieceId ? String(value.pieceId) : null,
    transaction,
  };
}

export function createBonusCardActionContinuation({ id = "", team, nextTurn, resumePolicy = null, source = "natural-20-interception", sourceEntryId = "", origin = null } = {}) {
  const continuationId = String(id || `continuation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const normalizedOrigin = normalizeBonusActionOrigin(origin, { source, sourceEntryId });
  return normalizeActionContinuation({
    id: continuationId,
    kind: "bonus-card-action",
    source,
    team,
    status: CONTINUATION_STATUS.READY,
    resumePolicy: resumePolicy || {
      type: CONTINUATION_RESUME_TYPE.ADVANCE_TURN,
      team,
      nextTurn,
      phase: "attack",
    },
    sourceEntryId,
    origin: normalizedOrigin,
    transaction: createActionTransaction({
      id: continuationId,
      actionType: "BONUS_ACTION",
      team,
      source,
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
  return { ...current, status: CONTINUATION_STATUS.AWAITING_END_BONUS_ACTION };
}

export function endContinuationAction(continuation) {
  const current = normalizeActionContinuation(continuation);
  if (!current || ![
    CONTINUATION_STATUS.READY,
    CONTINUATION_STATUS.ACTION_ACTIVE,
    CONTINUATION_STATUS.AWAITING_END_BONUS_ACTION,
  ].includes(current.status)) return null;
  return {
    continuation: current,
    declined: current.status === CONTINUATION_STATUS.READY,
    endedWhileActive: current.status === CONTINUATION_STATUS.ACTION_ACTIVE,
    resumePolicy: normalizeContinuationResumePolicy(current.resumePolicy, { team: current.team }),
  };
}
