import assert from "node:assert/strict";
import test from "node:test";
import { areBothPrepTeamsReady, createPrepReadyTeams, invalidatePrepTeamReady, markPrepTeamReady } from "./teamPrepReadiness.mjs";

test("Prep readiness is separate per team and Start New needs both confirmations", () => {
  const initial = createPrepReadyTeams();
  const blueReady = markPrepTeamReady(initial, "A");
  assert.deepEqual(blueReady, { A: true, B: false });
  assert.equal(areBothPrepTeamsReady(blueReady), false);
  assert.equal(areBothPrepTeamsReady(markPrepTeamReady(blueReady, "B")), true);
});

test("a Prep mutation invalidates only the changed team", () => {
  const ready = { A: true, B: true };
  assert.deepEqual(invalidatePrepTeamReady(ready, "A"), { A: false, B: true });
  assert.deepEqual(invalidatePrepTeamReady(ready, "B"), { A: true, B: false });
});
