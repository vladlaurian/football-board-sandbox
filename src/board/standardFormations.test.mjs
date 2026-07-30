import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_FORMATIONS } from "./standardFormations.mjs";

test("the standard catalogue contains the approved 22 fixed formations outside the centre-circle corridor", () => {
  assert.equal(STANDARD_FORMATIONS.length, 22);
  STANDARD_FORMATIONS.forEach(formation => {
    assert.equal(formation.players.length, 11);
    assert.equal(formation.starterRoleRecipe.length, 11);
    formation.players.forEach(coordinate => {
      const column = Number(String(coordinate).match(/\d+$/)?.[0]);
      assert.equal(column < 18 || column > 25, true, `${formation.name} leaves ${coordinate} in the centre corridor`);
    });
  });
});
