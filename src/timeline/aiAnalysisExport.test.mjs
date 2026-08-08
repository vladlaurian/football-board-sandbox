import assert from "node:assert/strict";
import test from "node:test";
import { createTimeline, commitTimelineEntry, undoTimeline } from "./timelineEngine.mjs";
import { createAiAnalysisExport } from "./aiAnalysisExport.mjs";

function state(overrides = {}) {
  return {
    settings: { cols: 44, rows: 29, goalDepth: 1, goalWidth: 5, boxDepth: 8, boxWidth: 17 },
    gameMode: "match",
    pieces: [
      { id: "A-1", team: "A", label: "ST", cardId: "blue-card", x: 10, y: 8 },
      { id: "B-1", team: "B", label: "CB", cardId: "red-card", x: 20, y: 8 },
      { id: "BALL", team: "BALL", label: "●", x: 10, y: 8 },
    ],
    tracker: {
      gameStarted: true,
      startingTeam: "blue",
      currentTurn: 1,
      usedActions: { blue: 0, red: 0 },
      actionLog: { blue: [], red: [] },
      matchActionState: {},
      turnPhase: "attack",
      settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    dice: { dieType: 20, blueResult: null, redResult: null },
    ...overrides,
  };
}

const cards = [
  {
    id: "blue-card", name: "Veer", position: "RW", passiveAttributes: [{ name: "Ball Control", value: 16 }],
    bonuses: [{ name: "Dribbling", value: 2 }], preferredFoot: "Right", specialAbility: "NONE",
    defensiveArea: [{ dx: 1, dy: 0 }], graphics: { frontExportDataUrl: "large-image-data" },
  },
  { id: "red-card", name: "Callum", position: "LB", passiveAttributes: [], bonuses: [], defensiveArea: [] },
];

test("AI analysis export is compact, directional, and keeps one action ID across Move activation and movement", () => {
  const before = state();
  const activated = state({
    tracker: {
      ...before.tracker,
      usedActions: { blue: 1, red: 0 },
      actionLog: { blue: [{ id: "move_1", type: "MOVE", pieceId: "A-1" }], red: [] },
      personalActionsByPieceId: { "A-1": 1 },
      matchActionState: { byPieceId: { "A-1": { moveAuthorized: true, moveGroupId: "move_1" } } },
    },
  });
  const moved = state({
    tracker: activated.tracker,
    pieces: [
      { ...before.pieces[0], x: 14 },
      before.pieces[1],
      { ...before.pieces[2], x: 14 },
    ],
  });
  let timeline = createTimeline(before, { recordingId: "match_1" });
  timeline = commitTimelineEntry(timeline, { id: "move_1", type: "MOVE_ACTIVATED", label: "Blue MOVE: Veer", team: "blue", groupId: "move_1", before, after: activated }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { id: "move_piece_1", type: "PIECE_MOVED", label: "Blue Veer → I15", team: "blue", groupId: "move_1", before: activated, after: moved });

  const exported = createAiAnalysisExport({ name: "Test", appVersion: "v17.7", cardSnapshot: cards, timeline });
  assert.equal(exported.matchContext.teams.blue.attacksToward, "right");
  assert.equal(exported.matchContext.teams.red.attacksToward, "left");
  assert.equal(exported.matchContext.openingAttackingTeam, "blue");
  assert.equal(exported.teams, undefined);
  assert.equal(exported.initialState.tracker.currentAttackingTeam, "blue");
  assert.equal(exported.initialState.tracker.startingTeam, undefined);
  assert.equal(exported.rulesetSnapshot.mode, "MANUAL_UNAUTOMATED");
  assert.equal(exported.rulesetSnapshot.ruleSet.actions.pass.rollMode, "manual");
  assert.equal(exported.gameplayCardSnapshot[0].graphics, undefined);
  assert.deepEqual(exported.gameplayCardSnapshot[0].bonuses, [{ name: "Dribbling", value: 2 }]);
  assert.equal(exported.semanticTimeline[0].actionId, "move_1");
  assert.equal(exported.semanticTimeline[0].actor.name, "Veer");
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.teamActionsUsed, 1);
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.actorActionsUsed, 1);
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.actorActionsMaximum, 3);
  assert.equal(exported.semanticTimeline[1].actionId, "move_1");
  assert.equal(exported.semanticTimeline[1].movementReason, "NORMAL_MOVE");
  assert.equal(exported.semanticTimeline[1].movements[0].origin, "I11");
  assert.equal(exported.semanticTimeline[1].movements[0].destination, "I15");
});

