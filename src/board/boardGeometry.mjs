import { clamp } from "../game/numberUtils.mjs";

export const DEFAULT_BOARD_GEOMETRY_SETTINGS = {
  cols: 44,
  rows: 29,
  invisiblePadding: 2,
  goalWidth: 5,
};

function setting(settingsLike, key) {
  return settingsLike?.[key] ?? DEFAULT_BOARD_GEOMETRY_SETTINGS[key];
}

export function rowLetter(index) {
  let n = Math.max(0, Number(index) || 0) + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function toCoord(x, y) {
  return `${rowLetter(y)}${Number(x) + 1}`;
}

export function fromCoord(coord) {
  const match = String(coord).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return { x: 0, y: 0 };
  const letters = match[1];
  const number = Number(match[2]);
  let y = 0;
  for (let i = 0; i < letters.length; i += 1) {
    y = y * 26 + (letters.charCodeAt(i) - 64);
  }
  return { x: number - 1, y: y - 1 };
}

export function goalTopForSettings(settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  return Math.floor((setting(settingsLike, "rows") - setting(settingsLike, "goalWidth")) / 2);
}

export function isInsideGoalMouthY(y, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const top = goalTopForSettings(settingsLike);
  const bottom = top + setting(settingsLike, "goalWidth") - 1;
  return y >= top && y <= bottom;
}

export function invisiblePaddingForSettings(settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  return Number(setting(settingsLike, "invisiblePadding") ?? 2);
}

export function clampBoardXForY(x, y, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const cols = setting(settingsLike, "cols");
  const pad = invisiblePaddingForSettings(settingsLike);
  return clamp(x, -pad, cols + pad - 1);
}

export function clampBoardY(y, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const rows = setting(settingsLike, "rows");
  const pad = invisiblePaddingForSettings(settingsLike);
  return clamp(y, -pad, rows + pad - 1);
}

export function normalizeGridPosition(x, y, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const safeY = clampBoardY(Math.round(Number(y) || 0), settingsLike);
  const safeX = clampBoardXForY(Math.round(Number(x) || 0), safeY, settingsLike);
  const fieldX = clamp(safeX, 0, setting(settingsLike, "cols") - 1);
  const fieldY = clamp(safeY, 0, setting(settingsLike, "rows") - 1);
  const coord = toCoord(fieldX, fieldY);
  return {
    x: safeX,
    y: safeY,
    coord,
    square: {
      id: coord,
      coord,
      x: safeX,
      y: safeY,
      lengthIndex: safeX + 1,
      widthLetter: rowLetter(fieldY),
    },
  };
}

export function withBoardPosition(piece, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const grid = normalizeGridPosition(Number(piece.x) || 0, Number(piece.y) || 0, settingsLike);
  return {
    ...piece,
    x: grid.x,
    y: grid.y,
    coord: grid.coord,
    position: { coord: grid.coord, x: grid.x, y: grid.y },
  };
}

export function normalizePiecesForBoard(pieces, settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  return (pieces || []).map(piece => withBoardPosition(piece, settingsLike));
}

export function createSquareObject(x, y, pieces = [], settingsLike = DEFAULT_BOARD_GEOMETRY_SETTINGS) {
  const grid = normalizeGridPosition(x, y, settingsLike);
  const occupants = normalizePiecesForBoard(pieces, settingsLike).filter(piece => piece.coord === grid.coord);
  return {
    id: grid.coord,
    coord: grid.coord,
    x: grid.x,
    y: grid.y,
    lengthIndex: grid.x + 1,
    widthLetter: rowLetter(grid.y),
    occupied: occupants.length > 0,
    pieces: occupants,
    piece: occupants[0] || null,
  };
}

export function buildBoardApi(settingsLike, piecesLike) {
  const boardPieces = normalizePiecesForBoard(piecesLike, settingsLike);
  const normalizedCoord = coord => {
    const { x, y } = fromCoord(coord);
    return normalizeGridPosition(x, y, settingsLike).coord;
  };
  return {
    cols: setting(settingsLike, "cols"),
    rows: setting(settingsLike, "rows"),
    toCoord,
    fromCoord,
    normalizePosition: (x, y) => normalizeGridPosition(x, y, settingsLike),
    getPieces: () => boardPieces,
    getPiece: pieceId => boardPieces.find(piece => piece.id === pieceId) || null,
    getPiecesByTeam: team => boardPieces.filter(piece => piece.team === team),
    getPieceAt: coord => boardPieces.find(piece => piece.coord === normalizedCoord(coord)) || null,
    getPiecesAt: coord => boardPieces.filter(piece => piece.coord === normalizedCoord(coord)),
    isEmpty: coord => !boardPieces.some(piece => piece.coord === normalizedCoord(coord)),
    getSquare: coord => {
      const { x, y } = fromCoord(coord);
      return createSquareObject(x, y, boardPieces, settingsLike);
    },
    getAllSquares: () => {
      const squares = [];
      for (let y = 0; y < setting(settingsLike, "rows"); y += 1) {
        for (let x = 0; x < setting(settingsLike, "cols"); x += 1) {
          squares.push(createSquareObject(x, y, boardPieces, settingsLike));
        }
      }
      return squares;
    },
    movePiece: (pieceId, coord) => {
      const { x, y } = fromCoord(coord);
      const grid = normalizeGridPosition(x, y, settingsLike);
      return boardPieces.map(piece => piece.id === pieceId
        ? withBoardPosition({ ...piece, x: grid.x, y: grid.y }, settingsLike)
        : piece);
    },
    distance: (fromCoordValue, toCoordValue) => {
      const a = fromCoord(fromCoordValue);
      const b = fromCoord(toCoordValue);
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      return { dx, dy, orthogonal: dx + dy, diagonal: Math.max(dx, dy), straight: Math.sqrt(dx * dx + dy * dy) };
    },
    adjacentSquares: (coord, includeDiagonals = false) => {
      const { x, y } = fromCoord(coord);
      const deltas = includeDiagonals
        ? [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
        : [[0, -1], [1, 0], [0, 1], [-1, 0]];
      return deltas
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter(pos => pos.x >= 0 && pos.y >= 0 && pos.x < setting(settingsLike, "cols") && pos.y < setting(settingsLike, "rows"))
        .map(pos => createSquareObject(pos.x, pos.y, boardPieces, settingsLike));
    },
  };
}
