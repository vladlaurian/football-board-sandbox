import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { kickoffRestartAfterAction } from "./kickoffMomentRules.mjs";

// Since v20.56.42 the kick-off restart's entitled piece may play ANY pass
// type (Short/Long Pass already covered in shotRules.test.mjs; Through Ball
// and Lofted Through Ball covered here) — only the piece restriction remains.

function kickoffState(overrides = {}) {
  return createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 1, y: 1 },
      { id: "blue-1", team: "A", cardId: "blue-1", x: 1, y: 1 },
      { id: "blue-2", team: "A", cardId: "blue-2", x: 10, y: 10 },
    ],
    kickoffRestart: { team: "blue", pieceId: "blue-1" },
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 3,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {}, turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function kickoffContext(overrides = {}) {
  return createMatchContext({
    id: "kickoff-any-pass-context",
    boardSettings: { cols: 20, rows: 12 },
    ruleSet: { actions: { throughBall: { maxDistance: 16 }, loftedThroughBall: { maxDistance: 32 } } },
    gameplayCards: [
      { id: "blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] },
      { id: "blue-2", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
    ],
    ...overrides,
  });
}

test("THROUGH_BALL_STARTED rejects the wrong player during a kickoff restart", () => {
  // Both pieces share the ball's cell so THROUGH_BALL_NOT_AVAILABLE (no ball)
  // cannot mask the dedicated wrong-player rejection this test is for.
  const state = kickoffState({ pieces: [{ id: "ball", team: "BALL", x: 1, y: 1 }, { id: "blue-1", team: "A", cardId: "blue-1", x: 1, y: 1 }, { id: "blue-2", team: "A", cardId: "blue-2", x: 1, y: 1 }] });
  const result = applyGameCommand({
    state, context: kickoffContext(),
    command: { id: "tb-wrong", type: "THROUGH_BALL_STARTED", payload: { pieceId: "blue-2" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "KICKOFF_RESTART_WRONG_PLAYER");
});

test("the kick-off piece may complete a Through Ball, which clears the restart", () => {
  const context = kickoffContext();
  const started = applyGameCommand({ state: kickoffState(), context, command: { id: "tb-start", type: "THROUGH_BALL_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  const targeted = applyGameCommand({ state: started.nextState, context, command: { id: "tb-target", type: "THROUGH_BALL_TARGET_SELECTED", payload: { x: 4, y: 1 } } });
  assert.equal(targeted.accepted, true);
  const committed = applyGameCommand({ state: targeted.nextState, context, command: { id: "tb-commit", type: "THROUGH_BALL_COMMITTED", payload: { cornerId: "top-left" } } });
  assert.equal(committed.accepted, true);
  assert.equal(committed.nextState.kickoffRestart, null);
  assert.equal(committed.nextState.tracker.usedActions.blue, 1);
});

test("LOFTED_THROUGH_BALL_STARTED rejects the wrong player during a kickoff restart", () => {
  const state = kickoffState({ pieces: [{ id: "ball", team: "BALL", x: 1, y: 1 }, { id: "blue-1", team: "A", cardId: "blue-1", x: 1, y: 1 }, { id: "blue-2", team: "A", cardId: "blue-2", x: 1, y: 1 }] });
  const result = applyGameCommand({
    state, context: kickoffContext(),
    command: { id: "lt-wrong", type: "LOFTED_THROUGH_BALL_STARTED", payload: { pieceId: "blue-2" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "KICKOFF_RESTART_WRONG_PLAYER");
});

// A card's "Lofted Through Ball" stat only wires up
// context.ruleSet.actions.loftedThroughBall.rollStatId if it carries a
// stable `id` — createMatchContext's resolveLoftedThroughBallStat scans the
// roster for a stat named exactly "lofted through ball" with an id and
// auto-resolves it (src/engine/matchContext.mjs). Without an id on the
// card's attribute it silently stays unresolved, which is normal for
// hand-built fixtures elsewhere in this file that don't exercise the full
// roll — this one needs it, since it drives the whole command sequence.
test("the kick-off piece may commit a Lofted Through Ball, which clears the restart", () => {
  const context = createMatchContext({
    id: "kickoff-lofted-context",
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "blue-1", passiveAttributes: [{ id: "stat:lofted-through-ball", name: "Lofted Through Ball", value: 14 }] },
      { id: "blue-2", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
    ],
  });
  const started = applyGameCommand({ state: kickoffState(), context, command: { id: "lt-start", type: "LOFTED_THROUGH_BALL_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  const targeted = applyGameCommand({ state: started.nextState, context, command: { id: "lt-target", type: "LOFTED_THROUGH_BALL_TARGET_SELECTED", payload: { x: 4, y: 1 } } });
  assert.equal(targeted.accepted, true);
  const committed = applyGameCommand({ state: targeted.nextState, context, command: { id: "lt-commit", type: "LOFTED_THROUGH_BALL_COMMITTED", payload: { cornerId: "top-left" } } });
  assert.equal(committed.accepted, true);
  assert.equal(committed.nextState.kickoffRestart, null);
  assert.equal(committed.nextState.tracker.usedActions.blue, 1);
  assert.equal(committed.nextState.actionResolution.status, "awaiting-roll");
});

test("kickoffRestartAfterAction clears the restart only for its own entitled piece", () => {
  const restart = { team: "blue", pieceId: "blue-1" };
  assert.equal(kickoffRestartAfterAction({ kickoffRestart: restart }, "blue-1"), null);
  assert.deepEqual(kickoffRestartAfterAction({ kickoffRestart: restart }, "blue-2"), restart);
  assert.equal(kickoffRestartAfterAction({ kickoffRestart: null }, "blue-1"), null);
});
