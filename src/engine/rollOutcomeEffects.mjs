// Canonical semantic outcome of a natural roll. Engines persist this fact;
// presentation may phrase it but must not infer it from a popup/event type.
export function naturalRollOutcome({ mechanic, natural, effect, team }) {
  const rawEffect = String(effect || "none");
  const naturalValue = Number(natural);
  if (naturalValue !== 1 && naturalValue !== 20) return { kind: "none", rawEffect: "none", team: team || null, natural: naturalValue };
  if (rawEffect === "bonus-action" || rawEffect === "passer-bonus-action" || rawEffect === "recoverer-bonus-action") return { kind: "bonus-action", rawEffect, team: team || null, natural: naturalValue };
  if (rawEffect === "next-turn-roll-advantage" || rawEffect === "current-turn-roll-advantage") return { kind: "advantage", rawEffect, team: team || null, natural: naturalValue, availability: rawEffect.startsWith("next-") ? "next-turn" : "current-turn" };
  if (rawEffect === "next-turn-roll-major-advantage" || rawEffect === "current-turn-roll-major-advantage") return { kind: "major-advantage", rawEffect, team: team || null, natural: naturalValue, availability: rawEffect.startsWith("next-") ? "next-turn" : "current-turn" };
  return { kind: "none", rawEffect, team: team || null, natural: naturalValue, mechanic: mechanic || null };
}

// Confirmed live with the user: every line names the natural roll that
// caused it explicitly — never left implicit via the roll breakdown alone.
export function naturalRollOutcomeLine(outcome, { teamName = null } = {}) {
  const recipient = teamName || (outcome?.team === "blue" ? "Blue" : outcome?.team === "red" ? "Red" : "The team");
  const prefix = Number.isFinite(Number(outcome?.natural)) ? `Natural ${Number(outcome.natural)} — ` : "";
  if (outcome?.kind === "bonus-action") return `${prefix}${recipient} receives one Bonus Action before play resumes.`;
  if (outcome?.kind === "advantage") return `${prefix}${recipient} receives Advantage for one chosen roll ${outcome.availability === "next-turn" ? "next turn" : "this turn"}.`;
  if (outcome?.kind === "major-advantage") return `${prefix}${recipient} receives Major Advantage for one chosen roll ${outcome.availability === "next-turn" ? "next turn" : "this turn"}.`;
  return "No additional natural-roll effect applies.";
}
