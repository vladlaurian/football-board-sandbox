import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const prepSource = readFileSync(new URL("../prep/PrepPanel.jsx", import.meta.url), "utf8");

test("Tracker Start Game remains independent of Prep, Ready and Selection Rules", () => {
  const start = source.indexOf("function startTrackedGame(team)");
  const end = source.indexOf("function applyTrackerTurn(turn)", start);
  assert.ok(start >= 0 && end > start);
  const implementation = source.slice(start, end);
  assert.doesNotMatch(implementation, /selectionRules|prepReady|validateReadySelection/);
});

test("Prep and Selection Rules are explicitly excluded from the Manual Multiplayer branch", () => {
  assert.match(source, /\{!sessionCode && <button[\s\S]*?Selection Rules[\s\S]*?<\/button>\}/);
  assert.match(source, /\{!sessionCode && gameMode === "match" && !singlePlayerMatchWorkspaceLocked && <PrepPanel/);
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

test("Prep keeps both team Selection summaries visible and Match Mode locks Selection Rules to view-only", () => {
  assert.match(prepSource, /Free Selection enabled/);
  assert.match(prepSource, /selectionSummaries\.blue/);
  assert.match(prepSource, /selectionSummaries\.red/);
  assert.match(source, /selectionSummaries=\{\{ blue: prepReadyValidation\.blue, red: prepReadyValidation\.red \}\}/);
  assert.match(source, /const selectionRulesReadOnly = !sessionCode && gameMode === "match"/);
  assert.match(source, /disabled=\{selectionRulesReadOnly\}/);
  assert.match(source, /if \(selectionRulesReadOnly\) return;/);
  assert.doesNotMatch(source, /prep-selection-live-panel/);
});
