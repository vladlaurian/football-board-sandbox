import { teamKeyForPiece, insideOwnPenaltyArea } from "../rules/passEngine.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";

// Shared fixed-restart setup for Corner, Goal Kick, Free Kick Direct, Free
// Kick Indirect and Throw-in (NOT Kick-off — a whole-team automatic tactical
// reset, already built separately — and NOT Penalty — a single fixed roll
// with no wall/reposition/execution-choice phases). Whichever mechanic
// produces the stoppage calls startRestartSetup with the entitled team and
// the fixed ball cell; this module owns everything from there: an optional
// wall, alternating reposition (attack first), executor selection and the
// execution-phase action gate enforced in gameEngine.mjs. See
// docs/FINALISATION_AND_RESTARTS_RULES.md section 9.

export function opponentOfTeam(team) {
  return team === "blue" ? "red" : "blue";
}

// The execution phase's own family map, keyed by the Inspector's action
// `type` string (not by GAME_COMMAND_TYPE) — single source of truth shared
// by the real dispatch gate in gameEngine.mjs (which builds its own
// GAME_COMMAND_TYPE-keyed copy from this) and the Inspector's own
// selectSinglePlayerInspectorActionPresentation (matchPresentationSelectors.mjs),
// so a button's disabled state can never drift from what the Engine would
// actually accept. A type with NO entry here (MOVE, GROUP_MOVE, TACKLING,
// CROSS, DRIBBLE) is never available during a restart's execution phase at
// all, regardless of Rules — those simply aren't restart-execution
// mechanics, so they are always blocked rather than checked against
// availableActions.
export const RESTART_EXECUTION_ACTION_TYPE_FAMILIES = {
  PASS: ["short-pass", "long-pass"],
  SHOT: ["shot"],
  THROUGH_BALL: ["through-ball"],
  LOFTED_THROUGH_BALL: ["lofted-through-ball"],
};

// The restart setup ends the moment its selected executor's action reaches
// the same commit point that already clears an equivalent Kick-off restart
// (see kickoffRestartAfterAction) — ball possession/interception/goal
// outcome afterwards no longer belongs to the fixed-restart machinery.
export function restartSetupAfterAction(state, actorPieceId) {
  return state.restartSetup?.executorId === String(actorPieceId) ? null : state.restartSetup;
}

function restartConfigFor(ruleSet, type) {
  return ruleSet?.actions?.restarts?.[type] || null;
}

function initialPhase(config) {
  if (config.wallSize > 0) return "wall-position";
  if (config.repositionCount > 0) return "reposition";
  return "executor";
}

// The reposition phase's own starting per-side allotment. Confirmed live
// with the user: if more defenders are standing illegally (closer to the
// ball than the legal minimum, or — Goal Kick only — inside the executing
// team's own box) than the configured repositionCount, BOTH sides get the
// same extra moves, granted from the very start — not discovered only once
// defense's own turn runs out, and not defense-only. Attack always moves
// first, so the extra budget must already be there before its very first
// move, not awarded retroactively after the fact. This is read fresh every
// time a restart actually enters "reposition" (build time for a wall-less
// restart, or after the wall is placed/declined for one that has a wall) —
// never cached — since wall placement can itself displace a bystander into
// or out of an illegal cell.
function repositionEntryRemaining(restartSetup, pieces, boardSettings) {
  const base = restartSetup.repositionCount;
  const probeState = { pieces };
  const illegalCount = illegalDistanceDefenderIds(probeState, restartSetup).length
    + (restartSetup.type === "goalKick" ? opponentBoxOccupantIds(probeState, boardSettings, restartSetup).length : 0);
  const extra = Math.max(0, illegalCount - base);
  return { attack: base + extra, defense: base + extra };
}

