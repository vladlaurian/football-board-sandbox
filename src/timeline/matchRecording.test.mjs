import test from "node:test";
import assert from "node:assert/strict";
import { commitTimelineEntry, createTimeline, forkTimeline } from "./timelineEngine.mjs";
import { createMatchRecording, readMatchRecording } from "./matchRecording.mjs";

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
});

test("a future replay branch retains its origin metadata", () => {
  const initial = { gameMode: "match", pieces: [] };
  const source = createTimeline(initial, { recordingId: "source-match" });
  const branch = forkTimeline(source, 0);
  assert.equal(branch.parentRecordingId, "source-match");
  assert.equal(branch.cursor, 0);
});
