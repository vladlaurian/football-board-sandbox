import test from "node:test";
import assert from "node:assert/strict";
import { commitTimelineEntry, createTimeline, forkTimeline } from "./timelineEngine.mjs";
import {
  createMatchRecording,
  matchRecordingNeedsExport,
  readMatchRecording,
  referencedCardIdsForTimeline,
  selectRecordingCards,
} from "./matchRecording.mjs";

test("match export freshness follows the exact timeline revision", () => {
  const initial = { gameMode: "match", pieces: [] };
  let timeline = createTimeline(initial, { recordingId: "revision-test" });
  assert.equal(matchRecordingNeedsExport(null, undefined), false);
  assert.equal(matchRecordingNeedsExport(timeline, undefined), true);
  assert.equal(matchRecordingNeedsExport(timeline, timeline.revision), false);

  timeline = commitTimelineEntry(timeline, {
    type: "ACTION",
    before: initial,
    after: { ...initial, tracker: { gameStarted: true } },
  });
  assert.equal(matchRecordingNeedsExport(timeline, 0), true);
  assert.equal(matchRecordingNeedsExport(timeline, timeline.revision), false);
});

test("a match recording keeps the initial state, actions and exact card snapshot", () => {
  const initial = { gameMode: "match", pieces: [{ id: "A-1", cardId: "card-1", x: 1, y: 1 }] };
  let timeline = createTimeline(initial, { recordingId: "exportable-match" });
  timeline = commitTimelineEntry(timeline, {
    id: "move-1",
    type: "PIECE_MOVED",
    before: initial,
    after: { ...initial, pieces: [{ ...initial.pieces[0], x: 2 }] },
  });
  const recording = createMatchRecording(timeline, {
    appVersion: "v17.0",
    cardSnapshot: [{ id: "card-1", name: "Test Player", speed: 6 }],
  });
  const loaded = readMatchRecording(JSON.parse(JSON.stringify(recording)));
  assert.equal(loaded.timeline.recordingId, "exportable-match");
  assert.equal(loaded.timeline.entries.length, 1);
  assert.equal(loaded.cardSnapshot[0].name, "Test Player");
  assert.equal(loaded.finalState.pieces[0].x, 2);
  assert.equal(loaded.ruleSetSnapshot.name, "Default Rules");
  assert.equal(loaded.ruleSetSnapshot.actions.pass.rollMode, "manual");
});

test("a future replay branch retains its origin metadata", () => {
  const initial = { gameMode: "match", pieces: [] };
  const source = createTimeline(initial, { recordingId: "source-match" });
  const branch = forkTimeline(source, 0);
  assert.equal(branch.parentRecordingId, "source-match");
  assert.equal(branch.cursor, 0);
});

test("a recording selects every card referenced anywhere in the timeline", () => {
  const initial = { gameMode: "match", pieces: [{ id: "A-1", cardId: "card-1" }] };
  let timeline = createTimeline(initial);
  timeline = commitTimelineEntry(timeline, {
    type: "CARD_CHANGED",
    before: initial,
    after: { gameMode: "match", pieces: [{ id: "A-1", cardId: "card-2" }] },
  });
  assert.deepEqual(referencedCardIdsForTimeline(timeline).sort(), ["card-1", "card-2"]);
  assert.deepEqual(
    selectRecordingCards(timeline, [
      { id: "card-1", name: "Initial" },
      { id: "card-2", name: "Replacement" },
      { id: "unused", name: "Unused" },
    ]).map(card => card.id),
    ["card-1", "card-2"]
  );
});

test("invalid recording payloads are rejected instead of creating an empty replay", () => {
  assert.throws(() => createMatchRecording(null), /timeline/i);
  assert.throws(() => readMatchRecording({
    recordingType: "football-board-match-recording",
    schemaVersion: 1,
    timeline: null,
  }), /timeline/i);
  assert.throws(() => readMatchRecording({
    recordingType: "football-board-match-recording",
    schemaVersion: 1,
    timeline: createTimeline({ gameMode: "match" }),
    cardSnapshot: {},
  }), /card snapshot/i);
});
