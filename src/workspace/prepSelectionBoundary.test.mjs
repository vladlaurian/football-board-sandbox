import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("Tracker Start Game remains independent of Prep, Ready and Selection Rules", () => {
  const start = source.indexOf("function startTrackedGame(team)");
  const end = source.indexOf("function applyTrackerTurn(turn)", start);
  assert.ok(start >= 0 && end > start);
  const implementation = source.slice(start, end);
  assert.doesNotMatch(implementation, /selectionRules|prepReady|validateReadySelection/);
});

test("Prep and Selection Rules are explicitly excluded from the Manual Multiplayer branch", () => {
  assert.match(source, /\{!sessionCode && <button[\s\S]*?Selection Rules[\s\S]*?<\/button>\}/);
  assert.match(source, /\{!sessionCode && !singlePlayerMatchWorkspaceLocked && <PrepPanel/);
});
