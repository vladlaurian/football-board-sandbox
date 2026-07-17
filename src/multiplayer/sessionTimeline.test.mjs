import test from "node:test";
import assert from "node:assert/strict";
import { commitTimelineEntry, createTimeline } from "../timeline/timelineEngine.mjs";
import { createSharedTimelineMeta, hydrateSessionTimeline, timelineDiceRollId } from "./sessionTimeline.mjs";

const initial = { gameMode: "match", pieces: [], movementStateByPieceId: {} };

test("session hydration waits until every timeline entry is available", () => {
  let timeline = createTimeline(initial, { recordingId: "shared-match" });
  timeline = commitTimelineEntry(timeline, {
    id: "pass-1",
    type: "PASS_ACTIVATED",
    label: "Blue PASS",
    team: "blue",
    before: initial,
    after: { ...initial, tracker: { actionLog: { blue: [{ id: "pass-1", type: "PASS" }], red: [] } } },
  });
  const meta = createSharedTimelineMeta(timeline, "client-a", initial);
  assert.equal(hydrateSessionTimeline(meta, [], initial), null);

  const hydrated = hydrateSessionTimeline(meta, [{
    recordingId: "shared-match",
    sequence: 1,
    entry: timeline.entries[0],
  }], initial);
  assert.equal(hydrated.entries.length, 1);
  assert.equal(hydrated.cursor, 1);
});

test("dice roll ids stay stable until the applied dice entry changes", () => {
  let timeline = createTimeline(initial, { recordingId: "dice-match" });
  timeline = commitTimelineEntry(timeline, {
    id: "dice-blue-1",
    type: "DICE_ROLLED",
    team: "blue",
    before: initial,
    after: { ...initial, dice: { blueResult: 17 } },
  });
  assert.equal(timelineDiceRollId(timeline, "blue"), "timeline_dice-match_dice-blue-1");
  assert.equal(timelineDiceRollId(timeline, "red"), "timeline_dice-match_baseline_red");
});
