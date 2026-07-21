import { normalizeRuleSet } from "../rules/ruleSets.mjs";
import { compactGameplayCard } from "../cards/gameplayCard.mjs";

export const MATCH_CONTEXT_SCHEMA_VERSION = 1;

function clonePlain(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function normalizeGameplayCards(raw) {
  const cards = Array.isArray(raw)
    ? raw
    : Object.values(raw && typeof raw === "object" ? raw : {});
  const byId = {};
  cards.forEach(card => {
    if (!card?.id) return;
    const compact = compactGameplayCard(card);
    byId[compact.id] = compact;
  });
  return byId;
}

export function createMatchContext(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return deepFreeze({
    schemaVersion: MATCH_CONTEXT_SCHEMA_VERSION,
    id: String(source.id || "").trim(),
    ruleSet: normalizeRuleSet(source.ruleSet),
    boardSettings: clonePlain(source.boardSettings && typeof source.boardSettings === "object" ? source.boardSettings : {}),
    gameplayCardsById: normalizeGameplayCards(source.gameplayCardsById || source.gameplayCards),
  });
}
