import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

// A "kickoff moment" is when a tactic/formation may safely be pushed to the
// real board without displacing a live Match: either the Match has not
// started its first turn yet (Prep, pre-Start-New-Game), or a goal's forced
// restart is pending and the entitled kick-off pass has not been played yet.
// Half-time/extra-time restarts are a future third case (no such state exists
// yet) and must be added here, not by inventing a second gate elsewhere.
export function isKickoffMoment(state) {
  const tracker = normalizeTrackerSnapshot(state?.tracker);
  if (!tracker.gameStarted || tracker.currentTurn < 1) return true;
  return Boolean(state?.kickoffRestart);
}

// The centre cell the entitled team's kick-off piece and the ball must
// occupy — shared by the goal consequence and any tactic/Adjust change that
// happens to land while that restart is still pending, so neither can ever
// displace the one piece the restart depends on.
export function kickoffCentreCell(entitledTeam, boardSettings) {
  const cols = Number(boardSettings?.cols);
  const halfwayRight = Math.floor(cols / 2);
  return {
    x: entitledTeam === "blue" ? halfwayRight : halfwayRight - 1,
    y: Math.floor(Number(boardSettings?.rows) / 2),
  };
}

export function pinKickoffPieceAtCentre(pieces, kickoffRestart, boardSettings) {
  if (!kickoffRestart?.pieceId) return pieces;
  const centre = kickoffCentreCell(kickoffRestart.team, boardSettings);
  return (pieces || []).map(piece => (piece?.team === "BALL" || String(piece.id) === String(kickoffRestart.pieceId))
    ? { ...piece, x: centre.x, y: centre.y }
    : piece);
}

// The restart ends the moment its entitled piece completes ANY pass type
// (Short/Long/Through Ball/Lofted Through Ball) — shared by every pass
// family's commit point so none of them has to reimplement this check.
export function kickoffRestartAfterAction(state, actorPieceId) {
  return state.kickoffRestart?.pieceId === String(actorPieceId) ? null : state.kickoffRestart;
}