/**
 * Called by whichever mechanic produces a fixed-restart stoppage (Shot's
 * "corner"/"goal-kick" outcome today; Free Kick/Throw-in once their trigger
 * mechanics exist). `ballCell` is always fixed by the caller before this runs
 * — for Corner and Goal Kick the caller picks it at random (an explicit
 * design choice: which corner flag or which of the three cells either side of
 * the box is irrelevant to gameplay); for Free Kick it is the fouled player's
 * cell, and for Throw-in the out-of-bounds cell. The coach never chooses the
 * ball cell — only which of their pieces executes (selectRestartExecutor),
 * after wall and reposition. Not a dispatched command itself — callers fold
 * the returned `restartSetup` into their own nextState alongside their other
 * consequence changes. `pieces`/`boardSettings` are only used when this
 * restart has no wall (so it starts directly in "reposition") — to compute
 * that phase's own starting allotment; see repositionEntryRemaining. They
 * are safely omitted for a restart that has a wall, since its reposition
 * allotment is instead computed once the wall step actually completes.
 */
export function buildRestartSetup(ruleSet, type, team, ballCell, pieces, boardSettings) {
  const config = restartConfigFor(ruleSet, type);
  if (!config) return null;
  const phase = initialPhase(config);
  return {
    type,
    team,
    ballCell,
    wallSize: config.wallSize,
    // Confirmed live with the user: the coach picks the wall's own lateral
    // position and length BEFORE picking which players fill it (a new
    // "wall-position" phase, see setRestartWallPosition below) — wallLength
    // starts at the Rule Set's own configured max (wallSize) and the coach
    // adjusts it down from there; wallOffset is a signed shift, in cells,
    // away from the ball-aligned default centre. wallCells is null until
    // that phase confirms a specific position+length ("No Wall" sets it to
    // an empty array instead of skipping the field entirely, so downstream
    // code can always tell "confirmed, zero cells" apart from "not yet
    // confirmed").
    wallOffset: 0,
    wallLength: config.wallSize,
    wallCells: null,
    wallPlaced: 0,
    repositionCount: config.repositionCount,
    repositionRemaining: phase === "reposition"
      ? repositionEntryRemaining({ type, team, ballCell, repositionCount: config.repositionCount }, pieces, boardSettings)
      : { attack: config.repositionCount, defense: config.repositionCount },
    repositionTurn: "attack",
    availableActions: config.availableActions,
    executorId: null,
    phase,
  };
}

// The wall stands between the ball and the defending team's OWN goal, on
// the fixed line exactly 5 cells centre-to-centre from the ball cell,
// straight toward that goal (docs/SHOOTING_RULES.md section 5,
// FINALISATION_AND_RESTARTS_RULES.md section 7). Blue defends the low-x
// goal, so its wall line sits at ballCell.x - 5; Red defends the high-x
// goal, so its wall line sits at ballCell.x + 5. A Corner's ball cell is
// already on the goal line, at the touchline corner — there is no room left
// toward goal along x, so its wall instead stays on the ball's own column
// (already adjacent to the goal line) and runs along y, toward the goal's
// own centre, starting from that same 5-cell distance.
//
// Along that fixed line, `length` consecutive cells are centred on the
// ball's own row (Free Kick) or the goal-centre direction (Corner), shifted
// by the coach's own `offset` (confirmed live with the user: a movable,
// resizable wall position/length, chosen in a dedicated step before player
// selection — see setRestartWallPosition). Each cell is clamped to the
// board independently, same as the single-cell version this replaced.
// Exported so the presentation layer can preview the highlight for an
// as-yet-unconfirmed offset/length (local draft state, before the coach
// clicks Confirm) using the exact same computation setRestartWallPosition
// itself will commit with — never a UI-side approximation of it.
export function wallRangeCells(restartSetup, offset, length, boardSettings) {
  const cols = Math.max(1, Number(boardSettings?.cols) || 1);
  const rows = Math.max(1, Number(boardSettings?.rows) || 1);
  const ballCell = restartSetup.ballCell;
  let wallX, centreY;
  if (restartSetup.type === "corner") {
    wallX = Number(ballCell?.x || 0);
    const direction = Number(ballCell?.y) <= (rows - 1) / 2 ? 1 : -1;
    centreY = Number(ballCell?.y || 0) + direction * 5;
  } else {
    const direction = opponentOfTeam(restartSetup.team) === "blue" ? -1 : 1;
    wallX = Number(ballCell?.x || 0) + direction * 5;
    centreY = Number(ballCell?.y || 0);
  }
  wallX = Math.max(0, Math.min(cols - 1, wallX));
  const safeLength = Math.max(0, Math.floor(Number(length) || 0));
  const startY = centreY + Math.floor(Number(offset) || 0) - Math.floor((safeLength - 1) / 2);
  return Array.from({ length: safeLength }, (_, i) => ({
    x: wallX,
    y: Math.max(0, Math.min(rows - 1, startY + i)),
  }));
}

