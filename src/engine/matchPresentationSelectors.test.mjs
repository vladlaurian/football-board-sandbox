import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { GAME_COMMAND_TYPE } from "./gameCommands.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { selectSinglePlayerBallCellMoveChoicePresentation, selectSinglePlayerBonusMovePresentation, selectSinglePlayerDicePresentation, selectSinglePlayerFreeBallPresentation, selectSinglePlayerFreeMovePresentation, selectSinglePlayerGroupMoveDraftPresentation, selectSinglePlayerGroupMovePieceStatuses, selectSinglePlayerInspectorActionPresentation, selectSinglePlayerInspectorControlPresentation, selectSinglePlayerNormalMovePresentation, selectSinglePlayerPassPresentation, selectRouteCornerBadges, selectSinglePlayerRollPromptPresentation, selectSinglePlayerThreeTwoPresentation, selectSinglePlayerPieceActionPresentation, selectSinglePlayerGkRepositionPresentation, selectSinglePlayerGkRepositionMovePresentation } from "./matchPresentationSelectors.mjs";
import { buildRestartSetup } from "./restartSetupRules.mjs";
import { createDefaultRuleSet } from "../rules/ruleSets.mjs";

// Free Move as a testing-engine global exception (confirmed live with the
// user): every ordinary action stays gated to an active restart-setup's own
// flow, but Free Move must work regardless — a coach needs to be able to
// freely reposition either team's pieces even mid restart-setup.
test("Free Move bypasses an active restart setup, but ordinary actions stay gated to it", () => {
  const piece = { id: "red-1", team: "B" };
  const baseTracker = {
    gameStarted: true, currentTurn: 1,
    matchActionState: { byPieceId: {}, freeMode: { active: false, pieceId: null } },
  };
  const stateDuringWall = {
    gameMode: "match",
    tracker: baseTracker,
    restartSetup: { type: "freeKickDirect", team: "blue", phase: "wall", executorId: null },
  };
  const blockedProjection = selectSinglePlayerPieceActionPresentation(stateDuringWall, { piece });
  assert.equal(blockedProjection.freeAllowed, true, "Free Move stays available even mid restart-setup");
  assert.equal(blockedProjection.movementAuthorization.mode, "blocked", "ordinary movement stays gated to the restart-setup panel");
  assert.equal(blockedProjection.movementAuthorization.reason, "restart-setup-active");

  const stateWithFreeModeActive = {
    gameMode: "match",
    tracker: { gameStarted: true, currentTurn: 1, matchActionState: { byPieceId: {}, freeMode: { active: true, pieceId: "red-1" } } },
    restartSetup: { type: "freeKickDirect", team: "blue", phase: "wall", executorId: null },
  };
  const activeProjection = selectSinglePlayerPieceActionPresentation(stateWithFreeModeActive, { piece });
  assert.equal(activeProjection.movementAuthorization.mode, "free", "once toggled on, the actual placement click also works mid restart-setup");
  assert.equal(activeProjection.movementAuthorization.allowed, true);
});

test("Free Move bypasses an active gkReposition too, but ordinary actions stay gated to it", () => {
  const piece = { id: "red-1", team: "B" };
  const stateDuring = {
    gameMode: "match",
    tracker: { gameStarted: true, currentTurn: 1, matchActionState: { byPieceId: {}, freeMode: { active: false, pieceId: null } } },
    gkReposition: { team: "blue", opponentTeam: "red", turn: "opponent", remaining: { self: 2, opponent: 2 }, count: 2, activePieceId: null },
  };
  const blockedProjection = selectSinglePlayerPieceActionPresentation(stateDuring, { piece });
  assert.equal(blockedProjection.freeAllowed, true, "Free Move stays available even mid gkReposition");
  assert.equal(blockedProjection.movementAuthorization.mode, "blocked");
  assert.equal(blockedProjection.movementAuthorization.reason, "gk-reposition-active");
});

