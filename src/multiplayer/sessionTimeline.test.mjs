import test from "node:test";
import assert from "node:assert/strict";
import { commitTimelineEntry, createTimeline } from "../timeline/timelineEngine.mjs";
import {
  canAccessPrimaryToolbar,
  createSharedTimelineMeta,
  hydrateSessionTimeline,
  nullableFiniteNumber,
  normalizeSessionStatusLabel,
  shouldApplySessionBoardProjection,
  shouldApplyIncomingTimeline,
  shouldRestoreTimelineState,
  timelineReconciliationMode,
  timelineDiceRollId,
} from "./sessionTimeline.mjs";

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
  assert.equal(timelineDiceRollId(timeline, "red"), "");
});

test("null dice values never become a synthetic zero roll", () => {
  assert.equal(nullableFiniteNumber(null), null);
  assert.equal(nullableFiniteNumber(undefined), null);
  assert.equal(nullableFiniteNumber(""), null);
  assert.equal(nullableFiniteNumber("17"), 17);
});

test("timeline reconciliation rejects stale echoes and protects pending mode changes", () => {
  const local = { ...createTimeline(initial, { recordingId: "local" }), revision: 3 };
  const stale = { ...local, revision: 2 };
  const newer = { ...local, revision: 4 };
  const different = createTimeline(initial, { recordingId: "remote" });
  assert.equal(shouldApplyIncomingTimeline(local, stale, 0), false);
  assert.equal(shouldApplyIncomingTimeline(local, newer, 0), true);
  assert.equal(shouldApplyIncomingTimeline(local, different, 1), false);
  assert.equal(shouldApplyIncomingTimeline(local, different, 0), true);
});

test("a matching timeline revision can restore a locally rolled-back board view", () => {
  const local = { ...createTimeline(initial, { recordingId: "shared" }), revision: 4 };
  const sameRevision = { ...local, revision: 4 };
  const stale = { ...local, revision: 3 };
  assert.equal(shouldRestoreTimelineState(local, sameRevision, 1), true);
  assert.equal(shouldRestoreTimelineState(local, stale, 0), false);
  assert.equal(timelineReconciliationMode(local, sameRevision, 1), "restore");
  assert.equal(timelineReconciliationMode(local, { ...local, revision: 5 }, 0), "replace");
  assert.equal(timelineReconciliationMode(local, stale, 0), "ignore");
});

test("an active Match Timeline rejects delayed board projections", () => {
  assert.equal(shouldApplySessionBoardProjection({ isOwnUpdate: false, timelineActive: true }), false);
  assert.equal(shouldApplySessionBoardProjection({ isOwnUpdate: true, timelineActive: false }), false);
  assert.equal(shouldApplySessionBoardProjection({ isOwnUpdate: false, timelineActive: false }), true);
});

test("only the host retains primary toolbar controls during a session", () => {
  assert.equal(canAccessPrimaryToolbar({ sessionActive: false, isSessionHost: false }), true);
  assert.equal(canAccessPrimaryToolbar({ sessionActive: true, isSessionHost: true }), true);
  assert.equal(canAccessPrimaryToolbar({ sessionActive: true, isSessionHost: false }), false);
  assert.equal(normalizeSessionStatusLabel({ type: "click" }), "Offline");
  assert.equal(normalizeSessionStatusLabel("Session ended"), "Session ended");
});
