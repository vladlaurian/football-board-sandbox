export function namedGameplayValues(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => ({
      name: String(value?.name || "").trim(),
      value: Number.isFinite(Number(value?.value)) ? Number(value.value) : 0,
    }))
    .filter(value => value.name);
}

export function compactGameplayCard(card) {
  return {
    id: String(card?.id || ""),
    name: String(card?.name || "").trim() || "Unnamed player",
    position: String(card?.position || "").trim() || null,
    passiveAttributes: namedGameplayValues(card?.passiveAttributes),
    bonuses: namedGameplayValues(card?.bonuses),
    preferredFoot: String(card?.preferredFoot || "").trim() || null,
    specialAbility: String(card?.specialAbility || "").trim() || null,
    defensiveArea: (Array.isArray(card?.defensiveArea) ? card.defensiveArea : [])
      .map(cell => ({ dx: Number(cell?.dx) || 0, dy: Number(cell?.dy) || 0 })),
  };
}

export function createGameplayCardMap(cards) {
  return new Map((Array.isArray(cards) ? cards : [])
    .filter(card => card?.id)
    .map(card => [String(card.id), compactGameplayCard(card)]));
}
