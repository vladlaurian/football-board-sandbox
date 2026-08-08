import { isTeamTacticLegal } from "./tacticLegalityRules.mjs";
import { kickoffCentreCell } from "./kickoffMomentRules.mjs";
import { applyFormationToTeamPieces } from "../board/formationLayout.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";

// The only entry point for Prep's mid-Match `Ready`, pressed while a
// post-goal kickoff restart is pending for that team. It re-lays out the
// team into its active tactic (so a piece pinned by an earlier tactic
// change returns to its real slot), re-validates the tactic, then picks
// whichever piece is that team's ST under the CURRENT tactic — not
// whatever was picked back when the goal happened — and pins it (and the
// ball) to centre. The UI only dispatches this command and displays
// whatever reason comes back; every decision here is the Engine's.
export function confirmKickoffReady(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
  if (!team) return { accepted: false, reason: "KICKOFF_READY_TEAM_INVALID" };
  if (!state.kickoffRestart || state.kickoffRestart.team !== team) return { accepted: false, reason: "NOT_AT_KICKOFF_RESTART" };
  const teamCode = team === "blue" ? "A" : "B";
  const activeFormationId = state.activeFormation?.[team];
  if (!isTeamTacticLegal(state.pieces, context.gameplayCardsById, teamCode, activeFormationId)) {
    return { accepted: false, reason: "TEAM_TACTIC_INVALID" };
  }
  const pieces = activeFormationId
    ? applyFormationToTeamPieces(state.pieces, teamCode, formationById(activeFormationId), context.boardSettings)
    : state.pieces;
  const candidates = pieces.filter(piece => piece?.team === teamCode && !piece.inactive && !isBenchReservePiece(piece));
  const kickoffPiece = candidates.find(piece => context.gameplayCardsById?.[String(piece.cardId)]?.position === "ST") || candidates[0] || null;
  if (!kickoffPiece) return { accepted: false, reason: "KICKOFF_READY_NO_PIECE" };
  const centre = kickoffCentreCell(team, context.boardSettings);
  const nextPieces = pieces.map(piece => (piece?.team === "BALL" || String(piece.id) === String(kickoffPiece.id))
    ? { ...piece, x: centre.x, y: centre.y }
    : piece);
  return {
    accepted: true,
    nextState: { ...state, pieces: nextPieces, kickoffRestart: { team, pieceId: kickoffPiece.id } },
    event: { type: "KICKOFF_READY_CONFIRMED", team, metadata: { pieceId: kickoffPiece.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
