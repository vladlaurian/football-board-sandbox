import { formationById } from "../board/standardFormations.mjs";
import { analyzeFormationCompatibility } from "../workspace/formationCompatibility.mjs";

// No tactic tracked yet (Continue Game never sets one) means there is
// nothing to validate — the roster cap/role check only ever applied at
// Prep's own Ready gate for that flow, and stays that way.
export function isTeamTacticLegal(pieces, cardsById, teamCode, formationId) {
  if (!formationId) return true;
  return analyzeFormationCompatibility({ pieces, cardsById, team: teamCode, formation: formationById(formationId) }).exact;
}
