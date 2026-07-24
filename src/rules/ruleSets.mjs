export const RULE_SET_SCHEMA_VERSION = 8;
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
    diceModifiers: {
      advantage: 1,
      majorAdvantage: 3,
      disadvantage: -1,
      majorDisadvantage: -3,
      stackCap: 4,
    },
    actions: {
      pass: {
        status: "configured",
        rollMode: "manual",
        pathMode: "corner-to-center",
        longPassThreshold: 16,
        requireFieldPlayerTarget: true,
        resolutionDelayMs: 2000,
      },
      interception: {
        status: "configured",
        rollMode: "manual",
        defenderRollStatId: "stat:interception",
        // Retained only while normalizing frozen legacy Manual Multiplayer
        // contexts. Offline Single Player forces the approved active rules.
        useStandardModifiers: true,
        useProgressiveBonus: true,
        equalRollOutcome: "pass-succeeds",
      },
      groupMove: {
        status: "configured",
        maxPlayers: 4,
        zoneLength: 10,
        maxOrthogonalDistance: 6,
        maxDiagonalDistance: 4,
        sameDirectionOnly: true,
      },
    },
  };
}

export function normalizeDiceModifiers(raw, fallback = createDefaultRuleSet().diceModifiers) {
  const source = raw && typeof raw === "object" ? raw : {};
  const value = (key, fallbackValue, minimum, maximum) => Math.max(minimum, Math.min(maximum, Math.floor(Number(source[key] ?? fallbackValue))));
  return {
    // These signs are part of the semantic contract, not a UI convention.
    // A Rule Set may change the magnitude, never invert an advantage into a penalty.
    advantage: value("advantage", fallback.advantage, 0, 20),
    majorAdvantage: value("majorAdvantage", fallback.majorAdvantage, 0, 20),
    disadvantage: value("disadvantage", fallback.disadvantage, -20, 0),
    majorDisadvantage: value("majorDisadvantage", fallback.majorDisadvantage, -20, 0),
    stackCap: Math.max(0, Math.min(20, Math.floor(Number(source.stackCap ?? fallback.stackCap)))),
  };
}

export function resolveDiceModifierStacks(diceModifiers, type, stacks = 1) {
  const modifiers = normalizeDiceModifiers(diceModifiers);
  const key = ["advantage", "majorAdvantage", "disadvantage", "majorDisadvantage"].includes(type) ? type : "advantage";
  return modifiers[key] * Math.max(0, Math.floor(Number(stacks) || 0));
}

export function normalizeRuleSet(raw, fallback = createDefaultRuleSet()) {
  const source = raw && typeof raw === "object" ? raw : fallback;
  const fallbackSet = fallback && typeof fallback === "object" ? fallback : createDefaultRuleSet();
  const pass = source.actions?.pass && typeof source.actions.pass === "object" ? source.actions.pass : {};
  const interception = source.actions?.interception && typeof source.actions.interception === "object" ? source.actions.interception : {};
  const groupMove = source.actions?.groupMove && typeof source.actions.groupMove === "object" ? source.actions.groupMove : {};
  const fallbackInterception = fallbackSet.actions?.interception || createDefaultRuleSet().actions.interception;
  // Schema v6 changes only Group Move's stored distance shape.  A v4/v5
  // Rule Set already has explicit action configuration, so it must not gain
  // configured actions merely because its Group Move value is migrated.
  const usesPreActionConfigurationDefaults = Number(source.schemaVersion || 0) < 4;
  const pathMode = pass.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center";
  const legacyModifierCap = Number.isFinite(Number(pass.modifierCap)) ? Number(pass.modifierCap) : undefined;
  const migratedModifierCap = Number.isFinite(Number(interception.modifierCap))
    ? Number(interception.modifierCap)
    : legacyModifierCap;
  const migratedEqualOutcome = interception.equalRollOutcome || pass.equalRollOutcome;
  const diceModifiers = normalizeDiceModifiers({
    ...source.diceModifiers,
    stackCap: source.diceModifiers?.stackCap ?? migratedModifierCap,
  }, fallbackSet.diceModifiers || createDefaultRuleSet().diceModifiers);

  return {
    id: cleanId(source.id, fallbackSet.id || DEFAULT_RULE_SET_ID),
    schemaVersion: RULE_SET_SCHEMA_VERSION,
    name: cleanText(source.name, fallbackSet.name || "Untitled Rules"),
    notes: String(source.notes ?? "").slice(0, 4000),
    diceModifiers,
    actions: {
      pass: {
        status: usesPreActionConfigurationDefaults || pass.status === "configured" ? "configured" : "not-configured",
        rollMode: "manual",
        pathMode,
        longPassThreshold: Math.max(0.01, Number(pass.longPassThreshold) || 16),
        requireFieldPlayerTarget: pass.requireFieldPlayerTarget !== false,
        resolutionDelayMs: Math.max(0, Math.min(5000, Math.floor(Number(pass.resolutionDelayMs) || 2000))),
      },
      interception: {
        status: usesPreActionConfigurationDefaults || interception.status === "configured" ? "configured" : "not-configured",
        rollMode: "manual",
        defenderRollStatId: cleanText(interception.defenderRollStatId, fallbackInterception.defenderRollStatId || "stat:interception"),
        useStandardModifiers: interception.useStandardModifiers !== false,
        useProgressiveBonus: interception.useProgressiveBonus !== false,
        equalRollOutcome: migratedEqualOutcome === "interception" ? "interception" : "pass-succeeds",
      },
      groupMove: {
        status: usesPreActionConfigurationDefaults || groupMove.status === "configured" ? "configured" : "not-configured",
        maxPlayers: Math.max(1, Math.min(11, Math.floor(Number(groupMove.maxPlayers) || 4))),
        zoneLength: Math.max(1, Math.min(100, Math.floor(Number(groupMove.zoneLength) || 10))),
        // Schema v5 and earlier had one Group Move maximum.  Preserve an
        // existing Rule Set exactly by migrating it into both new limits.
        maxOrthogonalDistance: Math.max(1, Math.min(100, Math.floor(Number(groupMove.maxOrthogonalDistance ?? groupMove.maxDistance) || 6))),
        maxDiagonalDistance: Math.max(1, Math.min(100, Math.floor(Number(groupMove.maxDiagonalDistance ?? groupMove.maxDistance) || 4))),
        sameDirectionOnly: groupMove.sameDirectionOnly !== false,
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
