import assert from "node:assert/strict";
import test from "node:test";
import { selectSinglePlayerTacticPresentation } from "./matchPresentationSelectors.mjs";

test("selectSinglePlayerTacticPresentation reflects kickoff moment and queued tactics", () => {
  const preMatch = selectSinglePlayerTacticPresentation({ tracker: { gameStarted: false, currentTurn: 0 }, pendingFormation: { blue: null, red: null } });
  assert.equal(preMatch.isKickoffMoment, true);
  assert.equal(preMatch.adjustEligible, true);

  const liveNoRestart = selectSinglePlayerTacticPresentation({ tracker: { gameStarted: true, currentTurn: 4 }, kickoffRestart: null, pendingFormation: { blue: 3, red: null } });
  assert.equal(liveNoRestart.isKickoffMoment, false);
  assert.equal(liveNoRestart.adjustEligible, false);
  assert.deepEqual(liveNoRestart.pendingFormation, { blue: 3, red: null });

  const postGoal = selectSinglePlayerTacticPresentation({ tracker: { gameStarted: true, currentTurn: 5 }, kickoffRestart: { team: "blue", pieceId: "A-0" }, pendingFormation: { blue: null, red: null } });
  assert.equal(postGoal.isKickoffMoment, true);
  assert.equal(postGoal.adjustEligible, true);
});