test("selectSinglePlayerGkRepositionPresentation reports the active side by real team name, remaining counts keyed by team", () => {
  assert.deepEqual(selectSinglePlayerGkRepositionPresentation({}), { active: false });
  const state = { gkReposition: { team: "red", opponentTeam: "blue", turn: "opponent", remaining: { self: 3, opponent: 1 }, count: 3, activePieceId: "blue-9" } };
  const presentation = selectSinglePlayerGkRepositionPresentation(state);
  assert.equal(presentation.active, true);
  assert.equal(presentation.activeTeam, "blue", "turn:\"opponent\" of team:\"red\" resolves to blue");
  assert.deepEqual(presentation.remaining, { red: 3, blue: 1 });
  assert.equal(presentation.activePieceId, "blue-9");
});

test("selectSinglePlayerGkRepositionMovePresentation previews the same accepted/rejected shape evaluateGkRepositionMove returns", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
    ],
    gkReposition: { team: "blue", opponentTeam: "red", turn: "self", remaining: { self: 1, opponent: 1 }, count: 1, activePieceId: null },
  });
  const context = createMatchContext({ id: "gk-move-preview", boardSettings: { cols: 20, rows: 12 }, gameplayCards: [{ id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] }] });
  const preview = selectSinglePlayerGkRepositionMovePresentation(state, context, { piece: state.pieces[1], x: 5, y: 5 });
  assert.equal(preview.legal, true);
  assert.equal(preview.moveCost, 2);
  assert.equal(preview.geometry.axis, "horizontal");
});

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
        verdict: "clear",
        segments: [{ endpoint: { x: 8.5, y: 4.5 }, status: "clear" }],
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
  assert.equal(projection.routeOptions[0].status, "clear");
  assert.equal(projection.routeOptions[0].segments.length, 1);
  assert.equal(projection.selectedRoute.cornerId, "top-right");
  assert.equal(projection.rollPrompt.modifier, 6);
  assert.equal(projection.rollPrompt.modifierSources[0].value, 7);
});

test("Single Player Pass selector renders Engine-invalid targets as blocked routes", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "route-selection",
      target: { x: 8, y: 4 },
      targetInvalidReason: "PASS_TARGET_FIELD_PLAYER_REQUIRED",
      routePresentation: [{
        id: "top-left", cornerId: "top-left", origin: { x: 3, y: 2 }, endpoint: { x: 8.5, y: 4.5 }, foot: "LF",
        modifier: 0, isLong: false, originBlocked: false, goalkeeperRouteBlocked: false, endpointBodyBlocked: false, risk: false,
        targetInvalidReason: "PASS_TARGET_FIELD_PLAYER_REQUIRED",
      }],
    },
  });
  assert.equal(projection.routeOptions[0].status, "blocked");
  assert.equal(projection.routeOptions[0].disabled, true);
});

// Pass now shows a corner blocked by the passer's own body as a disabled
// badge, exactly like Through Ball, Lofted Through Ball and Shot already do,
// instead of removing it from the projection entirely.
test("Single Player Pass selector shows an origin-blocked corner disabled rather than hiding it", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "route-selection",
      target: { x: 8, y: 4 },
      routePresentation: [{
        id: "top-left", cornerId: "top-left", origin: { x: 3, y: 2 }, endpoint: { x: 8.5, y: 4.5 }, foot: "LF",
        modifier: 0, isLong: false, originBlocked: true, goalkeeperRouteBlocked: false, endpointBodyBlocked: false, risk: false,
      }],
    },
  });
  assert.equal(projection.routeOptions.length, 1);
  assert.equal(projection.routeOptions[0].status, "blocked");
  assert.equal(projection.routeOptions[0].disabled, true);
});

