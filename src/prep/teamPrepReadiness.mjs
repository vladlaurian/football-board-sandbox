export function createPrepReadyTeams() {
  return { A: false, B: false };
}

export function markPrepTeamReady(readyTeams, team) {
  return { ...createPrepReadyTeams(), ...(readyTeams || {}), [team]: true };
}

export function invalidatePrepTeamReady(readyTeams, team) {
  return { ...createPrepReadyTeams(), ...(readyTeams || {}), [team]: false };
}

export function areBothPrepTeamsReady(readyTeams) {
  return Boolean(readyTeams?.A && readyTeams?.B);
}
