import { isBenchReservePiece } from "../board/formationUtils.mjs";

const validRole = role => /^[A-Z]+$/.test(String(role || ""));
const nameFor = card => card?.name || card?.id || "Assigned card";
const count = roles => roles.reduce((all, role) => ({ ...all, [role]: (all[role] || 0) + 1 }), {});

export function formationRoleRecipe(formation) {
  return Array.isArray(formation?.starterRoleRecipe) && formation.starterRoleRecipe.length === 11
    ? formation.starterRoleRecipe.map(role => String(role || "").toUpperCase()) : [];
}

export function analyzeFormationCompatibility({ pieces = [], cardsById = {}, team, formation } = {}) {
  const recipe = formationRoleRecipe(formation);
  const starters = pieces.filter(piece => piece?.team === team && !isBenchReservePiece(piece));
  const entries = starters.map((piece, index) => {
    const card = cardsById[String(piece.cardId || "")] || null;
    return { piece, card, role: String(card?.position || "").toUpperCase(), index };
  });
  const expected = count(recipe);
  const actual = count(entries.filter(entry => entry.card && validRole(entry.role)).map(entry => entry.role));
  const roles = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
  const missing = roles.flatMap(role => Array.from({ length: Math.max(0, (expected[role] || 0) - (actual[role] || 0)) }, () => role));
  const excess = roles.flatMap(role => Array.from({ length: Math.max(0, (actual[role] || 0) - (expected[role] || 0)) }, () => role));
  const compatible = recipe.length === 11 && excess.length === 0 && entries.every(entry => !entry.card || validRole(entry.role));
  const exact = compatible && missing.length === 0 && entries.length === 11 && entries.every(entry => entry.card);
  return { formation, recipe, starters, entries, expected, actual, missing, excess, compatible, exact };
}

export function planFormationRoleAssignment({ pieces = [], cardsById = {}, team, formation } = {}) {
  const analysis = analyzeFormationCompatibility({ pieces, cardsById, team, formation });
  const available = [...analysis.entries];
  const slotAssignments = analysis.recipe.map(expectedRole => {
    const matchingIndex = available.findIndex(entry => entry.role === expectedRole);
    const entry = matchingIndex >= 0 ? available.splice(matchingIndex, 1)[0] : null;
    return { expectedRole, entry, mismatch: false };
  });
  available.forEach(entry => {
    const slot = slotAssignments.find(candidate => !candidate.entry);
    if (slot) { slot.entry = entry; slot.mismatch = entry.role !== slot.expectedRole; }
  });
  const cardIdsByStarterIndex = Object.fromEntries(slotAssignments.map((slot, index) => [index, slot.entry?.piece?.cardId || null]));
  const slotProblems = slotAssignments.map((slot, index) => slot.entry && slot.entry.role !== slot.expectedRole ? ({
    index, pieceId: `${team}-${index}`, expectedRole: slot.expectedRole, actualRole: slot.entry.role, cardName: nameFor(slot.entry.card), cardId: slot.entry.piece.cardId,
  }) : null).filter(Boolean);
  return { ...analysis, cardIdsByStarterIndex, slotProblems };
}

export function suggestedCompatibleFormations({ formations = [], pieces = [], cardsById = {}, team } = {}) {
  return formations.filter(formation => analyzeFormationCompatibility({ pieces, cardsById, team, formation }).compatible);
}
