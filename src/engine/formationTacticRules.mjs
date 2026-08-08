import { isKickoffMoment, pinKickoffPieceAtCentre } from "./kickoffMomentRules.mjs";
import { applyFormationToTeamPieces } from "../board/formationLayout.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { isTeamTacticLegal } from "./tacticLegalityRules.mjs";

// A confirmed tactic mid-Match either lands on the real board immediately
// (a kickoff moment: pre-Match Timeline start or a pending post-goal
// restart) or is queued in state.pendingFormation for the next one. This is
// the ONLY entry point that may move live pieces for a tactic change once
// the Match Timeline has started — Prep's pre-Match Formation control keeps
// its existing, separate, non-Timeline Workspace path (see
// docs/TEAM_COMPOSITION_AND_FORMATIONS.md, section 5.5/5.8).
export function confirmFormationTactic(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
  if (!team) return { accepted: false, reason: "FORMATION_TACTIC_TEAM_INVALID" };
  const formationId = Number(command.payload?.formationId);
  if (!Number.isFinite(formationId)) return { accepted: false, reason: "FORMATION_TACTIC_INVALID" };
  const formation = formationById(formationId);
  const pieceTeamCode = team === "blue" ? "A" : "B";

  if (isKickoffMoment(state)) {
    let nextPieces = applyFormationToTeamPieces(state.pieces, pieceTeamCode, formation, context.boardSettings);
    // A tactic confirmed while a post-goal restart is still pending must
    // never move the ball or the entitled kick-off piece off centre, even
    // if that piece belongs to the team whose tactic just changed.
    if (state.kickoffRestart) nextPieces = pinKickoffPieceAtCentre(nextPieces, state.kickoffRestart, context.boardSettings);
    const legal = isTeamTacticLegal(nextPieces, context.gameplayCardsById, pieceTeamCode, formation.id);
    return {
      accepted: true,
      nextState: {
        ...state,
        pieces: nextPieces,
        pendingFormation: { ...state.pendingFormation, [team]: null },
        activeFormation: { ...state.activeFormation, [team]: formation.id },
        tacticBlock: { ...state.tacticBlock, [team]: !legal },
      },
      event: { type: "FORMATION_TACTIC_APPLIED", team, metadata: { formationId: formation.id } },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }

  return {
    accepted: true,
    nextState: { ...state, pendingFormation: { ...state.pendingFormation, [team]: formation.id } },
    event: { type: "FORMATION_TACTIC_QUEUED", team, metadata: { formationId: formation.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
