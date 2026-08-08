import { normalizeDiceModifiers, resolveDiceModifierStacks } from "./ruleSets.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
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

// `ignorePieceIds` lets the goalkeeper-restart exception make an opposing
// body invisible to direct-contact detection, exactly as it already does for
// defensive-area cells — the ball must reach past that body to its real
// target instead of stopping at it, so the excluded piece is removed from
// the candidate list entirely rather than merely skipped once.
export function firstPlayerHit(origin, target, pieces, passerId, ignorePieceIds = null) {
  const hits = (pieces || [])
    .filter(piece => piece && piece.id !== passerId && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece))
    .filter(piece => !ignorePieceIds || !ignorePieceIds.has(String(piece.id)))
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
    if (!piece || piece.id === passer?.id || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return false;
    return PASS_CORNERS.some(corner => (
      Math.abs(Number(piece.x) + corner.x - Number(origin.x)) < EPSILON
      && Math.abs(Number(piece.y) + corner.y - Number(origin.y)) < EPSILON
    ));
  }) || null;
}

export function isCellVisibleToDefender(defender, cell, pieces, { ignorePieceId = null } = {}) {
  return isPointVisibleToDefender(defender, { x: Number(cell.x) + 0.5, y: Number(cell.y) + 0.5 }, pieces, { ignorePieceId });
}

