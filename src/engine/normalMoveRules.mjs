import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, isTeamActiveForTrackerPhase, removePersonalAction } from "../tracker/actionRules.mjs";
import { normalizeMatchActionState, normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { firstPlayerBlockingMovementPath, movementPathSquares } from "./movementPathRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { firstMarkingEntryCell, opponentTeamOf, checkMarkingFastExit, beginMarkingTrackMove } from "./markingRules.mjs";
import { isPieceInOffsidePosition, resolveOffsideWatchClaim } from "./offsidePositionRules.mjs";

function normalMovementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
    threeTwoUsed: Boolean(value?.threeTwoUsed),
    movementEnded: Boolean(value?.movementEnded),
    ...(value?.directionLocked ? { directionLocked: true } : {}),
    // Distinguishes WHY directionLocked is set: Three-Two Move's own
    // "continue after prior move" option sets it too (unrelated to
    // offside), and once 3/2 can itself trigger the offside lock as a
    // piece's first hop, `threeTwoUsed` alone stopped being a reliable way
    // to tell the two apart when picking a rejection reason (offside-
    // direction vs Three-Two's own "direction") — see threeTwoMoveRules.mjs.
    ...(value?.offsideDirectionLocked ? { offsideDirectionLocked: true } : {}),
    ...(value?.direction && Number.isInteger(Number(value.direction.dx)) && Number.isInteger(Number(value.direction.dy)) ? { direction: { dx: Math.sign(Number(value.direction.dx)), dy: Math.sign(Number(value.direction.dy)) } } : {}),
    // Where this locked-axis movement session actually started — captured
    // once, at the session's first commit, and never recomputed afterward.
    // Marking fast-exit/entry checks (commitNormalMove) need this once the
    // coach may reverse direction on the same axis mid-session.
    ...(value?.origin && Number.isInteger(Number(value.origin.x)) && Number.isInteger(Number(value.origin.y)) ? { origin: { x: Number(value.origin.x), y: Number(value.origin.y) } } : {}),
    // Every cell this session has actually crossed so far, in the real
    // chronological order each commit visited them — appended to, never
    // geometrically re-derived from two endpoints. A straight line between
    // the session's origin and its current position cannot represent a
    // reversal: if the coach goes out and back to the exact same cell, an
    // origin-to-current reconstruction collapses to zero distance and
    // silently erases the whole detour. Appending each commit's own segment
    // instead keeps that detour visible to Marking's cumulative fast-exit
    // and entry checks (reported live: reversing direction produced a
    // Marking decision or ending that a straight walk through the same
    // cells never would have).
    ...(Array.isArray(value?.visitedCells) ? { visitedCells: value.visitedCells
      .filter(cell => cell && Number.isInteger(Number(cell.x)) && Number.isInteger(Number(cell.y)))
      .map(cell => ({ x: Number(cell.x), y: Number(cell.y) })) } : {}),
  };
}

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function normalMoveSpeed(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

export function startNormalMove(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  const team = teamKeyForPiece(piece);
  if (!team) return { accepted: false, reason: "MOVE_TEAM_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = activateTrackerAction(tracker, { type: "MOVE", pieceId: piece.id, team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "MOVE_NOT_ALLOWED" };
  return {
    accepted: true,
    nextState: {
      ...state,
      tracker: {
        ...state.tracker,
        actionLog: activation.actionLog,
        usedActions: activation.usedActions,
        personalActionsByPieceId: activation.personalActionsByPieceId,
        matchActionState: activation.matchActionState,
      },
    },
    event: { type: "MOVE_ACTIVATED", team, metadata: { pieceId: piece.id, movementReason: "NORMAL_MOVE" } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
  };
}

export function cancelNormalMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.activeMovement || {};
  const log = Array.isArray(tracker.actionLog?.[team]) ? tracker.actionLog[team] : [];
  const last = log[log.length - 1];
  const valid = Boolean(piece && active.active && active.kind === "normal-move"
    && String(active.pieceId || "") === String(piece.id) && active.team === team
    && last?.type === "MOVE" && String(last.pieceId || "") === String(piece.id)
    && String(last.id || "") === String(active.timelineGroupId || ""));
  if (!valid) return { accepted: false, reason: "NORMAL_MOVE_NOT_ACTIVE" };
  const actionLog = { ...tracker.actionLog, [team]: log.slice(0, -1) };
  const usedActions = { ...tracker.usedActions, [team]: actionLog[team].length };
  const byPieceId = { ...tracker.matchActionState.byPieceId };
  delete byPieceId[piece.id];
  const matchActionState = normalizeMatchActionState({
    ...tracker.matchActionState,
    byPieceId,
    activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
  });
  const personalActionsByPieceId = removePersonalAction(tracker, { pieceId: piece.id });
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...state.tracker, actionLog, usedActions, personalActionsByPieceId, matchActionState } },
    event: { type: "MOVE_CANCELLED", team, metadata: { pieceId: piece.id, movementReason: "NORMAL_MOVE" } },
    timeline: { groupId: active.timelineGroupId || null, undoMode: "step", allowNoop: true },
  };
}

