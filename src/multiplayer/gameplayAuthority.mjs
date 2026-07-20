export function gameplayCommandLockState({ sessionActive = false, intentPending = false, syncPending = false, applyingSnapshot = false } = {}) {
  return Boolean(sessionActive && (intentPending || syncPending || applyingSnapshot));
}

export function validateGameplayIntent({ intent, canonicalRevision = 0, teamOwners = {} } = {}) {
  const command = intent?.command || {};
  const requestedTeam = String(intent?.requestedTeam || command.team || "");
  const ownerUid = String(teamOwners?.[requestedTeam] || "");
  const requesterUid = String(intent?.requestedByUid || "");
  const revisionMatches = Number(intent?.baseRevision) === Math.max(0, Number(canonicalRevision) || 0);
  const ownerMatches = !command.team || !ownerUid || ownerUid === requesterUid;
  const commandValid = Boolean(command.before && command.after && String(command.type || ""));
  return {
    valid: revisionMatches && ownerMatches && commandValid,
    revisionMatches,
    ownerMatches,
    commandValid,
    rejectionReason: revisionMatches
      ? (ownerMatches ? (commandValid ? null : "invalid-command") : "unauthorized-team")
      : "stale-revision",
  };
}