test("AI export reads a position from the card and ignores a Single Player puck label", () => {
  const before = state({
    pieces: [
      { id: "A-1", team: "A", label: "ST", cardId: "blue-card", x: 10, y: 8 },
      { id: "B-1", team: "B", label: "CB", cardId: "red-card", x: 20, y: 8 },
      { id: "A-2", team: "A", label: "LW", cardId: null, x: 11, y: 8 },
      { id: "BALL", team: "BALL", label: "●", x: 10, y: 8 },
    ],
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline: createTimeline(before) });
  assert.equal(exported.initialState.pieces.find(piece => piece.pieceId === "A-1").position, "RW");
  assert.equal(exported.initialState.pieces.find(piece => piece.pieceId === "A-2").position, null);
});

test("AI export preserves legacy puck-label fallback only when explicitly requested for Manual Multiplayer", () => {
  const before = state({
    pieces: [
      { id: "A-1", team: "A", label: "LB", cardId: null, x: 10, y: 8 },
      { id: "BALL", team: "BALL", label: "●", x: 10, y: 8 },
    ],
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline: createTimeline(before) }, { legacyPuckLabels: true });
  assert.equal(exported.initialState.pieces.find(piece => piece.pieceId === "A-1").position, "LB");
});

test("MATCH_STARTED belongs to turn 1 and opening attack never changes with a later possession change", () => {
  const before = state({
    tracker: { ...state().tracker, gameStarted: false, startingTeam: "red", currentTurn: 0 },
  });
  const started = state({
    tracker: { ...before.tracker, gameStarted: true, startingTeam: "red", currentTurn: 1 },
  });
  const possessionChanged = state({
    tracker: { ...started.tracker, startingTeam: "blue" },
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "start", type: "MATCH_STARTED", label: "Match started: Red attacks", team: "red", before, after: started });
  timeline = commitTimelineEntry(timeline, { id: "possession", type: "POSSESSION_CHANGED", label: "Possession changed: Blue attacks", team: "blue", before: started, after: possessionChanged });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.matchContext.openingAttackingTeam, "red");
  assert.equal(exported.semanticTimeline[0].turnId, "turn_1");
  assert.equal(exported.semanticTimeline[0].phase, "attack");
  assert.equal(exported.initialState.tracker.currentAttackingTeam, "red");
  assert.equal(exported.finalState.tracker.currentAttackingTeam, "blue");
});

test("unlinked physical moves are explicitly exported as Manual Move", () => {
  const before = state();
  const after = state({ pieces: [{ ...before.pieces[0], x: 11 }, before.pieces[1], before.pieces[2]] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "manual_1", type: "PIECE_MOVED", label: "Blue Veer → I12", team: "blue", before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].movementReason, "MANUAL_MOVE");
  assert.equal(exported.semanticTimeline[0].resolution.status, "NOT_AUTOMATED");
});

test("manual declared actions remain explicit rather than pretending their rule was automated", () => {
  const before = state();
  const after = state({
    tracker: {
      ...before.tracker,
      usedActions: { blue: 1, red: 0 },
      actionLog: { blue: [{ id: "manual_dribble", type: "DRIBBLE", pieceId: "A-1" }], red: [] },
    },
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "manual_dribble", type: "MANUAL_ACTION_DECLARED", label: "Blue DRIBBLE: Veer (manual)", team: "blue",
    metadata: { actionType: "DRIBBLE", pieceId: "A-1", manualResolutionRequired: true }, before, after,
  }, { allowNoop: true });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].type, "DRIBBLE");
  assert.equal(exported.semanticTimeline[0].resolution.status, "MANUAL_DECLARATION");
  assert.equal(exported.semanticTimeline[0].explicitOutcome, "MANUAL_RESOLUTION_REQUIRED");
});

