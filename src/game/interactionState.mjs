const PASS_SELECTION_STATUSES = new Set([
  "targeting",
  "route-selection",
  "awaiting-interceptor-choice",
  "awaiting-interception-roll",
]);

const BONUS_END_STATUSES = new Set([
  "ready",
  "action-active",
  "awaiting-end-bonus-action",
]);

function validPieceId(pieces, pieceId) {
  if (!pieceId) return null;
  const piece = (Array.isArray(pieces) ? pieces : []).find(item => item?.id === pieceId);
  return piece && !piece.inactive ? piece.id : null;
}

export function deriveInteractionState({
  pieces = [],
  actionResolution = null,
  actionContinuation = null,
  matchActionState = null,
  canControlResolution = false,
  canControlContinuation = false,
} = {}) {
  if (actionResolution?.kind === "pass" && PASS_SELECTION_STATUSES.has(actionResolution.status)) {
    const activePieceId = validPieceId(pieces, actionResolution.passerId);
    return {
      kind: "pass",
      activePieceId,
      controllingTeam: actionResolution.team || null,
      canControl: Boolean(canControlResolution),
      cursorMode: canControlResolution && actionResolution.status === "targeting" ? "pass-target" : null,
      canCancelPass: Boolean(canControlResolution && ["targeting", "route-selection"].includes(actionResolution.status)),
      canEndBonusAction: false,
    };
  }

  if (actionContinuation?.kind === "bonus-card-action") {
    const activePieceId = actionContinuation.status === "action-active"
      ? validPieceId(pieces, actionContinuation.pieceId)
      : null;
    return {
      kind: "bonus-card-action",
      activePieceId,
      controllingTeam: actionContinuation.team || null,
      canControl: Boolean(canControlContinuation),
      cursorMode: actionContinuation.status === "action-active" && actionContinuation.actionType === "MOVE" && canControlContinuation
        ? "bonus-move"
        : null,
      canCancelPass: false,
      canEndBonusAction: Boolean(canControlContinuation && BONUS_END_STATUSES.has(actionContinuation.status) && !actionResolution),
    };
  }

  const freeMode = matchActionState?.freeMode;
  if (freeMode?.active) {
    return {
      kind: "free-move",
      activePieceId: validPieceId(pieces, freeMode.pieceId),
      controllingTeam: freeMode.team || null,
      canControl: true,
      cursorMode: "free-move",
      canCancelPass: false,
      canEndBonusAction: false,
    };
  }

  return {
    kind: null,
    activePieceId: null,
    controllingTeam: null,
    canControl: false,
    cursorMode: null,
    canCancelPass: false,
    canEndBonusAction: false,
  };
}

