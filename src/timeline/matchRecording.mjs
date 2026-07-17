import { cloneGameState } from "../game/gameState.mjs";
import { normalizeTimeline, timelineStateAt } from "./timelineEngine.mjs";

export const MATCH_RECORDING_TYPE = "football-board-match-recording";
export const MATCH_RECORDING_SCHEMA_VERSION = 1;
export const MATCH_RECORDING_MAX_ENTRIES = 20000;
export const MATCH_RECORDING_MAX_CARDS = 2000;

function cardIdsFromState(state) {
  return (Array.isArray(state?.pieces) ? state.pieces : [])
    .map(piece => String(piece?.cardId || "").trim())
    .filter(Boolean);
}

export function referencedCardIdsForTimeline(timeline) {
  const normalized = normalizeTimeline(timeline, {});
  const ids = new Set(cardIdsFromState(normalized.initialState));
  normalized.entries.forEach(entry => {
    cardIdsFromState(entry.before).forEach(id => ids.add(id));
    cardIdsFromState(entry.after).forEach(id => ids.add(id));
  });
  return [...ids];
}

export function selectRecordingCards(timeline, availableCards = []) {
  const referencedIds = new Set(referencedCardIdsForTimeline(timeline));
  return cloneGameState((Array.isArray(availableCards) ? availableCards : [])
    .filter(card => referencedIds.has(String(card?.id || ""))));
}

export function createMatchRecording(timeline, metadata = {}) {
  if (!timeline || typeof timeline !== "object" || !Array.isArray(timeline.entries)) {
    throw new Error("Match timeline is missing or invalid");
  }
  const normalized = normalizeTimeline(timeline, {});
  return {
    recordingType: MATCH_RECORDING_TYPE,
    schemaVersion: MATCH_RECORDING_SCHEMA_VERSION,
    appVersion: String(metadata.appVersion || ""),
    name: String(metadata.name || `Match ${normalized.startedAt}`),
    exportedAt: metadata.exportedAt || new Date().toISOString(),
    cardSnapshot: cloneGameState(metadata.cardSnapshot || []),
    timeline: normalized,
    finalState: timelineStateAt(normalized, normalized.cursor),
  };
}

export function readMatchRecording(raw) {
  if (!raw || raw.recordingType !== MATCH_RECORDING_TYPE) {
    throw new Error("Unsupported match recording");
  }
  if (Number(raw.schemaVersion) !== MATCH_RECORDING_SCHEMA_VERSION) {
    throw new Error("Unsupported match recording version");
  }
  if (!raw.timeline || typeof raw.timeline !== "object" || !Array.isArray(raw.timeline.entries)) {
    throw new Error("Match recording timeline is missing or invalid");
  }
  if (raw.timeline.entries.length > MATCH_RECORDING_MAX_ENTRIES) {
    throw new Error("Match recording contains too many timeline entries");
  }
  if (raw.cardSnapshot !== undefined && !Array.isArray(raw.cardSnapshot)) {
    throw new Error("Match recording card snapshot is invalid");
  }
  if (raw.cardSnapshot?.length > MATCH_RECORDING_MAX_CARDS) {
    throw new Error("Match recording contains too many cards");
  }
  return {
    ...raw,
    timeline: normalizeTimeline(raw.timeline, raw.finalState || {}),
    cardSnapshot: cloneGameState(raw.cardSnapshot || []),
  };
}
