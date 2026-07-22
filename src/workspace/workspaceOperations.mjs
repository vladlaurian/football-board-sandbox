import { normalizeRuleSet, normalizeRuleSets } from "../rules/ruleSets.mjs";

/** Pure Editor Workspace mutations. UI prompts, React setters, Timeline notes,
 * Cloud writes and Manual Multiplayer persistence deliberately stay outside. */
export function planWorkspaceBoardSetting({
  settings,
  pieces,
  key,
  value,
  forceOddDirectional,
  clamp,
  clampBoardXForY,
  ensureBenchReserveCount,
} = {}) {
  let cleanValue = Number(value);
  if (key === "rows" || key === "goalWidth") {
    cleanValue = forceOddDirectional(cleanValue, settings[key], settings[key]);
  }
  const nextSettings = { ...settings, [key]: cleanValue };
  if (key === "cols") nextSettings.penaltyDistance = clamp(nextSettings.penaltyDistance, 1, Math.floor(cleanValue / 2));
  if (key === "rows") {
    nextSettings.rows = forceOddDirectional(cleanValue, settings.rows, settings.rows);
    nextSettings.penaltyY = Math.floor(nextSettings.rows / 2);
  }
  if (key === "goalWidth") nextSettings.goalWidth = forceOddDirectional(cleanValue, settings.goalWidth, settings.goalWidth);

  const nextPieces = ensureBenchReserveCount((pieces || []).map(piece => {
    const y = clamp(piece.y, 0, nextSettings.rows - 1);
    return { ...piece, y, x: clampBoardXForY(piece.x, y, nextSettings) };
  }), nextSettings);
  return { cleanValue, nextSettings, nextPieces };
}

export function planWorkspaceFormationApplication({
  pieces,
  team,
  formation,
  blueFormation,
  redFormation,
  settings,
  createInitialPieces,
  sanitizePieces,
} = {}) {
  const ball = (pieces || []).find(piece => piece.team === "BALL");
  const others = (pieces || []).filter(piece => piece.team !== team && piece.team !== "BALL");
  const nextTeamPieces = createInitialPieces(
    settings.cols,
    settings.rows,
    team === "A" ? formation : blueFormation,
    team === "B" ? formation : redFormation
  ).filter(piece => piece.team === team);
  return sanitizePieces([...others, ...nextTeamPieces, ball].filter(Boolean));
}

export function planWorkspaceFormationSave({ formations, slotId, name, players, normalizeFormationSlots, baseSlots } = {}) {
  return normalizeFormationSlots((formations || []).map(formation =>
    formation.id === Number(slotId)
      ? { id: Number(slotId), name: String(name || "").trim() || `Formație ${slotId}`, players }
      : formation
  ), baseSlots);
}

export function planWorkspaceScenarioSave({ scenarios, activeSituationId, name, snapshot } = {}) {
  const cleanName = String(name || "").trim() || `Scenario ${activeSituationId}`;
  return {
    cleanName,
    nextScenarios: (scenarios || []).map(scenario =>
      scenario.id === Number(activeSituationId)
        ? { ...scenario, name: cleanName, snapshot }
        : scenario
    ),
  };
}

export function planWorkspaceRuleSetCommit({ ruleSets, activeRuleSet } = {}) {
  const normalizedRuleSets = normalizeRuleSets(ruleSets);
  const normalizedActiveRuleSet = normalizeRuleSet(activeRuleSet);
  const activeExists = normalizedRuleSets.some(ruleSet => ruleSet.id === normalizedActiveRuleSet.id);
  return {
    ruleSets: activeExists ? normalizedRuleSets : [...normalizedRuleSets, normalizedActiveRuleSet],
    activeRuleSet: normalizedActiveRuleSet,
  };
}

export function planWorkspaceCardAssignment({ pieces, pieceId, cardId, sanitizePieces } = {}) {
  return sanitizePieces((pieces || []).map(piece => {
    if (piece.team === "BALL") return { ...piece, cardId: null };
    if (piece.id === pieceId) return { ...piece, cardId };
    if (piece.cardId === cardId) return { ...piece, cardId: null };
    return { ...piece, cardId: piece.cardId || null };
  }));
}

export function planWorkspaceCardDetachment({ pieces, pieceId, sanitizePieces } = {}) {
  return sanitizePieces((pieces || []).map(piece =>
    piece.id === pieceId ? { ...piece, cardId: null } : { ...piece, cardId: piece.cardId || null }
  ));
}