test("selectRouteCornerBadges projects one uniform badge shape for every board-first mechanic", () => {
  const shotStyle = selectRouteCornerBadges([
    { cornerId: "top-left", origin: { x: 1, y: 1 }, foot: { foot: "Left", dominant: false }, modifierLabel: "−4", status: "risk", disabled: false },
    { cornerId: "top-right", origin: { x: 2, y: 1 }, foot: { foot: "Right", dominant: true }, modifierLabel: "+1", disabled: true },
  ], { actionLabel: "SHOT" });
  assert.deepEqual(shotStyle.map(badge => badge.foot), ["LF", "RF"]);
  assert.deepEqual(shotStyle.map(badge => badge.modifier), ["−4", "+1"]);
  assert.deepEqual(shotStyle.map(badge => badge.status), ["risk", "blocked"]);
  assert.deepEqual(shotStyle.map(badge => badge.disabled), [false, true]);
  assert.deepEqual(shotStyle.map(badge => badge.actionLabel), ["SHOT", "SHOT"]);

  // A mechanic without a legality/disabled field falls back to route.legal.
  const legalOnly = selectRouteCornerBadges([{ cornerId: "bottom-left", origin: { x: 0, y: 0 }, legal: false }], { actionLabel: "TB", footLabel: () => "TB" });
  assert.equal(legalOnly[0].disabled, true);
  assert.equal(legalOnly[0].status, "blocked");
  assert.equal(legalOnly[0].foot, "TB");
  assert.equal(legalOnly[0].modifier, "");
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
    throughBallOpportunity: { team: "blue", passerId: "other", target: { x: 5, y: 3 }, turn: 1 },
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
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", usedActions: { blue: 5, red: 0 }, actionLog: { blue: [{ id: "a", type: "PASS" }, { id: "b", type: "PASS" }, { id: "c", type: "PASS" }, { id: "d", type: "PASS" }, { id: "group", type: "GROUP_MOVE" }], red: [] }, matchActionState: { groupMove: { active: true, team: "blue", zoneStartX: 0, zoneLength: 8, maxPlayers: 4, maxOrthogonalDistance: 6, maxDiagonalDistance: 4, sameDirectionOnly: true, movedPieceIds: [], direction: null } }, settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const statuses = selectSinglePlayerGroupMovePieceStatuses(state);
  assert.equal(statuses["blue-1"], "eligible");
});

test("Group Move draft activation projects Engine availability and frozen zone shape", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 15, y: 5 }, { id: "blue-1", team: "A", x: 3, y: 5 }],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 1,
      turnPhase: "attack",
      usedActions: { blue: 4, red: 0 },
      actionLog: { blue: Array.from({ length: 4 }, (_, index) => ({ id: `action-${index}`, type: "PASS" })), red: [] },
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
  });
  const context = createMatchContext({ boardSettings: { cols: 20, rows: 12 }, ruleSet: { actions: { groupMove: { zoneLength: 6 } } } });
  const allowed = selectSinglePlayerGroupMoveDraftPresentation(state, context, { piece: state.pieces[1] });
  assert.deepEqual(allowed, {
    allowed: true,
    reason: null,
    team: "blue",
    zoneLength: 6,
    defaultZoneStartX: 7,
    maxZoneStartX: 14,
  });

  const notFinalAction = selectSinglePlayerGroupMoveDraftPresentation({
    ...state,
    tracker: { ...state.tracker, usedActions: { blue: 3, red: 0 }, actionLog: { ...state.tracker.actionLog, blue: state.tracker.actionLog.blue.slice(0, 3) } },
  }, context, { piece: state.pieces[1] });
  assert.equal(notFinalAction.allowed, false);
  assert.equal(notFinalAction.reason, "group-move-last-action-only");
});

test("Single Player UI imports the presentation boundary, not direct gameplay evaluators", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /from "\.\/engine\/matchPresentationSelectors\.mjs"/);
  assert.match(source, /from "\.\/engine\/singlePlayerMatchGateway\.mjs"/);
  assert.doesNotMatch(source, /from "\.\/engine\/(?:gameEngine|movementPathRules|normalMoveRules|threeTwoMoveRules|groupMoveRules|bonusMoveRules|freeMoveRules|passStartRules|matchAdministrationRules|matchLifecycleRules|trackerPhaseRules)\.mjs"/);
});

test("main.jsx no longer computes Shot roll modifiers locally", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /resolveDiceModifierStacks/);
});

test("Manual Multiplayer retains its Bonus Action declaration path for Shot", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(!sessionCode && type === "SHOT"\) return;/);
});

test("pass hover remains render-safe before a Timeline exists", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /gameTimeline\?\.cursor/);
  assert.doesNotMatch(source, /settings\.rows, gameTimeline\.cursor\]/);
});

function localFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `expected main.jsx to retain ${name}`);
  const bodyStart = source.indexOf(") {", start) + 2;
  assert.notEqual(bodyStart, 1, `could not locate ${name} body start`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`could not read ${name} body`);
}

