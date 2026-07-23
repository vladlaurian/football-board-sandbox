import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { GAME_COMMAND_TYPE } from "./gameCommands.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerBallCellMoveChoicePresentation, selectSinglePlayerDicePresentation, selectSinglePlayerFreeBallPresentation, selectSinglePlayerFreeMovePresentation, selectSinglePlayerGroupMovePieceStatuses, selectSinglePlayerInspectorActionPresentation, selectSinglePlayerNormalMovePresentation, selectSinglePlayerPassPresentation, selectSinglePlayerThreeTwoPresentation } from "./matchPresentationSelectors.mjs";

test("Single Player Pass selector projects persisted route and roll facts without recalculating them", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "awaiting-interception-roll",
      cornerId: "top-right",
      target: { x: 8, y: 4 },
      routePresentation: [{
        id: "top-right",
        cornerId: "top-right",
        origin: { x: 3, y: 2 },
        endpoint: { x: 8.5, y: 4.5 },
        foot: "RF",
        modifier: -5,
        modifierType: "disadvantage",
        isLong: false,
        originBlocked: false,
        goalkeeperRouteBlocked: false,
        risk: true,
      }],
      rollPresentation: {
        defenderId: "red-2",
        team: "red",
        modifier: 6,
        modifierCap: 6,
        capped: false,
        modifierSources: [{ label: "Advantage", value: 7, source: "passer-execution-disadvantage" }],
      },
    },
  });
  assert.equal(projection.routeOptions[0].modifierLabel, "−5");
  assert.equal(projection.routeOptions[0].status, "risk");
  assert.equal(projection.selectedRoute.cornerId, "top-right");
  assert.equal(projection.rollPrompt.modifier, 6);
  assert.equal(projection.rollPrompt.modifierSources[0].value, 7);
});

test("Single Player Pass selector keeps a dominant-foot origin badge neutral and compact", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "route-selection",
      routePresentation: [{ id: "top-left", cornerId: "top-left", modifier: 0, foot: "LF" }],
    },
  });
  assert.equal(projection.routeOptions[0].modifierLabel, "0");
});

test("Single Player movement projections reuse Engine evaluators instead of UI-local movement rules", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 5, y: 3 },
      { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 },
      { id: "blue-blocker", team: "A", x: 4, y: 3 },
    ],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] }] });
  const normal = selectSinglePlayerNormalMovePresentation(state, context, { piece: state.pieces[1], x: 5, y: 3 });
  assert.equal(normal.legal, false);
  assert.equal(normal.reason, "path-blocked");
  const threeTwo = selectSinglePlayerThreeTwoPresentation(state, context, { piece: state.pieces[1], x: 5, y: 3 });
  assert.equal(threeTwo.legal, false);
  assert.equal(threeTwo.reason, "path-blocked");
});

test("Normal Move projection remains render-safe before Tracker start and for an inactive team", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 8, y: 3 },
      { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 },
    ],
    tracker: { gameStarted: false, startingTeam: "blue", currentTurn: 0, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] }] });
  const beforeStart = selectSinglePlayerNormalMovePresentation(state, context, { piece: state.pieces[1], x: 4, y: 3 });
  // Existing preview semantics allow the geometry preview before Tracker start;
  // the submitted command remains independently Engine-gated.
  assert.equal(beforeStart.legal, true);
  assert.equal(beforeStart.geometry.axis, "horizontal");

  const inactiveTeamState = createGameState({
    ...state,
    tracker: { ...state.tracker, gameStarted: true, currentTurn: 1, startingTeam: "red" },
  });
  const inactiveTeam = selectSinglePlayerNormalMovePresentation(inactiveTeamState, context, { piece: inactiveTeamState.pieces[1], x: 4, y: 3 });
  assert.equal(inactiveTeam.legal, false);
  assert.equal(inactiveTeam.reason, "wait-active-team");
  assert.equal(inactiveTeam.geometry.axis, "horizontal");
});

test("Single Player projection boundary keeps Group Move crossing semantics in the Engine", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 12, y: 2 },
      { id: "blue-1", team: "A", x: 3, y: 3 },
      { id: "blue-blocker", team: "A", x: 4, y: 3 },
    ],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", usedActions: { blue: 5, red: 0 }, actionLog: { blue: [{ id: "a", type: "PASS" }, { id: "b", type: "PASS" }, { id: "c", type: "PASS" }, { id: "d", type: "PASS" }, { id: "group", type: "GROUP_MOVE" }], red: [] }, matchActionState: { groupMove: { active: true, team: "blue", zoneStartX: 0, zoneLength: 8, maxPlayers: 4, maxDistance: 6, sameDirectionOnly: true, movedPieceIds: [], direction: null } }, settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const statuses = selectSinglePlayerGroupMovePieceStatuses(state);
  assert.equal(statuses["blue-1"], "eligible");
});

