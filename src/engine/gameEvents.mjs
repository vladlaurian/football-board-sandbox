function cloneMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createGameEvent({ type, commandId, team = null, metadata = {} } = {}) {
  return {
    type: String(type || "UNKNOWN"),
    commandId: String(commandId || ""),
    team: team === "blue" || team === "red" ? team : null,
    metadata: cloneMetadata(metadata),
  };
}
