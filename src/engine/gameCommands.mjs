export const GAME_COMMAND_TYPE = Object.freeze({
  FREE_BALL_MOVED: "FREE_BALL_MOVED",
  NORMAL_MOVE_STARTED: "NORMAL_MOVE_STARTED",
  NORMAL_MOVE_CANCELLED: "NORMAL_MOVE_CANCELLED",
  NORMAL_MOVE_COMMITTED: "NORMAL_MOVE_COMMITTED",
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
