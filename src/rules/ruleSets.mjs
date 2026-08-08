export const RULE_SET_SCHEMA_VERSION = 13;
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
        maxPassDistance: 32,
        requireFieldPlayerTarget: true,
        resolutionDelayMs: 2000,
      },
      shot: {
        status: "configured",
        longShotNormalRangeMax: 11,
        shotMaximumRange: 16,
        distantBandModifier: "disadvantage",
        // How many natural rolls starting at 1 count as a Goal Kick (1 = only
        // Natural 1 itself, matching the original rule), and how many total
        // values at-or-below the goalkeeper's stat count as Corner (1 = only
        // an exact tie, matching the original rule). Neither ever reaches
        // above the goalkeeper's stat — a total that beats it is always a
        // Goal regardless of either interval (resolveShotResult in
        // shotRules.mjs enforces this by check order, not by clamping).
        goalKickInterval: 1,
        cornerInterval: 1,
        // Untracked extra repositions after a Goalkeeper Retains (confirmed
        // live with the user): count is per side, 0 disables it entirely
        // ("no move, resume normal play" — see restartSetupRules-style
        // reposition, but using real movement legality instead of "any free
        // cell", and never touching the Tracker). Each of the 3 triggers is
        // independent — any combination may be checked at once.
        // afterCornerHeader stays present but inert until that mechanic
        // (a corner header shot) actually exists.
        goalkeeperRetainsReposition: { count: 4, afterFreeKick: false, afterCornerHeader: false, anyCatch: false },
      },
      throughBall: { status: "configured", maxDistance: 16 },
      loftedThroughBall: {
        status: "configured", maxDistance: 32, difficultyThreshold: 16,
        pathMode: "corner-to-center",
        naturalOneEffect: "recoverer-bonus-action", naturalTwentyEffect: "passer-bonus-action",
        equalRollOutcome: "lofted-fails",
      },
      threeTwo: { allowMovementAfterPriorMove: false },
      interception: {
        status: "configured",
        rollMode: "manual",
        defenderRollStatId: "stat:interception",
        // Retained only while normalizing frozen legacy Manual Multiplayer
        // contexts. Offline Single Player forces the approved active rules.
        useStandardModifiers: true,
        useProgressiveBonus: true,
        equalRollOutcome: "pass-succeeds",
        naturalOneEffect: "carry-disadvantage",
        naturalTwentyEffect: "bonus-action",
      },
      groupMove: {
        status: "configured",
        maxPlayers: 4,
        zoneLength: 10,
        maxOrthogonalDistance: 6,
        maxDiagonalDistance: 4,
        sameDirectionOnly: true,
      },
      // Starting values only — every field here is coach-editable per Rule
      // Set (docs/FINALISATION_AND_RESTARTS_RULES.md sections 4-7).
      restarts: {
        // loftedThroughBallDifficultyOverride: this restart type's own
        // Lofted Through Ball uses this difficulty instead of the ordinary
        // actions.loftedThroughBall.difficultyThreshold (docs/SHOOTING_RULES.md
        // section 7 for Free Kick's own documented 18; Corner has no
        // documented exception, confirmed live with the user as wanting the
        // same configurability regardless — its default of 16 matches the
        // ordinary threshold exactly, so it changes nothing until a coach
        // edits it). The number of defensive areas crossed has no effect
        // either way — that part is hardcoded, not editable.
        corner: { wallSize: 1, repositionCount: 5, availableActions: ["short-pass", "long-pass", "through-ball", "lofted-through-ball", "shot"], loftedThroughBallDifficultyOverride: 16 },
        goalKick: { wallSize: 0, repositionCount: 7, availableActions: ["short-pass", "long-pass", "through-ball", "lofted-through-ball"] },
        freeKickDirect: { wallSize: 4, repositionCount: 5, availableActions: ["short-pass", "long-pass", "through-ball", "lofted-through-ball", "shot"], loftedThroughBallDifficultyOverride: 18 },
        freeKickIndirect: { wallSize: 4, repositionCount: 5, availableActions: ["short-pass", "long-pass", "through-ball", "lofted-through-ball"], loftedThroughBallDifficultyOverride: 18 },
        throwIn: { wallSize: 0, repositionCount: 0, availableActions: ["short-pass"] },
      },
    },
  };
}

// Every restart-setup action a coach could ever make available, keyed by
// restart type. Free Kick and Throw-in are configurable now even though
// they have no trigger mechanic yet (not yet triggerable in a Match) — see
// docs/FINALISATION_AND_RESTARTS_RULES.md section 9.
const RESTART_AVAILABLE_ACTION_IDS = ["short-pass", "long-pass", "through-ball", "lofted-through-ball", "shot"];

