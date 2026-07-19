import { normalizeRuleSet } from "../rules/ruleSets.mjs";

export const GAME_STATE_SCHEMA_VERSION = 2;

export function cloneGameState(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
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
    tracker: {
      gameStarted: Boolean(tracker.gameStarted),
      startingTeam: tracker.startingTeam === "blue" ? "blue" : "red",
      currentTurn: Math.max(0, Number(tracker.currentTurn) || 0),
      usedActions: tracker.usedActions || { red: 0, blue: 0 },
      actionLog: tracker.actionLog || { red: [], blue: [] },
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
    tracker: {
      gameStarted: stateOverride(overrides, "trackerGameStarted", base.tracker.gameStarted),
      startingTeam: stateOverride(overrides, "trackerStartingTeam", base.tracker.startingTeam),
      currentTurn: stateOverride(overrides, "trackerCurrentTurn", base.tracker.currentTurn),
      usedActions: stateOverride(overrides, "trackerUsedActions", base.tracker.usedActions),
      actionLog: stateOverride(overrides, "trackerActionLog", base.tracker.actionLog),
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

export function gameStatesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
