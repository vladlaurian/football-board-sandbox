import { normalizeDiceModifiers, resolveDiceModifierStacks } from "./ruleSets.mjs";
/**
 * Pure geometry and resolution helpers for the configurable Pass action.
 * Coordinates use board units: a square at x/y occupies [x,x+1] × [y,y+1].
 */

const EPSILON = 1e-8;

export const PASS_CORNERS = [
  { id: "top-left", x: 0, y: 0 },
  { id: "top-right", x: 1, y: 0 },
  { id: "bottom-left", x: 0, y: 1 },
  { id: "bottom-right", x: 1, y: 1 },
];

export function teamKeyForPiece(piece) {
  return piece?.team === "A" ? "blue" : piece?.team === "B" ? "red" : null;
}

export function isGoalkeeperPiece(piece, cardById) {
  return cardById?.[String(piece?.cardId || "")]?.position === "GK";
}

export function oppositeTeam(team) {
  return team === "blue" ? "red" : "blue";
}

export function pointForPassOrigin(piece, pathMode, cornerId = "top-left") {
  if (pathMode === "center-to-center") return { x: Number(piece.x) + 0.5, y: Number(piece.y) + 0.5, cornerId: null };
  const corner = PASS_CORNERS.find(item => item.id === cornerId) || PASS_CORNERS[0];
  return { x: Number(piece.x) + corner.x, y: Number(piece.y) + corner.y, cornerId: corner.id };
}

export function pointForPassTarget(target) {
  return { x: Number(target.x) + 0.5, y: Number(target.y) + 0.5 };
}

export function passDistance(origin, target) {
  return Math.hypot(Number(target.x) - Number(origin.x), Number(target.y) - Number(origin.y));
}

// Rule measurement is deliberately separate from the visual/execution route:
// every pass measures occupied square centre to occupied square centre. A
// selected origin corner models the foot and can affect the route, never range.
export function passMeasurementDistance(passer, target) {
  return Math.hypot(Number(target.x) - Number(passer.x), Number(target.y) - Number(passer.y));
}

export function segmentIntersectsOpenRect(a, b, rect) {
  // Liang-Barsky clipping against the rectangle's *open* interior. Touching
  // only an edge/corner is intentionally not an intersection.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const bounds = [
    [-dx, a.x - rect.x],
    [dx, rect.x + 1 - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + 1 - a.y],
  ];
  for (const [p, q] of bounds) {
    if (Math.abs(p) < EPSILON) {
      if (q <= EPSILON) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1 - EPSILON) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0 + EPSILON) return false;
      if (r < t1) t1 = r;
    }
  }
  // Ensure there is a non-zero section strictly inside the square.
  return t1 - t0 > EPSILON && t1 > EPSILON && t0 < 1 - EPSILON;
}

// Unlike ordinary ground-pass collision, Long Pass endpoint contact treats a
// touch on an edge/corner as physical contact. This closed test is used only
// in the launch/landing neighbourhood, never to make middle bodies block air.
export function segmentTouchesClosedRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + 1 - a.x], [-dy, a.y - rect.y], [dy, rect.y + 1 - a.y]]) {
    if (Math.abs(p) < EPSILON) {
      if (q < -EPSILON) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return t0 <= t1 + EPSILON && t1 >= -EPSILON && t0 <= 1 + EPSILON;
}

// Long Pass may only make physical contact near its launch or landing area.
// Unlike ground-pass collision, an edge/corner touch is contact here, so this
// returns the first closed-rectangle contact along the segment.
export function segmentClosedContactT(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + 1 - a.x], [-dy, a.y - rect.y], [dy, rect.y + 1 - a.y]]) {
    if (Math.abs(p) < EPSILON) {
      if (q < -EPSILON) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t0 > t1 + EPSILON || t1 < -EPSILON || t0 > 1 + EPSILON) return null;
  return Math.max(0, Math.min(1, t0));
}

