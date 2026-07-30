import assert from "node:assert/strict";
import test from "node:test";
import { fromCoord } from "./boardGeometry.mjs";
import { STANDARD_FORMATIONS } from "./standardFormations.mjs";

const circle = { x: 22, y: 14.5, radius: 4 };
const isInsideCentreCircle = ({ x, y }) => ((x + .5 - circle.x) ** 2) + ((y + .5 - circle.y) ** 2) < circle.radius ** 2;

test("the approved fixed formations keep Blue in its half and outside the centre circle", () => {
  assert.equal(STANDARD_FORMATIONS.length, 22);
  STANDARD_FORMATIONS.forEach(formation => {
    assert.equal(formation.players.length, 11, formation.name);
    assert.equal(formation.starterRoleRecipe.length, 11, formation.name);
    const cells = formation.players.map(fromCoord);
    assert.equal(new Set(cells.map(cell => `${cell.x}:${cell.y}`)).size, 11, formation.name);
    cells.forEach(cell => {
      assert.ok(cell.x >= 0 && cell.x < 22, `${formation.name}: Blue must stay in its own half`);
      assert.equal(isInsideCentreCircle(cell), false, `${formation.name}: no default player may be in the centre circle`);
      const redMirrorX = 43 - cell.x;
      assert.ok(redMirrorX >= 22 && redMirrorX < 44, `${formation.name}: Red mirror must stay in its own half`);
      assert.equal(isInsideCentreCircle({ x: redMirrorX, y: cell.y }), false, `${formation.name}: no Red mirror may be in the centre circle`);
    });
  });
});

test("central forwards use the closest legal own-half positions outside the centre circle", () => {
  STANDARD_FORMATIONS.forEach(formation => {
    formation.starterRoleRecipe.forEach((role, index) => {
      if (role !== "ST") return;
      const cell = fromCoord(formation.players[index]);
      assert.ok(cell.x >= 17, `${formation.name}: ST should be advanced toward the centre circle`);
      assert.equal(isInsideCentreCircle(cell), false, `${formation.name}: ST must remain outside the centre circle`);
    });
  });
});