// RESTART_WALL_POSITION_SET: the coach's own first step for any restart
// type with a configured wall (confirmed live with the user) — pick the
// wall's lateral position and length (2..wallSize, defaulting to wallSize
// itself) before picking which specific players fill it, or decline the
// wall entirely. `offset`/`length` are read fresh from the payload each
// call (not accumulated), so repeated adjustments before confirming are
// idempotent — only the final call's values are ever applied.
export function setRestartWallPosition(state, context, command) {
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "wall-position") return { accepted: false, reason: "NOT_AT_RESTART_WALL_POSITION_PHASE" };
  if (command.payload?.noWall === true) {
    const nextPhase = restartSetup.repositionCount > 0 ? "reposition" : "executor";
    const repositionRemaining = nextPhase === "reposition"
      ? repositionEntryRemaining(restartSetup, state.pieces, context.boardSettings)
      : restartSetup.repositionRemaining;
    return {
      accepted: true,
      nextState: { ...state, restartSetup: { ...restartSetup, wallOffset: 0, wallLength: 0, wallCells: [], repositionRemaining, phase: nextPhase } },
      event: { type: "RESTART_WALL_DECLINED", team: opponentOfTeam(restartSetup.team), metadata: { restartType: restartSetup.type } },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  const length = Math.max(1, Math.min(restartSetup.wallSize, Math.floor(Number(command.payload?.length ?? restartSetup.wallLength)) || 1));
  const offset = Math.floor(Number(command.payload?.offset ?? restartSetup.wallOffset)) || 0;
  const wallCells = wallRangeCells(restartSetup, offset, length, context.boardSettings);
  return {
    accepted: true,
    nextState: { ...state, restartSetup: { ...restartSetup, wallOffset: offset, wallLength: length, wallCells, phase: "wall" } },
    event: { type: "RESTART_WALL_POSITION_SET", team: opponentOfTeam(restartSetup.team), metadata: { restartType: restartSetup.type, offset, length, wallCells } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// The nearest empty cell to `target` (not occupied by any non-ball piece,
// board-bounded), searching outward ring by ring. Used only to make room
// for a computed wall/executor placement — never a gameplay-legal-move
// search, just "closest free square".
function nearestFreeCell(pieces, target, boardSettings, extraOccupied = []) {
  const cols = Math.max(1, Number(boardSettings?.cols) || 1);
  const rows = Math.max(1, Number(boardSettings?.rows) || 1);
  const occupied = new Set((pieces || []).filter(piece => piece?.team !== "BALL").map(piece => `${Number(piece.x)},${Number(piece.y)}`));
  extraOccupied.forEach(cell => occupied.add(`${cell.x},${cell.y}`));
  const maxRadius = Math.max(cols, rows);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = Number(target.x) + dx;
        const y = Number(target.y) + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (!occupied.has(`${x},${y}`)) return { x, y };
      }
    }
  }
  return null;
}

// A wall or executor cell is computed by the Engine, not chosen by a coach
// — whoever already happens to stand there must be freely, automatically
// relocated to the nearest open cell first, or the new arrival would stack
// on top of them. This costs nothing (no Tracker action, no reposition
// allotment) and never makes that displaced piece part of the wall/executor
// — it keeps behaving as an entirely ordinary player.
// Places the ball piece at a fixed restart's own ballCell — shared by every
// caller that builds a restartSetup (Corner/Goal Kick in shotRules.mjs,
// Free Kick Direct/Indirect), so the ball is never left wherever it
// happened to be sitting when play stopped. Callers clear the destination
// with clearCellForPlacement first, same as the wall/executor cells.
export function moveBallTo(state, x, y) {
  const ballIndex = (state.pieces || []).findIndex(piece => piece?.team === "BALL");
  if (ballIndex < 0) return null;
  return state.pieces.map((piece, index) => (index === ballIndex ? { ...piece, x: Number(x), y: Number(y) } : piece));
}

export function clearCellForPlacement(pieces, cell, boardSettings, excludePieceId) {
  const occupant = (pieces || []).find(piece => piece?.team !== "BALL" && String(piece.id) !== String(excludePieceId)
    && Number(piece.x) === Number(cell.x) && Number(piece.y) === Number(cell.y));
  if (!occupant) return pieces;
  const freeCell = nearestFreeCell(pieces, cell, boardSettings, [cell]);
  if (!freeCell) return pieces;
  return pieces.map(piece => (String(piece.id) === String(occupant.id) ? { ...piece, x: freeCell.x, y: freeCell.y } : piece));
}

// The wall's own cells were already fixed by the coach in the prior
// wall-position step (setRestartWallPosition) — this step only picks which
// specific defending-team pieces fill them, one each, so the count must
// match exactly (the coach already committed to that length; there is no
// "fill fewer of them" option here — that decision was "No Wall" or a
// shorter length, both back at the position step).
export function setRestartWall(state, context, command) {
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "wall") return { accepted: false, reason: "NOT_AT_RESTART_WALL_PHASE" };
  const defendingTeam = opponentOfTeam(restartSetup.team);
  const cells = Array.isArray(restartSetup.wallCells) ? restartSetup.wallCells : [];
  const requestedIds = Array.isArray(command.payload?.pieceIds) ? command.payload.pieceIds.map(id => String(id)) : [];
  const pieceIds = Array.from(new Set(requestedIds));
  if (pieceIds.length !== cells.length) return { accepted: false, reason: "RESTART_WALL_PLAYER_COUNT_MISMATCH" };
  const wallPieces = pieceIds.map(id => (state.pieces || []).find(piece => String(piece?.id || "") === id)).filter(Boolean);
  if (wallPieces.length !== pieceIds.length) return { accepted: false, reason: "RESTART_WALL_PIECE_INVALID" };
  if (wallPieces.some(piece => teamKeyForPiece(piece) !== defendingTeam || isBenchReservePiece(piece))) {
    return { accepted: false, reason: "RESTART_WALL_WRONG_TEAM" };
  }
  let clearedPieces = state.pieces;
  wallPieces.forEach((wallPiece, index) => {
    clearedPieces = clearCellForPlacement(clearedPieces, cells[index], context.boardSettings, wallPiece.id);
  });
  const pieces = clearedPieces.map(piece => {
    const index = wallPieces.findIndex(wallPiece => String(wallPiece.id) === String(piece.id));
    return index >= 0 ? { ...piece, x: cells[index].x, y: cells[index].y } : piece;
  });
  const nextPhase = restartSetup.repositionCount > 0 ? "reposition" : "executor";
  const repositionRemaining = nextPhase === "reposition"
    ? repositionEntryRemaining(restartSetup, pieces, context.boardSettings)
    : restartSetup.repositionRemaining;
  const nextRestartSetup = { ...restartSetup, wallPieceIds: pieceIds, wallPlaced: pieceIds.length, repositionRemaining, phase: nextPhase };
  return {
    accepted: true,
    nextState: { ...state, pieces, restartSetup: nextRestartSetup },
    event: { type: "RESTART_WALL_SET", team: defendingTeam, metadata: { restartType: restartSetup.type, pieceIds } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

function advanceRepositionTurn(remaining, currentTurn) {
  const other = currentTurn === "attack" ? "defense" : "attack";
  if (remaining[other] > 0) return other;
  if (remaining[currentTurn] > 0) return currentTurn;
  return null;
}

function repositionSideTeam(restartSetup, side) {
  return side === "attack" ? restartSetup.team : opponentOfTeam(restartSetup.team);
}

// Goal Kick only: ids of the non-executing team's own pieces currently
// standing inside the executing team's own box. Read live off state.pieces
// every time — never a precomputed/cached list — so it always reflects
// whatever the team has (or hasn't) cleared so far. Exported so the
// presentation selector can restrict which pieces are clickable and disable
// Skip using this exact same rule, not a re-derived approximation of it.
export function opponentBoxOccupantIds(state, boardSettings, restartSetup) {
  if (!restartSetup || restartSetup.type !== "goalKick") return [];
  const opponentTeam = opponentOfTeam(restartSetup.team);
  return (state?.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece)
    && teamKeyForPiece(piece) === opponentTeam
    && insideOwnPenaltyArea(boardSettings, piece, restartSetup.team)).map(piece => String(piece.id));
}

// Corner / Free Kick Direct / Free Kick Indirect only: confirmed live with
// the user — a defending piece standing closer to the ball than this legal
// minimum can otherwise permanently soft-lock the restart (nobody but the
// executor may Move it once execution starts, and its body can block every
// possible route). Distance is judged the same way the wall itself already
// is (docs/FINALISATION_AND_RESTARTS_RULES.md section 7: "exactly five
// cells centre-to-centre... the ball cell is not counted"): 5 cells if the
// piece sits on a pure orthogonal line from the ball, 4 if on a pure
// diagonal — any other (mixed) offset uses the stricter 5-cell threshold.
const DISTANCE_RESTRICTED_RESTART_TYPES = new Set(["corner", "freeKickDirect", "freeKickIndirect"]);

function isWithinIllegalBallDistance(piece, ballCell) {
  const dx = Math.abs(Number(piece.x) - Number(ballCell.x));
  const dy = Math.abs(Number(piece.y) - Number(ballCell.y));
  const isPureDiagonal = dx === dy && dx > 0;
  const chebyshev = Math.max(dx, dy);
  return chebyshev < (isPureDiagonal ? 4 : 5);
}

// Read live off state.pieces every time, same as opponentBoxOccupantIds —
// exported for the same reason (the presentation selector restricts
// clickable pieces and disables Skip using this exact rule).
export function illegalDistanceDefenderIds(state, restartSetup) {
  if (!restartSetup || !DISTANCE_RESTRICTED_RESTART_TYPES.has(restartSetup.type) || !restartSetup.ballCell) return [];
  const defendingTeam = opponentOfTeam(restartSetup.team);
  return (state?.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece)
    && teamKeyForPiece(piece) === defendingTeam
    && isWithinIllegalBallDistance(piece, restartSetup.ballCell)).map(piece => String(piece.id));
}

// Goal Kick only: the non-executing side may not finish its reposition turn
// — by Skip or by exhausting its allotted moves — while it still has a
// player inside the executing team's own box. Rather than precomputing a
// fixed number of "extra" moves, this simply grants one more each time the
// side would otherwise run out with an occupant still there, so it can
// never be exhausted around.
function completeRepositionIfDone(restartSetup, remaining, state, context) {
  // The upfront grant (repositionEntryRemaining, computed once at phase
  // entry) already covers the ordinary case. This is only a safety net for
  // the count drifting since then — e.g. the coach voluntarily repositioning
  // an already-legal defender into an illegal cell mid-phase, which nothing
  // else forbids. Confirmed live with the user: any such extra defense move
  // is matched with an equal extra move for attack too, same as the upfront
  // grant — never a defense-only top-up.
  if (remaining.defense <= 0 && (opponentBoxOccupantIds(state, context.boardSettings, restartSetup).length > 0
    || illegalDistanceDefenderIds(state, restartSetup).length > 0)) {
    return { ...restartSetup, repositionRemaining: { attack: remaining.attack + 1, defense: remaining.defense + 1 }, repositionTurn: "defense" };
  }
  if (remaining.attack <= 0 && remaining.defense <= 0) {
    return { ...restartSetup, repositionRemaining: remaining, phase: "executor" };
  }
  const turn = advanceRepositionTurn(remaining, restartSetup.repositionTurn);
  return { ...restartSetup, repositionRemaining: remaining, repositionTurn: turn || restartSetup.repositionTurn };
}

// Confirmed live with the user: a defending reposition landing directly in
// continuation of the confirmed wall line — the same fixed axis cell
// (wallX) as the wall, immediately extending one end of it by one cell —
// looks like it joined the wall but isn't counted as part of it for this
// restart. Only checked for a confirmed, non-empty wall (a declined "No
// Wall" or zero-length wall has nothing to continue).
function wallContinuationCell(restartSetup, x, y) {
  const cells = Array.isArray(restartSetup.wallCells) ? restartSetup.wallCells : [];
  if (!cells.length) return false;
  const wallX = Number(cells[0].x);
  if (Number(x) !== wallX) return false;
  const ys = cells.map(cell => Number(cell.y));
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return Number(y) === minY - 1 || Number(y) === maxY + 1;
}

function commitRepositionMove(state, context, restartSetup, side, piece, x, y) {
  const turnTeam = repositionSideTeam(restartSetup, side);
  // Reported live: completeRepositionIfDone must see the piece at its NEW
  // cell, not its old one — passing the pre-move state made it re-check
  // illegalDistanceDefenderIds/opponentBoxOccupantIds against the mover's
  // stale position, so the very move that just cleared a violator looked
  // like it hadn't, wrongly re-triggering the "grant one more" safety net
  // (forcing repositionTurn back to "defense" and inflating both sides'
  // remaining counts even though nothing was actually still wrong).
  const pieces = state.pieces.map(item => (item.id === piece.id ? { ...item, x, y } : item));
  const remaining = { ...restartSetup.repositionRemaining, [side]: restartSetup.repositionRemaining[side] - 1 };
  const nextRestartSetup = completeRepositionIfDone(restartSetup, remaining, { ...state, pieces }, context);
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      restartSetup: nextRestartSetup,
      pendingRestartWallContinuation: null,
    },
    event: { type: "RESTART_PIECE_REPOSITIONED", team: turnTeam, metadata: { restartType: restartSetup.type, pieceId: piece.id, x, y } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// The defending coach's own Yes/No gate (confirmed live with the user) for
// a reposition that would land in continuation of the wall — opened by
// repositionRestartPiece itself rather than committing straight away, same
// pattern as Marking's own pendingMarking decision. Yes actually performs
// the move (confirmRestartWallContinuation, below); No leaves the piece
// exactly where it was and the coach simply tries a different cell/piece —
// no move consumed, nothing else changes.
export function confirmRestartWallContinuation(state, context, command) {
  const pending = state.pendingRestartWallContinuation;
  if (!pending) return { accepted: false, reason: "NO_PENDING_WALL_CONTINUATION" };
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "reposition") return { accepted: false, reason: "NOT_AT_RESTART_REPOSITION_PHASE" };
  const piece = (state.pieces || []).find(item => String(item?.id || "") === String(pending.pieceId));
  if (!piece) return { accepted: false, reason: "RESTART_REPOSITION_PIECE_INVALID" };
  return commitRepositionMove(state, context, restartSetup, pending.side, piece, pending.x, pending.y);
}

export function declineRestartWallContinuation(state, context, command) {
  if (!state.pendingRestartWallContinuation) return { accepted: false, reason: "NO_PENDING_WALL_CONTINUATION" };
  return {
    accepted: true,
    nextState: { ...state, pendingRestartWallContinuation: null },
    event: { type: "RESTART_WALL_CONTINUATION_DECLINED", team: state.pendingRestartWallContinuation.team, metadata: {} },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

export function repositionRestartPiece(state, context, command) {
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "reposition") return { accepted: false, reason: "NOT_AT_RESTART_REPOSITION_PHASE" };
  const side = restartSetup.repositionTurn;
  if (restartSetup.repositionRemaining[side] <= 0) return { accepted: false, reason: "RESTART_REPOSITION_TURN_EXHAUSTED" };
  const turnTeam = repositionSideTeam(restartSetup, side);
  const piece = (state.pieces || []).find(item => String(item?.id || "") === String(command.payload?.pieceId || ""));
  if (!piece || piece.team === "BALL" || isBenchReservePiece(piece)) return { accepted: false, reason: "RESTART_REPOSITION_PIECE_INVALID" };
  if (teamKeyForPiece(piece) !== turnTeam) return { accepted: false, reason: "RESTART_REPOSITION_WRONG_TEAM" };
  // Goal Kick only: while the non-executing side still has ANY player inside
  // the executing team's own box, it must move one of THOSE players next —
  // it cannot touch any other player of its own until the box is clear.
  if (restartSetup.type === "goalKick" && side === "defense") {
    const boxOccupantIds = opponentBoxOccupantIds(state, context.boardSettings, restartSetup);
    if (boxOccupantIds.length && !boxOccupantIds.includes(String(piece.id))) {
      return { accepted: false, reason: "RESTART_MUST_REPOSITION_BOX_PLAYER_FIRST" };
    }
  }
  // Corner / Free Kick: the defending side must move any of its own pieces
  // standing closer to the ball than the legal minimum distance before it
  // may touch any other player of its own — see illegalDistanceDefenderIds.
  if (side === "defense") {
    const illegalIds = illegalDistanceDefenderIds(state, restartSetup);
    if (illegalIds.length && !illegalIds.includes(String(piece.id))) {
      return { accepted: false, reason: "RESTART_MUST_REPOSITION_ILLEGAL_DISTANCE_PLAYER_FIRST" };
    }
  }
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { accepted: false, reason: "RESTART_TARGET_INVALID" };
  const cols = Number(context.boardSettings?.cols);
  const rows = Number(context.boardSettings?.rows);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return { accepted: false, reason: "RESTART_TARGET_OUTSIDE_BOARD" };
  if (restartSetup.ballCell && x === restartSetup.ballCell.x && y === restartSetup.ballCell.y) {
    return { accepted: false, reason: "RESTART_TARGET_IS_BALL_CELL" };
  }
  // Goal Kick only (docs/FINALISATION_AND_RESTARTS_RULES.md section 4): the
  // team NOT executing may not use reposition to add a player into the
  // executing (goalkeeper's) own large or small penalty area. The executing
  // team's own players are unrestricted there. Corner deliberately has no
  // such restriction — the attacking team is meant to be able to stack the
  // box it's attacking.
  if (restartSetup.type === "goalKick" && turnTeam !== restartSetup.team && insideOwnPenaltyArea(context.boardSettings, { x, y }, restartSetup.team)) {
    return { accepted: false, reason: "RESTART_TARGET_INSIDE_EXECUTING_TEAM_BOX" };
  }
  // Corner / Free Kick: reported live — a defender could be repositioned
  // right back INTO the illegal distance (nothing above stopped the
  // destination itself), which the coach could exploit to farm extra
  // reposition moves, since the same piece would just get flagged
  // "must move first" again next turn. The defending side may never place a
  // piece there in the first place — not just "must clear an existing one".
  if (side === "defense" && DISTANCE_RESTRICTED_RESTART_TYPES.has(restartSetup.type) && restartSetup.ballCell
    && isWithinIllegalBallDistance({ x, y }, restartSetup.ballCell)) {
    return { accepted: false, reason: "RESTART_TARGET_WITHIN_ILLEGAL_DISTANCE" };
  }
  const occupied = (state.pieces || []).some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y);
  if (occupied) return { accepted: false, reason: "RESTART_TARGET_OCCUPIED" };
  // Defense only — extending the wall's own line is only ever a defensive
  // concept. Opens the Yes/No gate instead of moving the piece straight
  // away; see confirmRestartWallContinuation/declineRestartWallContinuation.
  if (side === "defense" && wallContinuationCell(restartSetup, x, y)) {
    return {
      accepted: true,
      nextState: { ...state, pendingRestartWallContinuation: { pieceId: piece.id, x, y, side, team: turnTeam } },
      event: { type: "RESTART_WALL_CONTINUATION_PENDING", team: turnTeam, metadata: { pieceId: piece.id, x, y } },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  return commitRepositionMove(state, context, restartSetup, side, piece, x, y);
}

// Skips only the ONE move it's the current side's turn to make — not every
// remaining move for that side. The turn still alternates normally
// afterward, so a side that still has moves left gets another turn later.
export function passRestartReposition(state, context, command) {
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "reposition") return { accepted: false, reason: "NOT_AT_RESTART_REPOSITION_PHASE" };
  const side = restartSetup.repositionTurn;
  if (restartSetup.repositionRemaining[side] <= 0) return { accepted: false, reason: "RESTART_REPOSITION_TURN_EXHAUSTED" };
  // Goal Kick only: the non-executing side cannot skip away while it still
  // has a player standing inside the executing team's own box.
  if (restartSetup.type === "goalKick" && side === "defense" && opponentBoxOccupantIds(state, context.boardSettings, restartSetup).length > 0) {
    return { accepted: false, reason: "RESTART_MUST_CLEAR_OWN_PLAYERS_FROM_BOX" };
  }
  // Corner / Free Kick: the defending side cannot skip away while it still
  // has a player standing within the illegal minimum distance of the ball.
  if (side === "defense" && illegalDistanceDefenderIds(state, restartSetup).length > 0) {
    return { accepted: false, reason: "RESTART_MUST_CLEAR_ILLEGAL_DISTANCE_PLAYERS_FIRST" };
  }
  const remaining = { ...restartSetup.repositionRemaining, [side]: restartSetup.repositionRemaining[side] - 1 };
  const nextRestartSetup = completeRepositionIfDone(restartSetup, remaining, state, context);
  return {
    accepted: true,
    nextState: { ...state, restartSetup: nextRestartSetup },
    event: { type: "RESTART_REPOSITION_PASSED", team: repositionSideTeam(restartSetup, side), metadata: { restartType: restartSetup.type } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// The attacking coach's one choice in every restart type: which of its
// pieces takes it. The ball cell itself is never chosen here — it was
// already fixed (automatically, or at random for Corner/Goal Kick) when the
// restart setup started. The selected piece is simply moved to that cell.
export function selectRestartExecutor(state, context, command) {
  const restartSetup = state.restartSetup;
  if (!restartSetup || restartSetup.phase !== "executor") return { accepted: false, reason: "NOT_AT_RESTART_EXECUTOR_PHASE" };
  const piece = (state.pieces || []).find(item => String(item?.id || "") === String(command.payload?.pieceId || ""));
  if (!piece || piece.team === "BALL" || isBenchReservePiece(piece)) return { accepted: false, reason: "RESTART_EXECUTOR_PIECE_INVALID" };
  if (teamKeyForPiece(piece) !== restartSetup.team) return { accepted: false, reason: "RESTART_EXECUTOR_WRONG_TEAM" };
  const { x, y } = restartSetup.ballCell || {};
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return { accepted: false, reason: "RESTART_BALL_CELL_INVALID" };
  const nextRestartSetup = { ...restartSetup, executorId: piece.id, phase: "execution" };
  const clearedPieces = clearCellForPlacement(state.pieces, { x: Number(x), y: Number(y) }, context.boardSettings, piece.id);
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces: clearedPieces.map(item => (item.id === piece.id ? { ...item, x: Number(x), y: Number(y) } : item)),
      restartSetup: nextRestartSetup,
    },
    event: { type: "RESTART_EXECUTOR_SELECTED", team: restartSetup.team, metadata: { restartType: restartSetup.type, pieceId: piece.id, x: Number(x), y: Number(y) } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
