export function createDefaultScenarioSlots(count = 12) {
  return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => ({
    id: index + 1,
    name: `Scenario ${index + 1}`,
    snapshot: null,
  }));
}

function normalizeScenarioName(value, id) {
  const name = String(value || "").trim();
  if (!name || /^Situa(?:tia|ția)\s+\d+$/i.test(name)) return `Scenario ${id}`;
  return name;
}

export function normalizeScenarioSlots(rawSlots, defaults = createDefaultScenarioSlots()) {
  const slots = Array.isArray(rawSlots) ? rawSlots : [];
  return defaults.map(base => {
    const stored = slots.find(slot => Number(slot?.id) === Number(base.id));
    if (!stored) return { ...base };
    return {
      ...base,
      ...stored,
      id: base.id,
      name: normalizeScenarioName(stored.name, base.id),
      snapshot: stored.snapshot || null,
    };
  });
}
