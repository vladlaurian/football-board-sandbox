import test from "node:test";
import assert from "node:assert/strict";
import {
  commitTimelineEntry,
  createTimeline,
  forkTimeline,
  moveTimelineCursor,
  redoTimeline,
  redoTimelineGroup,
  undoTimeline,
  undoTimelineGroup,
} from "./timelineEngine.mjs";

function state(x) {
  return {
    gameMode: "match",
    pieces: [{ id: "A-1", team: "A", x, y: 2 }],
    movementStateByPieceId: {},
  };
}

test("commit, undo and redo use the same timeline entry", () => {
  let timeline = createTimeline(state(1), { recordingId: "match-test" });
  timeline = commitTimelineEntry(timeline, {
    id: "move-1",
    type: "PIECE_MOVED",
    label: "Blue A-1 → C3",
    before: state(1),
    after: state(2),
  });
  assert.equal(timeline.entries.length, 1);
  assert.equal(timeline.cursor, 1);

  const undone = undoTimeline(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.state.pieces[0].x, 1);

  const redone = redoTimeline(undone.timeline);
  assert.equal(redone.timeline.cursor, 1);
  assert.equal(redone.state.pieces[0].x, 2);
});

test("group undo and redo treat activation plus movements as one action", () => {
  let timeline = createTimeline(state(1));
  timeline = commitTimelineEntry(timeline, { type: "MOVE_ACTIVATED", groupId: "move-a", before: state(1), after: state(1) }, { allowNoop: true });
  timeline = commitTimelineEntry(timeline, { type: "PIECE_MOVED", groupId: "move-a", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { type: "PIECE_MOVED", groupId: "move-a", before: state(2), after: state(3) });

  const undone = undoTimelineGroup(timeline);
  assert.equal(undone.timeline.cursor, 0);
  assert.equal(undone.entries.length, 3);
  assert.equal(undone.state.pieces[0].x, 1);

  const redone = redoTimelineGroup(undone.timeline);
  assert.equal(redone.timeline.cursor, 3);
  assert.equal(redone.entries.length, 3);
  assert.equal(redone.state.pieces[0].x, 3);
});

test("a new action after undo removes the abandoned redo branch", () => {
  let timeline = createTimeline(state(1));
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(2), after: state(3) });
  timeline = undoTimeline(timeline).timeline;
  timeline = commitTimelineEntry(timeline, { type: "MOVE", before: state(2), after: state(8) });
  assert.equal(timeline.entries.length, 2);
  assert.equal(timeline.entries[1].after.pieces[0].x, 8);
  assert.equal(redoTimeline(timeline).state, null);
});

test("cursor navigation and fork preserve the original recording", () => {
  let timeline = createTimeline(state(1), { recordingId: "original" });
  timeline = commitTimelineEntry(timeline, { id: "one", type: "MOVE", before: state(1), after: state(2) });
  timeline = commitTimelineEntry(timeline, { id: "two", type: "MOVE", before: state(2), after: state(3) });
  const moved = moveTimelineCursor(timeline, 1);
  assert.equal(moved.state.pieces[0].x, 2);

  const branch = forkTimeline(timeline, 1);
  assert.equal(branch.parentRecordingId, "original");
  assert.equal(branch.forkedAtEntryId, "one");
  assert.equal(branch.initialState.pieces[0].x, 2);
  assert.equal(timeline.entries.length, 2);
});
