export const MAX_FORMATION_PLAYERS = 11;

export function isBenchReservePiece(piece) {
  return /^[AB]-R-\d+$/.test(String(piece?.id || ""));
}

export function normalizeFormationPlayers(rawPlayers, maximum = MAX_FORMATION_PLAYERS) {
  const safeMaximum = Math.max(0, Math.floor(Number(maximum) || MAX_FORMATION_PLAYERS));
  return (Array.isArray(rawPlayers) ? rawPlayers : [])
    .filter(player => Array.isArray(player) && player.length >= 2)
    .map(([label, coord]) => [String(label ?? "").slice(0, 5), String(coord ?? "").trim()])
    .filter(([, coord]) => coord)
    .slice(0, safeMaximum);
}

export function normalizeFormationSlots(rawFormations, baseSlots) {
  const stored = Array.isArray(rawFormations) ? rawFormations : [];
  const bases = Array.isArray(baseSlots) ? baseSlots : [];

  return bases.map(base => {
    const saved = stored.find(item => Number(item?.id) === Number(base.id));
    const source = saved || base;
    const players = normalizeFormationPlayers(source?.players);
    const fallbackPlayers = normalizeFormationPlayers(base?.players);

    return {
      ...base,
      ...(saved || {}),
      id: Number(base.id),
      name: String(source?.name || base?.name || `Formation ${base.id}`),
      players: players.length ? players : fallbackPlayers,
    };
  });
}
