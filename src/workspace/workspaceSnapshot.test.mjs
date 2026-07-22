import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceSnapshot, readWorkspaceSnapshot } from "./workspaceSnapshot.mjs";

test("Workspace Snapshot excludes live Match Runtime while retaining future-Match setup", () => {
  const snapshot = createWorkspaceSnapshot({
    settings: { cols: 44 },
    pieces: [{ id: "ball" }],
    trackerSettings: { attackActions: 5 },
    preferences: { touchMode: true, trackerVisible: true },
  });

  assert.equal(snapshot.settings.cols, 44);
  assert.equal(snapshot.trackerSettings.attackActions, 5);
  assert.equal(snapshot.preferences.touchMode, true);
  assert.equal("gameMode" in snapshot, false);
  assert.equal("movementStateByPieceId" in snapshot, false);
  assert.equal("trackerState" in snapshot, false);
  assert.equal("diceResult" in snapshot, false);
});

test("Workspace Snapshot reads legacy flat persistence without reviving Match Runtime", () => {
  const workspace = readWorkspaceSnapshot({
    settings: { cols: 44 },
    pieces: [{ id: "ball" }],
    trackerState: {
      enabled: true,
      settings: { attackActions: 5 },
      currentTurn: 7,
      usedActions: { blue: 3 },
    },
    gameMode: "match",
    movementStateByPieceId: { blue: { remaining: 4 } },
    dieResult: { blue: 20 },
  });

  assert.deepEqual(workspace.trackerSettings, { attackActions: 5 });
  assert.equal(workspace.preferences.trackerVisible, true);
  assert.equal("gameMode" in workspace, false);
  assert.equal("movementStateByPieceId" in workspace, false);
  assert.equal("dieResult" in workspace, false);
});
