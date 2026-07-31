// This module retains its historical filename so old imports/recordings have
// one compatibility boundary.  Its exported model is now the complete team
// modifier-token contract, not a positive-only roll-opportunity list.
const TYPES = new Set(["advantage", "majorAdvantage", "disadvantage", "majorDisadvantage"]);
const OPPOSITE = Object.freeze({
  advantage: "disadvantage",
  disadvantage: "advantage",
  majorAdvantage: "majorDisadvantage",
  majorDisadvantage: "majorAdvantage",
});

export const DEFAULT_TEAM_MODIFIER_CAPACITY = 3;

export function normalizeTeamModifierCapacity(value) {
  return Math.max(1, Math.min(12, Math.floor(Number(value) || DEFAULT_TEAM_MODIFIER_CAPACITY)));
}

// "Current turn" means the numbered gameplay turn in which the token can be
// used. A Bonus Action may live between numbered turns; closing it must not
// consume a token earned inside it.
export function effectiveCurrentTurnForRollOpportunity(state, fallbackTurn) {
  const currentTurn = Math.max(1, Math.floor(Number(fallbackTurn) || 1));
  const continuation = state?.actionContinuation;
  const nextTurn = Number(continuation?.resumePolicy?.nextTurn);
  return continuation?.kind === "bonus-card-action"
    && continuation?.resumePolicy?.type === "advance-turn"
    && Number.isFinite(nextTurn)
    ? Math.max(1, Math.floor(nextTurn))
    : currentTurn;
}

export function normalizeTeamModifierTokens(raw) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => {
    const team = item?.team === "blue" || item?.team === "red" ? item.team : null;
    const type = TYPES.has(item?.modifierType) ? item.modifierType : null;
    const availableFromTurn = Math.max(1, Math.floor(Number(item?.availableFromTurn) || 1));
    const expiresAfterTurn = Math.max(availableFromTurn, Math.floor(Number(item?.expiresAfterTurn) || availableFromTurn));
    if (!team || !type) return null;
    return {
      id: String(item?.id || `team-modifier-${index}`), team, modifierType: type,
      availableFromTurn, expiresAfterTurn,
      source: String(item?.source || "gameplay"), sourceActionId: String(item?.sourceActionId || "") || null,
      // Legacy AV/AVM opportunities applied to one chosen eligible D20 roll.
      // The explicit scope prevents a future mechanic from treating a token as
      // universal merely because it belongs to the same team.
      rollScope: item?.rollScope === "owned-d20" ? "owned-d20" : "owned-d20",
    };
  }).filter(Boolean);
}

// Kept only as a decoding alias for old recordings and tests. New MatchState
// and Engine code use teamModifierTokens / the TeamModifier names above.
export const normalizeRollModifierOpportunities = normalizeTeamModifierTokens;

export function activeTeamModifierTokens(raw, team, turn, { rollScope = "owned-d20" } = {}) {
  const currentTurn = Math.max(1, Math.floor(Number(turn) || 1));
  return normalizeTeamModifierTokens(raw)
    .filter(item => item.team === team && item.rollScope === rollScope && item.availableFromTurn <= currentTurn && item.expiresAfterTurn >= currentTurn);
}

export const activeRollModifierOpportunities = activeTeamModifierTokens;

export function consumeTeamModifierToken(raw, { team, turn, modifierType, rollScope = "owned-d20" } = {}) {
  if (!TYPES.has(modifierType)) return { accepted: modifierType == null, tokens: normalizeTeamModifierTokens(raw), consumed: null };
  const tokens = normalizeTeamModifierTokens(raw);
  const candidate = activeTeamModifierTokens(tokens, team, turn, { rollScope }).find(item => item.modifierType === modifierType) || null;
  if (!candidate) return { accepted: false, tokens, consumed: null };
  return { accepted: true, tokens: tokens.filter(item => item.id !== candidate.id), consumed: candidate };
}

export function consumeRollModifierOpportunity(raw, args) {
  const result = consumeTeamModifierToken(raw, args);
  return { ...result, opportunities: result.tokens };
}

export function grantTeamModifierToken(raw, token, { capacity = DEFAULT_TEAM_MODIFIER_CAPACITY } = {}) {
  const tokens = normalizeTeamModifierTokens(raw);
  const incoming = normalizeTeamModifierTokens([token])[0] || null;
  if (!incoming) return { accepted: false, reason: "TEAM_MODIFIER_INVALID", tokens, granted: null, cancelled: null };
  const oppositeIndex = tokens.findIndex(item => item.team === incoming.team && item.modifierType === OPPOSITE[incoming.modifierType]);
  if (oppositeIndex >= 0) {
    const cancelled = tokens[oppositeIndex];
    return { accepted: true, kind: "cancelled", tokens: tokens.filter((_, index) => index !== oppositeIndex), granted: null, cancelled };
  }
  const used = tokens.filter(item => item.team === incoming.team).length;
  if (used >= normalizeTeamModifierCapacity(capacity)) return { accepted: false, reason: "TEAM_MODIFIER_CAPACITY_REACHED", tokens, granted: null, cancelled: null };
  return { accepted: true, kind: "granted", tokens: [...tokens, incoming], granted: incoming, cancelled: null };
}

export function grantRollModifierOpportunity(raw, opportunity, options) {
  return grantTeamModifierToken(raw, opportunity, options).tokens;
}

export function pruneTeamModifierTokens(raw, turn) {
  const currentTurn = Math.max(1, Math.floor(Number(turn) || 1));
  return normalizeTeamModifierTokens(raw).filter(item => item.expiresAfterTurn >= currentTurn);
}

export const pruneRollModifierOpportunities = pruneTeamModifierTokens;

export function expiredTeamModifierTokens(raw, turn) {
  const currentTurn = Math.max(1, Math.floor(Number(turn) || 1));
  return normalizeTeamModifierTokens(raw)
    .filter(item => item.expiresAfterTurn < currentTurn);
}

export const expiredRollModifierOpportunities = expiredTeamModifierTokens;