// This is deliberately exported for the Single Player presentation boundary.
// A preview must use the exact validation that the commit will use; the UI
// must never recreate movement legality from its own copies of these rules.
export function evaluateNormalMove(state, context, command, { preview = false } = {}) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const team = teamKeyForPiece(piece);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive || !team) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  // Geometry is an Engine fact used by the Match presentation projection. It
  // must be available even when a later gameplay gate rejects the move (for
  // example before the Tracker starts or while the other team is active).
  // UI never derives this geometry itself.
  const geometry = getMovementGeometry(piece, { x, y });
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.activeMovement || {};
  const pieceState = tracker.matchActionState.byPieceId[piece.id] || {};
  const activeForPiece = active.active && active.kind === "normal-move"
    && String(active.pieceId || "") === String(piece.id) && active.team === team;
  if (!isTeamActiveForTrackerPhase(tracker, team)) return { accepted: false, reason: "wait-active-team", geometry };
  // Preview is an evaluator-only capability. It is never read from command
  // payload, so a submitted NORMAL_MOVE_COMMITTED command cannot bypass MOVE
  // authorization by carrying UI metadata.
  if ((!pieceState.moveAuthorized && !(preview && !active.active)) || (!activeForPiece && active.active)) return { accepted: false, reason: "NORMAL_MOVE_NOT_ACTIVE", geometry };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) return { accepted: false, reason: "occupied", geometry };
  if (geometry.kind === "same") return { accepted: false, reason: "same", geometry };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed", geometry };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) {
    return { accepted: false, reason: "path-blocked", geometry };
  }
  const current = normalMovementState(state.movementStateByPieceId[piece.id]);
  if (current.movementEnded) return { accepted: false, reason: "movement-ended", geometry, current, remaining: 0 };
  const speed = normalMoveSpeed(piece, context);
  if (speed === null) return { accepted: false, reason: "no-speed", geometry, current };
  if (current.axis && current.axis !== geometry.axis) return { accepted: false, reason: "axis", geometry, speed, current };
  // Offside movement lock (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6,
  // confirmed live with the user): a piece that starts a fresh movement
  // session (no axis committed yet this session) while currently standing in
  // an offside position gets locked to whichever direction its first hop
  // takes, exactly like directionLocked already works for Three-Two Move's
  // bonus continuation — this is what stops a turn-based "retreat onside,
  // receive a pass mid-session, then reverse and break away alone" sequence
  // from making a defensive offside trap unusable. Checked only once, at the
  // session's first commit — becoming onside via that first hop does not
  // release the lock for the rest of the session.
  const offsideLocked = !current.axis && !current.directionLocked
    && isPieceInOffsidePosition(state, context, { piece, attackingTeam: team });
  const directionLocked = current.directionLocked || offsideLocked;
  const direction = { dx: Math.sign(x - Number(piece.x)), dy: Math.sign(y - Number(piece.y)) };
  if (directionLocked && current.direction && (current.direction.dx !== direction.dx || current.direction.dy !== direction.dy)) {
    // Distinct reason string (not reused "direction") because
    // applyGameCommand's rejection strips everything but {accepted, reason}
    // before it reaches the UI (confirmed by gameEngine.test.mjs's own
    // strict deepEqual on a 3/2 rejection) — offsideDirectionLocked is the
    // only reliable way to tell the two locks apart this late.
    return { accepted: false, reason: current.offsideDirectionLocked ? "offside-direction" : "direction", geometry, speed, current };
  }
  const moveCost = geometry.kind === "diagonal"
    ? diagonalCostForDistance(current.distance + geometry.distance) - diagonalCostForDistance(current.distance)
    : geometry.cost;
  const remaining = Math.max(0, speed - current.spent);
  if (moveCost > remaining) return { accepted: false, reason: "speed", geometry, moveCost, speed, current, remaining };
  return { accepted: true, piece, team, x, y, tracker, pieceState, active, activeForPiece, geometry, current, speed, moveCost, remaining, offsideLocked };
}

