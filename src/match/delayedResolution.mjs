export const DELAYED_RESOLUTION_SCHEMA_VERSION = 2;

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createDelayedResolution({
  kind,
  actionId,
  team = null,
  value = null,
  delayMs = 0,
  createdAt = Date.now(),
  payload = {},
} = {}) {
  const safeKind = String(kind || "").trim();
  const safeActionId = String(actionId || "").trim();
  if (!safeKind || !safeActionId) return null;
  const safeCreatedAt = Number.isFinite(Number(createdAt)) ? Number(createdAt) : Date.now();
  const safeDelay = Math.max(0, Number(delayMs) || 0);
  return {
    schemaVersion: DELAYED_RESOLUTION_SCHEMA_VERSION,
    kind: safeKind,
    actionId: safeActionId,
    team: team === "blue" || team === "red" ? team : null,
    value: Number.isFinite(Number(value)) ? Number(value) : null,
    createdAt: safeCreatedAt,
    resolveAt: safeCreatedAt + safeDelay,
    payload: { ...safeObject(payload) },
  };
}

export function delayedResolutionAtCursor(timeline, actionResolution) {
  const cursor = Math.max(0, Number(timeline?.cursor) || 0);
  if (!cursor || !Array.isArray(timeline?.entries)) return null;
  const entry = timeline.entries[cursor - 1];
  const request = safeObject(entry?.metadata?.delayedResolution);
  const actionId = String(request.actionId || "").trim();
  if (entry?.type !== "DICE_ROLLED" || !actionId) return null;
  if (String(actionResolution?.id || "") !== actionId) return null;
  return {
    ...request,
    entryId: String(entry.id || ""),
  };
}

export function delayedResolutionRemaining(request, now = Date.now()) {
  const resolveAt = Number(request?.resolveAt);
  if (!Number.isFinite(resolveAt)) return 0;
  return Math.max(0, resolveAt - (Number(now) || 0));
}


export function shouldScheduleCanonicalDelayedResolution({
  sessionActive = false,
  isHost = false,
  replayMode = false,
  sessionEnding = false,
  timeline = null,
  request = null,
} = {}) {
  if (!sessionActive || !isHost || replayMode || sessionEnding || !request) return false;
  const cursor = Math.max(0, Number(timeline?.cursor) || 0);
  const entryCount = Array.isArray(timeline?.entries) ? timeline.entries.length : 0;
  return cursor === entryCount;
}
