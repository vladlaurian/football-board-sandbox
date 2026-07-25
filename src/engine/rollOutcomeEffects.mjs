// Canonical semantic outcome of a natural roll. Engines persist this fact;
// presentation may phrase it but must not infer it from a popup/event type.
export function naturalRollOutcome({ mechanic, natural, effect, team }) {
  const rawEffect = String(effect || "none");
  if (Number(natural) !== 1 && Number(natural) !== 20) return { kind: "none", rawEffect: "none", team: team || null };
  if (rawEffect === "bonus-action" || rawEffect === "passer-bonus-action" || rawEffect === "recoverer-bonus-action") return { kind: "bonus-action", rawEffect, team: team || null };
  if (rawEffect === "next-turn-roll-advantage" || rawEffect === "current-turn-roll-advantage") return { kind: "advantage", rawEffect, team: team || null, availability: rawEffect.startsWith("next-") ? "next-turn" : "current-turn" };
  if (rawEffect === "next-turn-roll-major-advantage" || rawEffect === "current-turn-roll-major-advantage") return { kind: "major-advantage", rawEffect, team: team || null, availability: rawEffect.startsWith("next-") ? "next-turn" : "current-turn" };
  return { kind: "none", rawEffect, team: team || null, mechanic: mechanic || null };
}

export function naturalRollOutcomeLine(outcome, { teamName = null } = {}) {
  const recipient = teamName || (outcome?.team === "blue" ? "Blue" : outcome?.team === "red" ? "Red" : "The team");
  if (outcome?.kind === "bonus-action") return `${recipient} receives one Bonus Action before play resumes.`;
  if (outcome?.kind === "advantage") return `${recipient} receives Advantage for one chosen roll ${outcome.availability === "next-turn" ? "next turn" : "this turn"}.`;
  if (outcome?.kind === "major-advantage") return `${recipient} receives Major Advantage for one chosen roll ${outcome.availability === "next-turn" ? "next turn" : "this turn"}.`;
  return "No additional natural-roll effect applies.";
}
