import assert from "node:assert/strict";
import test from "node:test";
import { adjustZoneCells, autoAdjustStarters } from "./adjustZones.mjs";

test("Adjust zones use the approved Blue map and Red depth mirror", () => {
  assert.deepEqual(adjustZoneCells("A", "GK"), [{ x: 0, y: 14 }]);
  assert.deepEqual(adjustZoneCells("B", "GK"), [{ x: 43, y: 14 }]);
  assert.deepEqual(adjustZoneCells("A", "LB").at(0), { x: 5, y: 4 });
  assert.deepEqual(adjustZoneCells("B", "LB").at(0), { x: 38, y: 4 });
  assert.equal(adjustZoneCells("A", "ST").some(cell => cell.x === 17 && cell.y === 0), true);
  assert.equal(adjustZoneCells("B", "ST").some(cell => cell.x === 26 && cell.y === 0), true);
});

test("automatic Adjust centres starters in distinct role cells and retains cards", () => {
  const pieces = [
    { id: "A-0", team: "A", cardId: "blue-cb-1", x: 30, y: 1 },
    { id: "A-1", team: "A", cardId: "blue-cb-2", x: 31, y: 1 },
    { id: "B-0", team: "B", cardId: "red-st", x: 2, y: 1 },
    { id: "A-R-0", team: "A", cardId: "blue-reserve", x: 2, y: 2 },
    { id: "BALL", team: "BALL", x: 22, y: 14 },
  ];
  const cardsById = {
    "blue-cb-1": { position: "CB" },
    "blue-cb-2": { position: "CB" },
    "red-st": { position: "ST" },
    "blue-reserve": { position: "CM" },
  };

  const adjusted = autoAdjustStarters({ pieces, cardsById });
  const firstCb = adjusted.find(piece => piece.id === "A-0");
  const secondCb = adjusted.find(piece => piece.id === "A-1");
  const redSt = adjusted.find(piece => piece.id === "B-0");

  assert.equal(adjustZoneCells("A", "CB").some(cell => cell.x === firstCb.x && cell.y === firstCb.y), true);
  assert.equal(adjustZoneCells("A", "CB").some(cell => cell.x === secondCb.x && cell.y === secondCb.y), true);
  assert.notDeepEqual({ x: firstCb.x, y: firstCb.y }, { x: secondCb.x, y: secondCb.y });
  assert.equal(adjustZoneCells("B", "ST").some(cell => cell.x === redSt.x && cell.y === redSt.y), true);
  assert.equal(adjusted.find(piece => piece.id === "A-R-0").x, 2);
  assert.equal(adjusted.find(piece => piece.id === "A-R-0").cardId, "blue-reserve");
  assert.equal(adjusted.find(piece => piece.id === "BALL").x, 22);
  assert.equal(firstCb.cardId, "blue-cb-1");
});
