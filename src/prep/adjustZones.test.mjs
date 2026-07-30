import assert from "node:assert/strict";
import test from "node:test";
import { adjustZoneCells, autoAdjustStarters, defaultAdjustAnchor, planAutoAdjustStarters } from "./adjustZones.mjs";

test("Adjust zones use the approved Blue map and Red depth mirror", () => {
  assert.deepEqual(adjustZoneCells("A", "GK"), [{ x: 0, y: 14 }]);
  assert.deepEqual(adjustZoneCells("B", "GK"), [{ x: 43, y: 14 }]);
  assert.deepEqual(adjustZoneCells("A", "LB").at(0), { x: 5, y: 4 });
  assert.deepEqual(adjustZoneCells("B", "LB").at(0), { x: 38, y: 4 });
  assert.equal(adjustZoneCells("A", "ST").some(cell => cell.x === 17 && cell.y === 0), true);
  assert.equal(adjustZoneCells("B", "ST").some(cell => cell.x === 26 && cell.y === 0), true);
  assert.deepEqual(defaultAdjustAnchor("A", "ST"), { x: 17, y: 14, spacing: 3 });
  assert.deepEqual(defaultAdjustAnchor("B", "ST"), { x: 26, y: 14, spacing: 3 });
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

test("role groups use the approved CB, CDM and CM vertical separation", () => {
  const pieces = [
    { id: "A-0", team: "A", cardId: "cb-1" }, { id: "A-1", team: "A", cardId: "cb-2" }, { id: "A-2", team: "A", cardId: "cb-3" },
    { id: "A-3", team: "A", cardId: "cdm-1" }, { id: "A-4", team: "A", cardId: "cdm-2" },
    { id: "A-5", team: "A", cardId: "cm-1" }, { id: "A-6", team: "A", cardId: "cm-2" },
  ];
  const cardsById = Object.fromEntries([
    ["cb-1", { position: "CB" }], ["cb-2", { position: "CB" }], ["cb-3", { position: "CB" }],
    ["cdm-1", { position: "CDM" }], ["cdm-2", { position: "CDM" }],
    ["cm-1", { position: "CM" }], ["cm-2", { position: "CM" }],
  ]);
  const adjusted = autoAdjustStarters({ pieces, cardsById });
  const ys = id => adjusted.find(piece => piece.id === id).y;
  assert.deepEqual([ys("A-0"), ys("A-1"), ys("A-2")], [14, 12, 16]);
  assert.deepEqual([ys("A-3"), ys("A-4")], [11, 17]);
  assert.deepEqual([ys("A-5"), ys("A-6")], [11, 17]);
});

test("a Red RW can only receive a Red RW zone cell", () => {
  const pieces = [{ id: "B-0", team: "B", cardId: "red-rw", x: 33, y: 14 }];
  const plan = planAutoAdjustStarters({ pieces, cardsById: { "red-rw": { position: "RW" } } });
  assert.equal(plan.accepted, true);
  const rw = plan.pieces[0];
  assert.equal(adjustZoneCells("B", "RW").some(cell => cell.x === rw.x && cell.y === rw.y), true);
  assert.equal(adjustZoneCells("B", "CDM").some(cell => cell.x === rw.x && cell.y === rw.y), false);
});

test("an invalid starter card rejects the complete role layout", () => {
  const pieces = [{ id: "A-0", team: "A", cardId: "missing", x: 4, y: 4 }];
  const plan = planAutoAdjustStarters({ pieces, cardsById: {} });
  assert.equal(plan.accepted, false);
  assert.deepEqual(plan.pieces, pieces);
  assert.equal(plan.issues[0].code, "adjust-card-position");
});
