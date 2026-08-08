import { normalizeRuleSet } from "../rules/ruleSets.mjs";
import { normalizeTrackerActionLog } from "../tracker/trackerState.mjs";
import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTeamModifierTokens } from "../engine/rollModifierOpportunities.mjs";

export const GAME_STATE_SCHEMA_VERSION = 3;

export function cloneGameState(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeScore(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return { blue: Math.max(0, Number(value.blue) || 0), red: Math.max(0, Number(value.red) || 0) };
}

// A confirmed tactic queued while the Match is not at a kickoff moment.
// Applied to the real board, then cleared, the next time either team's
// kickoff moment arrives (see kickoffMomentRules.mjs / applyGoalConsequence).
function normalizePendingFormation(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const normalizeId = id => (id === null || id === undefined || id === "" ? null : id);
  return { blue: normalizeId(value.blue), red: normalizeId(value.red) };
}

// Set whenever a tactic becomes active (confirmed or consumed at a
// kickoff) and its role recipe does not exactly match that team's
// assigned starter cards. Blocks that team's action buttons until a
// legal tactic is confirmed — see tacticLegalityRules.mjs.
function normalizeTacticBlock(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return { blue: Boolean(value.blue), red: Boolean(value.red) };
}

// Each team's remaining Marking opportunities for the current numbered
// turn (docs/MARKING_RULES.md section 2: at most 2 per team per turn,
// reset only when the numbered turn ends). See markingRules.mjs.
function normalizeMarkingOpportunities(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const clamp = input => Math.max(0, Math.min(2, Number.isFinite(Number(input)) ? Math.floor(Number(input)) : 2));
  return { blue: clamp(value.blue ?? 2), red: clamp(value.red ?? 2) };
}

export function createGameState(raw = {}) {
  const tracker = raw.tracker && typeof raw.tracker === "object" ? raw.tracker : {};
  const dice = raw.dice && typeof raw.dice === "object" ? raw.dice : {};
  return cloneGameState({
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    settings: raw.settings || {},
    pieces: Array.isArray(raw.pieces) ? raw.pieces : [],
    movementStateByPieceId: raw.movementStateByPieceId || {},
    gameMode: raw.gameMode === "match" ? "match" : "editor",
    ruleSet: normalizeRuleSet(raw.ruleSet),
    // This is deliberately timeline state, not a local modal. A pending
    // automated action must render identically for host, guest, undo/redo and
    // a loaded replay.
    actionResolution: raw.actionResolution && typeof raw.actionResolution === "object"
      ? raw.actionResolution
      : null,
    // A resolved automated action may leave a controlled follow-up before a
    // turn changes (such as a Natural 20 bonus card action). This belongs in
    // Timeline state for replay, Undo/Redo and multiplayer parity.
    actionContinuation: raw.actionContinuation && typeof raw.actionContinuation === "object"
      ? raw.actionContinuation
      : null,
    threeTwoOpportunity: raw.threeTwoOpportunity && typeof raw.threeTwoOpportunity === "object"
      ? raw.threeTwoOpportunity
      : raw.throughBallOpportunity && typeof raw.throughBallOpportunity === "object" ? raw.throughBallOpportunity : null,
    // v20.56.24 replaces the positive-only opportunity list with complete
    // team-owned tokens. Old recordings normalize at this one state boundary.
    teamModifierTokens: normalizeTeamModifierTokens(raw.teamModifierTokens ?? raw.rollModifierOpportunities),
    // Canonical Goal score, Kick-off's forced-restart gate, and the
    // goalkeeper-restart penalty-area exception. All three are Match-runtime-
    // only state, reset with the Tracker on every Match start/restart
    // (matchLifecycleRules.mjs).
    score: normalizeScore(raw.score),
    pendingFormation: normalizePendingFormation(raw.pendingFormation),
    // The formation currently on the real board for each team, by id. Set at
    // Match start and whenever a tactic lands (immediately or via a
    // consumed pendingFormation) — Adjust reads this to anchor its
    // per-piece placement range the same way Prep's pre-Match Adjust does.
    activeFormation: normalizePendingFormation(raw.activeFormation),
    tacticBlock: normalizeTacticBlock(raw.tacticBlock),
    kickoffRestart: raw.kickoffRestart && typeof raw.kickoffRestart === "object" ? raw.kickoffRestart : null,
    goalkeeperRestartException: raw.goalkeeperRestartException && typeof raw.goalkeeperRestartException === "object"
      ? raw.goalkeeperRestartException
      : null,
    // Active fixed-restart setup (Corner, Goal Kick and — once triggerable —
    // Free Kick/Throw-in): wall, alternating reposition and executor-selection
    // phases. Null when no restart setup is in progress. See
    // restartSetupRules.mjs.
    restartSetup: raw.restartSetup && typeof raw.restartSetup === "object" ? raw.restartSetup : null,
    // A pending Yes/No gate for a defense reposition that would extend the
    // wall's own line — see restartSetupRules.mjs (repositionRestartPiece /
    // confirmRestartWallContinuation / declineRestartWallContinuation).
    pendingRestartWallContinuation: raw.pendingRestartWallContinuation && typeof raw.pendingRestartWallContinuation === "object"
      ? raw.pendingRestartWallContinuation
      : null,
    // Untracked extra repositions after a Goalkeeper Retains — see
    // gkRepositionRules.mjs. gkRepositionMovementByPieceId is a parallel,
    // scoped-to-this-phase movement-session map (axis/spent/distance),
    // deliberately separate from movementStateByPieceId so it can never
    // bleed into ordinary Normal Move sessions before or after.
    gkReposition: raw.gkReposition && typeof raw.gkReposition === "object" ? raw.gkReposition : null,
    gkRepositionMovementByPieceId: raw.gkRepositionMovementByPieceId && typeof raw.gkRepositionMovementByPieceId === "object"
      ? raw.gkRepositionMovementByPieceId
      : {},
    // Marking (docs/MARKING_RULES.md): a pending first-entry decision for the
    // defending team, every currently active marker-target assignment, and
    // each team's remaining per-turn opportunity count. See markingRules.mjs.
    pendingMarking: raw.pendingMarking && typeof raw.pendingMarking === "object" ? raw.pendingMarking : null,
    activeMarkings: Array.isArray(raw.activeMarkings) ? raw.activeMarkings : [],
    markingOpportunities: normalizeMarkingOpportunities(raw.markingOpportunities),
    // A tie between 2+ equally good tracking-step cells for an active
    // marking's marker (docs/MARKING_RULES.md section 5) — the coach must
    // pick one before anything else can proceed. See markingRules.mjs.
    pendingMarkingTrack: raw.pendingMarkingTrack && typeof raw.pendingMarkingTrack === "object" ? raw.pendingMarkingTrack : null,
    // "Continue Marking?" (docs/MARKING_RULES.md section 5): asked before
    // every tracking response after a marking's first one. See
    // markingRules.mjs.
    pendingMarkingContinue: raw.pendingMarkingContinue && typeof raw.pendingMarkingContinue === "object" ? raw.pendingMarkingContinue : null,
    // Marking switch (docs/MARKING_RULES.md section 8): an attacker with an
    // active marker entering a DIFFERENT eligible defender's area. See
    // markingRules.mjs.
    pendingMarkingSwitch: raw.pendingMarkingSwitch && typeof raw.pendingMarkingSwitch === "object" ? raw.pendingMarkingSwitch : null,
    // The outcome of the most recent Marking-ending check (docs section 6/7):
    // every marking that ended just now and why, so the UI can show a brief
    // explanation. Not a queue — each check overwrites it, empty when nothing
    // ended. See markingRules.mjs.
    markingEndedNotices: Array.isArray(raw.markingEndedNotices) ? raw.markingEndedNotices : [],
    // Tackling (docs/TACKLING_RULES.md) — Build 1 (normal defensive action
    // only). The frozen defense-phase-start eligibility snapshot, every
    // player currently inactive because of a Tackling outcome, and any
    // yellow/red card recorded from a Tackling foul. See tacklingRules.mjs.
    tacklingEligibility: Array.isArray(raw.tacklingEligibility) ? raw.tacklingEligibility : [],
    tacklingInactivePlayers: Array.isArray(raw.tacklingInactivePlayers) ? raw.tacklingInactivePlayers : [],
    disciplinaryCards: Array.isArray(raw.disciplinaryCards) ? raw.disciplinaryCards : [],
    // A Tackling foul or equality out-of-bounds result, recorded as a
    // canonical fact only — not yet an executable restart (Free Kick and
    // Penalty setup are not implemented; see docs/IMPLEMENTATION_STATUS.md).
    pendingRestartResult: raw.pendingRestartResult && typeof raw.pendingRestartResult === "object" ? raw.pendingRestartResult : null,
    // Offside movement lock's Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md
    // section 6): every attacking-team piece that was in an offside position
    // the instant a Through Ball / Lofted Through Ball won its recovery race
    // for the attacking team, kept until any piece actually reaches the
    // loose ball — deliberately NOT reset on a turn/phase change (confirmed
    // live with the user: an attacker who can only partially close the
    // distance before its own actions run out, then reaches the ball on a
    // later turn once Speed refills, is still offside from that original
    // pass). See offsidePositionRules.mjs.
    offsideWatch: raw.offsideWatch && typeof raw.offsideWatch === "object" && Array.isArray(raw.offsideWatch.flaggedPieceIds)
      ? { attackingTeam: raw.offsideWatch.attackingTeam === "blue" ? "blue" : "red", flaggedPieceIds: raw.offsideWatch.flaggedPieceIds.map(String) }
      : null,
    tracker: {
      gameStarted: Boolean(tracker.gameStarted),
      startingTeam: tracker.startingTeam === "blue" ? "blue" : "red",
      currentTurn: Math.max(0, Number(tracker.currentTurn) || 0),
      usedActions: tracker.usedActions || { red: 0, blue: 0 },
      actionLog: normalizeTrackerActionLog(tracker.actionLog),
      personalActionsByPieceId: tracker.personalActionsByPieceId || {},
      matchActionState: tracker.matchActionState || {},
      turnPhase: ["attack", "defense", "complete"].includes(tracker.turnPhase)
        ? tracker.turnPhase
        : "attack",
      settings: tracker.settings || { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    dice: {
      dieType: Math.max(2, Number(dice.dieType) || 20),
      blueResult: dice.blueResult !== null && dice.blueResult !== undefined && Number.isFinite(Number(dice.blueResult)) ? Number(dice.blueResult) : null,
      redResult: dice.redResult !== null && dice.redResult !== undefined && Number.isFinite(Number(dice.redResult)) ? Number(dice.redResult) : null,
      blueLastDieType: Math.max(2, Number(dice.blueLastDieType) || 20),
      redLastDieType: Math.max(2, Number(dice.redLastDieType) || 20),
    },
  });
}

function stateOverride(overrides, key, fallback) {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, key) || overrides[key] === undefined) return fallback;
  return overrides[key];
}

/**
 * Applies the flattened Timeline overrides used by the app to a normalized
 * game state. An omitted field retains its previous value; an explicit null
 * is a real value and clears nullable state such as an action resolution,
 * continuation, or die result.
 */
export function mergeGameState(baseState, overrides = {}) {
  const base = createGameState(baseState || {});
  return createGameState({
    settings: stateOverride(overrides, "settings", base.settings),
    pieces: stateOverride(overrides, "pieces", base.pieces),
    movementStateByPieceId: stateOverride(overrides, "movementStateByPieceId", base.movementStateByPieceId),
    gameMode: stateOverride(overrides, "gameMode", base.gameMode),
    ruleSet: stateOverride(overrides, "ruleSet", base.ruleSet),
    actionResolution: stateOverride(overrides, "actionResolution", base.actionResolution),
    actionContinuation: stateOverride(overrides, "actionContinuation", base.actionContinuation),
    threeTwoOpportunity: stateOverride(overrides, "threeTwoOpportunity", stateOverride(overrides, "throughBallOpportunity", base.threeTwoOpportunity)),
    teamModifierTokens: stateOverride(overrides, "teamModifierTokens", stateOverride(overrides, "rollModifierOpportunities", base.teamModifierTokens)),
    score: stateOverride(overrides, "score", base.score),
    pendingFormation: stateOverride(overrides, "pendingFormation", base.pendingFormation),
    activeFormation: stateOverride(overrides, "activeFormation", base.activeFormation),
    tacticBlock: stateOverride(overrides, "tacticBlock", base.tacticBlock),
    kickoffRestart: stateOverride(overrides, "kickoffRestart", base.kickoffRestart),
    goalkeeperRestartException: stateOverride(overrides, "goalkeeperRestartException", base.goalkeeperRestartException),
    restartSetup: stateOverride(overrides, "restartSetup", base.restartSetup),
    pendingRestartWallContinuation: stateOverride(overrides, "pendingRestartWallContinuation", base.pendingRestartWallContinuation),
    gkReposition: stateOverride(overrides, "gkReposition", base.gkReposition),
    gkRepositionMovementByPieceId: stateOverride(overrides, "gkRepositionMovementByPieceId", base.gkRepositionMovementByPieceId),
    pendingMarking: stateOverride(overrides, "pendingMarking", base.pendingMarking),
    activeMarkings: stateOverride(overrides, "activeMarkings", base.activeMarkings),
    markingOpportunities: stateOverride(overrides, "markingOpportunities", base.markingOpportunities),
    pendingMarkingTrack: stateOverride(overrides, "pendingMarkingTrack", base.pendingMarkingTrack),
    pendingMarkingContinue: stateOverride(overrides, "pendingMarkingContinue", base.pendingMarkingContinue),
    pendingMarkingSwitch: stateOverride(overrides, "pendingMarkingSwitch", base.pendingMarkingSwitch),
    markingEndedNotices: stateOverride(overrides, "markingEndedNotices", base.markingEndedNotices),
    tacklingEligibility: stateOverride(overrides, "tacklingEligibility", base.tacklingEligibility),
    tacklingInactivePlayers: stateOverride(overrides, "tacklingInactivePlayers", base.tacklingInactivePlayers),
    disciplinaryCards: stateOverride(overrides, "disciplinaryCards", base.disciplinaryCards),
    pendingRestartResult: stateOverride(overrides, "pendingRestartResult", base.pendingRestartResult),
    offsideWatch: stateOverride(overrides, "offsideWatch", base.offsideWatch),
    tracker: {
      gameStarted: stateOverride(overrides, "trackerGameStarted", base.tracker.gameStarted),
      startingTeam: stateOverride(overrides, "trackerStartingTeam", base.tracker.startingTeam),
      currentTurn: stateOverride(overrides, "trackerCurrentTurn", base.tracker.currentTurn),
      usedActions: stateOverride(overrides, "trackerUsedActions", base.tracker.usedActions),
      actionLog: stateOverride(overrides, "trackerActionLog", base.tracker.actionLog),
      personalActionsByPieceId: stateOverride(overrides, "trackerPersonalActionsByPieceId", base.tracker.personalActionsByPieceId),
      matchActionState: stateOverride(overrides, "matchActionState", base.tracker.matchActionState),
      turnPhase: stateOverride(overrides, "turnPhase", base.tracker.turnPhase),
      settings: stateOverride(overrides, "trackerSettings", base.tracker.settings),
    },
    dice: {
      dieType: stateOverride(overrides, "dieType", base.dice.dieType),
      blueResult: stateOverride(overrides, "blueDieResult", base.dice.blueResult),
      redResult: stateOverride(overrides, "redDieResult", base.dice.redResult),
      blueLastDieType: stateOverride(overrides, "blueLastDieType", base.dice.blueLastDieType),
      redLastDieType: stateOverride(overrides, "redLastDieType", base.dice.redLastDieType),
    },
  });
}

/**
 * Editor Mode is not a suspended Match.  Leaving a Match therefore retains
 * its board and Tracker record for the closing Timeline entry, but removes
 * every Match-only interaction that would otherwise lock Editor controls.
 */
export function createEditorStateAfterMatchExit(rawState) {
  const state = createGameState(rawState);
  const emptyTurn = createEmptyTrackerTurnState();
  return createGameState({
    ...state,
    gameMode: "editor",
    actionResolution: null,
    actionContinuation: null,
    // Roll bonuses and 3/2 grants are Match-runtime opportunities. They must
    // never leak into the unrestricted Editor workspace.
    teamModifierTokens: [],
    threeTwoOpportunity: null,
    score: { blue: 0, red: 0 },
    kickoffRestart: null,
    goalkeeperRestartException: null,
    restartSetup: null,
    pendingRestartWallContinuation: null,
    gkReposition: null,
    gkRepositionMovementByPieceId: {},
    pendingMarking: null,
    activeMarkings: [],
    markingOpportunities: { blue: 2, red: 2 },
    pendingMarkingTrack: null,
    pendingMarkingContinue: null,
    pendingMarkingSwitch: null,
    markingEndedNotices: [],
    tacklingEligibility: [],
    tacklingInactivePlayers: [],
    disciplinaryCards: [],
    pendingRestartResult: null,
    offsideWatch: null,
    pendingFormation: { blue: null, red: null },
    activeFormation: { blue: null, red: null },
    tacticBlock: { blue: false, red: false },
    tracker: {
      ...state.tracker,
      // Editor is a new future-Match workspace, never a paused Match.
      gameStarted: false,
      currentTurn: 0,
      usedActions: emptyTurn.usedActions,
      actionLog: emptyTurn.actionLog,
      personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
      matchActionState: emptyTurn.matchActionState,
      turnPhase: "attack",
    },
    dice: { ...state.dice, blueResult: null, redResult: null },
  });
}

export function gameStatesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
