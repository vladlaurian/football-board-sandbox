export function canControlResolution({ sessionActive = false, myTeam = "spectator", resolution = null } = {}) {
  if (!resolution) return false;
  if (!sessionActive) return true;
  const team = String(resolution.team || "");
  return (myTeam === "blue" || myTeam === "red") && team === myTeam;
}

export function resolutionUiState(args = {}) {
  const visible = Boolean(args.resolution);
  return { visible, interactive: visible && canControlResolution(args) };
}
