import test from "node:test";
import assert from "node:assert/strict";
import { canControlBonusAction, validateBonusActionEndIntent } from "./bonusActionAuthority.mjs";

const continuation = { id: "ba-1", kind: "bonus-card-action", team: "red", status: "ready" };

test("only the local owner team controls a multiplayer bonus action", () => {
  assert.equal(canControlBonusAction({ sessionActive: true, myTeam: "red", continuation }), true);
  assert.equal(canControlBonusAction({ sessionActive: true, myTeam: "blue", continuation }), false);
  assert.equal(canControlBonusAction({ sessionActive: true, myTeam: "spectator", continuation }), false);
  assert.equal(canControlBonusAction({ sessionActive: false, myTeam: "blue", continuation }), true);
});

test("bonus-action end intent requires canonical continuation and team ownership", () => {
  const intent = { requestId: "req-1", continuationId: "ba-1", team: "red", requestedByUid: "red-user" };
  assert.equal(validateBonusActionEndIntent({ intent, continuation, actionResolution: null, teamOwners: { red: "red-user" } }), true);
  assert.equal(validateBonusActionEndIntent({ intent, continuation: { ...continuation, status: "action-active", actionType: "MOVE", pieceId: "r1" }, actionResolution: null, teamOwners: { red: "red-user" } }), true);
  assert.equal(validateBonusActionEndIntent({ intent, continuation: { ...continuation, status: "awaiting-end-bonus-action" }, actionResolution: null, teamOwners: { red: "red-user" } }), true);
  assert.equal(validateBonusActionEndIntent({ intent: { ...intent, requestedByUid: "blue-user" }, continuation, actionResolution: null, teamOwners: { red: "red-user" } }), false);
  assert.equal(validateBonusActionEndIntent({ intent, continuation: { ...continuation, status: "invalid-status" }, actionResolution: null, teamOwners: { red: "red-user" } }), false);
  assert.equal(validateBonusActionEndIntent({ intent, continuation, actionResolution: { kind: "pass" }, teamOwners: { red: "red-user" } }), false);
});
