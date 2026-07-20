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
export function canonicalDelayedResolutionContext(timeline) {
  const cursor = Math.max(0, Number(timeline?.cursor) || 0);
  const entries = Array.isArray(timeline?.entries) ? timeline.entries : [];
  if (!cursor || cursor !== entries.length) return null;
  const entry = entries[cursor - 1];
  const state = entry?.after && typeof entry.after === "object" ? entry.after : null;
  const actionResolution = state?.actionResolution || null;
  const request = delayedResolutionAtCursor(timeline, actionResolution);
  if (!request) return null;
  return { request, actionResolution, state };
}


export function diagnoseCanonicalDelayedResolution(timeline, expectedEntryId = "") {
  const cursor = Math.max(0, Number(timeline?.cursor) || 0);
  const entries = Array.isArray(timeline?.entries) ? timeline.entries : [];
  const expected = String(expectedEntryId || "");
  const cursorEntry = cursor > 0 ? entries[cursor - 1] : null;
  const state = cursorEntry?.after && typeof cursorEntry.after === "object" ? cursorEntry.after : null;
  const actionResolution = state?.actionResolution || null;
  const delayed = safeObject(cursorEntry?.metadata?.delayedResolution);
  const delayedActionId = String(delayed.actionId || "");
  const actionResolutionId = String(actionResolution?.id || "");
  const canonical = canonicalDelayedResolutionContext(timeline);

  let reason = "canonical-context-found";
  if (!cursor) reason = "cursor-is-zero";
  else if (cursor !== entries.length) reason = "cursor-not-at-live-edge";
  else if (!cursorEntry) reason = "cursor-entry-missing";
  else if (cursorEntry.type !== "DICE_ROLLED") reason = "cursor-entry-is-not-dice-roll";
  else if (!state) reason = "cursor-entry-after-state-missing";
  else if (!actionResolution) reason = "action-resolution-missing-from-after-state";
  else if (!delayedActionId) reason = "delayed-resolution-metadata-missing";
  else if (!actionResolutionId) reason = "action-resolution-id-missing";
  else if (delayedActionId !== actionResolutionId) reason = "action-id-mismatch";
  else if (expected && String(cursorEntry.id || "") !== expected) reason = "expected-entry-is-not-cursor-entry";
  else if (!canonical) reason = "canonical-context-unavailable";

  const delayedEntries = entries
    .map((entry, index) => {
      const request = safeObject(entry?.metadata?.delayedResolution);
      if (entry?.type !== "DICE_ROLLED" && !request.actionId) return null;
      return {
        index,
        applied: index < cursor,
        id: String(entry?.id || ""),
        type: String(entry?.type || ""),
        actionId: String(request.actionId || ""),
        requestId: String(request?.payload?.rollEvent?.requestId || request?.payload?.requestId || ""),
        traceId: String(request?.payload?.traceId || request?.payload?.rollEvent?.traceId || ""),
        afterActionResolutionId: String(entry?.after?.actionResolution?.id || ""),
        afterActionStatus: String(entry?.after?.actionResolution?.status || ""),
      };
    })
    .filter(Boolean)
    .slice(-12);

  const expectedIndex = expected ? entries.findIndex(entry => String(entry?.id || "") === expected) : -1;
  const expectedEntry = expectedIndex >= 0 ? entries[expectedIndex] : null;

  return {
    reason,
    canonicalFound: Boolean(canonical),
    timelineRevision: Number(timeline?.revision) || 0,
    cursor,
    entryCount: entries.length,
    expectedEntryId: expected,
    expectedEntryIndex: expectedIndex,
    expectedEntryApplied: expectedIndex >= 0 ? expectedIndex < cursor : false,
    expectedEntryType: String(expectedEntry?.type || ""),
    cursorEntryId: String(cursorEntry?.id || ""),
    cursorEntryType: String(cursorEntry?.type || ""),
    cursorEntryActionId: delayedActionId,
    cursorEntryRequestId: String(delayed?.payload?.rollEvent?.requestId || delayed?.payload?.requestId || ""),
    cursorEntryTraceId: String(delayed?.payload?.traceId || delayed?.payload?.rollEvent?.traceId || ""),
    actionResolutionId,
    actionResolutionKind: String(actionResolution?.kind || ""),
    actionResolutionStatus: String(actionResolution?.status || ""),
    delayedEntries,
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