test("offline migrated Match command entrances retain the gateway route", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /from "\.\/engine\/singlePlayerMatchGateway\.mjs"/);
  [
    "commitFreeBallMove",
    "commitNormalMoveThroughEngine",
    "confirmGroupMoveZone",
    "startBonusMove",
    "cancelBonusMove",
    "commitBonusMoveSegment",
    "commitDirectBoardBonusMove",
    "beginPassTargeting",
    "commitPassCancellation",
    "commitPassTargetSelection",
    "choosePassInterceptor",
    "confirmPassRoute",
    "confirmEndTurn",
    "endBonusAction",
    "startTrackedGame",
    "resetTrackerActions",
    "changeTrackerPossession",
  ].forEach(name => {
    const body = localFunctionSource(source, name);
    assert.match(body, /dispatchSinglePlayer(?:GameCommand|GameCommandSequence|MatchStart)\(/, `${name} must retain an offline Engine gateway dispatch`);
  });
});

test("offline movement and ball-cell previews keep their local fallback behind the session boundary", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  [
    ["getThreeTwoEligibility", "selectSinglePlayerThreeTwoPresentation"],
    ["evaluateMove", "selectSinglePlayerNormalMovePresentation"],
    ["evaluateGroupMove", "selectSinglePlayerGroupMovePresentation"],
  ].forEach(([name, selector]) => {
    const body = localFunctionSource(source, name);
    assert.match(body, new RegExp(`if \\(!sessionCode[\\s\\S]*?return ${selector}\\(`), `${name} must return the offline presentation projection before its legacy fallback`);
  });
});

test("offline Group Move draft uses its official projection instead of local Rule Set and Tracker reads", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  const body = localFunctionSource(source, "consumeInspectorAction");
  assert.match(body, /selectSinglePlayerGroupMoveDraftPresentation\(/);
  assert.doesNotMatch(body, /singlePlayerMatchContext\(\)\.ruleSet\.actions\?\.groupMove\?\.zoneLength/);
  assert.doesNotMatch(body, /getTeamActionStatus\(team\)\.remaining !== 1/);
});

test("Single Player dice availability projects the canonical pending request rather than mechanic names", () => {
  const pass = { actionResolution: { kind: "pass", status: "awaiting-interception-roll", pendingRoll: { requestId: "pass-roll", team: "red", dieType: 20 } } };
  assert.equal(selectSinglePlayerDicePresentation(pass, { team: "red" }).canRoll, true);
  assert.equal(selectSinglePlayerDicePresentation(pass, { team: "blue" }).canRoll, false);
  const lofted = { actionResolution: { kind: "lofted-through-ball", status: "awaiting-roll", pendingRoll: { requestId: "lt-roll", team: "blue", dieType: 20 } } };
  assert.equal(selectSinglePlayerDicePresentation(lofted, { team: "blue" }).canRoll, true);
  assert.equal(selectSinglePlayerDicePresentation(lofted, { team: "red" }).canRoll, false);
  const routeSelection = { actionResolution: { kind: "lofted-through-ball", status: "route-selection", team: "blue" } };
  assert.equal(selectSinglePlayerDicePresentation(routeSelection, { team: "blue" }).canRoll, false);
  const throughBall = { actionResolution: { kind: "through-ball", status: "route-selection", team: "blue" } };
  assert.equal(selectSinglePlayerDicePresentation(throughBall, { team: "blue" }).canRoll, false);
  assert.equal(selectSinglePlayerDicePresentation({ actionResolution: null }, { team: "blue", extraRollArmed: true }).canRoll, true);
  assert.equal(selectSinglePlayerDicePresentation({ actionResolution: null }, { team: "blue", extraRollArmed: false }).canRoll, false);
});

test("offline Dice UI derives pending-roll availability and die type without Pass or LT status checks", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  const gate = localFunctionSource(source, "canRollTeamDie");
  assert.match(gate, /if \(!sessionCode && gameMode === "match"\) \{[\s\S]*?selectSinglePlayerDicePresentation/);
  const request = localFunctionSource(source, "offlinePendingRoll");
  assert.match(request, /state\?\.actionResolution\?\.pendingRoll/);
  const autoOpen = source.slice(source.indexOf("useEffect(() => {\n    const pendingRoll = actionResolution?.pendingRoll"), source.indexOf("useEffect(() => { movementStateRef.current", source.indexOf("useEffect(() => {\n    const pendingRoll = actionResolution?.pendingRoll")));
  assert.match(autoOpen, /pendingRoll\.dieType/);
  assert.doesNotMatch(autoOpen, /lofted-through-ball|awaiting-interception-roll/);
});

