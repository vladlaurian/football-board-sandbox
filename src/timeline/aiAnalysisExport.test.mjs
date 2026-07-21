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
  assert.equal(exported.semanticTimeline[1].actionId, "move_1");
  assert.equal(exported.semanticTimeline[1].movementReason, "NORMAL_MOVE");
  assert.equal(exported.semanticTimeline[1].movements[0].origin, "I11");
  assert.equal(exported.semanticTimeline[1].movements[0].destination, "I15");
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
  assert.equal(exported.schemaVersion, 9);
  assert.equal(exported.semanticTimeline[0].continuation.kind, "bonus-card-action");
  assert.equal(exported.semanticTimeline[0].continuation.resumePolicy.nextTurn, 2);
  assert.equal(exported.semanticTimeline[0].continuation.resumePolicy.type, "advance-turn");
  assert.equal(exported.semanticTimeline[0].actionTransaction.undoMode, "atomic");
  assert.equal(exported.finalState.actionContinuation.status, "ready");
  assert.equal(exported.finalState.actionContinuation.transaction.id, "bonus_1");
  assert.equal(exported.semanticTimeline[0].actionEconomyAfter.teamActionsUsed, 0);
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