test("AI export preserves canonical Tracker markers and Through Ball recovery facts", () => {
  const before = state({ ruleSet: { actions: { throughBall: { maxDistance: 11 } } } });
  const after = state({
    ruleSet: before.ruleSet,
    tracker: { ...before.tracker, usedActions: { blue: 1, red: 0 }, actionLog: { blue: [{ id: "tb", type: "THROUGH_BALL", trackerMarker: "TB", pieceId: "A-1" }], red: [] } },
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "tb", type: "THROUGH_BALL_AUTO_RECOVERY_PENDING", label: "Through Ball recovered", team: "red",
    metadata: { passerId: "A-1", target: { x: 15, y: 8 }, defenseDistance: 2, attackDistance: 4, defenseSpeed: 5, attackSpeed: 4, defenderWins: true }, before, after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.rulesetSnapshot.ruleSet.actions.throughBall.maxDistance, 11);
  assert.deepEqual(exported.semanticTimeline[0].trackerActions[0], { id: "tb", type: "THROUGH_BALL", trackerMarker: "TB", pieceId: "A-1", team: "blue" });
  assert.equal(exported.semanticTimeline[0].resolution.throughBall.defenderWins, true);
  assert.equal(exported.semanticTimeline[0].resolution.throughBall.defenseDistance, 2);
});

test("Free Ball is explicitly identified in AI export", () => {
  const before = state();
  const after = state({ pieces: [before.pieces[0], before.pieces[1], { ...before.pieces[2], x: 14, y: 9 }] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "free_ball_1",
    type: "BALL_MOVED",
    label: "Free Ball → L15",
    team: null,
    metadata: { movementReason: "FREE_BALL" },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].type, "MOVE");
  assert.equal(exported.semanticTimeline[0].movementReason, "FREE_BALL");
  assert.equal(exported.semanticTimeline[0].movements[0].isBall, true);
});

test("Free Move is exported as an explicit administrative correction without Tracker consumption", () => {
  const before = state();
  const after = state({ pieces: [{ ...before.pieces[0], x: 16, y: 11 }, before.pieces[1], before.pieces[2]] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "free_move_1", type: "FREE_MOVE", label: "Blue Free Move: Veer → P12", team: "blue",
    metadata: { movementReason: "FREE_MODE", administrative: true }, before, after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].type, "MOVE");
  assert.equal(exported.semanticTimeline[0].movementReason, "FREE_MODE");
  assert.equal(exported.semanticTimeline[0].eventSource, "MANUAL_CORRECTION");
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.teamActionsUsed, 0);
});

test("Three Two is explicitly identified in AI export", () => {
  const before = state();
  const after = state({ pieces: [{ ...before.pieces[0], x: 11 }, before.pieces[1], before.pieces[2]] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "three_two_1",
    type: "THREE_TWO_MOVE",
    label: "Blue Veer → I12 (3/2)",
    team: "blue",
    metadata: { movementReason: "THREE_TWO" },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].type, "MOVE");
  assert.equal(exported.semanticTimeline[0].movementReason, "THREE_TWO");
});