function normalizeRestartTypeConfig(raw, fallback) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawActions = Array.isArray(source.availableActions) ? source.availableActions : fallback.availableActions;
  const availableActions = RESTART_AVAILABLE_ACTION_IDS.filter(id => rawActions.includes(id));
  return {
    wallSize: Math.max(0, Math.min(11, Math.floor(Number(source.wallSize ?? fallback.wallSize)))),
    repositionCount: Math.max(0, Math.min(11, Math.floor(Number(source.repositionCount ?? fallback.repositionCount)))),
    availableActions: availableActions.length ? availableActions : fallback.availableActions,
    ...(fallback.loftedThroughBallDifficultyOverride !== undefined
      ? { loftedThroughBallDifficultyOverride: Math.max(1, Math.floor(Number(source.loftedThroughBallDifficultyOverride ?? fallback.loftedThroughBallDifficultyOverride))) }
      : {}),
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
  const shot = source.actions?.shot && typeof source.actions.shot === "object" ? source.actions.shot : {};
  const interception = source.actions?.interception && typeof source.actions.interception === "object" ? source.actions.interception : {};
  const groupMove = source.actions?.groupMove && typeof source.actions.groupMove === "object" ? source.actions.groupMove : {};
  const throughBall = source.actions?.throughBall && typeof source.actions.throughBall === "object" ? source.actions.throughBall : {};
  const loftedThroughBall = source.actions?.loftedThroughBall && typeof source.actions.loftedThroughBall === "object" ? source.actions.loftedThroughBall : {};
  const threeTwo = source.actions?.threeTwo && typeof source.actions.threeTwo === "object" ? source.actions.threeTwo : {};
  const restarts = source.actions?.restarts && typeof source.actions.restarts === "object" ? source.actions.restarts : {};
  const tackling = source.actions?.tackling && typeof source.actions.tackling === "object" ? source.actions.tackling : {};
  const fallbackRestarts = fallbackSet.actions?.restarts || createDefaultRuleSet().actions.restarts;
  const fallbackInterception = fallbackSet.actions?.interception || createDefaultRuleSet().actions.interception;
  const fallbackShot = fallbackSet.actions?.shot || createDefaultRuleSet().actions.shot;
  // Schema v6 changes only Group Move's stored distance shape.  A v4/v5
  // Rule Set already has explicit action configuration, so it must not gain
  // configured actions merely because its Group Move value is migrated.
  const usesPreActionConfigurationDefaults = Number(source.schemaVersion || 0) < 4;
  const usesPreShotConfigurationDefaults = Number(source.schemaVersion || 0) < 13;
  const pathMode = pass.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center";
  const legacyModifierCap = Number.isFinite(Number(pass.modifierCap)) ? Number(pass.modifierCap) : undefined;
  const migratedModifierCap = Number.isFinite(Number(interception.modifierCap))
    ? Number(interception.modifierCap)
    : legacyModifierCap;
  const migratedEqualOutcome = interception.equalRollOutcome || pass.equalRollOutcome;
  // Pass thresholds are board-cell counts. They are deliberately integral;
  // older decimal Rule Sets migrate down to the same whole-cell threshold.
  const normalizedLongPassThreshold = Math.max(1, Math.floor(Number(pass.longPassThreshold) || 16));
  const normalizedMaxPassDistance = Math.max(normalizedLongPassThreshold, Math.floor(Number(pass.maxPassDistance) || 32));
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
        longPassThreshold: normalizedLongPassThreshold,
        maxPassDistance: normalizedMaxPassDistance,
        requireFieldPlayerTarget: pass.requireFieldPlayerTarget !== false,
        resolutionDelayMs: Math.max(0, Math.min(5000, Math.floor(Number(pass.resolutionDelayMs) || 2000))),
      },
      shot: {
        status: usesPreShotConfigurationDefaults || shot.status === "configured" ? "configured" : "not-configured",
        longShotNormalRangeMax: Math.max(1, Math.floor(Number(shot.longShotNormalRangeMax) || 11)),
        shotMaximumRange: Math.max(
          Math.max(1, Math.floor(Number(shot.longShotNormalRangeMax) || 11)),
          Math.floor(Number(shot.shotMaximumRange) || 16),
        ),
        distantBandModifier: shot.distantBandModifier === "majorDisadvantage" ? "majorDisadvantage" : "disadvantage",
        goalKickInterval: Math.max(1, Math.min(5, Math.floor(Number(shot.goalKickInterval) || 1))),
        cornerInterval: Math.max(1, Math.min(5, Math.floor(Number(shot.cornerInterval) || 1))),
        goalkeeperRetainsReposition: {
          count: Math.max(0, Math.min(11, Math.floor(Number(shot.goalkeeperRetainsReposition?.count ?? fallbackShot.goalkeeperRetainsReposition.count)))),
          afterFreeKick: shot.goalkeeperRetainsReposition?.afterFreeKick === true,
          afterCornerHeader: shot.goalkeeperRetainsReposition?.afterCornerHeader === true,
          anyCatch: shot.goalkeeperRetainsReposition?.anyCatch === true,
        },
      },
      throughBall: {
        status: usesPreActionConfigurationDefaults || throughBall.status === "configured" ? "configured" : "not-configured",
        maxDistance: Math.max(1, Math.floor(Number(throughBall.maxDistance) || 16)),
      },
      loftedThroughBall: {
        status: usesPreActionConfigurationDefaults || loftedThroughBall.status === "configured" ? "configured" : "not-configured",
        maxDistance: Math.max(1, Math.floor(Number(loftedThroughBall.maxDistance) || 32)),
        difficultyThreshold: Math.max(1, Math.floor(Number(loftedThroughBall.difficultyThreshold) || 16)),
        pathMode: loftedThroughBall.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center",
        naturalOneEffect: ["recoverer-bonus-action", "none"].includes(loftedThroughBall.naturalOneEffect) ? loftedThroughBall.naturalOneEffect : "recoverer-bonus-action",
        naturalTwentyEffect: ["passer-bonus-action", "none", "current-turn-roll-advantage", "current-turn-roll-major-advantage"].includes(loftedThroughBall.naturalTwentyEffect) ? loftedThroughBall.naturalTwentyEffect : "passer-bonus-action",
        equalRollOutcome: loftedThroughBall.equalRollOutcome === "lofted-succeeds" ? "lofted-succeeds" : "lofted-fails",
      },
      threeTwo: { allowMovementAfterPriorMove: threeTwo.allowMovementAfterPriorMove === true },
      interception: {
        status: usesPreActionConfigurationDefaults || interception.status === "configured" ? "configured" : "not-configured",
        rollMode: "manual",
        defenderRollStatId: cleanText(interception.defenderRollStatId, fallbackInterception.defenderRollStatId || "stat:interception"),
        useStandardModifiers: interception.useStandardModifiers !== false,
        useProgressiveBonus: interception.useProgressiveBonus !== false,
        equalRollOutcome: migratedEqualOutcome === "interception" ? "interception" : "pass-succeeds",
        naturalOneEffect: interception.naturalOneEffect === "none" ? "none" : "carry-disadvantage",
        naturalTwentyEffect: ["bonus-action", "none", "next-turn-roll-advantage", "next-turn-roll-major-advantage"].includes(interception.naturalTwentyEffect) ? interception.naturalTwentyEffect : "bonus-action",
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
      restarts: {
        corner: normalizeRestartTypeConfig(restarts.corner, fallbackRestarts.corner),
        goalKick: normalizeRestartTypeConfig(restarts.goalKick, fallbackRestarts.goalKick),
        freeKickDirect: normalizeRestartTypeConfig(restarts.freeKickDirect, fallbackRestarts.freeKickDirect),
        freeKickIndirect: normalizeRestartTypeConfig(restarts.freeKickIndirect, fallbackRestarts.freeKickIndirect),
        throwIn: normalizeRestartTypeConfig(restarts.throwIn, fallbackRestarts.throwIn),
      },
      // docs/TACKLING_RULES.md (superseded per the live design session —
      // the doc text itself still needs a rewrite pass): Free Kick/Yellow
      // Card/Red Card are independent 1-7 thresholds — at 1 (the baseline)
      // each checks the natural roll directly; from 2 up, each checks the
      // total instead (after the Tackling bonus). Equality is a 1-5 band
      // below Ball Control, always on total, mirroring Shot's
      // goalKickInterval shape. Neither has a stable historical default
      // (Tackling is new), so "not-configured" always shows here until the
      // coach visits Rules.
      tackling: {
        status: tackling.status === "configured" ? "configured" : "not-configured",
        freeKickInterval: Math.max(1, Math.min(7, Math.floor(Number(tackling.freeKickInterval) || 1))),
        yellowCardInterval: Math.max(1, Math.min(7, Math.floor(Number(tackling.yellowCardInterval) || 1))),
        redCardInterval: Math.max(1, Math.min(7, Math.floor(Number(tackling.redCardInterval) || 1))),
        equalityInterval: Math.max(1, Math.min(5, Math.floor(Number(tackling.equalityInterval) || 1))),
        equalityResult: tackling.equalityResult === "succeeds" ? "succeeds" : "outOfPlay",
        natural20Result: ["bonusAction", "none", "av", "avm"].includes(tackling.natural20Result) ? tackling.natural20Result : "av",
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
