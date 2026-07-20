import test from "node:test";
import assert from "node:assert/strict";
import { canControlResolution, resolutionUiState } from "./resolutionAuthority.mjs";

test("offline resolution remains locally controllable", () => {
  assert.equal(canControlResolution({ resolution: { team: "red" } }), true);
});

test("multiplayer resolution is controlled only by its team owner", () => {
  assert.equal(canControlResolution({ sessionActive: true, myTeam: "red", resolution: { team: "red" } }), true);
  assert.equal(canControlResolution({ sessionActive: true, myTeam: "blue", resolution: { team: "red" } }), false);
  assert.equal(canControlResolution({ sessionActive: true, myTeam: "spectator", resolution: { team: "red" } }), false);
});

test("resolution may be visible without being interactive", () => {
  assert.deepEqual(resolutionUiState({ sessionActive: true, myTeam: "blue", resolution: { team: "red" } }), { visible: true, interactive: false });
});
