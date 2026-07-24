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

function linkLegacyLongPassStat(ruleSet, gameplayCardsById) {
  if (ruleSet?.actions?.pass?.longPassAttackerStatId) return ruleSet;
  const candidates = Object.values(gameplayCardsById || {}).flatMap(card => [
    ...(card?.passiveAttributes || []),
    ...(card?.bonuses || []),
  ]).filter(stat => String(stat?.name || "").trim().toLowerCase() === "long pass" && stat?.id);
  const ids = [...new Set(candidates.map(stat => String(stat.id)))];
  // This is a one-time compatibility link while freezing a MatchContext. A
  // unique existing Long Pass global stat is unambiguous; otherwise the Rule
  // Set must explicitly select one in Rules.
  if (ids.length !== 1) return ruleSet;
  return {
    ...ruleSet,
    actions: {
      ...ruleSet.actions,
      pass: { ...ruleSet.actions.pass, longPassAttackerStatId: ids[0] },
    },
  };
}

export function createMatchContext(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const gameplayCardsById = normalizeGameplayCards(source.gameplayCardsById || source.gameplayCards);
  const normalizedRuleSet = normalizeRuleSet(source.ruleSet);
  // Old recordings/tests without a stored Rule Set retain the historical
  // free-cell target behaviour. Every real MatchContext is created from the
  // active Rule Set and therefore freezes the new field-player-only rule.
  const configuredRuleSet = source.ruleSet ? normalizedRuleSet : {
    ...normalizedRuleSet,
    actions: { ...normalizedRuleSet.actions, pass: { ...normalizedRuleSet.actions.pass, requireFieldPlayerTarget: false } },
  };
  const ruleSet = linkLegacyLongPassStat(configuredRuleSet, gameplayCardsById);
  return deepFreeze({
    schemaVersion: MATCH_CONTEXT_SCHEMA_VERSION,
    id: String(source.id || "").trim(),
    ruleSet,
    boardSettings: clonePlain(source.boardSettings && typeof source.boardSettings === "object" ? source.boardSettings : {}),
    gameplayCardsById,
  });
}
