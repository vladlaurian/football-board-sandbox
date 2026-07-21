import test from "node:test";
import assert from "node:assert/strict";
import { deriveInteractionState } from "./interactionState.mjs";

const pieces = [
  { id: "a1", team: "A" },
  { id: "b1", team: "B" },
  { id: "inactive", team: "A", inactive: true },
];

test("pass reconstructs the canonical passer independently of local selection", () => {
  const state = deriveInteractionState({ pieces, actionResolution: { kind: "pass", status: "targeting", passerId: "a1", team: "blue" }, canControlResolution: true });
  assert.equal(state.activePieceId, "a1");
  assert.equal(state.canCancelPass, true);
  assert.equal(state.activePieceId, "a1");
});

test("guest can see a pass without receiving interaction authority", () => {
  const state = deriveInteractionState({ pieces, actionResolution: { kind: "pass", status: "route-selection", passerId: "a1", team: "blue" }, canControlResolution: false });
  assert.equal(state.activePieceId, "a1");
  assert.equal(state.canControl, false);
  assert.equal(state.canCancelPass, false);
});

test("bonus move reconstructs its piece and end control does not require inspector state", () => {
  const state = deriveInteractionState({ pieces, actionContinuation: { kind: "bonus-card-action", status: "action-active", actionType: "MOVE", pieceId: "b1", team: "red" }, canControlContinuation: true });
  assert.equal(state.activePieceId, "b1");
  assert.equal(state.cursorMode, "bonus-move");
  assert.equal(state.canEndBonusAction, true);
});

test("ready bonus action has no forced piece but exposes canonical end control", () => {
  const state = deriveInteractionState({ pieces, actionContinuation: { kind: "bonus-card-action", status: "ready", team: "blue" }, canControlContinuation: true });
  assert.equal(state.activePieceId, null);
  assert.equal(state.canEndBonusAction, true);
});

test("free move reconstructs its active piece", () => {
  const state = deriveInteractionState({ pieces, matchActionState: { freeMode: { active: true, pieceId: "a1", team: "blue" } } });
  assert.equal(state.kind, "free-move");
  assert.equal(state.activePieceId, "a1");
});

test("missing or inactive canonical pieces never create ghost selection", () => {
  const missing = deriveInteractionState({ pieces, actionResolution: { kind: "pass", status: "targeting", passerId: "missing" }, canControlResolution: true });
  const inactive = deriveInteractionState({ pieces, actionResolution: { kind: "pass", status: "targeting", passerId: "inactive" }, canControlResolution: true });
  assert.equal(missing.activePieceId, null);
  assert.equal(inactive.activePieceId, null);
});


test("canonical active piece remains presentation data and does not replace local selection", () => {
  const localSelectedId = "b1";
  const state = deriveInteractionState({ pieces, actionResolution: { kind: "pass", status: "awaiting-interception-roll", passerId: "a1", team: "blue" }, canControlResolution: false });
  assert.equal(state.activePieceId, "a1");
  assert.equal(localSelectedId, "b1");
  assert.equal(state.cursorMode, null);
});
