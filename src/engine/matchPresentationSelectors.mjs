// Single Player Match UI reads this projection boundary only.  It deliberately
// performs no gameplay resolution: all gameplay facts were persisted by Engine
// commands in MatchState using the frozen MatchContext.

import { evaluateNormalMove } from "./normalMoveRules.mjs";
import { evaluateFreeMove } from "./freeMoveRules.mjs";
import { applyGameCommand, evaluateFreeBallMoved } from "./gameEngine.mjs";
import { GAME_COMMAND_TYPE } from "./gameCommands.mjs";
import { evaluateThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./groupMoveRules.mjs";
import { evaluateBonusMove } from "./bonusMoveRules.mjs";
import { canUseTrackerActionForPiece, canUseTrackerFreeModeForPiece, hasGroupMoveAuthorization, isTeamActiveForTrackerPhase, movementAuthorizationForPiece, personalActionStatusForPiece, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { cardStat, interceptorChoiceCandidates, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activeTeamModifierTokens } from "./rollModifierOpportunities.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { sumAndCapRollModifier } from "../rules/rollModifierMath.mjs";
import { BONUS_ACTION_IMPLEMENTED_TYPES } from "./bonusActionCapabilities.mjs";
import { naturalRollOutcomeLine } from "./rollOutcomeEffects.mjs";
import { goalCellsForTeam } from "./shotRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { isKickoffMoment } from "./kickoffMomentRules.mjs";
import { opponentOfTeam, opponentBoxOccupantIds, illegalDistanceDefenderIds, wallRangeCells, repositionRestartPiece, RESTART_EXECUTION_ACTION_TYPE_FAMILIES } from "./restartSetupRules.mjs";
import { evaluateGkRepositionMove } from "./gkRepositionRules.mjs";

const OFFLINE_IMPLEMENTED_ACTION_TYPES = Object.freeze(["MOVE", "GROUP_MOVE", "SHOT", "TACKLING", ...BONUS_ACTION_IMPLEMENTED_TYPES]);

export function selectNaturalRollOutcomePresentation(outcome) {
  return naturalRollOutcomeLine(outcome, { teamName: outcome?.team === "blue" ? "Blue" : outcome?.team === "red" ? "Red" : null });
}

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
    // Route verdict and segments are canonical Engine projection facts. Keep
    // the fallback only for pre-v20.56.1 recordings that lack this field.
    status: route.verdict || (route.targetInvalidReason || route.goalkeeperRouteBlocked || route.endpointBodyBlocked || route.originBlocked ? "blocked" : (route.directContact?.team && route.directContact.team !== route.team) || route.risk ? "risk" : "clear"),
    // A corner blocked by the passer's own body is shown disabled, exactly
    // like every other mechanic's corner picker, rather than hidden.
    disabled: Boolean(route.targetInvalidReason || route.goalkeeperRouteBlocked || route.endpointBodyBlocked || route.originBlocked),
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

// One shared corner-badge projection for every board-first mechanic (Pass,
// Through Ball, Lofted Through Ball, Shot). Each mechanic still builds its
// own route/plan objects — the physical rules genuinely differ — but they
// converge on this one shape before reaching the board, so a blocked corner
// is presented identically everywhere (shown, disabled) instead of some
// mechanics hiding it and others greying it out.
export function selectRouteCornerBadges(routes, { actionLabel, footLabel } = {}) {
  return (Array.isArray(routes) ? routes : []).map(route => {
    const disabled = route.disabled ?? !route.legal;
    return {
      id: route.cornerId || "center",
      cornerId: route.cornerId,
      origin: route.origin,
      foot: footLabel ? footLabel(route) : (route.foot?.foot === "Left" ? "LF" : route.foot?.foot === "Right" ? "RF" : "BF"),
      modifier: route.modifierLabel ?? (route.modifier !== undefined ? formatSigned(route.modifier) : ""),
      modifierType: route.modifierType || null,
      status: route.status || (disabled ? "blocked" : "clear"),
      disabled: Boolean(disabled),
      actionLabel,
    };
  });
}

// This is a pure label projection of the persisted Shot route plan.  The UI
// never recreates its geometry, legal verdict, band or modifier facts.
export function selectSinglePlayerShotPresentation(state) {
  const pending = state?.actionResolution;
  if (!pending || pending.kind !== "shot") return null;
  const routes = (pending.routes || []).map(route => ({
    ...route,
    // "risk" (red) reflects defensive-area facts only — occupying one at
    // the origin or crossing one along the route — exactly like Pass's own
    // verdict (passStartRules.mjs). Non-dominant-foot DVM and the distant
    // Long Shot band penalty still show in the corner's total modifier
    // number, but must never turn the corner red by themselves.
    status: !route.legal ? "blocked" : route.defensiveAreaCrossings?.length ? "risk" : "clear",
    disabled: !route.legal,
    modifierLabel: formatSigned(route.modifier),
  }));
  return {
    status: pending.status,
    target: pending.target || pending.attemptedTarget || null,
    targetInvalidReason: pending.targetInvalidReason || null,
    routes,
    selectedRoute: routes.find(route => route.cornerId === pending.plan?.cornerId) || null,
    result: pending.status === "result-display" ? pending.result || null : null,
  };
}

// Goal-grid cells are an Engine-owned target domain. The board only renders
// this projection and forwards the selected cell as a command payload.
export function selectSinglePlayerShotTargetPresentation(state, context) {
  const pending = state?.actionResolution;
  if (!pending || pending.kind !== "shot" || pending.status !== "targeting") return { targetOptions: [] };
  const shooter = (state?.pieces || []).find(piece => String(piece?.id) === String(pending.shooterId));
  const settings = context?.boardSettings || {};
  const goalTop = Math.floor((Number(settings.rows) - Number(settings.goalWidth)) / 2);
  const targetOptions = goalCellsForTeam(settings, pending.team).map(target => ({
    ...target,
    x: target.side === "right" ? Number(settings.cols) + Number(target.depth) : -Number(settings.goalDepth) + Number(target.depth),
    boardY: goalTop + Number(target.y),
  }));
  return { targetOptions, shooterId: shooter?.id || null };
}

function previewCommand(type, piece, x, y) {
  return { id: `presentation:${type}:${piece?.id || ""}:${x}:${y}`, type, payload: { pieceId: piece?.id, x: Number(x), y: Number(y) } };
}

export function selectSinglePlayerNormalMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateNormalMove(state, context, previewCommand("NORMAL_MOVE_COMMITTED", piece, x, y), { preview: true });
  // A projection has an explicit nullable geometry field. Invalid piece/input
  // requests have no geometry; ordinary rejected moves still carry the Engine
  // geometry returned above.
  return { ...result, geometry: result.geometry || null, legal: Boolean(result.accepted) };
}

// BA Move presentation always uses the Engine evaluator, including rejected
// destinations. The command envelope intentionally does not expose internal
// calculation details, therefore it cannot be used as a hover evaluator.
export function selectSinglePlayerBonusMovePresentation(state, context, { piece, x, y } = {}) {
  const continuation = state?.actionContinuation;
  let previewState = state;
  if (continuation?.kind === "bonus-card-action" && continuation.status === "ready") {
    const start = applyGameCommand({ state, context, command: previewCommand(GAME_COMMAND_TYPE.BONUS_MOVE_STARTED, piece, x, y) });
    if (!start.accepted) return { ...start, geometry: null, legal: false };
    previewState = start.nextState;
  }
  const result = evaluateBonusMove(previewState, context, previewCommand(GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED, piece, x, y));
  return { ...result, geometry: result.geometry || null, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerThreeTwoPresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateThreeTwoMove(state, context, previewCommand("THREE_TWO_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.eligible) };
}

function selectNormalMoveRoutePresentation(state, context, { piece, x, y } = {}) {
  const current = state?.tracker?.matchActionState?.byPieceId?.[piece?.id] || {};
  if (current.moveAuthorized) {
    const result = evaluateNormalMove(state, context, previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, piece, x, y));
    return { ...result, legal: Boolean(result.accepted), mode: "existing-authorization" };
  }
  const start = applyGameCommand({
    state,
    context,
    command: previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, piece, x, y),
  });
  if (!start.accepted) return { ...start, legal: false, mode: "start-and-commit" };
  const commit = applyGameCommand({
    state: start.nextState,
    context,
    command: previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, piece, x, y),
  });
  return { ...commit, legal: Boolean(commit.accepted), mode: "start-and-commit" };
}

// A ball-cell choice is a presentation of two Engine-owned command routes.
// It deliberately evaluates the complete normal route when MOVE has not yet
// been started, because a direct board click is a valid second entrance to it.
export function selectSinglePlayerBallCellMoveChoicePresentation(state, context, { piece, x, y } = {}) {
  const threeTwo = selectSinglePlayerThreeTwoPresentation(state, context, { piece, x, y });
  const normal = selectNormalMoveRoutePresentation(state, context, { piece, x, y });
  return {
    threeTwo,
    normal,
    showChoice: Boolean(threeTwo.legal),
    showNormalMove: Boolean(normal.legal),
  };
}

export function selectSinglePlayerNormalMoveContinuationPresentation(state, context, { piece } = {}) {
  const pieceState = state?.tracker?.matchActionState?.byPieceId?.[piece?.id] || {};
  const movement = state?.movementStateByPieceId?.[piece?.id] || {};
  const speed = frozenSpeed(context, piece);
  return {
    allowed: Boolean(
      pieceState.moveAuthorized
      && !movement.movementEnded
      && speed !== null
      && Number(movement.spent) < speed
    ),
  };
}

export function selectSinglePlayerGroupMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateGroupMovePlayer(state, context, previewCommand("GROUP_MOVE_PLAYER_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
}

// The draft band is local presentation, but its availability and frozen shape
// are projected by evaluating the same Engine command that will confirm it.
// The preview transition is never published to Timeline.
export function selectSinglePlayerGroupMoveDraftPresentation(state, context, { piece, replay = false } = {}) {
  const team = teamKeyForPiece(piece);
  if (replay) return { allowed: false, reason: "REPLAY_READ_ONLY", team, zoneLength: null, defaultZoneStartX: null, maxZoneStartX: null };
  const result = applyGameCommand({
    state,
    context,
    command: {
      id: `presentation:group-move-zone:${team || "unknown"}`,
      type: GAME_COMMAND_TYPE.GROUP_MOVE_ZONE_CONFIRMED,
      payload: { team, zoneStartX: 0 },
    },
  });
  if (!result.accepted) {
    return { allowed: false, reason: result.reason || "GROUP_MOVE_NOT_ALLOWED", team, zoneLength: null, defaultZoneStartX: null, maxZoneStartX: null };
  }
  const group = result.nextState?.tracker?.matchActionState?.groupMove || {};
  const cols = Math.max(1, Number(context?.boardSettings?.cols) || 0);
  const zoneLength = Math.max(1, Math.min(cols, Number(group.zoneLength) || 1));
  const maxZoneStartX = Math.max(0, cols - zoneLength);
  return {
    allowed: true,
    reason: null,
    team: group.team,
    zoneLength,
    defaultZoneStartX: Math.floor(maxZoneStartX / 2),
    maxZoneStartX,
  };
}

export function selectSinglePlayerGroupMovePieceStatuses(state) {
  const group = state?.tracker?.matchActionState?.groupMove;
  if (!group?.active) return {};
  return Object.fromEntries((state?.pieces || [])
    .filter(piece => piece?.team !== "BALL" && !isBenchReservePiece(piece) && teamKeyForPiece(piece) === group.team
      && Number(piece.x) >= group.zoneStartX && Number(piece.x) < group.zoneStartX + group.zoneLength)
    .map(piece => [piece.id, evaluateGroupMovePieceEligibility(state, { payload: { pieceId: piece.id } }).accepted ? "eligible" : "ineligible"]));
}

export function selectSinglePlayerPieceActionPresentation(state, { piece, replay = false } = {}) {
  const tracker = state?.tracker || {};
  const team = teamKeyForPiece(piece);
  const actionStatus = trackerActionStatusForTeam(tracker, team);
  const personal = personalActionStatusForPiece(tracker, { team, pieceId: piece?.id });
  const isReserve = isBenchReservePiece(piece);
  const tacticBlocked = Boolean(state?.tacticBlock?.[team]);
  // A pending restart setup (wall/reposition/executor selection, or an
  // execution phase whose one entitled executor is a different piece) blocks
  // every ordinary action button — those phases are driven entirely by the
  // restart-setup panel's own RESTART_* commands, never the normal action UI.
  const restartSetup = state?.restartSetup;
  const restartBlocked = Boolean(restartSetup) && (restartSetup.phase !== "execution" || String(restartSetup.executorId) !== String(piece?.id));
  // Untracked Goalkeeper Retains reposition (gkRepositionRules.mjs): same
  // idea as restartBlocked — every ordinary action stays gated to this
  // phase's own GK_REPOSITION_* commands until it closes.
  const gkRepositionBlocked = Boolean(state?.gkReposition);
  const isBlocked = isReserve || tacticBlocked || restartBlocked || gkRepositionBlocked;
  // Free Move is a deliberate global exception to restartBlocked/
  // gkRepositionBlocked (confirmed live with the user — this is a testing
  // engine, not the official game, and needs a way to freely reposition
  // either team's pieces even mid restart-setup or mid gkReposition; safe
  // because Free Move is already administrative, no Tracker cost and it
  // never moves a carried ball). Every other action stays gated to each
  // phase's own flow.
  const freeBlocked = isReserve || tacticBlocked;
  const freeModeActiveForPiece = Boolean(tracker.matchActionState?.freeMode?.active && String(tracker.matchActionState.freeMode.pieceId || "") === String(piece?.id || ""));
  return {
    team,
    actionStatus,
    personal,
    teamActive: isTeamActiveForTrackerPhase(tracker, team),
    actionAllowed: !isBlocked && canUseTrackerActionForPiece({ replay, piece, gameMode: state?.gameMode, gameStarted: tracker.gameStarted, sessionActive: false }),
    freeAllowed: !freeBlocked && canUseTrackerFreeModeForPiece({ replay, piece, gameMode: state?.gameMode, gameStarted: tracker.gameStarted, sessionActive: false }),
    movementAuthorization: isReserve ? { allowed: false, mode: "blocked", reason: "bench-reserve" } : tacticBlocked ? { allowed: false, mode: "blocked", reason: "tactic-invalid" } : freeModeActiveForPiece ? { allowed: true, mode: "free" } : restartBlocked ? { allowed: false, mode: "blocked", reason: "restart-setup-active" } : gkRepositionBlocked ? { allowed: false, mode: "blocked", reason: "gk-reposition-active" } : movementAuthorizationForPiece({ piece, team, gameMode: state?.gameMode, tracker }),
    groupMoveAuthorized: !isBlocked && hasGroupMoveAuthorization(tracker, team),
  };
}

// Reads the same way as every other restart-adjacent panel here — the UI
// stages nothing itself, only which side/piece is active right now and how
// many moves each side has left, plus the entitled team names for its own
// "Team X may reposition" label.
export function selectSinglePlayerGkRepositionPresentation(state) {
  const gkReposition = state?.gkReposition;
  if (!gkReposition) return { active: false };
  const activeTeam = gkReposition.turn === "self" ? gkReposition.team : gkReposition.opponentTeam;
  return {
    active: true,
    team: gkReposition.team,
    opponentTeam: gkReposition.opponentTeam,
    turn: gkReposition.turn,
    activeTeam,
    remaining: { [gkReposition.team]: gkReposition.remaining.self, [gkReposition.opponentTeam]: gkReposition.remaining.opponent },
    activePieceId: gkReposition.activePieceId,
  };
}

// Same shape/contract as selectSinglePlayerNormalMovePresentation — the
// board's own movement-preview rendering (cursor, distance/cost label) can
// consume either one interchangeably, since both are built directly from
// their respective Engine evaluator's own accepted/rejected shape.
export function selectSinglePlayerGkRepositionMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateGkRepositionMove(state, context, previewCommand("GK_REPOSITION_MOVE_COMMITTED", piece, x, y), { preview: true });
  return { ...result, geometry: result.geometry || null, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerTeamActionPresentation(state, { team } = {}) {
  return { actionStatus: trackerActionStatusForTeam(state?.tracker || {}, team), teamActive: isTeamActiveForTrackerPhase(state?.tracker || {}, team) };
}

// The single read-through for anything that needs to know whether a tactic
// confirmed right now would land on the real board (a kickoff moment) or be
// queued for the next one, plus whatever is already queued for either team.
// Adjust must gate on the same fact so it never moves a live piece outside a
// kickoff moment either.
export function selectSinglePlayerTacticPresentation(state) {
  const pendingFormation = state?.pendingFormation || { blue: null, red: null };
  return {
    isKickoffMoment: isKickoffMoment(state),
    pendingFormation,
    adjustEligible: isKickoffMoment(state),
    tacticBlock: state?.tacticBlock || { blue: false, red: false },
  };
}

// The UI's one restart-setup panel family (wall / reposition / executor)
// reads everything it needs here — which team may act right now, which of
// its own pieces are eligible to click, and the ball cell — and decides
// nothing itself. Every click it stages is only confirmed by dispatching
// the matching RESTART_* command, which the Engine validates independently.
export function selectSinglePlayerRestartSetupPresentation(state) {
  const restartSetup = state?.restartSetup;
  if (!restartSetup) return { active: false };
  const attackTeam = restartSetup.team;
  const defenseTeam = opponentOfTeam(attackTeam);
  const eligiblePieceIds = team => {
    const teamCode = team === "blue" ? "A" : "B";
    return (state.pieces || [])
      .filter(piece => piece?.team === teamCode && !piece.inactive && !isBenchReservePiece(piece))
      .map(piece => String(piece.id));
  };
  // Goal Kick only: while the non-executing side still has a player inside
  // the executing team's own box, it must move one of THOSE players next —
  // Skip is disabled and every other of its own pieces is unclickable until
  // the box is clear. Read via the exact same helper the Engine gate itself
  // uses, so the UI can never drift from what a dispatched command would do.
  // Corner / Free Kick: same pattern, for a defending piece standing closer
  // to the ball than the legal minimum distance — see
  // illegalDistanceDefenderIds in restartSetupRules.mjs.
  const repositionTurnIsDefense = restartSetup.phase === "reposition" && restartSetup.repositionTurn === "defense";
  const boxOccupantIds = repositionTurnIsDefense ? opponentBoxOccupantIds(state, state?.settings, restartSetup) : [];
  const illegalDistanceIds = repositionTurnIsDefense ? illegalDistanceDefenderIds(state, restartSetup) : [];
  const mustClearFirstIds = boxOccupantIds.length ? boxOccupantIds : illegalDistanceIds;
  return {
    active: true,
    type: restartSetup.type,
    phase: restartSetup.phase,
    ballCell: restartSetup.ballCell,
    attackTeam,
    defenseTeam,
    wallSize: restartSetup.wallSize,
    // Wall-position phase (confirmed live with the user): the coach's own
    // draft offset/length live in the UI's local state until Confirm, not
    // on canonical state — wallOffset/wallLength here are only the
    // LAST-CONFIRMED values (0/wallSize until the coach ever confirms one).
    // The live highlight for an unconfirmed draft is a separate call —
    // selectSinglePlayerWallPositionPreview below — using the exact same
    // wallRangeCells computation setRestartWallPosition itself commits with.
    wallOffset: restartSetup.wallOffset,
    wallLength: restartSetup.wallLength,
    wallCells: restartSetup.wallCells,
    wallEligiblePieceIds: restartSetup.phase === "wall" ? eligiblePieceIds(defenseTeam) : [],
    repositionTurnTeam: restartSetup.phase === "reposition"
      ? (restartSetup.repositionTurn === "attack" ? attackTeam : defenseTeam)
      : null,
    repositionRemaining: { [attackTeam]: restartSetup.repositionRemaining?.attack ?? 0, [defenseTeam]: restartSetup.repositionRemaining?.defense ?? 0 },
    repositionEligiblePieceIds: restartSetup.phase === "reposition"
      ? (mustClearFirstIds.length ? mustClearFirstIds : eligiblePieceIds(restartSetup.repositionTurn === "attack" ? attackTeam : defenseTeam))
      : [],
    repositionMustClearBoxFirst: boxOccupantIds.length > 0,
    repositionMustClearIllegalDistanceFirst: illegalDistanceIds.length > 0,
    executorEligiblePieceIds: restartSetup.phase === "executor" ? eligiblePieceIds(attackTeam) : [],
    availableActions: restartSetup.availableActions,
  };
}

// The wall-position phase's own live highlight, for a draft offset/length
// the coach is still adjusting locally (not yet dispatched) — uses the
// Engine's own wallRangeCells so a preview can never drift from what
// RESTART_WALL_POSITION_SET would actually commit.
export function selectSinglePlayerWallPositionPreview(state, { offset, length } = {}) {
  const restartSetup = state?.restartSetup;
  if (!restartSetup || restartSetup.phase !== "wall-position") return { active: false };
  const safeLength = Math.max(1, Math.min(restartSetup.wallSize, Math.floor(Number(length)) || 1));
  const safeOffset = Math.floor(Number(offset)) || 0;
  return {
    active: true,
    offset: safeOffset,
    length: safeLength,
    maxLength: restartSetup.wallSize,
    cells: wallRangeCells(restartSetup, safeOffset, safeLength, state?.settings),
  };
}

// The wall-continuation Yes/No gate (restartSetupRules.mjs), read the same
// way as every other pending decision here — the UI stages nothing itself,
// it only reflects state.pendingRestartWallContinuation and dispatches
// RESTART_WALL_CONTINUATION_CONFIRMED/DECLINED.
export function selectSinglePlayerWallContinuationPresentation(state) {
  const pending = state?.pendingRestartWallContinuation;
  if (!pending) return { active: false };
  return { active: true, pieceId: pending.pieceId, x: pending.x, y: pending.y, team: pending.team };
}

// A minimal hover cursor for the reposition phase's own destination click
// (confirmed live with the user): legal/illegal, exactly like Normal Move's
// own cursor, using the Engine's real repositionRestartPiece validation —
// but deliberately no distance/cost label, since a reposition target has no
// such concept. See selectSinglePlayerRestartSetupPresentation for the rest
// of this phase's own projection.
export function selectSinglePlayerRestartRepositionCellPreview(state, context, { pieceId, x, y } = {}) {
  if (!pieceId) return { legal: false };
  const result = repositionRestartPiece(state, context, { id: `presentation:restart-reposition:${pieceId}:${x}:${y}`, payload: { pieceId, x: Number(x), y: Number(y) } });
  return { legal: Boolean(result.accepted) };
}

// Marking (docs/MARKING_RULES.md sections 3 and 4): the pending accept/
// decline decision for the defending coach. Every eligible defender the
// completed route touched is exposed at once as `candidates` — the coach
// selects exactly one (accepting drops every other candidate) or declines
// the whole list. The whole route was already completed before this
// decision opens — it is never a mid-move truncation any more.
export function selectSinglePlayerMarkingDecisionPresentation(state) {
  const pending = state?.pendingMarking;
  if (!pending || !pending.queue?.length) return { active: false };
  return {
    active: true,
    team: pending.team,
    attackerId: pending.attackerId,
    candidates: pending.queue.map(entry => ({ defenderId: entry.defenderId, startedInside: entry.startedInside })),
    opportunitiesRemaining: Math.max(0, Number(state?.markingOpportunities?.[pending.team]) || 0),
  };
}

// Marking switch (docs/MARKING_RULES.md section 8): an already-marked
// attacker entering a different eligible defender's area. `candidates` lists
// the new defender(s) the route touched; `currentMarkerId` is exposed so the
// UI can label the "keep" option with the current marker's own identity.
export function selectSinglePlayerMarkingSwitchPresentation(state) {
  const pending = state?.pendingMarkingSwitch;
  if (!pending || !pending.queue?.length) return { active: false };
  return {
    active: true,
    team: pending.team,
    attackerId: pending.attackerId,
    currentMarkingId: pending.currentMarkingId,
    currentMarkerId: pending.currentMarkerId,
    candidates: pending.queue.map(entry => ({ defenderId: entry.defenderId, startedInside: entry.startedInside })),
    opportunitiesRemaining: Math.max(0, Number(state?.markingOpportunities?.[pending.team]) || 0),
  };
}

// "Continue Marking?" (docs/MARKING_RULES.md section 5): asked before every
// tracking response after a marking's first one.
export function selectSinglePlayerMarkingContinuePresentation(state) {
  const pending = state?.pendingMarkingContinue;
  if (!pending) return { active: false };
  return {
    active: true,
    team: pending.team,
    markerId: pending.markerId,
    attackerId: pending.attackerId,
  };
}

// Marking passive tracking (docs/MARKING_RULES.md section 5): the marker's
// own pending tracking move — every legal cell the coach may click, already
// restricted to the shortest axis(es) toward the attacker and to cells that
// keep the attacker inside the resulting defensive area. The board just
// highlights `cells`; there is no separate axis-choice step.
export function selectSinglePlayerMarkingTrackChoicePresentation(state) {
  const pending = state?.pendingMarkingTrack;
  if (!pending) return { active: false };
  return {
    active: true,
    team: pending.team,
    markerId: pending.markerId,
    attackerId: pending.attackerId,
    cells: pending.cells,
  };
}

// A minimal, iconography-free presentation of who is currently marking whom
// (docs/MARKING_RULES.md section 9 defers full iconography to a future
// presentation task) — enough for the UI to draw a plain indicator on both
// pieces in an active marking.
export function selectSinglePlayerActiveMarkingsPresentation(state) {
  return (state?.activeMarkings || []).map(marking => ({
    id: marking.id,
    team: marking.team,
    markerId: marking.markerId,
    attackerId: marking.attackerId,
  }));
}

// Presentation only: the Engine owns granting, consuming and expiring these tokens.
export function selectSinglePlayerRollModifierTokenPresentation(state, { team } = {}) {
  const turn = Number(state?.tracker?.currentTurn) || 1;
  return activeTeamModifierTokens(state?.teamModifierTokens, team, turn);
}

// The UI may choose a token type, but this Engine selector owns the resulting
// numeric preview and source list. Prompt and submitted roll therefore share
// one calculation contract.
// Tackling has no stored plan/preview the way Shot/Lofted Through Ball do
// (its own modifier is just the defender's Tackling stat, computed live
// here rather than frozen when the action started) — see
// tacklingRules.mjs's resolveTacklingResult for the canonical, authoritative
// version of this same computation.
// Only AV/AVM/DV/DVM ever get capped — never the defender's own Tackling
// stat. With no bonus token selected yet (the only case this function
// itself controls — see the caller for what happens once one is chosen)
// the preview is just the bare, uncapped stat.
function tacklingRollPreview(state, context, pending) {
  const defender = (state?.pieces || []).find(piece => String(piece?.id) === String(pending?.defenderId));
  if (!defender) return null;
  const stat = Math.max(0, Number(cardStat(context?.gameplayCardsById?.[String(defender.cardId || "")], "stat:tackling")) || 0);
  const modifierCap = Math.max(0, Number(context?.ruleSet?.diceModifiers?.stackCap) || 0);
  return { modifierSources: [{ label: "Tackling", value: stat, source: "card" }], modifier: stat, rawModifier: stat, modifierCap, capped: false };
}

export function selectSinglePlayerRollPromptPresentation(state, context, { team, selectedModifierType = null } = {}) {
  const pending = state?.actionResolution;
  const base = pending?.kind === "lofted-through-ball" || pending?.kind === "shot"
    ? pending?.plan?.rollPreview
    : pending?.kind === "pass"
      ? pending?.rollPresentation
      : pending?.kind === "tackling"
        ? tacklingRollPreview(state, context, pending)
        : null;
  if (!base) return null;
  const token = activeTeamModifierTokens(state?.teamModifierTokens, team, state?.tracker?.currentTurn)
    .find(item => item.modifierType === selectedModifierType) || null;
  if (!token) return base;
  const value = resolveDiceModifierStacks(context?.ruleSet?.diceModifiers, token.modifierType);
  const cap = Math.max(0, Number(base.modifierCap ?? context?.ruleSet?.diceModifiers?.stackCap) || 0);
  // Only the situational sources (everything after the base "card" entry
  // every preview builds first, by construction) plus the newly-chosen
  // token are ever capped — never the rolling subject's own base stat,
  // confirmed live with the user; see rollModifierMath.mjs.
  const [baseSource, ...situationalSources] = Array.isArray(base.modifierSources) ? base.modifierSources : [];
  const modifierSources = [
    ...(baseSource ? [baseSource] : []),
    ...situationalSources,
    { label: ({ advantage: "Advantage", majorAdvantage: "Major Advantage", disadvantage: "Disadvantage", majorDisadvantage: "Major Disadvantage" })[token.modifierType], value, source: "team-modifier-token", detail: "earned team modifier" },
  ];
  const situational = sumAndCapRollModifier([...situationalSources, { value }], cap);
  const baseValue = Number(baseSource?.value) || 0;
  const modifier = baseValue + situational.modifier;
  const rawModifier = baseValue + situational.rawModifier;
  const capped = situational.capped;
  return {
    ...base,
    rawModifier,
    modifier,
    modifierCap: cap,
    capped,
    modifierSources,
  };
}

export function selectSinglePlayerDicePresentation(state, { team, extraRollArmed = false } = {}) {
  const pending = state?.actionResolution;
  const request = pending?.pendingRoll || null;
  // Dice ownership is a persisted Engine request, not a list of mechanic
  // names maintained by the UI. Pass, Lofted Through and future D20 actions
  // all expose the same request shape when a team may roll.
  if (request?.team && Number.isFinite(Number(request.dieType))) {
    return {
      canRoll: request.team === team,
      reason: "GAMEPLAY_PENDING_ROLL",
      dieType: Number(request.dieType),
      requestId: request.requestId || null,
    };
  }
  if (pending) return { canRoll: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  return { canRoll: Boolean(extraRollArmed), reason: extraRollArmed ? "EXTRA_ROLL" : "EXTRA_ROLL_NOT_ARMED" };
}

export function selectSinglePlayerFreeMovePresentation(state, { piece, x, y } = {}) {
  const result = evaluateFreeMove(state, previewCommand("FREE_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerFreeBallPresentation(state, context, { x, y } = {}) {
  const result = evaluateFreeBallMoved(state, context, { id: `presentation:free-ball:${x}:${y}`, payload: { x: Number(x), y: Number(y) } });
  return { ...result, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerFreeBallControlPresentation(state, { replay = false } = {}) {
  const actionState = state?.tracker?.matchActionState || {};
  return {
    allowed: Boolean(
      !replay
      && state?.gameMode === "match"
      && !state?.actionResolution
      && !state?.actionContinuation
      && !actionState.freeMode?.active
      && !actionState.groupMove?.active
      && !actionState.activeMovement?.active
    ),
  };
}

function pieceHasBall(state, piece) {
  return Boolean(piece && (state?.pieces || []).some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y)));
}

function frozenSpeed(context, piece) {
  const card = context?.gameplayCardsById?.[String(piece?.cardId || "")];
  return card ? Math.max(0, Number(cardStat(card, "stat:speed")) || 0) : null;
}

export function selectSinglePlayerInspectorControlPresentation(state, context, { piece, replay = false } = {}) {
  const action = selectSinglePlayerPieceActionPresentation(state, { piece, replay });
  const current = state?.tracker?.matchActionState || {};
  const continuation = state?.actionContinuation?.kind === "bonus-card-action" ? state.actionContinuation : null;
  const pending = state?.actionResolution || null;
  const teamOwnsContinuation = !continuation || continuation.team === action.team;
  const freeMoveSamePiece = Boolean(current.freeMode?.active && String(current.freeMode.pieceId || "") === String(piece?.id || ""));
  return {
    ...action,
    endTurnAllowed: Boolean(
      action.actionAllowed
      && action.teamActive
      && !continuation
      && !pending
      && !current.freeMode?.active
      && !current.activeMovement?.active
    ),
    freeBall: selectSinglePlayerFreeBallControlPresentation(state, { replay }),
    freeMoveAllowed: Boolean(
      action.freeAllowed
      // A ready Bonus Action does not own a piece yet. Free Move remains an
      // explicit always-available action until a bonus card action is begun.
      && !(continuation && continuation.status !== "ready")
      && !current.activeMovement?.active
      && !current.groupMove?.active
      && (!current.freeMode?.active || freeMoveSamePiece)
    ),
    continuation,
    teamOwnsContinuation,
    pending,
  };
}

export function selectSinglePlayerInspectorActionPresentation(state, context, { piece, type, replay = false } = {}) {
  const control = selectSinglePlayerInspectorControlPresentation(state, context, { piece, replay });
  const current = state?.tracker?.matchActionState || {};
  const pieceState = current.byPieceId?.[piece?.id] || {};
  const continuation = control.continuation;
  // A pending resolution locks the ordinary action row regardless of its
  // mechanic. Only Pass has a row-level cancellation label; Through Ball
  // owns its inline control separately in the Inspector.
  const pending = control.pending || null;
  const passCancellable = type === "PASS" && pending?.kind === "pass" && pending?.passerId === piece?.id && ["targeting", "route-selection"].includes(pending.status);
  const shotCancellable = type === "SHOT" && pending?.kind === "shot" && pending?.shooterId === piece?.id && ["targeting", "route-selection"].includes(pending.status);
  const normalMove = current.activeMovement || {};
  const moveCancellable = type === "MOVE" && normalMove.active && normalMove.kind === "normal-move" && String(normalMove.pieceId || "") === String(piece?.id || "");
  const bonusMoveCancellable = type === "MOVE" && continuation?.status === "action-active" && continuation.actionType === "MOVE" && String(continuation.pieceId || "") === String(piece?.id || "") && !continuation.movementStarted;
  const movement = state?.movementStateByPieceId?.[piece?.id] || {};
  const speed = frozenSpeed(context, piece);
  const normalHasRemaining = Boolean(pieceState.moveAuthorized && !movement.movementEnded && speed !== null && Number(movement.spent) < speed);
  const personalBlocked = Boolean(control.personal.limit > 0 && control.personal.exhausted && type !== "GROUP_MOVE" && !moveCancellable && !(type === "MOVE" && normalHasRemaining));
  const continuationReady = continuation?.status === "ready";
  const implementedBonusAction = BONUS_ACTION_IMPLEMENTED_TYPES.includes(type);
  const implementedOfflineAction = OFFLINE_IMPLEMENTED_ACTION_TYPES.includes(type);
  const trackerComplete = control.actionStatus.exhausted;
  // Reported live: the Inspector let the executor click Shot on a Free Kick
  // Indirect (not in its own availableActions) — it only failed after
  // dispatch, with an illegal-move notice. Blocked here instead, for every
  // mechanic uniformly, using the exact same family map the real dispatch
  // gate in gameEngine.mjs enforces (RESTART_EXECUTION_ACTION_TYPE_FAMILIES)
  // — never a UI-local approximation of it.
  const restartSetup = state?.restartSetup;
  const restartExecutionBlocked = restartSetup?.phase === "execution" && (() => {
    const families = RESTART_EXECUTION_ACTION_TYPE_FAMILIES[type];
    return !families || !families.some(id => restartSetup.availableActions.includes(id));
  })();
  const disabled = bonusMoveCancellable
    ? false
    : passCancellable
      ? false
      : shotCancellable
        ? false
      : moveCancellable
        ? false
        : normalMove.active
          ? true
          : continuationReady
            ? Boolean(
                !control.teamOwnsContinuation
                || !implementedBonusAction
                || type === "GROUP_MOVE"
                || piece?.inactive
                || current.freeMode?.active
                || current.groupMove?.active
                || (["PASS", "THROUGH_BALL", "LOFTED_THROUGH_BALL", "SHOT"].includes(type) && !pieceHasBall(state, piece))
              )
            : Boolean(
                !implementedOfflineAction
                || pending
                || !control.teamOwnsContinuation
                || Boolean(continuation)
                || !control.teamActive
                || !control.actionAllowed
                || personalBlocked
                || current.freeMode?.active
                || current.groupMove?.active
                || restartExecutionBlocked
                || (["PASS", "THROUGH_BALL", "LOFTED_THROUGH_BALL", "SHOT"].includes(type) && !pieceHasBall(state, piece))
                || (type === "MOVE" && pieceState.moveUsed && !normalHasRemaining)
                || (type === "GROUP_MOVE" && control.actionStatus.remaining !== 1 && !trackerComplete)
                // docs/TACKLING_RULES.md section 1.1: the normal defensive
                // action is only available to a defender the defense-phase-
                // start snapshot actually froze as eligible.
                || (type === "TACKLING" && !(state?.tacklingEligibility || []).some(entry => entry.defenderId === String(piece?.id || "")))
              );
  return {
    ...control,
    disabled,
    actionLocked: trackerComplete && !continuationReady && !passCancellable && !shotCancellable && !moveCancellable,
    label: passCancellable ? "CANCEL PASS" : shotCancellable ? "CANCEL SHOT" : (moveCancellable || bonusMoveCancellable) ? "CANCEL MOVE" : type === "PASS" ? "PASS S/L" : String(type || "").replace("GROUP_MOVE", "GROUP MOVE"),
  };
}

export function selectSinglePlayerInterceptorChoicePresentation(state, context) {
  const pending = state?.actionResolution;
  if (pending?.kind !== "pass" || pending.status !== "awaiting-interceptor-choice") return null;
  const candidates = interceptorChoiceCandidates(pending.plan?.interceptors, pending.interceptorIndex);
  return {
    team: teamKeyForPiece(candidates[0]?.defender),
    candidates: candidates.map(item => ({
      ...item,
      interception: cardStat(context?.gameplayCardsById?.[String(item?.defender?.cardId || "")], pending.plan?.interceptionRules?.defenderRollStatId || "stat:interception"),
    })),
  };
}
