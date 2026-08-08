import { fromCoord, clampBoardXForY, clampBoardY } from "./boardGeometry.mjs";
import { normalizeFormationPlayers } from "./formationUtils.mjs";

// Starter coordinates only. A formation change never moves reserves — their
// board position depends only on boardSettings (a fixed bench column/row),
// never on the chosen formation, so leaving them untouched here matches the
// pre-Match `createInitialPieces` behavior exactly.
export function formationStarterCoordinates(team, formation, boardSettings) {
  const isBlue = team === "A";
  const cols = Number(boardSettings?.cols);
  return normalizeFormationPlayers(formation?.players).map((coord, index) => {
    const pos = fromCoord(coord);
    const x = isBlue ? pos.x : cols - 1 - pos.x;
    return {
      id: `${team}-${index}`,
      x: clampBoardXForY(x, pos.y, boardSettings),
      y: clampBoardY(pos.y, boardSettings),
    };
  });
}

export function applyFormationToTeamPieces(pieces, team, formation, boardSettings) {
  const coordsById = new Map(formationStarterCoordinates(team, formation, boardSettings).map(coord => [coord.id, coord]));
  return (pieces || []).map(piece => {
    const coord = piece?.team === team ? coordsById.get(String(piece.id)) : undefined;
    return coord ? { ...piece, x: coord.x, y: coord.y } : piece;
  });
}