test("offline Dice schedules the generic canonical result hold while Timeline navigation is guarded during animation", () => {
  const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  const reserve = localFunctionSource(source, "reserveDiceRoll");
  assert.match(reserve, /if \(!sessionCode\) \{\s*return true;/);
  const roll = localFunctionSource(source, "rollTeamDie");
  const offlineBranchStart = roll.indexOf("if (offlineMatch)");
  const offlineBranchEnd = roll.indexOf("      setResult(result);", offlineBranchStart);
  const offlineBranch = roll.slice(offlineBranchStart, offlineBranchEnd);
  assert.match(offlineBranch, /scheduleDelayedResolution/);
  assert.doesNotMatch(offlineBranch, /PASS_INTERCEPTION_RESOLUTION_DUE/);
  const undo = localFunctionSource(source, "undo");
  const redo = localFunctionSource(source, "redo");
  assert.match(undo, /if \(diceAnimationActive\(\)\) return;/);
  assert.match(redo, /if \(diceAnimationActive\(\)\) return;/);
});

test("Normal Move preview capability cannot be smuggled through a submitted command payload", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 8, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
    throughBallOpportunity: { team: "blue", passerId: "other", target: { x: 5, y: 3 }, turn: 1 },
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
    throughBallOpportunity: { team: "blue", passerId: "other", target: { x: 5, y: 3 }, turn: 1 },
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
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "THROUGH_BALL" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "LOFTED_THROUGH_BALL" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "SHOT" }).disabled, true);
  assert.equal(selectSinglePlayerInspectorControlPresentation(state, context, { piece: state.pieces[1] }).freeMoveAllowed, true);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "GROUP_MOVE" }).disabled, true);
});

test("during a Free Kick Indirect's execution, the executor's Shot button is blocked (not in availableActions) and Move is always blocked, but Pass/Through Ball/Lofted Through Ball stay enabled (reported live: Shot only failed post-dispatch before)", () => {
  const restartSetup = { ...buildRestartSetup(createDefaultRuleSet(), "freeKickIndirect", "blue", { x: 14, y: 5 }), phase: "execution", executorId: "blue-1" };
  assert.ok(!restartSetup.availableActions.includes("shot"), "sanity check on the default Rule Set this test relies on");
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 14, y: 5 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 14, y: 5 }],
    restartSetup,
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "SHOT" }).disabled, true);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "MOVE" }).disabled, true, "Move has no execution-phase family at all");
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "PASS" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "THROUGH_BALL" }).disabled, false);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "LOFTED_THROUGH_BALL" }).disabled, false);
});

test("a Free Kick Direct's execution leaves Shot enabled — it IS in that restart type's own availableActions", () => {
  const restartSetup = { ...buildRestartSetup(createDefaultRuleSet(), "freeKickDirect", "blue", { x: 14, y: 5 }), phase: "execution", executorId: "blue-1" };
  assert.ok(restartSetup.availableActions.includes("shot"));
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 14, y: 5 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 14, y: 5 }],
    restartSetup,
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "SHOT" }).disabled, false);
});

test("Through Ball targeting locks the ordinary Inspector action row", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 3, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    actionResolution: { kind: "through-ball", status: "targeting", passerId: "blue-1", target: { x: 6, y: 3 } },
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "MOVE" }).disabled, true);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "PASS" }).disabled, true);
  assert.equal(selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "GROUP_MOVE" }).disabled, true);
});

// v20.56.30: Shot's Inspector action row control gets the same visible
// cancel affordance Pass already had ("CANCEL PASS"), instead of staying
// disabled while a Shot is active with no way to trigger it from the row.
test("an active Shot shows CANCEL SHOT on its own Inspector control and stays enabled", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 14, y: 5 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 14, y: 5 }],
    actionResolution: { kind: "shot", status: "targeting", shooterId: "blue-1", team: "blue" },
    tracker: { gameStarted: true, startingTeam: "blue", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] }] });
  const projection = selectSinglePlayerInspectorActionPresentation(state, context, { piece: state.pieces[1], type: "SHOT" });
  assert.equal(projection.disabled, false);
  assert.equal(projection.label, "CANCEL SHOT");
  // A different piece's Shot button is unaffected.
  const otherState = { ...state, pieces: [...state.pieces, { id: "blue-2", team: "A", cardId: "blue-card", x: 12, y: 5 }] };
  const otherProjection = selectSinglePlayerInspectorActionPresentation(otherState, context, { piece: otherState.pieces[2], type: "SHOT" });
  assert.equal(otherProjection.label, "SHOT");
});

