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
  assert.equal(exported.rulesetSnapshot.mode, "MANUAL_UNAUTOMATED");
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

test("unlinked physical moves are explicitly exported as Manual Move", () => {
  const before = state();
  const after = state({ pieces: [{ ...before.pieces[0], x: 11 }, before.pieces[1], before.pieces[2]] });
  let timeline = createTimeline(before);
  timeline = commitTimelineEntry(timeline, { id: "manual_1", type: "PIECE_MOVED", label: "Blue Veer → I12", team: "blue", before, after });
  const exported = createAiAnalysisExport({ cardSnapshot: cards, timeline });
  assert.equal(exported.semanticTimeline[0].movementReason, "MANUAL_MOVE");
  assert.equal(exported.semanticTimeline[0].resolution.status, "NOT_AUTOMATED");
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
