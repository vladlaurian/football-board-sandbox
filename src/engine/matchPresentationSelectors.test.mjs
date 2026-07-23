import assert from "node:assert/strict";
import test from "node:test";
import { selectSinglePlayerPassPresentation } from "./matchPresentationSelectors.mjs";

test("Single Player Pass selector projects persisted route and roll facts without recalculating them", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "awaiting-interception-roll",
      cornerId: "top-right",
      target: { x: 8, y: 4 },
      routePresentation: [{
        id: "top-right",
        cornerId: "top-right",
        origin: { x: 3, y: 2 },
        endpoint: { x: 8.5, y: 4.5 },
        foot: "RF",
        modifier: -5,
        modifierType: "disadvantage",
        isLong: false,
        originBlocked: false,
        goalkeeperRouteBlocked: false,
        risk: true,
      }],
      rollPresentation: {
        defenderId: "red-2",
        team: "red",
        modifier: 6,
        modifierCap: 6,
        capped: false,
        modifierSources: [{ label: "Advantage", value: 7, source: "passer-execution-disadvantage" }],
      },
    },
  });
  assert.equal(projection.routeOptions[0].modifierLabel, "−5");
  assert.equal(projection.routeOptions[0].status, "risk");
  assert.equal(projection.selectedRoute.cornerId, "top-right");
  assert.equal(projection.rollPrompt.modifier, 6);
  assert.equal(projection.rollPrompt.modifierSources[0].value, 7);
});

test("Single Player Pass selector keeps a dominant-foot origin badge neutral and compact", () => {
  const projection = selectSinglePlayerPassPresentation({
    actionResolution: {
      kind: "pass",
      status: "route-selection",
      routePresentation: [{ id: "top-left", cornerId: "top-left", modifier: 0, foot: "LF" }],
    },
  });
  assert.equal(projection.routeOptions[0].modifierLabel, "0");
});