test("Bonus Move projection preserves cost and remaining speed for a rejected destination", () => {
  const state = createGameState({
    gameMode: "match",
    pieces: [{ id: "ball", team: "BALL", x: 3, y: 3 }, { id: "blue-1", team: "A", cardId: "blue-card", x: 3, y: 3 }],
    actionContinuation: { id: "bonus-blue", kind: "bonus-card-action", team: "blue", status: "ready" },
    tracker: { gameStarted: true, startingTeam: "red", currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ gameplayCards: [{ id: "blue-card", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] }] });
  const projection = selectSinglePlayerBonusMovePresentation(state, context, { piece: state.pieces[1], x: 9, y: 3 });
  assert.equal(projection.legal, false);
  assert.equal(projection.reason, "speed");
  assert.equal(projection.geometry.cost, 6);
  assert.equal(projection.moveCost, 6);
  assert.equal(projection.remaining, 4);
});

test("selected AVM is included in the official pending-roll preview, capped separately from the card stat", () => {
  const state = createGameState({
    gameMode: "match",
    actionResolution: { kind: "lofted-through-ball", status: "awaiting-roll", team: "blue", plan: { rollPreview: { modifier: -1, rawModifier: -1, modifierCap: 4, modifierSources: [{ label: "Lofted Through", value: 10, source: "card" }, { label: "Disadvantage", value: -1, source: "area" }] } } },
    rollModifierOpportunities: [{ id: "avm", team: "blue", modifierType: "majorAdvantage", availableFromTurn: 1, expiresAfterTurn: 1 }],
    tracker: { gameStarted: true, currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ ruleSet: { diceModifiers: { advantage: 1, majorAdvantage: 3, disadvantage: -1, majorDisadvantage: -3, stackCap: 4 } } });
  const preview = selectSinglePlayerRollPromptPresentation(state, context, { team: "blue", selectedModifierType: "majorAdvantage" });
  // Only disadvantage(-1) + majorAdvantage(3) = 2 is ever capped (well under
  // ±4, so nothing actually clips); the card stat (10) is always added back
  // in full — confirmed live with the user, see rollModifierMath.mjs.
  assert.equal(preview.rawModifier, 12);
  assert.equal(preview.modifier, 12);
  assert.equal(preview.capped, false);
  assert.equal(preview.modifierSources.at(-1).label, "Major Advantage");
});

test("selected AV is included in the interception prompt total, including the card statistic", () => {
  const state = createGameState({
    gameMode: "match",
    actionResolution: { kind: "pass", status: "awaiting-interception-roll", rollPresentation: { defenderStatValue: 2, modifier: 1, rawModifier: 1, modifierCap: 4, modifierSources: [{ label: "Interception", value: 2, source: "card" }, { label: "Advantage", value: 1, source: "order" }] } },
    rollModifierOpportunities: [{ id: "av", team: "blue", modifierType: "advantage", availableFromTurn: 1, expiresAfterTurn: 1 }],
    tracker: { gameStarted: true, currentTurn: 1, turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 } },
  });
  const context = createMatchContext({ ruleSet: { diceModifiers: { advantage: 1, majorAdvantage: 3, disadvantage: -1, majorDisadvantage: -3, stackCap: 4 } } });
  const preview = selectSinglePlayerRollPromptPresentation(state, context, { team: "blue", selectedModifierType: "advantage" });
  // card(2) + order(1) + advantage(1) = 4, exactly at the frozen ±4 cap.
  assert.equal(preview.rawModifier, 4);
  assert.equal(preview.modifier, 4);
  assert.equal(preview.capped, false);
  assert.equal(preview.modifierSources.at(-1).source, "team-modifier-token");
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
