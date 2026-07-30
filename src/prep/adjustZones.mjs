import { fromCoord } from "../board/boardGeometry.mjs";

export const ADJUST_RADIUS = 2;

function starterSlotIndex(piece) {
  const match = String(piece?.id || "").match(/^[AB]-(\d+)$/);
  return match ? Number(match[1]) : null;
}

// The selected formation owns the neutral starter-slot coordinate. The card
// retains sole authority for role; this only supplies the local Adjust anchor.
export function formationAdjustAnchor(piece, formation, cols = 44) {
  const index = starterSlotIndex(piece);
  const coordinate = index == null ? null : formation?.players?.[index];
  if (!coordinate) return null;
  const blue = fromCoord(coordinate);
  if (!blue) return null;
  return {
    x: piece.team === "B" ? cols - 1 - blue.x : blue.x,
    y: blue.y,
  };
}

export function formationAdjustCells(piece, formation, { cols = 44, rows = 29 } = {}) {
  const anchor = formationAdjustAnchor(piece, formation, cols);
  if (!anchor) return [];
  const cells = [];
  for (let y = anchor.y - ADJUST_RADIUS; y <= anchor.y + ADJUST_RADIUS; y += 1) {
    for (let x = anchor.x - ADJUST_RADIUS; x <= anchor.x + ADJUST_RADIUS; x += 1) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) cells.push({ x, y });
    }
  }
  return cells;
}
