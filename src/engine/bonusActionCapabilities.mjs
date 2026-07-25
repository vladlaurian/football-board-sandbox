import { CONTINUATION_STATUS, beginContinuationAction, completeContinuationAction, normalizeActionContinuation } from "../match/actionContinuation.mjs";

// Single Engine contract for the actions currently supported by Bonus Action.
// UI projects this state; it never opens a local substitute continuation.
export const BONUS_ACTION_IMPLEMENTED_TYPES = Object.freeze(["MOVE", "PASS", "THROUGH_BALL", "LOFTED_THROUGH_BALL"]);

const COMMAND_ACTION_TYPES = Object.freeze({
  BONUS_MOVE_STARTED: "MOVE",
  BONUS_MOVE_CANCELLED: "MOVE",
  BONUS_MOVE_COMMITTED: "MOVE",
  PASS_STARTED: "PASS",
  PASS_TARGET_SELECTED: "PASS",
  PASS_ROUTE_CONFIRMED: "PASS",
  PASS_INTERCEPTOR_SELECTED: "PASS",
  PASS_INTERCEPTION_ROLL_SUBMITTED: "PASS",
  PASS_INTERCEPTION_RESOLUTION_DUE: "PASS",
  PASS_CONSEQUENCE_DUE: "PASS",
  PASS_CANCELLED: "PASS",
  THROUGH_BALL_STARTED: "THROUGH_BALL",
  THROUGH_BALL_TARGET_SELECTED: "THROUGH_BALL",
  THROUGH_BALL_COMMITTED: "THROUGH_BALL",
  THROUGH_BALL_CANCELLED: "THROUGH_BALL",
  THROUGH_BALL_ROUTE_CANCELLED: "THROUGH_BALL",
  THROUGH_BALL_RECOVERER_SELECTED: "THROUGH_BALL",
  THROUGH_BALL_RECOVERY_CONFIRMED: "THROUGH_BALL",
  LOFTED_THROUGH_BALL_STARTED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_TARGET_SELECTED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_COMMITTED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_CANCELLED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_ROUTE_CANCELLED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_ROLL_SUBMITTED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_RESOLUTION_CONFIRMED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_RECOVERER_SELECTED: "LOFTED_THROUGH_BALL",
  LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED: "LOFTED_THROUGH_BALL",
});

export function isBonusActionCommand(commandType) {
  return Boolean(COMMAND_ACTION_TYPES[String(commandType || "")]);
}

// A gameplay-roll submission has no mechanic name by design.  Its authority
// during a Bonus Action therefore comes from the canonical active resolution,
// not from a second static list that must be amended for every future roll.
export function isPendingBonusActionRollSubmission(state, commandType) {
  if (String(commandType || "") !== "GAMEPLAY_ROLL_SUBMITTED") return false;
  const continuation = normalizeActionContinuation(state?.actionContinuation);
  const resolution = state?.actionResolution;
  return Boolean(
    continuation
      && continuation.kind === "bonus-card-action"
      && continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE
      && resolution?.pendingRoll
      && String(resolution.bonusContinuationId || "") === continuation.id
  );
}

export function bonusActionTypeForCommand(commandType) {
  return COMMAND_ACTION_TYPES[String(commandType || "")] || null;
}

export function beginImplementedBonusAction(state, { team, pieceId, type }) {
  const continuation = normalizeActionContinuation(state?.actionContinuation);
  if (!BONUS_ACTION_IMPLEMENTED_TYPES.includes(type)
    || !continuation
    || continuation.kind !== "bonus-card-action"
    || continuation.team !== team
    || continuation.status !== CONTINUATION_STATUS.READY) return null;
  return beginContinuationAction(continuation, { type, pieceId });
}

export function activeBonusActionFor(state, { team, pieceId, type, continuationId = null }) {
  const continuation = normalizeActionContinuation(state?.actionContinuation);
  if (!continuation
    || continuation.kind !== "bonus-card-action"
    || continuation.team !== team
    || continuation.status !== CONTINUATION_STATUS.ACTION_ACTIVE
    || continuation.actionType !== type
    || continuation.pieceId !== String(pieceId || "")
    || (continuationId && continuation.id !== String(continuationId))) return null;
  return continuation;
}

export function completeImplementedBonusAction(state, details) {
  const continuation = activeBonusActionFor(state, details);
  return continuation ? completeContinuationAction(continuation) : null;
}
