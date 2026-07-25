const TYPES = new Set(["advantage", "majorAdvantage"]);

export function normalizeRollModifierOpportunities(raw) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => {
    const team = item?.team === "blue" || item?.team === "red" ? item.team : null;
    const type = TYPES.has(item?.modifierType) ? item.modifierType : null;
    const availableFromTurn = Math.max(1, Math.floor(Number(item?.availableFromTurn) || 1));
    const expiresAfterTurn = Math.max(availableFromTurn, Math.floor(Number(item?.expiresAfterTurn) || availableFromTurn));
    if (!team || !type) return null;
    return {
      id: String(item?.id || `roll-modifier-${index}`), team, modifierType: type,
      availableFromTurn, expiresAfterTurn,
      source: String(item?.source || "gameplay"), sourceActionId: String(item?.sourceActionId || "") || null,
    };
  }).filter(Boolean);
}

export function activeRollModifierOpportunities(raw, team, turn) {
  const currentTurn = Math.max(1, Math.floor(Number(turn) || 1));
  return normalizeRollModifierOpportunities(raw)
    .filter(item => item.team === team && item.availableFromTurn <= currentTurn && item.expiresAfterTurn >= currentTurn);
}

export function consumeRollModifierOpportunity(raw, { team, turn, modifierType } = {}) {
  if (!TYPES.has(modifierType)) return { accepted: modifierType == null, opportunities: normalizeRollModifierOpportunities(raw), consumed: null };
  const opportunities = normalizeRollModifierOpportunities(raw);
  const candidate = activeRollModifierOpportunities(opportunities, team, turn).find(item => item.modifierType === modifierType) || null;
  if (!candidate) return { accepted: false, opportunities, consumed: null };
  return { accepted: true, opportunities: opportunities.filter(item => item.id !== candidate.id), consumed: candidate };
}

export function grantRollModifierOpportunity(raw, opportunity) {
  return [...normalizeRollModifierOpportunities(raw), ...normalizeRollModifierOpportunities([opportunity])];
}

export function pruneRollModifierOpportunities(raw, turn) {
  const currentTurn = Math.max(1, Math.floor(Number(turn) || 1));
  return normalizeRollModifierOpportunities(raw).filter(item => item.expiresAfterTurn >= currentTurn);
}

// The Engine records the exact items that disappear as a turn advances. This
// lets presentation explain an expiry without re-deriving lifecycle rules.
export function expiredRollModifierOpportunities(raw, nextTurn) {
  const currentTurn = Math.max(1, Math.floor(Number(nextTurn) || 1));
  return normalizeRollModifierOpportunities(raw).filter(item => item.expiresAfterTurn < currentTurn);
}
