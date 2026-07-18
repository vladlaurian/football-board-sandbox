import { normalizeRuleSet } from "../rules/ruleSets.mjs";

export const GAME_STATE_SCHEMA_VERSION = 1;

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

export function gameStatesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
