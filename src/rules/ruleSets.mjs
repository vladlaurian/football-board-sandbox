export const RULE_SET_SCHEMA_VERSION = 3;
export const DEFAULT_RULE_SET_ID = "default-rules";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanId(value, fallback = DEFAULT_RULE_SET_ID) {
  return cleanText(value, fallback).replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function createDefaultRuleSet() {
  return {
    id: DEFAULT_RULE_SET_ID,
    schemaVersion: RULE_SET_SCHEMA_VERSION,
    name: "Default Rules",
    notes: "",
    actions: {
      pass: {
        status: "configured",
        rollMode: "manual",
        pathMode: "corner-to-center",
        longPassThreshold: 15,
        resolutionDelayMs: 2000,
      },
      interception: {
        status: "configured",
        rollMode: "manual",
        defenderRollStatId: "stat:interception",
        useStandardModifiers: true,
        useProgressiveBonus: true,
        modifierCap: 4,
        equalRollOutcome: "pass-succeeds",
      },
    },
  };
}

export function normalizeRuleSet(raw, fallback = createDefaultRuleSet()) {
  const source = raw && typeof raw === "object" ? raw : fallback;
  const fallbackSet = fallback && typeof fallback === "object" ? fallback : createDefaultRuleSet();
  const pass = source.actions?.pass && typeof source.actions.pass === "object" ? source.actions.pass : {};
  const interception = source.actions?.interception && typeof source.actions.interception === "object" ? source.actions.interception : {};
  const fallbackInterception = fallbackSet.actions?.interception || createDefaultRuleSet().actions.interception;
  const isLegacyRuleSet = Number(source.schemaVersion || 0) < RULE_SET_SCHEMA_VERSION;
  const pathMode = pass.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center";
  const legacyModifierCap = Number.isFinite(Number(pass.modifierCap)) ? Number(pass.modifierCap) : undefined;
  const migratedModifierCap = Number.isFinite(Number(interception.modifierCap))
    ? Number(interception.modifierCap)
    : legacyModifierCap;
  const migratedEqualOutcome = interception.equalRollOutcome || pass.equalRollOutcome;

  return {
    id: cleanId(source.id, fallbackSet.id || DEFAULT_RULE_SET_ID),
    schemaVersion: RULE_SET_SCHEMA_VERSION,
    name: cleanText(source.name, fallbackSet.name || "Untitled Rules"),
    notes: String(source.notes ?? "").slice(0, 4000),
    actions: {
      pass: {
        status: isLegacyRuleSet || pass.status === "configured" ? "configured" : "not-configured",
        rollMode: "manual",
        pathMode,
        longPassThreshold: Math.max(0.01, Number(pass.longPassThreshold) || 15),
        resolutionDelayMs: Math.max(0, Math.min(5000, Math.floor(Number(pass.resolutionDelayMs) || 2000))),
      },
      interception: {
        status: isLegacyRuleSet || interception.status === "configured" ? "configured" : "not-configured",
        rollMode: "manual",
        defenderRollStatId: cleanText(interception.defenderRollStatId, fallbackInterception.defenderRollStatId || "stat:interception"),
        useStandardModifiers: interception.useStandardModifiers !== false,
        useProgressiveBonus: interception.useProgressiveBonus !== false,
        modifierCap: Math.max(0, Math.min(20, Math.floor(
          Number.isFinite(migratedModifierCap) ? migratedModifierCap : 4,
        ))),
        equalRollOutcome: migratedEqualOutcome === "interception" ? "interception" : "pass-succeeds",
      },
    },
  };
}

export function normalizeRuleSets(raw) {
  const seen = new Set();
  const normalized = (Array.isArray(raw) ? raw : [])
    .map((item, index) => normalizeRuleSet(item, {
      ...createDefaultRuleSet(),
      id: index === 0 ? DEFAULT_RULE_SET_ID : `rules-${index + 1}`,
      name: index === 0 ? "Default Rules" : `Rule Set ${index + 1}`,
    }))
    .filter(ruleSet => {
      if (seen.has(ruleSet.id)) return false;
      seen.add(ruleSet.id);
      return true;
    });
  return normalized.length ? normalized : [createDefaultRuleSet()];
}

export function findRuleSet(ruleSets, id) {
  const normalized = normalizeRuleSets(ruleSets);
  const selected = normalized.find(ruleSet => ruleSet.id === String(id || ""));
  return selected || normalized[0];
}

export function createRuleSetId(ruleSets, requestedName = "Rule Set") {
  const existing = new Set(normalizeRuleSets(ruleSets).map(ruleSet => ruleSet.id));
  const base = cleanId(requestedName.toLowerCase().replace(/\s+/g, "-"), "rule-set");
  let index = 1;
  let candidate = base;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

export function createRuleSet(ruleSets, name = "New Rule Set", source = createDefaultRuleSet()) {
  const cleanName = cleanText(name, "New Rule Set");
  return normalizeRuleSet({
    ...source,
    id: createRuleSetId(ruleSets, cleanName),
    name: cleanName,
  }, source);
}
