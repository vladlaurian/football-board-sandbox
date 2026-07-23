/**
 * Generic interception resolution.
 *
 * This module intentionally knows nothing about Pass geometry or pass types.
 * Callers provide the defender stat value, attacker target value, and every
 * enabled modifier source. Dice remain manual and Natural 1/20 remain global
 * interception invariants.
 */

export function clampInterceptionModifier(value, cap) {
  const safeCap = Math.max(0, Number.isFinite(Number(cap)) ? Number(cap) : 0);
  return Math.max(-safeCap, Math.min(safeCap, Number(value) || 0));
}

export function resolveInterception({
  natural,
  defenderStatValue = 0,
  attackerTargetValue = 0,
  progressiveBonus = 0,
  standardModifier = 0,
  previousNaturalOnePenalty = 0,
  modifierCap,
  equalRollOutcome = "pass-succeeds",
} = {}) {
  const die = Number(natural);
  const rawModifier = Number(defenderStatValue)
    + Number(progressiveBonus)
    + Number(standardModifier)
    + Number(previousNaturalOnePenalty);
  const cap = Math.max(0, Number.isFinite(Number(modifierCap)) ? Number(modifierCap) : 0);

  if (die === 1) {
    return {
      outcome: "pass-continues",
      natural: 1,
      total: 1,
      modifier: 0,
      rawModifier,
      modifierCap: cap,
      capped: false,
    };
  }
  if (die === 20) {
    return {
      outcome: "natural-20-interception",
      natural: 20,
      total: 20,
      modifier: 0,
      rawModifier,
      modifierCap: cap,
      capped: false,
    };
  }

  const modifier = clampInterceptionModifier(rawModifier, cap);
  const total = die + modifier;
  const target = Number(attackerTargetValue) || 0;
  const intercepts = equalRollOutcome === "interception" ? total >= target : total > target;
  return {
    outcome: intercepts ? "interception" : "pass-continues",
    natural: die,
    total,
    modifier,
    rawModifier,
    modifierCap: cap,
    capped: modifier !== rawModifier,
  };
}

/**
 * Temporary compatibility wrapper for old imports/tests. New code should call
 * resolveInterception with generic names.
 */
export function resolveInterceptionRoll({
  natural,
  interception = 0,
  orderModifier = 0,
  nonDominantPenalty = 0,
  previousNaturalOnePenalty = 0,
  passerPass = 0,
  modifierCap,
  equalRollOutcome = "pass-succeeds",
} = {}) {
  return resolveInterception({
    natural,
    defenderStatValue: interception,
    attackerTargetValue: passerPass,
    progressiveBonus: orderModifier,
    standardModifier: nonDominantPenalty,
    previousNaturalOnePenalty,
    modifierCap,
    equalRollOutcome,
  });
}
