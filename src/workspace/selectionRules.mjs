import { isBenchReservePiece } from "../board/formationUtils.mjs";

export const SELECTION_RULES_VERSION = 1;
export const SELECTION_RULE_DEFAULTS = Object.freeze({
  version: SELECTION_RULES_VERSION,
  freeMode: true,
  totalStarsCap: Object.freeze({ enabled: false, value: 55 }),
  maximumPlayersAtStars: Object.freeze({ enabled: false, maxPlayers: 5, stars: 3 }),
});

const VALID_POSITIONS = new Set([
  "GK", "LWB", "LB", "CB", "RB", "RWB", "LW", "LM", "CDM", "CAM", "CM", "RM", "RW", "ST",
]);

function whole(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

export function normalizeSelectionRules(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const totalStarsCap = {
    enabled: source?.totalStarsCap?.enabled === true,
    value: whole(source?.totalStarsCap?.value, SELECTION_RULE_DEFAULTS.totalStarsCap.value, 0, 180),
  };
  const maximumPlayersAtStars = {
    enabled: source?.maximumPlayersAtStars?.enabled === true,
    maxPlayers: whole(source?.maximumPlayersAtStars?.maxPlayers, SELECTION_RULE_DEFAULTS.maximumPlayersAtStars.maxPlayers, 0, 18),
    stars: whole(source?.maximumPlayersAtStars?.stars, SELECTION_RULE_DEFAULTS.maximumPlayersAtStars.stars, 0, 10),
  };
  const hasConstraint = totalStarsCap.enabled || maximumPlayersAtStars.enabled;
  const freeMode = source?.freeMode === true || !hasConstraint;

  return {
    version: SELECTION_RULES_VERSION,
    freeMode,
    totalStarsCap: { ...totalStarsCap, enabled: freeMode ? false : totalStarsCap.enabled },
    maximumPlayersAtStars: { ...maximumPlayersAtStars, enabled: freeMode ? false : maximumPlayersAtStars.enabled },
  };
}

export function selectionRulesWithPatch(current, patch) {
  const next = {
    ...normalizeSelectionRules(current),
    ...(patch || {}),
    totalStarsCap: { ...normalizeSelectionRules(current).totalStarsCap, ...(patch?.totalStarsCap || {}) },
    maximumPlayersAtStars: {
      ...normalizeSelectionRules(current).maximumPlayersAtStars,
      ...(patch?.maximumPlayersAtStars || {}),
    },
  };
  return normalizeSelectionRules(next);
}

export function cardStarCount(card) {
  return whole(card?.starsFront?.count, 2, 0, 10);
}

function teamName(team) {
  return team === "A" ? "Blue" : "Red";
}

function issue(code, message, scope = "roster") {
  return { code, message, scope };
}

function positionCount(cards, position) {
  return cards.filter(card => card.role === position).length;
}

export function analyzeTeamSelection({ pieces, cardsById, team, selectionRules } = {}) {
  const rules = normalizeSelectionRules(selectionRules);
  const cardMap = cardsById instanceof Map ? cardsById : new Map(Object.entries(cardsById || {}));
  const teamPieces = (Array.isArray(pieces) ? pieces : []).filter(piece => piece?.team === team);
  const starters = teamPieces.filter(piece => !isBenchReservePiece(piece));
  const reserves = teamPieces.filter(piece => isBenchReservePiece(piece));
  const rosterPieces = [...starters, ...reserves];
  const issues = [];
  const assigned = rosterPieces.map(piece => {
    const cardId = String(piece?.cardId || "").trim();
    const card = cardId ? cardMap.get(cardId) || null : null;
    return {
      pieceId: String(piece?.id || ""),
      cardId,
      card,
      role: card ? String(card.position || "").trim() : "",
      stars: card ? cardStarCount(card) : 0,
      reserve: isBenchReservePiece(piece),
    };
  });

  if (starters.length !== 11) issues.push(issue("starter-count", `${teamName(team)} needs exactly 11 starters; found ${starters.length}.`, "structure"));
  if (reserves.length !== 7) issues.push(issue("reserve-count", `${teamName(team)} needs exactly 7 reserves; found ${reserves.length}.`, "structure"));

  assigned.forEach(entry => {
    if (!entry.cardId) issues.push(issue("card-missing", `${teamName(team)} ${entry.pieceId || "roster slot"} has no assigned card.`, "assignment"));
    else if (!entry.card) issues.push(issue("card-not-found", `${teamName(team)} ${entry.pieceId} references missing card ${entry.cardId}.`, "assignment"));
    else if (!VALID_POSITIONS.has(entry.role)) issues.push(issue("card-position-invalid", `${teamName(team)} ${entry.card.name || entry.cardId} has no valid card position.`, "assignment"));
  });

  const duplicateIds = new Set();
  assigned.forEach((entry, index) => {
    if (!entry.cardId) return;
    if (assigned.some((other, otherIndex) => otherIndex !== index && other.cardId === entry.cardId)) duplicateIds.add(entry.cardId);
  });
  duplicateIds.forEach(cardId => issues.push(issue("card-duplicate", `${teamName(team)} assigns card ${cardId} more than once.`, "assignment")));

  const validAssigned = assigned.filter(entry => entry.card && VALID_POSITIONS.has(entry.role));
  const starterCards = validAssigned.filter(entry => !entry.reserve);
  const reserveCards = validAssigned.filter(entry => entry.reserve);
  const totalStars = validAssigned.reduce((sum, entry) => sum + entry.stars, 0);
  const atMaximumStars = rules.maximumPlayersAtStars.enabled
    ? validAssigned.filter(entry => entry.stars === rules.maximumPlayersAtStars.stars).length
    : 0;

  if (starterCards.length > 11) issues.push(issue("starter-maximum", `${teamName(team)} has more than 11 players on the field.`, "starters"));
  const starterGoalkeepers = positionCount(starterCards, "GK");
  const reserveGoalkeepers = positionCount(reserveCards, "GK");
  const reserveOutfield = reserveCards.filter(entry => entry.role !== "GK").length;
  if (starterGoalkeepers !== 1) issues.push(issue("starter-goalkeeper", `${teamName(team)} needs exactly one starting GK; found ${starterGoalkeepers}.`, "starters"));
  if (reserveGoalkeepers !== 1) issues.push(issue("reserve-goalkeeper", `${teamName(team)} needs exactly one reserve GK; found ${reserveGoalkeepers}.`, "reserves"));
  if (reserveOutfield !== 6) issues.push(issue("reserve-outfield", `${teamName(team)} needs exactly six outfield reserves; found ${reserveOutfield}.`, "reserves"));

  const groupedLimits = [
    [["RB", "RWB"], 1],
    [["LB", "LWB"], 1],
    [["LM", "LW"], 1],
    [["RM", "RW"], 1],
    [["CB"], 3],
    [["CDM"], 2],
    [["CM"], 3],
    [["CAM"], 2],
    [["ST"], 2],
  ];
  groupedLimits.forEach(([roles, maximum]) => {
    const count = starterCards.filter(entry => roles.includes(entry.role)).length;
    if (count > maximum) issues.push(issue("starter-position-limit", `${teamName(team)} may use at most ${maximum} ${roles.join("/")}; found ${count}.`, "starters"));
  });
  const starterCdm = positionCount(starterCards, "CDM");
  const starterCm = positionCount(starterCards, "CM");
  if (starterCdm === 2 && starterCm === 3) {
    issues.push(issue("starter-cdm-cm-conflict", `${teamName(team)} cannot use 2 CDM together with 3 CM.`, "starters"));
  }

  if (rules.totalStarsCap.enabled && totalStars > rules.totalStarsCap.value) {
    issues.push(issue("total-stars-cap", `${teamName(team)} has ${totalStars} stars; the cap is ${rules.totalStarsCap.value}.`, "selection"));
  }
  if (rules.maximumPlayersAtStars.enabled) {
    const overIndividual = validAssigned.filter(entry => entry.stars > rules.maximumPlayersAtStars.stars);
    if (overIndividual.length) {
      issues.push(issue("individual-stars-cap", `${teamName(team)} has ${overIndividual.length} player(s) above ${rules.maximumPlayersAtStars.stars} stars.`, "selection"));
    }
    if (atMaximumStars > rules.maximumPlayersAtStars.maxPlayers) {
      issues.push(issue("maximum-stars-player-count", `${teamName(team)} has ${atMaximumStars} player(s) at ${rules.maximumPlayersAtStars.stars} stars; the limit is ${rules.maximumPlayersAtStars.maxPlayers}.`, "selection"));
    }
  }

  return {
    team,
    teamName: teamName(team),
    rules,
    rosterCount: rosterPieces.length,
    starterCount: starters.length,
    reserveCount: reserves.length,
    assignedCount: validAssigned.length,
    totalStars,
    atMaximumStars,
    issues,
    valid: issues.length === 0,
  };
}

export function validateReadySelection(input = {}) {
  const blue = analyzeTeamSelection({ ...input, team: "A" });
  const red = analyzeTeamSelection({ ...input, team: "B" });
  return { blue, red, issues: [...blue.issues, ...red.issues], valid: blue.valid && red.valid };
}
