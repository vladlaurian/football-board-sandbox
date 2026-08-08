// Untracked extra repositions after a Goalkeeper Retains (confirmed live
// with the user): up to `count` alternating moves per side, the goalkeeper's
// own (fresh attacking) team first, using REAL movement legality — the
// piece's own Speed stat, diagonal cost, axis lock, same as an ordinary
// Normal Move — but none of it is ever written to the Tracker (no action
// economy, no personal-action count, nothing). This is why it is its own
// small parallel engine rather than a reuse of normalMoveRules.mjs directly:
// that module's evaluate/commit is inseparably wired into Tracker
// activation, Marking and the offside claim — none of which make sense
// during this pre-play "settle everyone's position" window. The pure
// geometry/cost primitives (getMovementGeometry, diagonalCostForDistance,
// firstPlayerBlockingMovementPath) are the same ones Normal Move itself
// uses, so legality can never drift between the two.
//
// Editable from Rules (actions.shot.goalkeeperRetainsReposition): a per-side
// move count (0 disables the whole phase — "no move, resume normal play")
// and three independent trigger checkboxes (after Free Kick, after a corner
// header — inert until that mechanic exists, any catch at all). See
// gkRepositionTriggerApplies below and its call site in shotRules.mjs.
import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { opponentOfTeam } from "./restartSetupRules.mjs";

function gkMovementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
  };
}

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return (state.pieces || []).find(piece => String(piece?.id || "") === pieceId) || null;
}

