const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const columns = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const rectangular = (xs, ys) => xs.flatMap(x => ys.map(y => ({ x, y })));

const BLUE = {
  GK: rectangular([0], rows(14, 14)), LB: rectangular(columns(5, 9), rows(4, 6)), CB: rectangular(columns(4, 8), rows(8, 20)), RB: rectangular(columns(5, 9), rows(22, 24)),
  LWB: rectangular(columns(10, 13), rows(0, 3)), RWB: rectangular(columns(10, 13), rows(25, 28)), CDM: rectangular(columns(9, 12), rows(9, 19)), CM: rectangular(columns(13, 15), rows(8, 20)),
  LM: rectangular(columns(14, 17), rows(3, 5)), RM: rectangular(columns(14, 17), rows(23, 25)), CAM: rectangular(columns(16, 17), rows(10, 18)),
  LW: rectangular(columns(18, 21), rows(0, 2)), RW: rectangular(columns(18, 21), rows(26, 28)),
  ST: [...rectangular([17], rows(0, 28)), ...[[18, 10], [18, 11], [19, 10], [18, 17], [18, 18], [19, 18]].map(([x, y]) => ({ x, y }))],
};

export function adjustZoneCells(team, role, cols = 44) {
  const blue = BLUE[String(role || "").toUpperCase()] || [];
  return blue.map(cell => ({ x: team === "B" ? cols - 1 - cell.x : cell.x, y: cell.y }));
}

export function autoAdjustStarters({ pieces = [], cardsById = {}, cols = 44 } = {}) {
  const occupied = new Set();
  const starters = pieces.filter(piece => piece.team !== "BALL" && !/^.[-]R-\d+$/.test(String(piece.id || "")));
  const placements = new Map();
  starters.forEach(piece => {
    const cells = adjustZoneCells(piece.team, cardsById[String(piece.cardId || "")]?.position, cols);
    if (!cells.length) return;
    const cx = cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
    const cy = cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length;
    const chosen = [...cells].sort((a, b) => ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2)).find(cell => !occupied.has(`${cell.x}:${cell.y}`));
    if (chosen) { occupied.add(`${chosen.x}:${chosen.y}`); placements.set(piece.id, chosen); }
  });
  return pieces.map(piece => placements.has(piece.id) ? { ...piece, ...placements.get(piece.id) } : piece);
}
