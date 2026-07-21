export const GAMEPLAY_COMMAND_TYPE = Object.freeze({
  ACTION_START: "ACTION_START",
  ACTION_STEP: "ACTION_STEP",
  ACTION_CANCEL: "ACTION_CANCEL",
  ACTION_END: "ACTION_END",
  TOOL_START: "TOOL_START",
  TOOL_STEP: "TOOL_STEP",
  TOOL_END: "TOOL_END",
});

export const GAMEPLAY_ACTION_TYPE = Object.freeze({
  MOVE: "MOVE",
  GROUP_MOVE: "GROUP_MOVE",
  BONUS_MOVE: "BONUS_MOVE",
  THREE_TWO: "THREE_TWO",
  FREE_MOVE: "FREE_MOVE",
  FREE_BALL: "FREE_BALL",
  PASS: "PASS",
});

export function createGameplayCommand({
  requestId,
  commandType,
  actionType,
  actorPieceId = null,
  team = null,
  baseRevision = 0,
  actionId = null,
  continuationId = null,
  requestedByUid = "",
  requestedByClient = "",
  payload = {},
} = {}) {
  return {
    requestId: String(requestId || ""),
    commandType: String(commandType || ""),
    actionType: String(actionType || ""),
    actorPieceId: actorPieceId == null ? null : String(actorPieceId),
    team: team == null ? null : String(team),
    baseRevision: Math.max(0, Number(baseRevision) || 0),
    actionId: actionId == null ? null : String(actionId),
    continuationId: continuationId == null ? null : String(continuationId),
    requestedByUid: String(requestedByUid || ""),
    requestedByClient: String(requestedByClient || ""),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
  };
}

export function validateGameplayCommandEnvelope(command, {
  canonicalRevision = 0,
  teamOwners = {},
  piece = null,
} = {}) {
  if (!command?.requestId) return { valid: false, reason: "missing-request-id" };
  if (!Object.values(GAMEPLAY_COMMAND_TYPE).includes(command.commandType)) return { valid: false, reason: "invalid-command-type" };
  if (!Object.values(GAMEPLAY_ACTION_TYPE).includes(command.actionType)) return { valid: false, reason: "invalid-action-type" };
  if (Number(command.baseRevision) !== Math.max(0, Number(canonicalRevision) || 0)) return { valid: false, reason: "stale-revision" };
  if (!piece || String(piece.id) !== String(command.actorPieceId || "")) return { valid: false, reason: "missing-piece" };
  if (!command.team || String(teamOwners?.[command.team] || "") !== String(command.requestedByUid || "")) return { valid: false, reason: "unauthorized-owner" };
  return { valid: true, reason: null };
}

export function movementCommandMode(command) {
  if (command?.actionType === GAMEPLAY_ACTION_TYPE.BONUS_MOVE) return "bonus";
  if (command?.actionType === GAMEPLAY_ACTION_TYPE.GROUP_MOVE) return "group";
  if (command?.actionType === GAMEPLAY_ACTION_TYPE.FREE_MOVE) return "free";
  if (command?.actionType === GAMEPLAY_ACTION_TYPE.THREE_TWO) return "three-two";
  return "normal";
}
