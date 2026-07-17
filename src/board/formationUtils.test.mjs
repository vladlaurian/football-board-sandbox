import test from "node:test";
import assert from "node:assert/strict";
import {
  isBenchReservePiece,
  normalizeFormationPlayers,
  normalizeFormationSlots,
} from "./formationUtils.mjs";

test("formation normalization removes the accidentally saved reserve row", () => {
  const players = Array.from({ length: 18 }, (_, index) => [`P${index + 1}`, `A${index + 1}`]);
  assert.deepEqual(normalizeFormationPlayers(players), players.slice(0, 11));
});

test("stored formation repair preserves its first eleven positions and identity", () => {
  const base = [{ id: 1, name: "4-4-2", players: [["GK", "O1"]] }];
  const savedPlayers = Array.from({ length: 18 }, (_, index) => [`P${index + 1}`, `B${index + 1}`]);
  const repaired = normalizeFormationSlots([{ id: 1, name: "Custom 4-4-2", players: savedPlayers }], base);

  assert.equal(repaired[0].name, "Custom 4-4-2");
  assert.deepEqual(repaired[0].players, savedPlayers.slice(0, 11));
});

test("only structural bench reserve ids are protected from puck deletion", () => {
  assert.equal(isBenchReservePiece({ id: "A-R-3" }), true);
  assert.equal(isBenchReservePiece({ id: "B-R-7" }), true);
  assert.equal(isBenchReservePiece({ id: "A-11" }), false);
  assert.equal(isBenchReservePiece({ id: "BALL" }), false);
});