test("Single Player UI imports the presentation boundary, not direct gameplay evaluators", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /from "\.\/engine\/matchPresentationSelectors\.mjs"/);
  assert.doesNotMatch(source, /from "\.\/engine\/movementPathRules\.mjs"/);
  assert.doesNotMatch(source, /from "\.\/engine\/threeTwoMoveRules\.mjs"/);
  assert.doesNotMatch(source, /from "\.\/engine\/groupMoveRules\.mjs"/);
});

test("Single Player dice availability projects the canonical pending request", () => {
  const pass = { actionResolution: { kind: "pass", status: "awaiting-interception-roll", interceptorIndex: 0, plan: { interceptors: [{ defender: { id: "red-1", team: "B" } }] } } };
  assert.equal(selectSinglePlayerDicePresentation(pass, { team: "red" }).canRoll, true);
  assert.equal(selectSinglePlayerDicePresentation(pass, { team: "blue" }).canRoll, false);
  assert.equal(selectSinglePlayerDicePresentation({ actionResolution: null }, { team: "blue", extraRollArmed: true }).canRoll, true);
  assert.equal(selectSinglePlayerDicePresentation({ actionResolution: null }, { team: "blue", extraRollArmed: false }).canRoll, false);
});

test("Normal Move preview capability cannot be smuggled through a submitted command payload", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 8, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] }] });
  const preview = selectSinglePlayerNormalMovePresentation(state, context, { piece: state.pieces[1], x: 4, y: 3 });
  assert.equal(preview.legal, true);
  const committed = applyGameCommand({ state, context, command: { id: "forged", type: GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, payload: { pieceId: "blue-1", x: 4, y: 3, presentationOnly: true } } });
  assert.equal(committed.accepted, false);
  assert.equal(committed.reason, "NORMAL_MOVE_NOT_ACTIVE");
});

test("ball-cell presentation exposes Engine-owned 3/2 and direct-board normal MOVE routes", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 5, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  const choice = selectSinglePlayerBallCellMoveChoicePresentation(state, context, { piece: state.pieces[1], x: 5, y: 3 });
  assert.equal(choice.threeTwo.legal, true);
  assert.equal(choice.normal.legal, true);
  assert.equal(choice.normal.mode, "start-and-commit");

  const started = applyGameCommand({ state, context, command: { id: "card-move", type: GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, payload: { pieceId: "blue-1" } } });
  const cardRoute = applyGameCommand({ state: started.nextState, context, command: { id: "card-move-commit", type: GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, payload: { pieceId: "blue-1", x: 5, y: 3 } } });
  const boardStart = applyGameCommand({ state, context, command: { id: "board-move", type: GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, payload: { pieceId: "blue-1" } } });
  const boardRoute = applyGameCommand({ state: boardStart.nextState, context, command: { id: "board-move-commit", type: GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, payload: { pieceId: "blue-1", x: 5, y: 3 } } });
  assert.equal(cardRoute.accepted, true);
  assert.equal(boardRoute.accepted, true);
  assert.deepEqual(boardRoute.nextState.pieces, cardRoute.nextState.pieces);
  assert.deepEqual(boardRoute.nextState.movementStateByPieceId, cardRoute.nextState.movementStateByPieceId);
  assert.deepEqual(boardRoute.nextState.tracker.usedActions, cardRoute.nextState.tracker.usedActions);
});

test("ready Bonus Action controls do not inherit normal Tracker phase or action locks", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 3, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    actionContinuation: { id: "bonus-blue", kind: "bonus-card-action", team: "blue", status: "ready" },
    tracker: {
      gameStarted: true,
      startingTeam: "red",
      currentTurn: 1,
      turnPhase: "attack",
      usedActions: { blue: 5, red: 0 },
      actionLog: { blue: Array.from({ length: 5 }, (_, index) => ({ id: `blue-${index}`, type: "PASS" })), red: [] },
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "MOVE" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "PASS" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "GROUP_MOVE" }).disabled, true);
});

test("Free Move and Free Ball projections use the same Engine validation as their commits", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 2, y: 2 }, { id: "blue-1", team: "A", x: 3, y: 3 }, { id: "red-1", team: "B", x: 4, y: 3 }],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", matchActionState: { freeMode: { active: true, pieceId: "blue-1", team: "blue", timelineGroupId: "free" } }, settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const free = selectSinglePlayerFreeMovePresentation(state, { piece: state.pieces[1], x: 4, y: 3 });
  assert.equal(free.legal, false);
  assert.equal(free.reason, "occupied");
  const context = createMatchContext({ boardSettings: { cols: 6, rows: 5 } });
  const ball = selectSinglePlayerFreeBallPresentation(state, context, { x: 6, y: 2 });
  assert.equal(ball.legal, false);
  assert.equal(ball.reason, "BALL_DESTINATION_OUT_OF_BOUNDS");
});