export function commitNormalMove(state, context, command) {
  const evaluation = evaluateNormalMove(state, context, command);
  if (!evaluation.accepted) return evaluation;
  const { piece, team, x, y, tracker, pieceState, active, activeForPiece, geometry, current, moveCost, offsideLocked } = evaluation;

  // Marking (docs/MARKING_RULES.md sections 3 and 4): the attacker's move is
  // NEVER truncated any more (confirmed with the user — it used to stop dead
  // at the first area entered, which read as broken/confusing). It always
  // lands exactly where requested; only AFTER that landing does the engine
  // work out who along the whole route gets a chance to mark, and opens that
  // decision then. state.pendingMarking is never active for more than one
  // move at a time (gameEngine.mjs blocks other commands while it is set),
  // so no later move can pile a second entry on top before this one clears.
  const requestedPath = movementPathSquares(piece, { x, y });
  // Fast exit (docs/MARKING_RULES.md section 7) must be judged against the
  // WHOLE movement action's route through one defensive area, not just this
  // individual segment — a fragmented series of small commits (the piece's
  // own axis is locked across all of them, see `current` above) must not be
  // able to sneak the cumulative cell count under the section 7 threshold
  // piece by piece. The true start of this movement action is stored
  // explicitly in `current.origin` the first time this session moves (see
  // movementStateByPieceId below) and never recomputed from direction times
  // distance — reported live: a coach who reverses direction mid-session
  // (moves forward, then back out along the SAME locked axis) broke the old
  // back-computation, since `direction` freezes at the session's first hop
  // while `distance` keeps summing regardless of sign, producing a bogus
  // origin far past where the piece actually started the moment the coach
  // ever moved the opposite way.
  const movementOrigin = current.origin ? { ...piece, x: current.origin.x, y: current.origin.y } : piece;
  const cumulativePath = [...(current.visitedCells || []), ...requestedPath];
  // Fast exit: if this route already qualifies the mover to break free of
  // its own marker, that Marking ends right here — before even checking
  // whether the move also enters some OTHER defender's area — rather than
  // pausing for a decision at all.
  const markingFastExit = state.gameMode === "match" ? checkMarkingFastExit(state, context, { mover: movementOrigin, path: cumulativePath }) : null;
  const fastExit = markingFastExit?.qualifies ? markingFastExit : null;
  const entryCheckState = fastExit ? { ...state, activeMarkings: fastExit.activeMarkings } : state;
  // Marking is one-directional (docs/MARKING_RULES.md: "Only the defending
  // team may declare Marking during the attacking team's phase") —
  // firstMarkingEntryCell itself is purely geometric/symmetric (whoever
  // moves is "the mover", the opponent is offered to mark), so this call is
  // gated to only ever fire for the team attacking THIS numbered turn
  // (tracker.startingTeam, stable regardless of which sub-phase is
  // currently active). Reported live: without this gate, the DEFENDING
  // team's own legitimate repositioning during its own defense phase could
  // wander a piece into an ATTACKER's defensive area and get the attacking
  // team offered a marking choice — backwards, since marking is exclusively
  // a defensive action.
  const entryResult = state.gameMode === "match" && !state.pendingMarking && !state.pendingMarkingSwitch && team === tracker.startingTeam
    ? firstMarkingEntryCell(entryCheckState, context, { mover: piece, moverTeam: team, path: requestedPath, fastExitOrigin: movementOrigin, fastExitPath: cumulativePath })
    : null;
  const queue = entryResult?.queue || [];
  const defendingTeam = opponentTeamOf(team);
  const hasOpportunity = (state.markingOpportunities?.[defendingTeam] ?? 0) > 0;

  const landingX = x;
  const landingY = y;
  const landingGeometry = geometry;
  const landingMoveCost = moveCost;

  const carriesBall = state.pieces.some(item => item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
  const pieces = state.pieces.map(item => {
    if (item.id === piece.id) return { ...item, x: landingX, y: landingY };
    if (carriesBall && item.team === "BALL") return { ...item, x: landingX, y: landingY };
    return item;
  });
  const movementStateByPieceId = {
    ...state.movementStateByPieceId,
    [piece.id]: {
      ...current,
      axis: current.axis || landingGeometry.axis,
      direction: current.direction || { dx: Math.sign(landingX - Number(piece.x)), dy: Math.sign(landingY - Number(piece.y)) },
      origin: current.origin || { x: Number(piece.x), y: Number(piece.y) },
      visitedCells: [...(current.visitedCells || []), ...requestedPath],
      ...((current.directionLocked || offsideLocked) ? { directionLocked: true } : {}),
      ...((current.offsideDirectionLocked || offsideLocked) ? { offsideDirectionLocked: true } : {}),
      spent: current.spent + landingMoveCost,
      distance: current.distance + landingGeometry.distance,
    },
  };
  const matchActionState = activeForPiece
    ? normalizeMatchActionState({
        ...tracker.matchActionState,
        activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
      })
    : tracker.matchActionState;
  // Section 6's "no marking left": the route DID touch at least one area a
  // decision would otherwise be due for, but the defending team has already
  // spent both opportunities this turn — announced once, not per defender,
  // since with zero opportunities left every one of them is equally moot.
  const activeMarkings = fastExit ? fastExit.activeMarkings : state.activeMarkings;
  // "X can't be marked by Y[, Z...]" (docs section 7: "the defender may not
  // consume a Marking unnecessarily") — bundled into ONE notice covering
  // every defender this route touched but fast exit already ruled out,
  // rather than one announcement per defender. The id is stable per
  // attacker+turn (not per command), so re-evaluating the same still-
  // fast-exiting pairings across a fragmented move's later commits does not
  // spam the same announcement twice.
  const preventedDefenderIds = (entryResult?.preventedDefenderIds || [])
    // A defender whose own active Marking just ended by fast exit (above)
    // was never a "prevented from marking" candidate — it already had the
    // real thing and the ended-Marking notice already covers this attacker's
    // escape. Without this filter the same escape would double-announce.
    .filter(defenderId => !fastExit || String(defenderId) !== String(fastExit.endedMarking.markerId));
  // Section 6's "no marking left": the route touched at least one area a
  // decision (queued OR fast-exit-prevented) would otherwise be due for, but
  // the defending team has already spent both opportunities this turn — in
  // that case ONLY this notice shows (confirmed with the user), never also
  // the fast-exit-prevented one, since with zero opportunities left the
  // fast-exit distinction is moot: nothing could have been marked either way.
  const outOfOpportunities = (queue.length > 0 || preventedDefenderIds.length > 0) && !hasOpportunity;
  const switchFromMarking = entryResult?.switchFromMarkingId
    ? (state.activeMarkings || []).find(marking => marking.id === entryResult.switchFromMarkingId) || null
    : null;
  const pendingMarkingSwitch = switchFromMarking && queue.length > 0 && hasOpportunity
    ? { id: `marking_switch_${command.id}`, team: defendingTeam, attackerId: piece.id, currentMarkingId: switchFromMarking.id, currentMarkerId: switchFromMarking.markerId, queue }
    : state.pendingMarkingSwitch;
  const pendingMarking = !switchFromMarking && queue.length > 0 && hasOpportunity
    ? { id: `marking_decision_${command.id}`, team: defendingTeam, attackerId: piece.id, queue }
    : state.pendingMarking;
  const preventedNotices = preventedDefenderIds.length && !outOfOpportunities
    ? [{
        id: `marking_prevented_${piece.id}_turn${state.tracker?.currentTurn ?? 0}`,
        team: defendingTeam,
        markerIds: preventedDefenderIds,
        attackerId: piece.id,
        reason: "fast-exit-prevented",
      }]
    : [];
  const noMarkingLeftNotices = outOfOpportunities
    ? [{ id: `marking_no_opportunities_${piece.id}_turn${state.tracker?.currentTurn ?? 0}`, team: defendingTeam, attackerId: piece.id, reason: "no-marking-left" }]
    : [];
  // Explains a route that LOOKED like it should fast-exit (the Speed edge
  // was there) but didn't, because the crossing through the area itself was
  // too long (docs section 7) — otherwise the marking would just silently
  // stay in place with no visible reason why the escape attempt failed.
  // Case 2: the attacker's OWN active marker.
  const ownMarkerNearMissNotice = markingFastExit && !markingFastExit.qualifies && markingFastExit.nearMiss
    ? [{
        id: `marking_fast_exit_attempted_${piece.id}_turn${state.tracker?.currentTurn ?? 0}_own`,
        team: markingFastExit.nearMiss.team,
        markerId: markingFastExit.nearMiss.markerId,
        attackerId: piece.id,
        reason: "fast-exit-attempted",
        runLength: markingFastExit.nearMiss.runLength,
        maxAllowed: markingFastExit.nearMiss.maxAllowed,
        geometryKind: markingFastExit.nearMiss.geometryKind,
      }]
    : [];
  // Case 1: a NEW candidate defender's area, touched on a fresh-entry check
  // (still offered as an ordinary Marking decision above — this only adds
  // the explanation for why fast exit itself did not also apply).
  const candidateNearMissNotices = (entryResult?.fastExitNearMisses || []).map(nearMiss => ({
    id: `marking_fast_exit_attempted_${piece.id}_turn${state.tracker?.currentTurn ?? 0}_${nearMiss.defenderId}`,
    team: defendingTeam,
    markerId: nearMiss.defenderId,
    attackerId: piece.id,
    reason: "fast-exit-attempted",
    runLength: nearMiss.runLength,
    maxAllowed: nearMiss.maxAllowed,
    geometryKind: nearMiss.geometryKind,
  }));
  // Preserve any notice a NORMAL_MOVE_STARTED trigger-check already set
  // earlier in this same board-click sequence — this commit only overwrites
  // it with a fresher one of its own, it never silently clears it.
  const markingEndedNotices = [
    ...(fastExit ? [fastExit.endedMarking] : (state.markingEndedNotices || [])),
    ...preventedNotices,
    ...noMarkingLeftNotices,
    ...ownMarkerNearMissNotice,
    ...candidateNearMissNotices,
  ];
  const withMarkingUpdates = { ...state, pieces, movementStateByPieceId, tracker: { ...state.tracker, matchActionState }, pendingMarking, pendingMarkingSwitch, activeMarkings, markingEndedNotices };
  // Passive tracking (docs/MARKING_RULES.md section 5): confirmed with the
  // user, a marker's response is due the moment ITS OWN attacker's move
  // ends — never by waiting for some other action to start next. That old
  // "wait for the next action" trigger still exists in gameEngine.mjs for
  // every OTHER action type that can end an attacker's movement, but a
  // Normal Move ending must settle any already-active marking's next check
  // right here, in the same commit, instead of leaving the marker frozen
  // until something else happens to start (reported live: without this, an
  // attacker who moved out of its marker's area without qualifying for fast
  // exit got no tracking response at all — the marker just sat there with
  // Speed left and no legal-looking moves until a later action forced it).
  const trackingCheck = state.gameMode === "match" && !pendingMarking && !pendingMarkingSwitch && activeMarkings.length
    ? beginMarkingTrackMove(withMarkingUpdates, context)
    : null;
  const finalState = trackingCheck?.changed
    ? { ...trackingCheck.nextState, markingEndedNotices: [...markingEndedNotices, ...(trackingCheck.endedMarkings || [])] }
    : withMarkingUpdates;
  // Offside Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6): landing
  // on a previously-loose ball (not one this piece was already carrying —
  // `carriesBall` above) is a claim, checked against any live watch left by
  // an unclaimed Through Ball / Lofted Through Ball. See
  // offsidePositionRules.mjs for why this deliberately survives turn/phase
  // resets.
  const ballBefore = state.pieces.find(item => item?.team === "BALL") || null;
  const landedOnLooseBall = Boolean(ballBefore) && !carriesBall && Number(ballBefore.x) === landingX && Number(ballBefore.y) === landingY;
  const offsideClaim = landedOnLooseBall ? resolveOffsideWatchClaim(finalState, { piece, team }) : null;
  const outputState = offsideClaim
    ? {
        ...finalState,
        offsideWatch: null,
        ...(offsideClaim.offside ? {
          pendingRestartResult: { type: "indirectFreeKick", team: opponentTeamOf(offsideClaim.attackingTeam), spot: { x: landingX, y: landingY }, executable: false },
          actionResolution: { kind: "offside", status: "result-display", team: offsideClaim.attackingTeam, result: { offside: true, recipientId: String(piece.id), team: offsideClaim.attackingTeam } },
        } : {}),
      }
    : finalState;
  return {
    accepted: true,
    nextState: outputState,
    event: {
      type: "PIECE_MOVED",
      team,
      metadata: {
        pieceId: piece.id,
        from: { x: Number(piece.x), y: Number(piece.y) },
        to: { x: landingX, y: landingY },
        movementReason: "NORMAL_MOVE",
        ...(queue.length > 0 && hasOpportunity ? { markingDecisionOffered: true } : {}),
        ...(offsideClaim?.offside ? { offside: true } : {}),
      },
    },
    timeline: { groupId: activeForPiece ? active.timelineGroupId : pieceState.moveGroupId, undoMode: "step", allowNoop: false },
  };
}
