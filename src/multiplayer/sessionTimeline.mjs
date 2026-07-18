import { normalizeTimeline } from "../timeline/timelineEngine.mjs";

export function createSharedTimelineMeta(timeline, clientId = "", fallbackState = {}) {
  const normalized = normalizeTimeline(timeline, fallbackState);
  return {
    schemaVersion: normalized.schemaVersion,
    recordingId: normalized.recordingId,
    parentRecordingId: normalized.parentRecordingId,
    forkedAtEntryId: normalized.forkedAtEntryId,
    startedAt: normalized.startedAt,
    endedAt: normalized.endedAt,
    initialState: normalized.initialState,
    cursor: normalized.cursor,
    revision: normalized.revision,
    entryCount: normalized.entries.length,
    updatedBy: String(clientId || ""),
  };
}

export function hydrateSessionTimeline(meta, rawEntries, fallbackState = {}) {
  if (!meta?.recordingId) return null;
  const entryCount = Math.max(0, Number(meta.entryCount) || 0);
  const entries = (Array.isArray(rawEntries) ? rawEntries : [])
    .filter(entry => entry.recordingId === meta.recordingId && entry.sequence <= entryCount)
    .sort((left, right) => left.sequence - right.sequence)
    .map(item => item.entry);
  if (entries.length < entryCount) return null;
  return normalizeTimeline({ ...meta, entries }, meta.initialState || fallbackState);
}

export function lastAppliedDiceEntryId(timeline, team) {
  const normalized = normalizeTimeline(timeline, {});
  const applied = normalized.entries.slice(0, normalized.cursor);
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const entry = applied[index];
    if (entry.type === "DICE_ROLLED" && entry.team === team) return entry.id;
  }
  return null;
}

export function timelineDiceRollId(timeline, team) {
  const normalized = normalizeTimeline(timeline, {});
  const entryId = lastAppliedDiceEntryId(normalized, team);
  return entryId ? `timeline_${normalized.recordingId}_${entryId}` : "";
}

export function nullableFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function shouldApplyIncomingTimeline(localTimeline, incomingTimeline, pendingSyncCount = 0) {
  if (!incomingTimeline) return false;
  if (!localTimeline) return true;
  const local = normalizeTimeline(localTimeline, {});
  const incoming = normalizeTimeline(incomingTimeline, {});
  if (local.recordingId !== incoming.recordingId) return pendingSyncCount <= 0;
  return incoming.revision > local.revision;
}

// A matching revision is an acknowledgement of the same canonical timeline.
// It must be allowed to restore the rendered game state after an out-of-order
// board projection arrived while this client was committing its own action.
export function shouldRestoreTimelineState(localTimeline, incomingTimeline, pendingSyncCount = 0) {
  if (shouldApplyIncomingTimeline(localTimeline, incomingTimeline, pendingSyncCount)) return true;
  if (!localTimeline || !incomingTimeline) return false;
  const local = normalizeTimeline(localTimeline, {});
  const incoming = normalizeTimeline(incomingTimeline, {});
  return local.recordingId === incoming.recordingId && incoming.revision === local.revision;
}

// In Match Mode, the Timeline is authoritative. The session board document is
// a projection for persistence and Editor Mode, not a second state authority.
export function shouldApplySessionBoardProjection({ isOwnUpdate = false, timelineActive = false } = {}) {
  return !isOwnUpdate && !timelineActive;
}
