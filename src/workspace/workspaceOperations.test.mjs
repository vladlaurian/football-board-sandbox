import assert from "node:assert/strict";
import test from "node:test";
import {
  planWorkspaceBoardSetting,
  planWorkspaceCardAssignment,
  planWorkspaceRuleSetCommit,
  planWorkspaceScenarioSave,
} from "./workspaceOperations.mjs";
import {
  planCardLibraryClone,
  planCardLibraryDeletion,
  planCardLibraryUpsert,
  planWorkspaceCardReset,
} from "./cardLibraryOperations.mjs";

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

test("Card Library clone preserves imported graphics while removing temporary inline copies", () => {
  const initial = { cards: [{ id: "card-1", name: "Player", graphics: { frontLocalDataUrl: "data:image/png;base64,abc", remote: "https://example.test/front.png" }, artwork: { customDataUrl: "data:image/png;base64,def" } }] };
  const saved = planCardLibraryUpsert({ cardState: initial, card: { ...initial.cards[0], name: "Player One" } });
  assert.equal(saved.cards[0].name, "Player One");

  const cloned = planCardLibraryClone({
    cardState: saved,
    sourceCard: saved.cards[0],
    nextId: "card-2",
    timestamp: "2026-07-22T00:00:00.000Z",
    isInlineImageDataUrl: value => String(value || "").startsWith("data:image/"),
  });
  assert.equal(cloned.clonedCard.id, "card-2");
  assert.equal(cloned.clonedCard.graphics.frontLocalDataUrl, "");
  assert.equal(cloned.clonedCard.graphics.remote, "https://example.test/front.png");
  assert.equal(cloned.clonedCard.artwork.customDataUrl, "");
  assert.equal(cloned.cardState.cards.length, 2);
});

test("Card Library deletion detaches only the deleted card and resets legacy assignment metadata", () => {
  const planned = planCardLibraryDeletion({
    cardState: { cards: [{ id: "card-1" }, { id: "card-2" }], teams: { old: true }, assignments: { old: true } },
    pieces: [{ id: "a", cardId: "card-1" }, { id: "b", cardId: "card-2" }, { id: "ball", team: "BALL", cardId: null }],
    cardId: "card-1",
    resetTeams: { blue: [], red: [] },
    sanitizePieces: value => value,
  });
  assert.deepEqual(planned.cardState.cards.map(card => card.id), ["card-2"]);
  assert.equal(planned.pieces.find(piece => piece.id === "a").cardId, null);
  assert.equal(planned.pieces.find(piece => piece.id === "b").cardId, "card-2");
  assert.deepEqual(planned.cardState.teams, { blue: [], red: [] });
  assert.deepEqual(planned.cardState.assignments, {});
});

test("Workspace card reset detaches every card without changing the pieces themselves", () => {
  const planned = planWorkspaceCardReset({ pieces: [{ id: "a", team: "A", cardId: "card-1" }, { id: "ball", team: "BALL", cardId: null }] });
  assert.deepEqual(planned, [{ id: "a", team: "A", cardId: null }, { id: "ball", team: "BALL", cardId: null }]);
});
