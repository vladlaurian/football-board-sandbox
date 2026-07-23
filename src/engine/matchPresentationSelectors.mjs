// Single Player Match UI reads this projection boundary only.  It deliberately
// performs no gameplay resolution: all gameplay facts were persisted by Engine
// commands in MatchState using the frozen MatchContext.

function formatSigned(value) {
  const number = Number(value) || 0;
  return number < 0 ? `−${Math.abs(number)}` : number > 0 ? `+${number}` : "0";
}

export function selectSinglePlayerPassPresentation(state) {
  const pending = state?.actionResolution;
  if (!pending || pending.kind !== "pass") return null;
  const routeOptions = (pending.routePresentation || []).map(route => ({
    ...route,
    modifierLabel: formatSigned(route.modifier),
    status: route.goalkeeperRouteBlocked ? "blocked" : route.risk ? "risk" : "clear",
    disabled: Boolean(route.goalkeeperRouteBlocked),
  }));
  const selectedRoute = routeOptions.find(route => route.cornerId === pending.cornerId)
    || routeOptions[0]
    || null;
  return {
    target: pending.target || null,
    routeOptions,
    selectedRoute,
    rollPrompt: pending.status === "awaiting-interception-roll" ? pending.rollPresentation || null : null,
  };
}