test("AI export distinguishes a deliberately chosen test roll from a random roll", () => {
  const before = state();
  const after = state({ dice: { ...before.dice, blueResult: 20 } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "chosen_roll",
    type: "DICE_ROLLED",
    label: "Blue D20: 20 (chosen)",
    team: "blue",
    metadata: { rollSource: "CHOSEN", chosenResult: 20 },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.deepEqual(exported.semanticTimeline[0].diceRoll, {
    source: "CHOSEN",
    chosenResult: 20,
    eventId: null,
    requestId: null,
    actionId: null,
    subjectId: null,
    reactionIndex: null,
  });
});

test("AI export identifies an Extra Roll as an administrative die event", () => {
  const before = state();
  const after = state({ dice: { ...before.dice, blueResult: 7, dieType: 12 } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "extra_roll",
    type: "EXTRA_ROLL",
    label: "Blue EXTRA D12: 7 (chosen)",
    team: "blue",
    metadata: { rollSource: "CHOSEN", chosenResult: 7, dieType: 12, result: 7, administrative: true },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].type, "EXTRA_ROLL");
  assert.equal(exported.semanticTimeline[0].diceRoll.administrative, true);
  assert.equal(exported.semanticTimeline[0].diceRoll.chosenResult, 7);
});

test("AI export retains the exact interception modifier sources and cap", () => {
  const before = state({
    actionResolution: {
      kind: "pass",
      status: "awaiting-interception-roll",
      plan: {
        pathMode: "corner-to-center", origin: { x: 10, y: 8 }, requestedTarget: { x: 15, y: 8 }, target: { x: 15, y: 8 }, distance: 5,
        isLong: false, foot: { foot: "Right", dominant: false }, passerPass: 14, directHit: null,
        interceptorPriority: {
          method: "passer-square-center-to-defender-square-center",
          metric: "euclidean-distance",
          tieBreak: "defending-team-choice",
          selections: [{ atIndex: 0, selectedPieceId: "blue-1", candidatePieceIds: ["blue-1", "blue-2"], priorityDistanceSquared: 25, reason: "defender-choice-equal-distance" }],
        },
        interceptors: [{ defender: { id: "blue-1" }, firstEntryT: 0.25, priorityDistance: 5, priorityDistanceSquared: 25, priorityMethod: "passer-square-center-to-defender-square-center", orderModifier: 0 }],
      },
    },
  });
  const after = state({ pieces: before.pieces, actionResolution: null });
  const interceptionResolution = {
    natural: 12, total: 16, outcome: "interception", passerPass: 14, rawModifier: 5, modifier: 4, modifierCap: 4, capped: true,
    modifierSources: [{ label: "Interception", value: 3, source: "card" }, { label: "Advantage", value: 1, source: "interceptor-order", detail: "second interceptor" }, { label: "Advantage", value: 1, source: "non-preferred-foot", detail: "non-preferred foot" }],
  };
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "pass_roll", type: "PASS_INTERCEPTED", label: "Blue intercepts", team: "blue", metadata: { interceptionResolution }, before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  const roll = exported.semanticTimeline[0].resolution.interceptionRoll;
  assert.equal(roll.appliedModifier, 4);
  assert.equal(roll.rawModifier, 5);
  assert.equal(roll.capped, true);
  assert.equal(roll.modifierSources[2].detail, "non-preferred foot");
  assert.equal(exported.semanticTimeline[0].resolution.pass.interceptorPriority.tieBreak, "defending-team-choice");
  assert.equal(exported.semanticTimeline[0].resolution.pass.interceptorOrder[0].priorityDistance, 5);
  assert.equal(exported.semanticTimeline[0].resolution.pass.interceptorOrder[0].priorityReason, "defender-choice-equal-distance");
});

test("AI export identifies an Engine-owned interception math result before Pass consequences", () => {
  const before = state({ actionResolution: { kind: "pass", status: "awaiting-interception-resolution", plan: { interceptors: [] }, lastRollEvent: { id: "roll-1", natural: 12 } } });
  const after = state({ actionResolution: { ...before.actionResolution, status: "interception-resolved", lastResolution: { natural: 12, total: 16, outcome: "interception", passerPass: 14, rawModifier: 4, modifier: 4, modifierCap: 4, capped: false } } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "interception-resolved", type: "PASS_INTERCEPTION_RESOLVED", label: "Interception result", team: "red", metadata: { interceptionResolution: after.actionResolution.lastResolution }, before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].explicitOutcome, "INTERCEPTION_ROLL_RESOLVED");
  assert.equal(exported.semanticTimeline[0].resolution.interceptionRoll.outcome, "interception");
});

test("AI export identifies an Engine-owned missed interception consequence", () => {
  const before = state({ actionResolution: { kind: "pass", status: "interception-resolved", lastResolution: { natural: 1, outcome: "pass-continues" } } });
  const after = state({ actionResolution: { kind: "pass", status: "awaiting-interception-roll", naturalOnePenalty: -1 } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "interception-missed", type: "PASS_INTERCEPTION_MISSED", label: "Pass continues", team: "red", before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].explicitOutcome, "INTERCEPTION_MISSED");
});

test("AI export retains a Shot result checkpoint without inventing a restart consequence", () => {
  const plan = {
    origin: { x: 10, y: 8 }, endpoint: { x: 44.5, y: 8.5 }, distance: 12.2, band: "distant-long-shot",
    modifierSources: [{ type: "disadvantage", value: -1, reason: "Distant Long Shot band" }],
  };
  const before = state({ actionResolution: { kind: "shot", status: "awaiting-roll", shooterId: "A-1", goalkeeperId: "B-1", target: { side: "right", depth: 0, y: 2 }, plan } });
  const after = state({ actionResolution: { ...before.actionResolution, status: "result-display", result: { natural: 20, attackerStat: 12, goalkeeperStat: 10, modifier: -1, total: 31, outcome: "goal" } } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "shot-result", type: "SHOT_RESOLVED", label: "Shot result", team: "blue", metadata: { outcome: "goal", consequenceApplied: false }, before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  const event = exported.semanticTimeline[0];
  assert.equal(event.explicitOutcome, "SHOT_GOAL");
  assert.equal(event.resolution.shot.result.outcome, "goal");
  assert.equal(event.resolution.shot.consequenceApplied, false);
  assert.equal(event.possessionBefore.ballCarrierId, event.possessionAfter.ballCarrierId);
});

test("AI export gives SHOT_ROLLED its own semantic identity, separate from SHOT_RESOLVED's SHOT_<OUTCOME>", () => {
  const plan = { origin: { x: 10, y: 8 }, endpoint: { x: 44.5, y: 8.5 }, distance: 12.2, band: "finishing", modifierSources: [] };
  const rollEvent = { id: "roll-1", requestId: "shot_roll_shot-1", actionId: "shot-1", team: "blue", dieType: 20, natural: 20, source: "RANDOM" };
  const before = state({ actionResolution: { kind: "shot", status: "awaiting-roll", shooterId: "A-1", goalkeeperId: "B-1", target: { side: "right", depth: 0, y: 2 }, plan } });
  const after = state({ actionResolution: { ...before.actionResolution, status: "awaiting-shot-resolution", lastRollEvent: rollEvent } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "shot-rolled", type: "SHOT_ROLLED", label: "Blue D20: 20 (SHOT)", team: "blue",
    metadata: { rollSource: "RANDOM", rollEvent, delayedResolution: { actionId: "shot-1" } },
    before, after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  const event = exported.semanticTimeline[0];
  assert.equal(event.type, "SHOT_ROLLED");
  assert.equal(event.explicitOutcome, "SHOT_ROLL_RECORDED");
  assert.equal(event.diceRoll.eventId, "roll-1");
  assert.equal(event.diceRoll.requestId, "shot_roll_shot-1");
});

test("AI export gives LOFTED_THROUGH_BALL_ROLLED its own semantic identity, matching SHOT_ROLLED's parity", () => {
  const plan = { origin: { x: 10, y: 8 }, endpoint: { x: 20, y: 8 }, distance: 10, difficultyThreshold: 16, rollStatValue: 10, foot: { dominant: true } };
  const rollEvent = { id: "lt-roll-1", requestId: "lt-roll-req", actionId: "lt-1", team: "blue", dieType: 20, natural: 15, source: "RANDOM" };
  const before = state({ actionResolution: { kind: "lofted-through-ball", status: "awaiting-roll", passerId: "A-1", team: "blue", target: { x: 20, y: 8 }, plan } });
  const after = state({ actionResolution: { ...before.actionResolution, status: "awaiting-lofted-resolution", lastRollEvent: rollEvent } });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "lt-rolled", type: "LOFTED_THROUGH_BALL_ROLLED", label: "Blue D20: 15 (LOFTED_THROUGH_BALL)", team: "blue",
    metadata: { rollSource: "RANDOM", rollEvent, delayedResolution: { actionId: "lt-1" } },
    before, after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  const event = exported.semanticTimeline[0];
  assert.equal(event.type, "LOFTED_THROUGH_BALL_ROLLED");
  assert.equal(event.explicitOutcome, "LOFTED_THROUGH_BALL_ROLL_RECORDED");
  assert.equal(event.diceRoll.eventId, "lt-roll-1");
  assert.equal(event.diceRoll.requestId, "lt-roll-req");
});

test("AI export retains a pending bonus-action continuation without adding Tracker economy", () => {
  const before = state();
  const after = state({
    actionContinuation: {
      id: "bonus_1",
      kind: "bonus-card-action",
      source: "natural-20-interception",
      team: "blue",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "blue", nextTurn: 2, phase: "attack" },
      actionType: null,
      pieceId: null,
      transaction: {
        id: "bonus_1",
        actionType: "BONUS_ACTION",
        team: "blue",
        source: "natural-20-interception",
        undoMode: "atomic",
      },
    },
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "natural_20",
    type: "PASS_NATURAL_20",
    label: "Natural 20",
    team: "blue",
    metadata: { actionTransaction: after.actionContinuation.transaction },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.schemaVersion, 10);
  assert.equal(exported.semanticTimeline[0].continuation.kind, "bonus-card-action");
  assert.equal(exported.semanticTimeline[0].continuation.resumePolicy.nextTurn, 2);
  assert.equal(exported.semanticTimeline[0].continuation.resumePolicy.type, "advance-turn");
  assert.equal(exported.semanticTimeline[0].actionTransaction.undoMode, "atomic");
  assert.equal(exported.finalState.actionContinuation.status, "ready");
  assert.equal(exported.finalState.actionContinuation.transaction.id, "bonus_1");
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.teamActionsUsed, 0);
});

test("AI export retains Bonus Action origin and replacement-chain identity", () => {
  const before = state();
  const after = state({
    actionContinuation: {
      id: "bonus_red_2",
      kind: "bonus-card-action",
      source: "natural-20-interception",
      team: "red",
      status: "ready",
      origin: {
        actionType: "PASS",
        outcome: "INTERCEPTION",
        reason: "NATURAL_20",
        sourceEntryId: "pass_red_2",
        parentContinuationId: "bonus_blue_1",
      },
    },
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "bonus_red_2_granted",
    type: "PASS_NATURAL_20",
    team: "red",
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.deepEqual(exported.semanticTimeline[0].continuation.origin, {
    actionType: "PASS",
    outcome: "INTERCEPTION",
    reason: "NATURAL_20",
    sourceEntryId: "pass_red_2",
    parentContinuationId: "bonus_blue_1",
  });
});

test("an older ungrouped physical move still links to the preceding tracker Move activation", () => {
  const before = state();
  const activated = state({
    tracker: {
      ...before.tracker,
      usedActions: { blue: 1, red: 0 },
      actionLog: { blue: [{ id: "legacy_move", type: "MOVE", pieceId: "A-1" }], red: [] },
    },
  });
  const moved = state({ pieces: [{ ...before.pieces[0], x: 11 }, before.pieces[1], before.pieces[2]], tracker: activated.tracker });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "legacy_move", type: "MOVE_ACTIVATED", label: "Blue MOVE: Veer", team: "blue", groupId: "legacy_move", before, after: activated }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { id: "legacy_move_piece", type: "PIECE_MOVED", label: "Blue Veer → I12", team: "blue", before: activated, after: moved });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[1].actionId, "legacy_move");
  assert.equal(exported.semanticTimeline[1].actionLink, "TRACKER_MOVE_ACTIVATION");
  assert.equal(exported.semanticTimeline[1].movementReason, "NORMAL_MOVE");
});

test("AI analysis excludes undone future steps and cards from the inactive redo branch", () => {
  const before = state();
  const after = state({ pieces: [{ ...before.pieces[0], cardId: "future-card", x: 11 }, before.pieces[1], before.pieces[2]] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "future", type: "PIECE_MOVED", label: "Future move", team: "blue", before, after });
  timeline = undoTimeline(timeline).timeline;
  const futureCard = { id: "future-card", name: "Future", position: "ST", passiveAttributes: [], bonuses: [], defensiveArea: [] };
  const exported = createAiAnalysisExport({ cardSnapshot: [...cards, futureCard], timeline });
  assert.equal(exported.semanticTimeline.length, 0);
  assert.equal(exported.matchSummary.retainedTimelineEntryCount, 1);
  assert.deepEqual(exported.gameplayCardSnapshot.map(card => card.id).sort(), ["blue-card", "red-card"]);
});


test("AI export records an explicitly declined bonus action separately from a completed one", () => {
  const before = state({
    actionContinuation: {
      id: "bonus_declined",
      kind: "bonus-card-action",
      source: "natural-20-interception",
      team: "red",
      status: "ready",
      resumePolicy: { type: "advance-turn", team: "red", nextTurn: 4, phase: "attack" },
      actionType: null,
      pieceId: null,
    },
  });
  const after = state({
    tracker: { ...before.tracker, startingTeam: "red", currentTurn: 4 },
    actionContinuation: null,
  });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, {
    id: "bonus_declined_event",
    type: "BONUS_ACTION_DECLINED",
    label: "Red declines the bonus action — Turn 4",
    team: "red",
    metadata: {
      continuationId: "bonus_declined",
      bonusAction: { used: false, declined: true, actionType: null, pieceId: null },
    },
    before,
    after,
  });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].explicitOutcome, "BONUS_ACTION_DECLINED");
  assert.deepEqual(exported.semanticTimeline[0].bonusAction, {
    used: false,
    declined: true,
    actionType: null,
    pieceId: null,
    continuationId: "bonus_declined",
  });
});
