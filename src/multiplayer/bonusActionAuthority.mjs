export function canControlBonusAction({ sessionActive, myTeam, continuation } = {}) {
  if (!continuation || continuation.kind !== "bonus-card-action") return false;
  if (!sessionActive) return true;
  return (myTeam === "blue" || myTeam === "red") && myTeam === continuation.team;
}

export function validateBonusActionEndIntent({ intent, continuation, actionResolution, teamOwners } = {}) {
  const team = intent?.team;
  const expectedOwner = String(teamOwners?.[team] || "");
  return Boolean(
    intent?.requestId
    && continuation?.kind === "bonus-card-action"
    && String(continuation.id) === String(intent?.continuationId)
    && continuation.team === team
    && ["ready", "action-active", "awaiting-end-bonus-action"].includes(String(continuation.status || ""))
    && !actionResolution
    && expectedOwner
    && expectedOwner === String(intent?.requestedByUid || "")
  );
}