export function segmentEntryT(a, b, rect) {
  if (!segmentIntersectsOpenRect(a, b, rect)) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + 1 - a.x], [-dy, a.y - rect.y], [dy, rect.y + 1 - a.y]]) {
    if (Math.abs(p) < EPSILON) continue;
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return Math.max(0, Math.min(1, t0));
}

export function traversedCells(a, b, { cols, rows } = {}) {
  const cells = [];
  const maxX = Number.isFinite(Number(cols)) ? Number(cols) : Infinity;
  const maxY = Number.isFinite(Number(rows)) ? Number(rows) : Infinity;
  for (let y = Math.floor(Math.min(a.y, b.y)) - 1; y <= Math.ceil(Math.max(a.y, b.y)) + 1; y += 1) {
    for (let x = Math.floor(Math.min(a.x, b.x)) - 1; x <= Math.ceil(Math.max(a.x, b.x)) + 1; x += 1) {
      if (x < 0 || y < 0 || x >= maxX || y >= maxY) continue;
      const rect = { x, y };
      const entryT = segmentEntryT(a, b, rect);
      if (entryT !== null) cells.push({ x, y, entryT });
    }
  }
  return cells.sort((left, right) => left.entryT - right.entryT || left.y - right.y || left.x - right.x);
}

export function firstPlayerHit(origin, target, pieces, passerId) {
  const hits = (pieces || [])
    .filter(piece => piece && piece.id !== passerId && piece.team !== "BALL" && !piece.inactive)
    .map(piece => ({ piece, entryT: segmentEntryT(origin, target, { x: Number(piece.x), y: Number(piece.y) }) }))
    .filter(item => item.entryT !== null)
    .sort((left, right) => left.entryT - right.entryT || String(left.piece.id).localeCompare(String(right.piece.id)));
  return hits[0] || null;
}

/**
 * A corner-to-centre pass cannot begin from a corner shared with an opposing
 * player's occupied square. This is a route-origin rule, not a collision on
 * the pass segment: the normal open-rectangle intersection deliberately
 * ignores the segment's starting point.
 */
export function opponentBlockingPassOrigin(origin, passer, pieces) {
  const passingTeam = teamKeyForPiece(passer);
  if (!origin?.cornerId || !passingTeam) return null;
  const defendingTeam = oppositeTeam(passingTeam);
  return (pieces || []).find(piece => {
    if (!piece || piece.id === passer?.id || piece.team === "BALL" || piece.inactive) return false;
    if (teamKeyForPiece(piece) !== defendingTeam) return false;
    return PASS_CORNERS.some(corner => (
      Math.abs(Number(piece.x) + corner.x - Number(origin.x)) < EPSILON
      && Math.abs(Number(piece.y) + corner.y - Number(origin.y)) < EPSILON
    ));
  }) || null;
}

// Offline Match contract: a selected corner models the ball at a specific
// foot.  A body occupying any of the three neighbouring squares that share
// that corner leaves no physical room for that execution point.  This is
// deliberately team-neutral: a teammate can obstruct the foot just as an
// opponent can.  Manual Multiplayer retains its historical opponent-only
// origin rule through opponentBlockingPassOrigin above.
export function bodyBlockingPassOrigin(origin, passer, pieces) {
  if (!origin?.cornerId) return null;
  return (pieces || []).find(piece => {
    if (!piece || piece.id === passer?.id || piece.team === "BALL" || piece.inactive) return false;
    return PASS_CORNERS.some(corner => (
      Math.abs(Number(piece.x) + corner.x - Number(origin.x)) < EPSILON
      && Math.abs(Number(piece.y) + corner.y - Number(origin.y)) < EPSILON
    ));
  }) || null;
}

