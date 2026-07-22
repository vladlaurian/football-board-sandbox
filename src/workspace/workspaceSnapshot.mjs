export const WORKSPACE_SNAPSHOT_VERSION = 1;

/**
 * Serializable future-Match setup. It deliberately excludes all live Match
 * Runtime fields: Timeline, MatchContext, Tracker progress, dice results,
 * movement authorization, action resolution and Bonus continuations.
 */
export function createWorkspaceSnapshot({
  settings,
  pieces,
  formations,
  gameSituations,
  activeSituationId,
  activeSituationName,
  ruleSets,
  activeRuleSet,
  blueFormationId,
  redFormationId,
  dieType,
  cardState,
  trackerSettings,
  preferences = {},
} = {}) {
  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    settings,
    pieces,
    formations,
    gameSituations,
    activeSituationId,
    activeSituationName,
    ruleSets,
    activeRuleSetId: activeRuleSet?.id,
    activeRuleSet,
    blueFormationId,
    redFormationId,
    dieType,
    cardState,
    trackerSettings,
    preferences: {
      touchMode: Boolean(preferences.touchMode),
      showCoordinates: Boolean(preferences.showCoordinates),
      trackerVisible: Boolean(preferences.trackerVisible),
    },
  };
}

/**
 * Reads both the new explicit profile and legacy flat cloud/backup payloads.
 * Legacy Match fields are intentionally not copied into the Workspace result.
 */
export function readWorkspaceSnapshot(raw = {}) {
  const source = raw?.workspaceProfile && typeof raw.workspaceProfile === "object"
    ? raw.workspaceProfile
    : (raw || {});
  const legacyTracker = source.trackerState && typeof source.trackerState === "object"
    ? source.trackerState
    : {};
  const preferences = source.preferences && typeof source.preferences === "object"
    ? source.preferences
    : {};

  return {
    version: Number(source.version) || WORKSPACE_SNAPSHOT_VERSION,
    settings: source.settings,
    pieces: source.pieces,
    formations: source.formations,
    gameSituations: source.gameSituations,
    activeSituationId: source.activeSituationId,
    activeSituationName: source.activeSituationName,
    ruleSets: source.ruleSets,
    activeRuleSetId: source.activeRuleSetId,
    activeRuleSet: source.activeRuleSet,
    blueFormationId: source.blueFormationId,
    redFormationId: source.redFormationId,
    dieType: source.dieType,
    cardState: source.cardState,
    trackerSettings: source.trackerSettings || legacyTracker.settings,
    preferences: {
      touchMode: preferences.touchMode ?? source.touchMode,
      showCoordinates: preferences.showCoordinates ?? source.showCoordinates,
      trackerVisible: preferences.trackerVisible ?? legacyTracker.enabled,
    },
  };
}
