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

test("Ready acknowledgement closes Prep without creating a persistent preparation lock", () => {
  const start = source.indexOf("function confirmPrepReady()");
  const end = source.indexOf("function buildTrackerSnapshot", start);
  assert.ok(start >= 0 && end > start);
  const implementation = source.slice(start, end);
  assert.match(implementation, /setPrepVisible\(false\)/);
  assert.match(implementation, /setPrepReadySuccessOpen\(true\)/);
  assert.doesNotMatch(source, /const \[prepReady,/);
  assert.doesNotMatch(source, /singlePlayerMatchWorkspaceLocked \|\| prepReady/);
});

test("Selection summary announces Free Selection and remains a live Workspace-only surface", () => {
  assert.match(source, /Free Selection enabled/);
  assert.match(source, /Current selection is legal\./);
  assert.match(source, /prepSelectionOpen && !sessionCode && !singlePlayerMatchWorkspaceLocked/);
});
