import { cloneGameState, createGameState, gameStatesEqual } from "../game/gameState.mjs";

export const TIMELINE_SCHEMA_VERSION = 1;
export const DEFAULT_TIMELINE_LIMIT = Number.POSITIVE_INFINITY;

function makeId(prefix = "timeline") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${random}`;
}

function normalizeEntryMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

export function createTimeline(initialState, metadata = {}) {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    recordingId: String(metadata.recordingId || makeId("match")),
    parentRecordingId: metadata.parentRecordingId ? String(metadata.parentRecordingId) : null,
    forkedAtEntryId: metadata.forkedAtEntryId ? String(metadata.forkedAtEntryId) : null,
    startedAt: metadata.startedAt || new Date().toISOString(),
    endedAt: metadata.endedAt || null,
    initialState: createGameState(initialState),
    entries: [],
    cursor: 0,
    revision: 0,
  };
}

export function normalizeTimeline(raw, fallbackState) {
  if (!raw || typeof raw !== "object") return createTimeline(fallbackState || {});
  const entries = Array.isArray(raw.entries) ? raw.entries.map((entry, index) => ({
    id: String(entry?.id || `entry_${index}`),
    sequence: index + 1,
    type: String(entry?.type || "UNKNOWN"),
    label: String(entry?.label || entry?.type || "Action"),
    actorId: entry?.actorId ? String(entry.actorId) : "",
    team: entry?.team === "blue" || entry?.team === "red" ? entry.team : null,
    groupId: entry?.groupId ? String(entry.groupId) : null,
    metadata: normalizeEntryMetadata(entry?.metadata),
    createdAt: entry?.createdAt || new Date().toISOString(),
    before: createGameState(entry?.before || fallbackState || {}),
    after: createGameState(entry?.after || entry?.before || fallbackState || {}),
  })) : [];
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    recordingId: String(raw.recordingId || makeId("match")),
    parentRecordingId: raw.parentRecordingId ? String(raw.parentRecordingId) : null,
    forkedAtEntryId: raw.forkedAtEntryId ? String(raw.forkedAtEntryId) : null,
    startedAt: raw.startedAt || new Date().toISOString(),
    endedAt: raw.endedAt || null,
    initialState: createGameState(raw.initialState || fallbackState || {}),
    entries,
    cursor: Math.max(0, Math.min(entries.length, Number(raw.cursor) || 0)),
    revision: Math.max(0, Number(raw.revision) || 0),
  };
}

export function commitTimelineEntry(timeline, transition, options = {}) {
  const current = normalizeTimeline(timeline, transition?.before);
  const before = createGameState(transition?.before);
  const after = createGameState(transition?.after);
  if (gameStatesEqual(before, after) && !options.allowNoop) return current;

  const activeEntries = current.entries.slice(0, current.cursor);
  const entry = {
    id: String(transition?.id || makeId("entry")),
    sequence: activeEntries.length + 1,
    type: String(transition?.type || "UNKNOWN"),
    label: String(transition?.label || transition?.type || "Action"),
    actorId: transition?.actorId ? String(transition.actorId) : "",
    team: transition?.team === "blue" || transition?.team === "red" ? transition.team : null,
    groupId: transition?.groupId ? String(transition.groupId) : null,
    metadata: normalizeEntryMetadata(transition?.metadata),
    createdAt: transition?.createdAt || new Date().toISOString(),
    before,
    after,
  };
  const limit = Math.max(1, Number(options.limit) || DEFAULT_TIMELINE_LIMIT);
  let entries = [...activeEntries, entry];
  let initialState = current.initialState;
  if (entries.length > limit) {
    const removeCount = entries.length - limit;
    initialState = cloneGameState(entries[removeCount - 1].after);
    entries = entries.slice(removeCount).map((item, index) => ({ ...item, sequence: index + 1 }));
  }
  return {
    ...current,
    initialState,
    entries,
    cursor: entries.length,
    revision: current.revision + 1,
    endedAt: null,
  };
}

export function timelineStateAt(timeline, cursor = timeline?.cursor) {
  const current = normalizeTimeline(timeline, {});
  const safeCursor = Math.max(0, Math.min(current.entries.length, Number(cursor) || 0));
  if (safeCursor === 0) return cloneGameState(current.initialState);
  return cloneGameState(current.entries[safeCursor - 1].after);
}

export function undoTimeline(timeline) {
  const current = normalizeTimeline(timeline, {});
  if (current.cursor <= 0) return { timeline: current, state: null, entry: null };
  const entry = current.entries[current.cursor - 1];
  const nextTimeline = { ...current, cursor: current.cursor - 1, revision: current.revision + 1 };
  return { timeline: nextTimeline, state: cloneGameState(entry.before), entry };
}

export function redoTimeline(timeline) {
  const current = normalizeTimeline(timeline, {});
  if (current.cursor >= current.entries.length) return { timeline: current, state: null, entry: null };
  const entry = current.entries[current.cursor];
  const nextTimeline = { ...current, cursor: current.cursor + 1, revision: current.revision + 1 };
  return { timeline: nextTimeline, state: cloneGameState(entry.after), entry };
}

export function atomicTimelineTransactionId(entry) {
  // Resolution transactions join a manual die roll with the automatic
  // consequence it deterministically produces. They deliberately do not use
  // groupId: the result may belong to a different gameplay group than the
  // die, but Undo/Redo must never stop between the two.
  const resolutionTransaction = entry?.metadata?.undoTransaction;
  if (resolutionTransaction?.undoMode === "atomic") {
    const resolutionTransactionId = String(resolutionTransaction.id || "").trim();
    if (resolutionTransactionId) return resolutionTransactionId;
  }
  const transaction = entry?.metadata?.actionTransaction;
  if (!transaction || transaction.undoMode !== "atomic") return null;
  const transactionId = String(transaction.id || "").trim();
  if (!transactionId || String(entry?.groupId || "") !== transactionId) return null;
  return transactionId;
}

export function undoAtomicTimelineTransaction(timeline) {
  const current = normalizeTimeline(timeline, {});
  if (current.cursor <= 0) return { timeline: current, state: null, entries: [] };
  const lastEntry = current.entries[current.cursor - 1];
  const transactionId = atomicTimelineTransactionId(lastEntry);
  if (!transactionId) {
    const result = undoTimeline(current);
    return { timeline: result.timeline, state: result.state, entries: result.entry ? [result.entry] : [] };
  }
  let nextCursor = current.cursor - 1;
  while (nextCursor > 0 && atomicTimelineTransactionId(current.entries[nextCursor - 1]) === transactionId) nextCursor -= 1;
  const entries = current.entries.slice(nextCursor, current.cursor);
  return {
    timeline: { ...current, cursor: nextCursor, revision: current.revision + 1 },
    state: timelineStateAt(current, nextCursor),
    entries,
  };
}

export function redoAtomicTimelineTransaction(timeline) {
  const current = normalizeTimeline(timeline, {});
  if (current.cursor >= current.entries.length) return { timeline: current, state: null, entries: [] };
  const firstEntry = current.entries[current.cursor];
  const transactionId = atomicTimelineTransactionId(firstEntry);
  if (!transactionId) {
    const result = redoTimeline(current);
    return { timeline: result.timeline, state: result.state, entries: result.entry ? [result.entry] : [] };
  }
  let nextCursor = current.cursor + 1;
  while (nextCursor < current.entries.length && atomicTimelineTransactionId(current.entries[nextCursor]) === transactionId) nextCursor += 1;
  const entries = current.entries.slice(current.cursor, nextCursor);
  return {
    timeline: { ...current, cursor: nextCursor, revision: current.revision + 1 },
    state: timelineStateAt(current, nextCursor),
    entries,
  };
}

export function moveTimelineCursor(timeline, cursor) {
  const current = normalizeTimeline(timeline, {});
  const safeCursor = Math.max(0, Math.min(current.entries.length, Number(cursor) || 0));
  return {
    timeline: { ...current, cursor: safeCursor, revision: current.revision + 1 },
    state: timelineStateAt(current, safeCursor),
  };
}

export function closeTimeline(timeline, endedAt = new Date().toISOString()) {
  return { ...normalizeTimeline(timeline, {}), endedAt };
}

export function forkTimeline(timeline, cursor = timeline?.cursor) {
  const source = normalizeTimeline(timeline, {});
  const safeCursor = Math.max(0, Math.min(source.entries.length, Number(cursor) || 0));
  const forkState = timelineStateAt(source, safeCursor);
  const forkedAtEntryId = safeCursor > 0 ? source.entries[safeCursor - 1]?.id || null : null;
  return createTimeline(forkState, {
    parentRecordingId: source.recordingId,
    forkedAtEntryId,
  });
}
