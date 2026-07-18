import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBoardApi,
  clampBoardXForY,
  fromCoord,
  normalizeGridPosition,
  normalizePiecesForBoard,
  rowLetter,
  toCoord,
} from "./boardGeometry.mjs";

const settings = { cols: 44, rows: 29, invisiblePadding: 2, goalWidth: 5 };

test("board coordinates preserve the existing spreadsheet-style labels", () => {
  assert.equal(rowLetter(0), "A");
  assert.equal(rowLetter(25), "Z");
  assert.equal(rowLetter(26), "AA");
  assert.equal(toCoord(43, 28), "AC44");
  assert.deepEqual(fromCoord("AC44"), { x: 43, y: 28 });
  assert.deepEqual(fromCoord("invalid"), { x: 0, y: 0 });
});

test("piece normalization keeps legal invisible bench positions while exposing a field coordinate", () => {
  const normalized = normalizeGridPosition(-9, 50, settings);
  assert.equal(normalized.x, -2);
  assert.equal(normalized.y, 30);
  assert.equal(normalized.coord, "AC1");
  assert.equal(clampBoardXForY(99, 5, settings), 45);

  const [piece] = normalizePiecesForBoard([{ id: "A-R-1", team: "A", x: -2, y: 4 }], settings);
  assert.equal(piece.coord, "E1");
  assert.deepEqual(piece.position, { coord: "E1", x: -2, y: 4 });
});

test("board API remains read-only and returns normalized pieces and squares", () => {
  const api = buildBoardApi(settings, [
    { id: "A-1", team: "A", x: 3, y: 4 },
    { id: "BALL", team: "BALL", x: 3, y: 4 },
  ]);
  assert.equal(api.getPieceAt("E4").id, "A-1");
  assert.equal(api.getPiecesAt("E4").length, 2);
  assert.equal(api.getSquare("E4").occupied, true);
  assert.equal(api.adjacentSquares("E4").length, 4);
  assert.equal(api.movePiece("A-1", "F5")[0].coord, "F5");
});
