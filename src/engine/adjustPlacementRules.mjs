import { isKickoffMoment } from "./kickoffMomentRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { formationAdjustCells } from "../prep/adjustZones.mjs";

// The ONLY entry point that may move a live piece via Adjust once the Match
// Timeline has started. Pre-Match Prep keeps its existing, separate,
// non-Timeline Adjust path unchanged (see formationTacticRules.mjs's header
// note for the same pre/mid-Match split, and
// docs/TEAM_COMPOSITION_AND_FORMATIONS.md section 5.4/5.8).
export function placeAdjustPiece(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  if (!isKickoffMoment(state)) return { accepted: false, reason: "ADJUST_NOT_AT_KICKOFF" };
  const piece = (state.pieces || []).find(item => String(item?.id || "") === String(command.payload?.pieceId || ""));
  if (!piece || piece.team === "BALL" || isBenchReservePiece(piece)) return { accepted: false, reason: "ADJUST_PIECE_INVALID" };
  // The entitled kick-off piece must stay glued to the ball at centre for as
  // long as the restart is pending — it cannot be the one being adjusted.
  if (state.kickoffRestart?.pieceId && String(state.kickoffRestart.pieceId) === String(piece.id)) {
    return { accepted: false, reason: "ADJUST_PIECE_IS_KICKOFF_TAKER" };
  }
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { accepted: false, reason: "ADJUST_TARGET_INVALID" };
  const team = piece.team === "A" ? "blue" : "red";
  const formation = formationById(state.activeFormation?.[team]);
  const allowed = formationAdjustCells(piece, formation, context.boardSettings).some(cell => cell.x === x && cell.y === y);
  if (!allowed) return { accepted: false, reason: "ADJUST_OUTSIDE_FORMATION_RANGE" };
  const occupied = (state.pieces || []).some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y);
  if (occupied) return { accepted: false, reason: "ADJUST_CELL_OCCUPIED" };
  return {
    accepted: true,
    nextState: { ...state, pieces: state.pieces.map(item => (item.id === piece.id ? { ...item, x, y } : item)) },
    event: { type: "ADJUST_PIECE_PLACED", team, metadata: { pieceId: piece.id, x, y } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