export function isCellVisibleToDefender(defender, cell, pieces, { ignorePieceId = null } = {}) {
  const from = { x: Number(defender.x) + 0.5, y: Number(defender.y) + 0.5 };
  const to = { x: Number(cell.x) + 0.5, y: Number(cell.y) + 0.5 };
  return !(pieces || []).some(piece => {
    if (!piece || piece.id === defender.id || String(piece.id) === String(ignorePieceId || "") || piece.team === "BALL" || piece.inactive) return false;
    // Only an opposing player's actual square blocks the geometric sightline.
    if (teamKeyForPiece(piece) === teamKeyForPiece(defender)) return false;
    return segmentIntersectsOpenRect(from, to, { x: Number(piece.x), y: Number(piece.y) });
  });
}

export function defensiveCellsForPiece(piece, card, settings) {
  if (!piece || !Array.isArray(card?.defensiveArea)) return [];
  return card.defensiveArea.map((cell, index) => {
    const dx = Number(cell.dx);
    const dy = Number(cell.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    const boardDx = piece.team === "A" ? -dy : piece.team === "B" ? dy : dx;
    const boardDy = piece.team === "A" ? dx : piece.team === "B" ? -dx : dy;
    const x = Number(piece.x) + boardDx;
    const y = Number(piece.y) + boardDy;
    if (x < 0 || y < 0 || x >= Number(settings.cols) || y >= Number(settings.rows)) return null;
    return { id: `${piece.id}-area-${index}`, x, y };
  }).filter(Boolean);
}

export function footForPass(origin, target, passer, preferredFoot = "Both") {
  if (!origin.cornerId) return { foot: null, dominant: true };
  const dx = target.x - (Number(passer.x) + 0.5);
  const dy = target.y - (Number(passer.y) + 0.5);
  const cornerX = origin.x - (Number(passer.x) + 0.5);
  const cornerY = origin.y - (Number(passer.y) + 0.5);
  const cross = dx * cornerY - dy * cornerX;
  const preferred = String(preferredFoot || "Both").toLowerCase();
  if (Math.abs(cross) < EPSILON || preferred === "both") return { foot: preferred === "both" ? "Both" : preferred === "left" ? "Left" : "Right", dominant: true };
  // Screen coordinates invert y.  With the player facing the destination,
  // a negative screen-space cross is on the player's left; a positive one is
  // on the right.  The origin corner chooses the execution foot.
  const foot = cross < 0 ? "Left" : "Right";
  return { foot, dominant: preferred === foot.toLowerCase() };
}

export function cardStat(card, nameOrId) {
  const wanted = String(nameOrId).trim().toLowerCase();
  const semanticName = wanted.startsWith("stat:") ? wanted.slice(5) : wanted;
  // Stable global stat IDs are authoritative. Name matching remains as a
  // compatibility fallback for old match recordings and imported cards.
  const acceptedNames = semanticName === "pass" || semanticName === "passing"
    ? new Set(["pass", "passing", "short pass"])
    : new Set([semanticName]);
  const sources = [card?.bonuses, card?.passiveAttributes, card?.attributes];
  for (const source of sources) {
    const row = Array.isArray(source) && source.find(item => {
      const id = String(item?.id || "").trim().toLowerCase();
      const label = String(item?.name || item?.label || "").trim().toLowerCase();
      return id === wanted || acceptedNames.has(label);
    });
    if (row) return Number(row.value ?? row.amount ?? 0) || 0;
  }
  return 0;
}

/**
 * Interception priority is a board-game measurement between occupied squares,
 * not a measurement from the selected pass corner or along the pass segment.
 * With square centres on the same unit grid, comparing squared distances gives
 * exactly the same order as Euclidean distance and avoids rounding tie errors.
 */
export function interceptorPriorityDistanceSquared(anchor, defender) {
  const dx = Number(defender?.x) - Number(anchor?.x);
  const dy = Number(defender?.y) - Number(anchor?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
  return dx * dx + dy * dy;
}

export function interceptorChoiceCandidates(interceptors, index = 0) {
  const list = Array.isArray(interceptors) ? interceptors : [];
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const current = list[safeIndex];
  if (!current) return [];
  return list.slice(safeIndex).filter(item => item.priorityDistanceSquared === current.priorityDistanceSquared
    && String(item.reactionGroup || "short-route") === String(current.reactionGroup || "short-route"));
}

export function applyInterceptorChoice(interceptors, index, selectedPieceId, diceModifiers) {
  const modifiers = normalizeDiceModifiers(diceModifiers);
  const list = Array.isArray(interceptors) ? interceptors : [];
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const candidates = interceptorChoiceCandidates(list, safeIndex);
  const selected = candidates.find(item => String(item?.defender?.id) === String(selectedPieceId));
  if (!selected || candidates.length < 2) return null;
  const candidateIds = new Set(candidates.map(item => String(item?.defender?.id)));
  const reorderedBase = [
    ...list.slice(0, safeIndex),
    selected,
    ...list.slice(safeIndex).filter(item => candidateIds.has(String(item?.defender?.id)) && item !== selected),
    ...list.slice(safeIndex).filter(item => !candidateIds.has(String(item?.defender?.id))),
  ];
  // A Long Pass is one contested execution. Its origin and destination
  // groups control resolution order only; every previous interceptor remains
  // part of the one progressive stack.
  const reordered = reorderedBase.map((item, orderIndex) => ({
    ...item,
    orderModifier: Math.min(modifiers.stackCap, resolveDiceModifierStacks(modifiers, "advantage", orderIndex)),
  }));
  return {
    interceptors: reordered,
    selection: {
      atIndex: safeIndex,
      selectedPieceId: String(selectedPieceId),
      candidatePieceIds: candidates.map(item => String(item?.defender?.id)),
      priorityDistanceSquared: selected.priorityDistanceSquared,
      reason: "defender-choice-equal-distance",
    },
  };
}

function activeFieldPlayerAt(pieces, cardById, target) {
  return (pieces || []).find(piece => piece && piece.team !== "BALL" && !piece.inactive
    && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y)
    && !isGoalkeeperPiece(piece, cardById)) || null;
}

function progressiveInterceptors(items, rules, diceModifiers, reactionGroup, stackOffset = 0) {
  return items
    .sort((left, right) => left.priorityDistanceSquared - right.priorityDistanceSquared || String(left.defender.id).localeCompare(String(right.defender.id)))
    .map((item, index) => ({
      ...item,
      reactionGroup,
      orderModifier: rules.useProgressiveBonus === false ? 0 : Math.min(diceModifiers.stackCap, resolveDiceModifierStacks(diceModifiers, "advantage", stackOffset + index)),
    }));
}

function endpointBodyContact(origin, targetPoint, passer, targetPlayer, pieces) {
  const contacts = (pieces || []).flatMap(piece => {
    if (!piece || piece.id === passer?.id || piece.team === "BALL" || piece.inactive) return [];
    const nearPasser = Math.max(Math.abs(Number(piece.x) - Number(passer.x)), Math.abs(Number(piece.y) - Number(passer.y))) === 1;
    const nearTarget = Math.max(Math.abs(Number(piece.x) - Number(targetPlayer.x)), Math.abs(Number(piece.y) - Number(targetPlayer.y))) === 1;
    if (!nearPasser && !nearTarget && piece.id !== targetPlayer?.id) return [];
    const entryT = segmentClosedContactT(origin, targetPoint, { x: Number(piece.x), y: Number(piece.y) });
    return entryT === null ? [] : [{ piece, entryT }];
  });
  contacts.sort((left, right) => left.entryT - right.entryT || String(left.piece.id).localeCompare(String(right.piece.id)));
  return contacts[0] || null;
}

export function buildPassPlan({ passer, passerCard, pieces, cardById, settings, target, cornerId, rules, legacyManual = false }) {
  const passRules = rules?.actions?.pass || rules || {};
  const configuredInterceptionRules = rules?.actions?.interception || {};
  // Offline Single Player has one approved Interception contract. The frozen
  // legacy manual branch intentionally keeps its historical configuration.
  const interceptionRules = legacyManual
    ? configuredInterceptionRules
    : { ...configuredInterceptionRules, useStandardModifiers: true, useProgressiveBonus: true };
  const diceModifiers = normalizeDiceModifiers(rules?.diceModifiers);
  const pathMode = passRules.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center";
  const origin = pointForPassOrigin(passer, pathMode, cornerId);
  const originBlocker = legacyManual
    ? opponentBlockingPassOrigin(origin, passer, pieces)
    : bodyBlockingPassOrigin(origin, passer, pieces);
  const targetPoint = pointForPassTarget(target);
  const distance = legacyManual ? passDistance(origin, targetPoint) : passMeasurementDistance(passer, target);
  const longPassThreshold = Number(passRules.longPassThreshold) || 16;
  const maxPassDistance = Math.max(longPassThreshold, Number(passRules.maxPassDistance) || 32);
  const passType = distance > longPassThreshold ? "LONG_PASS" : "SHORT_PASS";
  const aerialLongPass = passType === "LONG_PASS" && !legacyManual;
  const targetPlayer = activeFieldPlayerAt(pieces, cardById, target);
  const longEndpointHit = aerialLongPass && targetPlayer
    ? endpointBodyContact(origin, targetPoint, passer, targetPlayer, pieces)
    : null;
  const hit = !aerialLongPass ? firstPlayerHit(origin, targetPoint, pieces, passer.id) : longEndpointHit;
  const goalkeeperBlocker = hit && isGoalkeeperPiece(hit.piece, cardById)
    ? { pieceId: hit.piece.id, team: teamKeyForPiece(hit.piece), entryT: hit.entryT }
    : null;
  const effectiveTarget = hit ? { x: Number(hit.piece.x), y: Number(hit.piece.y) } : { x: Number(target.x), y: Number(target.y) };
  const effectiveTargetPoint = hit ? pointForPassTarget(effectiveTarget) : targetPoint;
  const foot = footForPass(origin, targetPoint, passer, passerCard?.preferredFoot);
  const passCells = traversedCells(origin, effectiveTargetPoint, settings).filter(cell => !(cell.x === Number(passer.x) && cell.y === Number(passer.y)));
  const defenseTeam = oppositeTeam(teamKeyForPiece(passer));
  const defensiveAreaCrossings = !aerialLongPass ? (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive)
    .flatMap(defender => defensiveCellsForPiece(defender, cardById?.[defender.cardId], settings)
      .map(cell => ({ defenderId: defender.id, ...cell, entryT: segmentEntryT(origin, effectiveTargetPoint, cell) }))
      .filter(cell => cell.entryT !== null)) : [];
  const shortInterceptors = (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive)
    .map(defender => {
      const cells = defensiveCellsForPiece(defender, cardById?.[defender.cardId], settings)
        .map(cell => ({ ...cell, passEntryT: segmentEntryT(origin, effectiveTargetPoint, cell) }))
        .filter(cell => cell.passEntryT !== null);
      const visibleCells = cells.filter(cell => isCellVisibleToDefender(defender, cell, pieces));
      const priorityDistanceSquared = interceptorPriorityDistanceSquared(passer, defender);
      return {
        defender,
        cells,
        visibleCells,
        firstEntryT: visibleCells.length ? Math.min(...visibleCells.map(cell => cell.passEntryT)) : null,
        priorityDistanceSquared,
        priorityDistance: Math.sqrt(priorityDistanceSquared),
        priorityMethod: "passer-square-center-to-defender-square-center",
      };
    })
    .filter(item => item.visibleCells.length);
  const longGroup = (group, anchor) => (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive)
    .map(defender => {
      const cells = defensiveCellsForPiece(defender, cardById?.[defender.cardId], settings);
      const matching = cells.filter(cell => cell.x === Number(anchor.x) && cell.y === Number(anchor.y));
      const visibleCells = matching.filter(cell => isCellVisibleToDefender(defender, anchor, pieces, { ignorePieceId: anchor.id }));
      const priorityDistanceSquared = interceptorPriorityDistanceSquared(anchor, defender);
      return { defender, cells: matching, visibleCells, firstEntryT: null, priorityDistanceSquared, priorityDistance: Math.sqrt(priorityDistanceSquared), priorityMethod: `${group}-endpoint-square-center-to-defender-square-center` };
    }).filter(item => item.visibleCells.length);
  const effectiveTargetPlayer = hit?.piece || targetPlayer;
  const originInterceptors = aerialLongPass ? progressiveInterceptors(longGroup("origin", passer), interceptionRules, diceModifiers, "long-origin") : [];
  const destinationInterceptors = aerialLongPass
    ? progressiveInterceptors(longGroup("destination", effectiveTargetPlayer || target), interceptionRules, diceModifiers, "long-destination", originInterceptors.length)
    : [];
  const interceptors = aerialLongPass
    ? [...originInterceptors, ...destinationInterceptors]
    : progressiveInterceptors(shortInterceptors, interceptionRules, diceModifiers, "short-route");
  const attackerTargetStatId = aerialLongPass ? String(passRules.longPassAttackerStatId || "") : "stat:passing";
  return {
    kind: "pass-plan",
    pathMode,
    origin,
    originBlocked: Boolean(originBlocker),
    originBlocker: originBlocker ? { pieceId: originBlocker.id, team: teamKeyForPiece(originBlocker) } : null,
    requestedTarget: { x: Number(target.x), y: Number(target.y) },
    target: effectiveTarget,
    endpoint: effectiveTargetPoint,
    distance,
    passType,
    isLong: passType === "LONG_PASS",
    longPassThreshold,
    maxPassDistance,
    maxDistanceExceeded: !legacyManual && distance > maxPassDistance,
    targetPlayerId: targetPlayer?.id || null,
    foot,
    attackerTargetStatId,
    attackerTargetValue: cardStat(passerCard, attackerTargetStatId),
    passerPass: cardStat(passerCard, "stat:passing"), // legacy projection
    // Freeze the Interception configuration into the canonical action plan so
    // host and guest always resolve the same roll in multiplayer.
    interceptionRules: {
      defenderRollStatId: interceptionRules.defenderRollStatId || "stat:interception",
      useStandardModifiers: interceptionRules.useStandardModifiers !== false,
      useProgressiveBonus: interceptionRules.useProgressiveBonus !== false,
      diceModifiers,
      equalRollOutcome: interceptionRules.equalRollOutcome === "interception" ? "interception" : "pass-succeeds",
    },
    directHit: hit ? { pieceId: hit.piece.id, team: teamKeyForPiece(hit.piece), entryT: hit.entryT }
      : aerialLongPass && targetPlayer ? { pieceId: targetPlayer.id, team: teamKeyForPiece(targetPlayer), entryT: 1 } : null,
    // A goalkeeper is a physical route blocker, not a possible pass recipient.
    // The route remains represented for Single Player preview, but the Engine
    // must reject its confirmation before Tracker action consumption.
    goalkeeperRouteBlocked: Boolean(goalkeeperBlocker),
    goalkeeperBlocker,
    endpointBodyBlocked: false,
    endpointBodyBlockers: [],
    passCells,
    defensiveAreaCrossings,
    interceptorPriority: {
      method: "passer-square-center-to-defender-square-center",
      metric: "euclidean-distance",
      tieBreak: "defending-team-choice",
      selections: [],
    },
    interceptors,
    interceptionGroups: aerialLongPass ? {
      origin: originInterceptors.map(item => item.defender.id),
      destination: destinationInterceptors.map(item => item.defender.id),
    } : null,
  };
}

export function passRequiresInterceptionSequence(plan, passingTeam) {
  const interceptors = Array.isArray(plan?.interceptors) ? plan.interceptors : [];
  if (!interceptors.length) return false;
  const directHitTeam = plan?.directHit?.team || null;
  // A direct opponent hit transfers possession immediately. A teammate hit
  // only shortens the pass endpoint; eligible reactions still resolve first.
  return !directHitTeam || directHitTeam === passingTeam;
}