// The interception rule asks whether the defender can physically reach the
// ball at a concrete point on its route.  An opposing body blocks only when
// its occupied square is actually crossed by that defender-to-ball segment.
// This is shared by Short Pass cell reactions and Long Pass launch/landing
// reactions; it deliberately does not treat a merely adjacent body as a
// blocker.
export function isPointVisibleToDefender(defender, point, pieces, { ignorePieceId = null } = {}) {
  const from = { x: Number(defender.x) + 0.5, y: Number(defender.y) + 0.5 };
  const to = { x: Number(point.x), y: Number(point.y) };
  return !(pieces || []).some(piece => {
    if (!piece || piece.id === defender.id || String(piece.id) === String(ignorePieceId || "") || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return false;
    // Only an opposing player's actual square blocks the geometric sightline.
    if (teamKeyForPiece(piece) === teamKeyForPiece(defender)) return false;
    return segmentIntersectsOpenRect(from, to, { x: Number(piece.x), y: Number(piece.y) });
  });
}

// Shared box geometry for the goalkeeper-restart exception (Goalkeeper
// Retains, and any future restart documented with the same wording, e.g. a
// retained Cross): "inside the goalkeeper's own large and small penalty
// areas" means the box around the team's own goal — blue defends the left
// side (attacks right, per Shot's own goal-side convention), red defends the
// right side. A cell (not just a piece) may be tested directly, since the
// exception depends on where a defensive-area cell or a blocking body sits,
// not which team owns the card producing it.
export function insideOwnPenaltyArea(settings, cell, team) {
  if (!cell || !settings || (team !== "blue" && team !== "red")) return false;
  const x = Number(cell.x);
  const y = Number(cell.y);
  const largeTop = Math.floor((Number(settings.rows) - Number(settings.boxWidth)) / 2);
  const smallTop = Math.floor((Number(settings.rows) - Number(settings.smallWidth)) / 2);
  const inLargeBand = y >= largeTop && y < largeTop + Number(settings.boxWidth);
  const inSmallBand = y >= smallTop && y < smallTop + Number(settings.smallWidth);
  const ownSideLarge = team === "blue" ? x < Number(settings.boxDepth) : x >= Number(settings.cols) - Number(settings.boxDepth);
  const ownSideSmall = team === "blue" ? x < Number(settings.smallDepth) : x >= Number(settings.cols) - Number(settings.smallDepth);
  return (inLargeBand && ownSideLarge) || (inSmallBand && ownSideSmall);
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
  return (pieces || []).find(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece)
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

function endpointBodyContact(origin, targetPoint, passer, targetPlayer, pieces, ignorePieceIds = null) {
  const contacts = (pieces || []).flatMap(piece => {
    if (!piece || piece.id === passer?.id || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return [];
    if (ignorePieceIds && ignorePieceIds.has(String(piece.id))) return [];
    const nearPasser = Math.max(Math.abs(Number(piece.x) - Number(passer.x)), Math.abs(Number(piece.y) - Number(passer.y))) === 1;
    const nearTarget = Math.max(Math.abs(Number(piece.x) - Number(targetPlayer.x)), Math.abs(Number(piece.y) - Number(targetPlayer.y))) === 1;
    if (!nearPasser && !nearTarget && piece.id !== targetPlayer?.id) return [];
    const entryT = segmentClosedContactT(origin, targetPoint, { x: Number(piece.x), y: Number(piece.y) });
    return entryT === null ? [] : [{ piece, entryT }];
  });
  contacts.sort((left, right) => left.entryT - right.entryT || String(left.piece.id).localeCompare(String(right.piece.id)));
  return contacts[0] || null;
}

export function buildPassPlan({ passer, passerCard, pieces, cardById, settings, target, cornerId, rules, legacyManual = false, restartException = null, cornerLongPassBoxTeam = null }) {
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
  // Goalkeeper Retains' restart exception (docs/SHOOTING_RULES.md): inside
  // the executing goalkeeper's own penalty area, EVERY body — teammate or
  // opponent — and every defensive area is ignored for this one restart; the
  // box is assumed crowded right after the save, so nobody standing in it
  // obstructs this one distribution. Never applies to any other passer, and
  // never outside that box. Defensive areas remain an opponent-only concept
  // (a teammate's card never produces one), so that half is unaffected.
  const exceptionActive = Boolean(restartException) && String(restartException.pieceId) === String(passer?.id || "");
  const ignoredByException = cell => exceptionActive && insideOwnPenaltyArea(settings, cell, restartException.team);
  const bodyIgnoredByException = piece => exceptionActive && ignoredByException({ x: piece.x, y: piece.y });
  const defensiveCellsForPieceUnlessException = (piece, card) => defensiveCellsForPiece(piece, card, settings).filter(cell => !ignoredByException(cell));
  // Direct body contact along the pass (the origin corner, and the first
  // body the segment/endpoint touches) is ignored the same way a
  // defensive-area cell is — the ball must reach past that body to its real
  // target, not stop at it. Under the exception this now exempts any body
  // inside the box, teammate or opponent alike — except whoever actually
  // occupies the requested target cell, since that piece is the intended
  // receiver, not an obstruction to clear.
  const ignorableBodyIds = exceptionActive
    ? new Set((pieces || [])
      .filter(piece => bodyIgnoredByException(piece) && !(Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y)))
      .map(piece => String(piece.id)))
    : null;
  const rawOriginBlocker = legacyManual
    ? opponentBlockingPassOrigin(origin, passer, pieces)
    : bodyBlockingPassOrigin(origin, passer, pieces);
  const originBlocker = rawOriginBlocker && bodyIgnoredByException(rawOriginBlocker) ? null : rawOriginBlocker;
  const targetPoint = pointForPassTarget(target);
  const distance = legacyManual ? passDistance(origin, targetPoint) : passMeasurementDistance(passer, target);
  const longPassThreshold = Number(passRules.longPassThreshold) || 16;
  const maxPassDistance = Math.max(longPassThreshold, Number(passRules.maxPassDistance) || 32);
  const passType = distance > longPassThreshold ? "LONG_PASS" : "SHORT_PASS";
  // Offline Short Pass needs a real board cell between passer and requested
  // target. Cells sharing either a side or a corner are too close; this closes
  // the diagonal L-corner route without changing physical-contact geometry.
  const targetTooClose = !legacyManual
    && passType === "SHORT_PASS"
    && Math.max(Math.abs(Number(target.x) - Number(passer.x)), Math.abs(Number(target.y) - Number(passer.y))) <= 1;
  const aerialLongPass = passType === "LONG_PASS" && !legacyManual;
  const targetPlayer = activeFieldPlayerAt(pieces, cardById, target);
  const longEndpointHit = aerialLongPass && targetPlayer
    ? endpointBodyContact(origin, targetPoint, passer, targetPlayer, pieces, ignorableBodyIds)
    : null;
  const hit = !aerialLongPass ? firstPlayerHit(origin, targetPoint, pieces, passer.id, ignorableBodyIds) : longEndpointHit;
  const goalkeeperBlocker = hit && isGoalkeeperPiece(hit.piece, cardById)
    ? { pieceId: hit.piece.id, team: teamKeyForPiece(hit.piece), entryT: hit.entryT }
    : null;
  const effectiveTarget = hit ? { x: Number(hit.piece.x), y: Number(hit.piece.y) } : { x: Number(target.x), y: Number(target.y) };
  const effectiveTargetPoint = hit ? pointForPassTarget(effectiveTarget) : targetPoint;
  const foot = footForPass(origin, targetPoint, passer, passerCard?.preferredFoot);
  const passCells = traversedCells(origin, effectiveTargetPoint, settings).filter(cell => !(cell.x === Number(passer.x) && cell.y === Number(passer.y)));
  const defenseTeam = oppositeTeam(teamKeyForPiece(passer));
  const defensiveAreaCrossings = !aerialLongPass ? (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive && !isBenchReservePiece(piece))
    .flatMap(defender => defensiveCellsForPieceUnlessException(defender, cardById?.[defender.cardId])
      .map(cell => ({ defenderId: defender.id, ...cell, entryT: segmentEntryT(origin, effectiveTargetPoint, cell) }))
      .filter(cell => cell.entryT !== null)) : [];
  const shortInterceptors = (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive && !isBenchReservePiece(piece))
    .map(defender => {
      const cells = defensiveCellsForPieceUnlessException(defender, cardById?.[defender.cardId])
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
  const longGroup = (group, anchor) => {
    return (pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defenseTeam && !piece.inactive && !isBenchReservePiece(piece))
    .map(defender => {
      const cells = defensiveCellsForPieceUnlessException(defender, cardById?.[defender.cardId]);
      // A Long Pass is aerial except at its two endpoints.  An endpoint only
      // activates this defender when the passer/receiver body is in that
      // defender's defensive area. Once activated, use the same rule as a
      // Short Pass: every one of this defender's area cells physically crossed
      // by this selected-corner route is considered on its own.
      const endpointInDefensiveArea = cells.some(cell => cell.x === Number(anchor.x) && cell.y === Number(anchor.y));
      const crossedCells = endpointInDefensiveArea
        ? cells.map(cell => ({ ...cell, passEntryT: segmentEntryT(origin, effectiveTargetPoint, cell) }))
          .filter(cell => cell.passEntryT !== null)
        : [];
      const visibleCells = crossedCells.filter(cell => isCellVisibleToDefender(defender, cell, pieces));
      const firstVisibleCell = visibleCells.slice().sort((left, right) => left.passEntryT - right.passEntryT)[0] || null;
      const priorityDistanceSquared = interceptorPriorityDistanceSquared(anchor, defender);
      return {
        defender,
        cells: crossedCells,
        visibleCells,
        reactionPoint: firstVisibleCell ? pointForPassTarget(firstVisibleCell) : null,
        firstEntryT: firstVisibleCell?.passEntryT ?? null,
        priorityDistanceSquared,
        priorityDistance: Math.sqrt(priorityDistanceSquared),
        priorityMethod: `${group}-endpoint-square-center-to-defender-square-center`,
      };
    }).filter(item => item.visibleCells.length);
  };
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
    // Corner only (not yet Free Kick — no trigger mechanic exists for it):
    // a Long Pass into the defending team's own penalty area is illegal, not
    // merely disadvantaged — Long Pass ignores defensive areas entirely and
    // only risks interception from the receiver's immediate neighbour, which
    // would turn a corner into an unrealistic near-certain scoring chance.
    // Short Pass into the box remains fully legal.
    illegalCornerLongPass: passType === "LONG_PASS" && Boolean(cornerLongPassBoxTeam) && insideOwnPenaltyArea(settings, target, cornerLongPassBoxTeam),
    longPassThreshold,
    maxPassDistance,
    maxDistanceExceeded: !legacyManual && distance > maxPassDistance,
    targetTooClose,
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
      naturalOneEffect: interceptionRules.naturalOneEffect === "none" ? "none" : "carry-disadvantage",
      naturalTwentyEffect: ["bonus-action", "none", "next-turn-roll-advantage", "next-turn-roll-major-advantage"].includes(interceptionRules.naturalTwentyEffect) ? interceptionRules.naturalTwentyEffect : "bonus-action",
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
