export const GAME_COMMAND_TYPE = Object.freeze({
  FREE_BALL_MOVED: "FREE_BALL_MOVED",
  NORMAL_MOVE_STARTED: "NORMAL_MOVE_STARTED",
  NORMAL_MOVE_CANCELLED: "NORMAL_MOVE_CANCELLED",
  NORMAL_MOVE_COMMITTED: "NORMAL_MOVE_COMMITTED",
  BONUS_MOVE_STARTED: "BONUS_MOVE_STARTED",
  BONUS_MOVE_CANCELLED: "BONUS_MOVE_CANCELLED",
  BONUS_MOVE_COMMITTED: "BONUS_MOVE_COMMITTED",
  BONUS_ACTION_ENDED: "BONUS_ACTION_ENDED",
  TRACKER_PHASE_ENDED: "TRACKER_PHASE_ENDED",
  THREE_TWO_MOVE_COMMITTED: "THREE_TWO_MOVE_COMMITTED",
  FREE_MOVE_STARTED: "FREE_MOVE_STARTED",
  FREE_MOVE_COMMITTED: "FREE_MOVE_COMMITTED",
  FREE_MOVE_ENDED: "FREE_MOVE_ENDED",
  GROUP_MOVE_ZONE_CONFIRMED: "GROUP_MOVE_ZONE_CONFIRMED",
  GROUP_MOVE_PLAYER_COMMITTED: "GROUP_MOVE_PLAYER_COMMITTED",
});

function clonePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function normalizeGameCommand(raw = {}) {
  return {
    id: String(raw?.id || "").trim(),
    type: String(raw?.type || "").trim(),
    payload: clonePayload(raw?.payload),
  };
}

export function gameCommandValidationReason(command) {
  if (!command?.id) return "COMMAND_ID_REQUIRED";
  if (!command?.type) return "COMMAND_TYPE_REQUIRED";
  return null;
}
