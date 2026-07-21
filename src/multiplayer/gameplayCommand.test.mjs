import test from "node:test";
import assert from "node:assert/strict";
import { createGameplayCommand, GAMEPLAY_ACTION_TYPE, GAMEPLAY_COMMAND_TYPE } from "./gameplayCommand.mjs";
import { routeGameplayCommand } from "./gameplayCommandRouter.mjs";

test("movement command routes only after common authority checks", () => {
  const command = createGameplayCommand({ requestId: "r1", commandType: GAMEPLAY_COMMAND_TYPE.ACTION_STEP, actionType: GAMEPLAY_ACTION_TYPE.MOVE, actorPieceId: "p1", team: "blue", baseRevision: 7, requestedByUid: "u1", payload: { x: 4, y: 6 } });
  assert.deepEqual(routeGameplayCommand(command, { canonicalRevision: 7, teamOwners: { blue: "u1" }, piece: { id: "p1" } }), { accepted: true, reason: null, domain: "movement", mode: "normal" });
});

test("stale and unauthorized commands are rejected before a motor is called", () => {
  const command = createGameplayCommand({ requestId: "r2", commandType: GAMEPLAY_COMMAND_TYPE.ACTION_STEP, actionType: GAMEPLAY_ACTION_TYPE.BONUS_MOVE, actorPieceId: "p1", team: "red", baseRevision: 3, requestedByUid: "guest" });
  assert.equal(routeGameplayCommand(command, { canonicalRevision: 4, teamOwners: { red: "guest" }, piece: { id: "p1" } }).reason, "stale-revision");
  assert.equal(routeGameplayCommand({ ...command, baseRevision: 4 }, { canonicalRevision: 4, teamOwners: { red: "host" }, piece: { id: "p1" } }).reason, "unauthorized-owner");
});

test("the router keeps movement lifecycles distinct", () => {
  const context = { canonicalRevision: 1, teamOwners: { blue: "u" }, piece: { id: "p" } };
  for (const [actionType, mode] of [[GAMEPLAY_ACTION_TYPE.MOVE, "normal"], [GAMEPLAY_ACTION_TYPE.GROUP_MOVE, "group"], [GAMEPLAY_ACTION_TYPE.BONUS_MOVE, "bonus"], [GAMEPLAY_ACTION_TYPE.THREE_TWO, "three-two"], [GAMEPLAY_ACTION_TYPE.FREE_MOVE, "free"]]) {
    const command = createGameplayCommand({ requestId: actionType, commandType: GAMEPLAY_COMMAND_TYPE.ACTION_STEP, actionType, actorPieceId: "p", team: "blue", baseRevision: 1, requestedByUid: "u" });
    assert.equal(routeGameplayCommand(command, context).mode, mode);
  }
});
