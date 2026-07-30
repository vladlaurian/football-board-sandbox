import assert from "node:assert/strict";
import test from "node:test";
import { formationAdjustAnchor, formationAdjustCells } from "./adjustZones.mjs";

const formation = { players: ["O1", "M18"] };

test("Adjust anchors a starter to its selected formation coordinate and mirrors Red", () => {
  assert.deepEqual(formationAdjustAnchor({ id: "A-1", team: "A" }, formation), { x: 17, y: 12 });
  assert.deepEqual(formationAdjustAnchor({ id: "B-1", team: "B" }, formation), { x: 26, y: 12 });
});

test("Adjust exposes only a local five by five area around the formation anchor", () => {
  const cells = formationAdjustCells({ id: "A-1", team: "A" }, formation);
  assert.equal(cells.length, 25);
  assert.equal(cells.some(cell => cell.x === 15 && cell.y === 10), true);
  assert.equal(cells.some(cell => cell.x === 19 && cell.y === 14), true);
  assert.equal(cells.some(cell => cell.x === 20 && cell.y === 12), false);
});

test("Adjust clips a local formation area at the board boundary", () => {
  const cells = formationAdjustCells({ id: "A-0", team: "A" }, formation);
  assert.equal(cells.length, 15);
  assert.equal(cells.every(cell => cell.x >= 0 && cell.y >= 0), true);
});
