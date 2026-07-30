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

// A role's legal Adjust zone and its automatic starting anchor are separate.
// ST may be moved in its approved wide zone, but defaults only inside K–S.
const BLUE_DEFAULT_LAYOUT = {
  GK: { x: 0, y: 14, spacing: 0 },
  LB: { x: 7, y: 5, spacing: 3 }, CB: { x: 6, y: 14, spacing: 2 }, RB: { x: 7, y: 23, spacing: 3 },
  LWB: { x: 12, y: 1, spacing: 3 }, RWB: { x: 12, y: 27, spacing: 3 },
  CDM: { x: 11, y: 14, spacing: 3 }, CM: { x: 14, y: 14, spacing: 3 },
  LM: { x: 16, y: 4, spacing: 3 }, RM: { x: 16, y: 24, spacing: 3 }, CAM: { x: 16, y: 14, spacing: 3 },
  LW: { x: 20, y: 1, spacing: 3 }, RW: { x: 20, y: 27, spacing: 3 }, ST: { x: 17, y: 14, spacing: 3 },
};

export function adjustZoneCells(team, role, cols = 44) {
  const blue = BLUE[String(role || "").toUpperCase()] || [];
  return blue.map(cell => ({ x: team === "B" ? cols - 1 - cell.x : cell.x, y: cell.y }));
}

export function defaultAdjustAnchor(team, role, cols = 44) {
  const blue = BLUE_DEFAULT_LAYOUT[String(role || "").toUpperCase()];
  if (!blue) return null;
  return { x: team === "B" ? cols - 1 - blue.x : blue.x, y: blue.y, spacing: blue.spacing };
}

function isStarter(piece) {
  return piece.team !== "BALL" && !/^[AB]-R-\d+$/.test(String(piece.id || ""));
}

function roleOffsets(count, spacing) {
  if (count <= 1) return [0];
  if (count === 2) return [-spacing, spacing];
  if (count === 3) return [0, -spacing, spacing];
  const offsets = [0, -spacing, spacing];
  for (let level = 2; offsets.length < count; level += 1) {
    offsets.push(-spacing * level);
    if (offsets.length < count) offsets.push(spacing * level);
  }
  return offsets;
}

function cellKey(cell) {
  return `${Number(cell.x)}:${Number(cell.y)}`;
}

function nearestAvailableCell(cells, desired, occupied) {
  return cells
    .filter(cell => !occupied.has(cellKey(cell)))
    .sort((a, b) => {
      const aDistance = (a.x - desired.x) ** 2 + (a.y - desired.y) ** 2;
      const bDistance = (b.x - desired.x) ** 2 + (b.y - desired.y) ** 2;
      return aDistance - bDistance || a.y - b.y || a.x - b.x;
    })[0] || null;
}

/**
 * Pure role-based layout. It never uses puck labels. Invalid/missing cards
 * reject the complete plan so a role can never silently land in another zone.
 */
export function planAutoAdjustStarters({ pieces = [], cardsById = {}, cols = 44, teams = ["A", "B"] } = {}) {
  const targetTeams = new Set(teams);
  const starters = pieces.filter(piece => isStarter(piece) && targetTeams.has(piece.team));
  const issues = [];
  const groups = new Map();

  starters.forEach(piece => {
    const card = cardsById[String(piece.cardId || "")];
    const role = String(card?.position || "").toUpperCase();
    if (!card || !BLUE_DEFAULT_LAYOUT[role] || !adjustZoneCells(piece.team, role, cols).length) {
      issues.push({ code: "adjust-card-position", pieceId: piece.id, message: `Adjust needs a valid card position for ${piece.id}.` });
      return;
    }
    const key = `${piece.team}:${role}`;
    const group = groups.get(key) || { team: piece.team, role, pieces: [] };
    group.pieces.push(piece);
    groups.set(key, group);
  });
  if (issues.length) return { accepted: false, pieces, issues };

  const movingIds = new Set(starters.map(piece => piece.id));
  const occupied = new Set(pieces
    .filter(piece => piece.team !== "BALL" && !movingIds.has(piece.id))
    .map(cellKey));
  const placements = new Map();

  [...groups.values()]
    .sort((a, b) => a.team.localeCompare(b.team) || a.role.localeCompare(b.role))
    .forEach(group => {
      const anchor = defaultAdjustAnchor(group.team, group.role, cols);
      const cells = adjustZoneCells(group.team, group.role, cols);
      const offsets = roleOffsets(group.pieces.length, anchor.spacing);
      [...group.pieces].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((piece, index) => {
        const desired = { x: anchor.x, y: anchor.y + offsets[index] };
        const target = nearestAvailableCell(cells, desired, occupied);
        if (!target) {
          issues.push({ code: "adjust-zone-full", pieceId: piece.id, message: `No free ${group.role} Adjust cell is available for ${piece.id}.` });
          return;
        }
        if (!cells.some(cell => cell.x === target.x && cell.y === target.y)) {
          issues.push({ code: "adjust-role-zone", pieceId: piece.id, message: `${piece.id} would leave its ${group.role} Adjust zone.` });
          return;
        }
        occupied.add(cellKey(target));
        placements.set(piece.id, target);
      });
    });

  if (issues.length) return { accepted: false, pieces, issues };
  return {
    accepted: true,
    pieces: pieces.map(piece => placements.has(piece.id) ? { ...piece, ...placements.get(piece.id) } : piece),
    issues: [],
  };
}

export function autoAdjustStarters(options = {}) {
  return planAutoAdjustStarters(options).pieces;
}