function movementSpeed(piece, context) {
  const card = context?.gameplayCardsById?.[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

function activeTeamKey(gkReposition) {
  return gkReposition.turn === "self" ? gkReposition.team : gkReposition.opponentTeam;
}

export function buildGkReposition(ruleSet, team) {
  const config = ruleSet?.actions?.shot?.goalkeeperRetainsReposition;
  const count = Math.max(0, Number(config?.count) || 0);
  if (count <= 0) return null;
  return {
    team,
    opponentTeam: opponentOfTeam(team),
    turn: "self",
    remaining: { self: count, opponent: count },
    count,
    activePieceId: null,
    // Reported live: each of the `count` turns must go to a DIFFERENT
    // piece — otherwise the same piece could be picked again on a later
    // turn and walk cumulatively across several turns' worth of Speed,
    // defeating the point of the per-turn cap (e.g. a goalkeeper walking
    // all the way into the opponent's box). Once a piece has been picked
    // for any turn (endGkRepositionTurn), it is retired for the rest of
    // this whole phase, not just for that one turn.
    usedPieceIds: [],
  };
}

// `key` is one of "afterFreeKick" / "afterCornerHeader" / "anyCatch" —
// checked independently by the caller alongside "anyCatch" itself, so any
// combination of checked boxes works (confirmed live with the user).
export function gkRepositionTriggerApplies(ruleSet, key) {
  return Boolean(ruleSet?.actions?.shot?.goalkeeperRetainsReposition?.[key]);
}

// Picks which piece acts for the current side's current turn — mirrors
// Normal Move's own MOVE_STARTED activation, but writes nothing to the
// Tracker. Reported live: exactly one piece per turn, same as an ordinary
// Free Kick reposition — once a piece is picked it is LOCKED for the rest of
// this turn (re-picking the SAME piece is a harmless no-op; picking a
// DIFFERENT one is rejected) until endGkRepositionTurn actually spends one
// of the side's allotted moves and clears it. Without this lock the coach
// could switch to a fresh piece after every move and effectively reposition
// the whole team on a single allotted turn.
export function selectGkRepositionPiece(state, context, command) {
  const gkReposition = state.gkReposition;
  if (!gkReposition) return { accepted: false, reason: "NO_GK_REPOSITION_ACTIVE" };
  const side = gkReposition.turn;
  if (gkReposition.remaining[side] <= 0) return { accepted: false, reason: "GK_REPOSITION_TURN_EXHAUSTED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return { accepted: false, reason: "GK_REPOSITION_PIECE_INVALID" };
  if (teamKeyForPiece(piece) !== activeTeamKey(gkReposition)) return { accepted: false, reason: "GK_REPOSITION_WRONG_TEAM" };
  if ((gkReposition.usedPieceIds || []).some(id => String(id) === String(piece.id))) {
    return { accepted: false, reason: "GK_REPOSITION_PIECE_ALREADY_USED" };
  }
  if (gkReposition.activePieceId != null && String(gkReposition.activePieceId) !== String(piece.id)) {
    return { accepted: false, reason: "GK_REPOSITION_PIECE_ALREADY_ACTIVE" };
  }
  return {
    accepted: true,
    nextState: { ...state, gkReposition: { ...gkReposition, activePieceId: piece.id } },
    event: { type: "GK_REPOSITION_PIECE_SELECTED", team: teamKeyForPiece(piece), metadata: { pieceId: piece.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Exported for the Single Player presentation boundary — a preview must use
// the exact validation the commit will use, same convention as
// evaluateNormalMove. `preview: true` allows evaluating geometry/legality
// for a piece not yet selected as this turn's active piece (so hovering
// shows a real answer before the coach has committed to that piece).
export function evaluateGkRepositionMove(state, context, command, { preview = false } = {}) {
  const gkReposition = state.gkReposition;
  if (!gkReposition) return { accepted: false, reason: "NO_GK_REPOSITION_ACTIVE" };
  const piece = pieceForCommand(state, command);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return { accepted: false, reason: "GK_REPOSITION_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  const geometry = getMovementGeometry(piece, { x, y });
  const team = teamKeyForPiece(piece);
  if (team !== activeTeamKey(gkReposition)) return { accepted: false, reason: "GK_REPOSITION_WRONG_TEAM", geometry };
  if (gkReposition.remaining[gkReposition.turn] <= 0) return { accepted: false, reason: "GK_REPOSITION_TURN_EXHAUSTED", geometry };
  if (!preview && String(gkReposition.activePieceId || "") !== String(piece.id)) {
    return { accepted: false, reason: "GK_REPOSITION_PIECE_NOT_ACTIVE", geometry };
  }
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) {
    return { accepted: false, reason: "occupied", geometry };
  }
  if (geometry.kind === "same") return { accepted: false, reason: "same", geometry };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed", geometry };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) {
    return { accepted: false, reason: "path-blocked", geometry };
  }
  const current = gkMovementState(state.gkRepositionMovementByPieceId?.[piece.id]);
  const speed = movementSpeed(piece, context);
  if (speed === null) return { accepted: false, reason: "no-speed", geometry, current };
  if (current.axis && current.axis !== geometry.axis) return { accepted: false, reason: "axis", geometry, speed, current };
  const moveCost = geometry.kind === "diagonal"
    ? diagonalCostForDistance(current.distance + geometry.distance) - diagonalCostForDistance(current.distance)
    : geometry.cost;
  const remaining = Math.max(0, speed - current.spent);
  if (moveCost > remaining) return { accepted: false, reason: "speed", geometry, moveCost, speed, current, remaining };
  return { accepted: true, piece, team, x, y, geometry, current, speed, moveCost, remaining };
}

export function commitGkRepositionMove(state, context, command) {
  const evaluation = evaluateGkRepositionMove(state, context, command);
  if (!evaluation.accepted) return evaluation;
  const { piece, x, y, geometry, current, moveCost, team } = evaluation;
  // A carried ball follows its piece, exactly like Normal Move — the
  // goalkeeper (or a teammate it already passed to within this same window)
  // may well be the one being repositioned.
  const carriesBall = state.pieces.some(item => item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
  const pieces = state.pieces.map(item => {
    if (item.id === piece.id) return { ...item, x, y };
    if (carriesBall && item.team === "BALL") return { ...item, x, y };
    return item;
  });
  const gkRepositionMovementByPieceId = {
    ...state.gkRepositionMovementByPieceId,
    [piece.id]: {
      axis: current.axis || geometry.axis,
      spent: current.spent + moveCost,
      distance: current.distance + geometry.distance,
    },
  };
  return {
    accepted: true,
    nextState: { ...state, pieces, gkRepositionMovementByPieceId },
    event: { type: "GK_REPOSITION_MOVE_COMMITTED", team, metadata: { pieceId: piece.id, from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y } } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Ends the current side's current turn (whether it moved or not — a manual
// "Done"), consuming one of its allotted repositions and handing the turn to
// the other side; once both sides are exhausted the whole phase closes and
// ordinary play (or a pending Bonus Action, confirmed live with the user to
// always come AFTER this phase, never interleaved) resumes.
export function endGkRepositionTurn(state, context, command) {
  const gkReposition = state.gkReposition;
  if (!gkReposition) return { accepted: false, reason: "NO_GK_REPOSITION_ACTIVE" };
  const side = gkReposition.turn;
  if (gkReposition.remaining[side] <= 0) return { accepted: false, reason: "GK_REPOSITION_TURN_EXHAUSTED" };
  const remaining = { ...gkReposition.remaining, [side]: gkReposition.remaining[side] - 1 };
  // Retires the piece that used this turn (if any was ever picked) for the
  // rest of the whole phase — see usedPieceIds on buildGkReposition.
  const usedPieceIds = gkReposition.activePieceId != null
    ? [...(gkReposition.usedPieceIds || []), gkReposition.activePieceId]
    : (gkReposition.usedPieceIds || []);
  // Wipes every piece's session state — a turn boundary is always a clean
  // slate, and the one piece that WAS active this turn is now retired
  // anyway (above), never picked again this phase.
  const gkRepositionMovementByPieceId = {};
  const finishingTeam = activeTeamKey(gkReposition);
  if (remaining.self <= 0 && remaining.opponent <= 0) {
    return {
      accepted: true,
      nextState: { ...state, gkReposition: null, gkRepositionMovementByPieceId: {} },
      event: { type: "GK_REPOSITION_ENDED", team: finishingTeam, metadata: {} },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  const other = side === "self" ? "opponent" : "self";
  const nextTurn = remaining[other] > 0 ? other : side;
  return {
    accepted: true,
    nextState: {
      ...state,
      gkReposition: { ...gkReposition, remaining, turn: nextTurn, activePieceId: null, usedPieceIds },
      gkRepositionMovementByPieceId,
    },
    event: { type: "GK_REPOSITION_TURN_ENDED", team: finishingTeam, metadata: {} },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
