import { fromCoord } from "../board/boardGeometry.mjs";

export const ADJUST_RADIUS = 2;

function starterIndex(piece) {
  const match = String(piece?.id || "").match(/^[AB]-(\d+)$/);
  return match ? Number(match[1]) : -1;
}

export function formationAdjustAnchor(piece, formation, cols = 44) {
  const index = starterIndex(piece);
  const coordinate = Array.isArray(formation?.players) ? formation.players[index] : null;
  if (!coordinate) return null;
  const cell = fromCoord(coordinate);
  return { x: piece.team === "B" ? cols - 1 - cell.x : cell.x, y: cell.y };
}

export function formationAdjustCells(piece, formation, { cols = 44, rows = 29 } = {}) {
  const anchor = formationAdjustAnchor(piece, formation, cols);
  if (!anchor) return [];
  const cells = [];
  for (let x = anchor.x - ADJUST_RADIUS; x <= anchor.x + ADJUST_RADIUS; x += 1) {
    for (let y = anchor.y - ADJUST_RADIUS; y <= anchor.y + ADJUST_RADIUS; y += 1) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) cells.push({ x, y });
    }
  }
  return cells;
}
