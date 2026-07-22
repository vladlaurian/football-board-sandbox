import assert from "node:assert/strict";
import test from "node:test";
import {
  planWorkspaceBoardSetting,
  planWorkspaceCardAssignment,
  planWorkspaceRuleSetCommit,
  planWorkspaceScenarioSave,
} from "./workspaceOperations.mjs";

test("Workspace board setting mutation returns one normalized board setup", () => {
  const planned = planWorkspaceBoardSetting({
    settings: { cols: 10, rows: 9, penaltyDistance: 6, goalWidth: 3 },
    pieces: [{ id: "blue", x: 99, y: 99 }],
    key: "cols",
    value: 8,
    forceOddDirectional: value => value,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampBoardXForY: (x, _y, settings) => Math.max(0, Math.min(settings.cols - 1, x)),
    ensureBenchReserveCount: pieces => pieces,
  });
  assert.equal(planned.nextSettings.penaltyDistance, 4);
  assert.equal(planned.nextPieces[0].x, 7);
  assert.equal(planned.nextPieces[0].y, 8);
});

test("Workspace scenario and card assignment plans remain setup-only", () => {
  const scenario = planWorkspaceScenarioSave({
    scenarios: [{ id: 1, name: "Old", snapshot: null }],
    activeSituationId: 1,
    name: "Pressing",
    snapshot: { pieces: [{ id: "ball" }] },
  });
  assert.equal(scenario.nextScenarios[0].name, "Pressing");

  const pieces = planWorkspaceCardAssignment({
    pieces: [{ id: "a", team: "A", cardId: null }, { id: "b", team: "B", cardId: "card-1" }, { id: "ball", team: "BALL" }],
    pieceId: "a",
    cardId: "card-1",
    sanitizePieces: value => value,
  });
  assert.equal(pieces.find(piece => piece.id === "a").cardId, "card-1");
  assert.equal(pieces.find(piece => piece.id === "b").cardId, null);
  assert.equal(pieces.find(piece => piece.id === "ball").cardId, null);
});

test("Workspace Rule Set plan retains the chosen active Rule Set", () => {
  const planned = planWorkspaceRuleSetCommit({ ruleSets: [], activeRuleSet: { id: "rules-test", name: "Test" } });
  assert.equal(planned.activeRuleSet.id, "rules-test");
  assert.equal(planned.ruleSets.some(ruleSet => ruleSet.id === "rules-test"), true);
});
