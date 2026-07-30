import assert from "node:assert/strict";
import test from "node:test";
import { ADJUST_RADIUS, formationAdjustAnchor, formationAdjustCells } from "./adjustZones.mjs";

const formation = { players: ["O8", "O17"] };

test("Adjust anchors each starter to its selected formation coordinate and mirrors Red", () => {
  assert.deepEqual(formationAdjustAnchor({ id: "A-0", team: "A" }, formation), { x: 7, y: 14 });
  assert.deepEqual(formationAdjustAnchor({ id: "B-0", team: "B" }, formation), { x: 36, y: 14 });
});

test("Adjust exposes only the local five by five area around the formation anchor", () => {
  const cells = formationAdjustCells({ id: "A-1", team: "A" }, formation);
  assert.equal(ADJUST_RADIUS, 2);
  assert.equal(cells.length, 25);
  assert.equal(cells.some(cell => cell.x === 16 && cell.y === 14), true);
  assert.equal(cells.some(cell => cell.x === 19 && cell.y === 14), false);
});

test("Adjust clips a local formation area at the board boundary", () => {
  const cells = formationAdjustCells({ id: "A-0", team: "A" }, { players: ["A1"] });
  assert.equal(cells.every(cell => cell.x >= 0 && cell.y >= 0), true);
});
