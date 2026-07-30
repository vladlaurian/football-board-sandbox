import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTeamSelection,
  normalizeSelectionRules,
  validateReadySelection,
} from "./selectionRules.mjs";

function card(id, position, stars = 2) {
  return { id, name: id, position, starsFront: { count: stars } };
}

function legalTeam(team, prefix, stars = 2) {
  const positions = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "LM", "RM", "CAM", "ST", "GK", "LB", "CB", "RB", "CM", "ST", "LW"];
  return positions.map((position, index) => ({
    piece: { id: index < 11 ? `${team}-${index}` : `${team}-R-${index - 10}`, team, cardId: `${prefix}-${index}` },
    card: card(`${prefix}-${index}`, position, stars),
  }));
}

function legalRoster() {
  const entries = [...legalTeam("A", "blue"), ...legalTeam("B", "red")];
  return {
    pieces: entries.map(entry => entry.piece),
    cardsById: Object.fromEntries(entries.map(entry => [entry.card.id, entry.card])),
  };
}

test("selection rules default to Free Mode and recover it when both constraints are disabled", () => {
  assert.deepEqual(normalizeSelectionRules({}), {
    version: 1,
    freeMode: true,
    totalStarsCap: { enabled: false, value: 55 },
    maximumPlayersAtStars: { enabled: false, maxPlayers: 5, stars: 3 },
  });
  const normalized = normalizeSelectionRules({
    freeMode: false,
    totalStarsCap: { enabled: false, value: 55 },
    maximumPlayersAtStars: { enabled: false, maxPlayers: 5, stars: 3 },
  });
  assert.equal(normalized.freeMode, true);
});

test("Free Mode disables both constraints even when an imported payload enables them", () => {
  const normalized = normalizeSelectionRules({
    freeMode: true,
    totalStarsCap: { enabled: true, value: 1 },
    maximumPlayersAtStars: { enabled: true, maxPlayers: 0, stars: 0 },
  });
  assert.equal(normalized.totalStarsCap.enabled, false);
  assert.equal(normalized.maximumPlayersAtStars.enabled, false);
});

test("selection calculations include starters and all seven reserves", () => {
  const { pieces, cardsById } = legalRoster();
  const summary = analyzeTeamSelection({ pieces, cardsById, team: "A" });
  assert.equal(summary.rosterCount, 18);
  assert.equal(summary.starterCount, 11);
  assert.equal(summary.reserveCount, 7);
  assert.equal(summary.totalStars, 36);
  assert.equal(summary.valid, true);
});

test("selection validation reports total, individual and maximum-player star rule failures", () => {
  const { pieces, cardsById } = legalRoster();
  cardsById["blue-0"].starsFront.count = 4;
  cardsById["blue-1"].starsFront.count = 3;
  cardsById["blue-2"].starsFront.count = 3;
  const summary = analyzeTeamSelection({
    pieces,
    cardsById,
    team: "A",
    selectionRules: {
      freeMode: false,
      totalStarsCap: { enabled: true, value: 30 },
      maximumPlayersAtStars: { enabled: true, maxPlayers: 1, stars: 3 },
    },
  });
  assert.deepEqual(summary.issues.map(item => item.code).sort(), [
    "individual-stars-cap",
    "maximum-stars-player-count",
    "total-stars-cap",
  ]);
});

test("Ready reports missing and duplicated cards", () => {
  const { pieces, cardsById } = legalRoster();
  pieces.find(piece => piece.id === "A-0").cardId = "";
  pieces.find(piece => piece.id === "A-2").cardId = "blue-1";
  const summary = validateReadySelection({ pieces, cardsById });
  assert.equal(summary.valid, false);
  assert.equal(summary.blue.issues.some(item => item.code === "card-missing"), true);
  assert.equal(summary.blue.issues.some(item => item.code === "card-duplicate"), true);
});

test("Ready reports invalid starter and reserve goalkeeper structure", () => {
  const { pieces, cardsById } = legalRoster();
  cardsById[pieces.find(piece => piece.id === "A-0").cardId].position = "CB";
  cardsById[pieces.find(piece => piece.id === "A-R-1").cardId].position = "CM";
  const summary = validateReadySelection({ pieces, cardsById });
  assert.equal(summary.blue.issues.some(item => item.code === "starter-goalkeeper"), true);
  assert.equal(summary.blue.issues.some(item => item.code === "reserve-goalkeeper"), true);
  assert.equal(summary.blue.issues.some(item => item.code === "reserve-outfield"), true);
});

test("Ready reports every approved starter-position limit including the 2 CDM plus 3 CM conflict", () => {
  const { pieces, cardsById } = legalRoster();
  const starterIds = pieces.filter(piece => piece.team === "A" && !piece.id.includes("-R-")).map(piece => piece.cardId);
  ["RB", "RWB", "LB", "LWB", "LM", "LW", "RM", "RW", "CB", "CB", "CB"].forEach((position, index) => {
    cardsById[starterIds[index]].position = position;
  });
  const summary = analyzeTeamSelection({ pieces, cardsById, team: "A" });
  assert.equal(summary.issues.filter(item => item.code === "starter-position-limit").length, 4);

  ["GK", "CDM", "CDM", "CM", "CM", "CM", "LB", "RB", "LM", "RM", "ST"].forEach((position, index) => {
    cardsById[starterIds[index]].position = position;
  });
  const conflict = analyzeTeamSelection({ pieces, cardsById, team: "A" });
  assert.equal(conflict.issues.some(item => item.code === "starter-cdm-cm-conflict"), true);
});

test("Ready analysis is pure and changes neither pieces nor cards", () => {
  const { pieces, cardsById } = legalRoster();
  const before = structuredClone({ pieces, cardsById });
  validateReadySelection({ pieces, cardsById });
  assert.deepEqual({ pieces, cardsById }, before);
});
