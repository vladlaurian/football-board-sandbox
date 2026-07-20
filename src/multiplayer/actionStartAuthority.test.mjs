import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("guest action starts are semantic intents, not direct Timeline commits", () => {
  assert.match(source, /sessionRuntimeRef\(sessionCode\.toUpperCase\(\), "actionStartIntent"\)/);
  assert.match(source, /mode: "bonus-action"/);
  assert.match(source, /mode: "normal-pass"/);
  assert.match(source, /if \(sessionCode && isSessionGuest && !fromHostIntent\)/);
  assert.match(source, /beginPassTargeting\(piece, \{ fromHostIntent: true \}\)/);
});

test("bonus Pass start and Pass targeting are one canonical host transition", () => {
  assert.match(source, /startPassAtomically: actionType === "PASS"/);
  assert.match(source, /type: pending \? "BONUS_PASS_TARGETING_STARTED" : "BONUS_CARD_ACTION_STARTED"/);
  assert.match(source, /actionContinuation: next, \.\.\.\(pending \? \{ actionResolution: pending \} : \{\}\)/);
});

test("stale action-start intents are revision guarded", () => {
  assert.match(source, /const baseRevisionValid = Number\(intent\.baseRevision\) === Math\.max\(0, Number\(gameTimelineRef\.current\?\.revision\) \|\| 0\)/);
  assert.match(source, /unauthorized-stale-or-invalid-action-start/);
});
