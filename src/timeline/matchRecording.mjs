import { cloneGameState } from "../game/gameState.mjs";
import { normalizeTimeline, timelineStateAt } from "./timelineEngine.mjs";

export const MATCH_RECORDING_TYPE = "football-board-match-recording";
export const MATCH_RECORDING_SCHEMA_VERSION = 1;

export function createMatchRecording(timeline, metadata = {}) {
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
  return {
    ...raw,
    timeline: normalizeTimeline(raw.timeline, raw.finalState || {}),
    cardSnapshot: cloneGameState(raw.cardSnapshot || []),
  };
}
