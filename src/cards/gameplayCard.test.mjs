import assert from "node:assert/strict";
import test from "node:test";
import { compactGameplayCard, createGameplayCardMap } from "./gameplayCard.mjs";

test("gameplay card projection retains only rule-relevant card data", () => {
  const source = {
    id: "card-1",
    name: "Victor",
    position: "GK",
    passiveAttributes: [{ name: "Reflexes", value: "17" }, { name: "", value: 4 }],
    bonuses: [{ name: "Save", value: 2 }],
    preferredFoot: "Right",
    specialAbility: "Wall",
    defensiveArea: [{ dx: 1, dy: 0 }],
    graphics: { frontDataUrl: "not-exported" },
  };
  const compact = compactGameplayCard(source);
  assert.deepEqual(compact.passiveAttributes, [{ name: "Reflexes", value: 17 }]);
  assert.equal(compact.graphics, undefined);
  assert.equal(createGameplayCardMap([source]).get("card-1").name, "Victor");
});
