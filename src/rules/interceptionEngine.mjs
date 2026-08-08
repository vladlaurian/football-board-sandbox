/**
 * Generic interception resolution.
 *
 * This module intentionally knows nothing about Pass geometry or pass types.
 * Callers provide the defender stat value, attacker target value, and every
 * enabled modifier source. Dice remain manual and Natural 1/20 remain global
 * interception invariants.
 */

import { sumAndCapRollModifier } from "./rollModifierMath.mjs";

export function resolveInterception({
  natural,
  defenderStatValue = 0,
  attackerTargetValue = 0,
  progressiveBonus = 0,
  standardModifier = 0,
  previousNaturalOnePenalty = 0,
  modifierCap,
  equalRollOutcome = "pass-succeeds",
  naturalOneEffect = "carry-disadvantage",
} = {}) {
  const die = Number(natural);
  // Only the situational sources (interceptor order, non-dominant-foot
  // advantage, previous-Natural-1 penalty) are ever capped — never the
  // defender's own Interception stat (confirmed live with the user; see
  // rollModifierMath.mjs).
  const situational = sumAndCapRollModifier([
    { value: progressiveBonus },
    { value: standardModifier },
    { value: previousNaturalOnePenalty },
  ], modifierCap);
  const baseStat = Number(defenderStatValue) || 0;
  const modifier = baseStat + situational.modifier;
  const rawModifier = baseStat + situational.rawModifier;
  const cap = situational.modifierCap;
  const capped = situational.capped;

  if (die === 1) {
    return {
      outcome: "pass-continues",
      natural: 1,
      total: 1,
      modifier: 0,
      rawModifier,
      modifierCap: cap,
      capped: false,
      naturalEffect: naturalOneEffect === "none" ? "none" : "carry-disadvantage",
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
      naturalEffect: "natural-20",
    };
  }

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
    capped,
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
