import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFormationCompatibility, planFormationRoleAssignment, suggestedCompatibleFormations } from "./formationCompatibility.mjs";

const formation = { id: 1, name: "4-3-3 Holding", starterRoleRecipe: ["GK","LB","CB","CB","RB","CDM","CM","CM","LW","RW","ST"] };
const cardsById = Object.fromEntries(["GK","LB","CB","CB","RB","CDM","CDM","CAM","LW","RW","ST"].map((position, index) => [`c${index}`, { id: `c${index}`, name: `P${index}`, position }]));
const pieces = Object.keys(cardsById).map((cardId, index) => ({ id: `A-${index}`, team: "A", cardId }));

test("an incompatible formation preserves every starter card while reporting the exact missing and excess roles", () => {
  const plan = planFormationRoleAssignment({ pieces, cardsById, team: "A", formation });
  assert.deepEqual(plan.missing, ["CM", "CM"]);
  assert.deepEqual(plan.excess.sort(), ["CAM", "CDM"]);
  assert.equal(Object.values(plan.cardIdsByStarterIndex).filter(Boolean).length, 11);
  assert.equal(plan.slotProblems.length, 2);
  assert.equal(plan.slotProblems.every(problem => problem.cardId === pieces.find(piece => piece.id === problem.pieceId)?.cardId), true);
});

test("compatible formation suggestions require capacity for every already assigned starter role", () => {
  const compatible = { id: 2, name: "4-2-1-3 ATT", starterRoleRecipe: ["GK","LB","CB","CB","RB","CDM","CDM","CAM","LW","RW","ST"] };
  const suggestions = suggestedCompatibleFormations({ formations: [formation, compatible], pieces, cardsById, team: "A" });
  assert.deepEqual(suggestions.map(item => item.id), [2]);
  assert.equal(analyzeFormationCompatibility({ pieces, cardsById, team: "A", formation: compatible }).exact, true);
});
