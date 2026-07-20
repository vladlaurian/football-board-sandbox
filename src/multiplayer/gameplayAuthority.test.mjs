import test from "node:test";
import assert from "node:assert/strict";
import { gameplayCommandLockState, validateGameplayIntent } from "./gameplayAuthority.mjs";

test("multiplayer gameplay is locked while a command, sync, or snapshot is pending", () => {
  assert.equal(gameplayCommandLockState({ sessionActive: true, intentPending: true }), true);
  assert.equal(gameplayCommandLockState({ sessionActive: true, syncPending: true }), true);
  assert.equal(gameplayCommandLockState({ sessionActive: true, applyingSnapshot: true }), true);
  assert.equal(gameplayCommandLockState({ sessionActive: false, intentPending: true }), false);
});

test("gameplay intent requires canonical revision and team ownership", () => {
  const command = { type: "DICE_ROLLED", team: "red", before: { gameMode: "match" }, after: { gameMode: "match" } };
  const accepted = validateGameplayIntent({
    intent: { command, requestedTeam: "red", requestedByUid: "red-owner", baseRevision: 12 },
    canonicalRevision: 12,
    teamOwners: { red: "red-owner" },
  });
  assert.equal(accepted.valid, true);

  assert.equal(validateGameplayIntent({
    intent: { command, requestedTeam: "red", requestedByUid: "red-owner", baseRevision: 11 },
    canonicalRevision: 12,
    teamOwners: { red: "red-owner" },
  }).rejectionReason, "stale-revision");

  assert.equal(validateGameplayIntent({
    intent: { command, requestedTeam: "red", requestedByUid: "blue-owner", baseRevision: 12 },
    canonicalRevision: 12,
    teamOwners: { red: "red-owner" },
  }).rejectionReason, "unauthorized-team");
});
