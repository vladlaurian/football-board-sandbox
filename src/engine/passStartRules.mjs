import { beginContinuationAction, CONTINUATION_STATUS, normalizeActionContinuation } from "../match/actionContinuation.mjs";
import { ACTION_TRANSACTION_UNDO_MODE, createActionTransaction, transactionForActionState } from "../match/actionTransaction.mjs";
import { createPendingDecision, createPendingRoll, withPendingDecision, withPendingRoll } from "../match/actionResolutionEngine.mjs";
import { PASS_CORNERS, buildPassPlan, interceptorChoiceCandidates, passRequiresInterceptionSequence, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, isTeamActiveForTrackerPhase, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function hasBall(state, piece) {
  return state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
}

function passIdForCommand(command) {
  return String(command.payload?.passId || "").trim();
}

function createPassTargetingResolution({ passId, piece, team, continuationId = null, transaction = null }) {
  return {
    id: passId,
    kind: "pass",
    status: "targeting",
    passerId: piece.id,
    team,
    target: null,
    cornerId: null,
    naturalOnePenalty: 0,
    interceptorIndex: 0,
    pendingDecision: null,
    pendingRoll: null,
    consumedEventIds: [],
    lastRollEvent: null,
    continuationId,
    transaction: transaction || createActionTransaction({
      id: passId,
      actionType: "PASS",
      team,
      source: "pass",
      undoMode: ACTION_TRANSACTION_UNDO_MODE.STEP,
    }),
  };
}

function routeCornerId(command) {
  return Object.prototype.hasOwnProperty.call(command.payload || {}, "cornerId")
    ? command.payload.cornerId
    : undefined;
}

function validRouteCornerId(cornerId, pathMode) {
  if (pathMode === "center-to-center") return cornerId === null;
  return PASS_CORNERS.some(corner => corner.id === String(cornerId || ""));
}

function pendingPassInput(pending, interceptorIndex = 0) {
  const candidates = interceptorChoiceCandidates(pending?.plan?.interceptors, interceptorIndex);
  if (candidates.length >= 2) {
    const team = teamKeyForPiece(candidates[0]?.defender);
    return withPendingDecision({ ...pending, interceptorIndex }, createPendingDecision({
      id: `pass_decision_${pending.id}_${interceptorIndex}`,
      type: "CHOOSE_INTERCEPTOR",
      team,
      options: candidates.map(item => ({ id: String(item?.defender?.id || ""), defenderId: String(item?.defender?.id || "") })),
      context: { actionId: pending.id, interceptorIndex },
    }));
  }
  const interceptor = pending?.plan?.interceptors?.[interceptorIndex];
  const team = teamKeyForPiece(interceptor?.defender);
  return withPendingRoll({ ...pending, interceptorIndex }, createPendingRoll({
    requestId: `pass_roll_${pending.id}_${interceptorIndex}`,
    actionId: pending.id,
    team,
    dieType: 20,
    subjectId: interceptor?.defender?.id,
    reactionIndex: interceptorIndex,
    context: { actionType: "PASS", reactionType: "INTERCEPTION" },
  }));
}

export function startPass(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  if (state.actionResolution) return { accepted: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  const piece = pieceForCommand(state, command);
  const passId = passIdForCommand(command);
  if (!piece || piece.team === "BALL" || piece.inactive) return { accepted: false, reason: "PASSER_INVALID" };
  if (!passId) return { accepted: false, reason: "PASS_ID_REQUIRED" };
  const team = teamKeyForPiece(piece);
  if (!team || !hasBall(state, piece)) return { accepted: false, reason: "PASS_REQUIRES_BALL" };

  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!tracker.gameStarted || tracker.currentTurn < 1) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const bonusPass = continuation?.kind === "bonus-card-action";
  let nextContinuation = continuation;
  if (bonusPass) {
    if (continuation.team !== team || continuation.status !== CONTINUATION_STATUS.READY) return { accepted: false, reason: "BONUS_PASS_NOT_READY" };
    nextContinuation = beginContinuationAction(continuation, { type: "PASS", pieceId: piece.id });
    if (!nextContinuation) return { accepted: false, reason: "BONUS_PASS_NOT_READY" };
  } else {
    if (!isTeamActiveForTrackerPhase(tracker, team)) return { accepted: false, reason: "WAIT_ACTIVE_TEAM" };
    if (trackerActionStatusForTeam(tracker, team).exhausted) return { accepted: false, reason: "ACTIONS_COMPLETE_END_TURN" };
  }

  const transaction = bonusPass ? transactionForActionState(nextContinuation) : null;
  const pending = createPassTargetingResolution({
    passId,
    piece,
    team,
    continuationId: bonusPass ? nextContinuation.id : null,
    transaction,
  });
  return {
    accepted: true,
    nextState: {
      ...state,
      actionResolution: pending,
      ...(bonusPass ? { actionContinuation: nextContinuation } : {}),
    },
    event: {
      type: bonusPass ? "BONUS_PASS_TARGETING_STARTED" : "PASS_TARGETING_STARTED",
      team,
      metadata: { passId, passerId: piece.id, continuationId: bonusPass ? nextContinuation.id : null },
    },
    timeline: { groupId: bonusPass ? nextContinuation.id : null, undoMode: bonusPass ? "atomic" : "step", allowNoop: true },
  };
}

export function selectPassTarget(state, context, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  if (!pending || pending.kind !== "pass" || pending.status !== "targeting") {
    return { accepted: false, reason: "PASS_NOT_TARGETING" };
  }
  if (!passId || passId !== String(pending.id || "")) return { accepted: false, reason: "PASS_NOT_TARGETING" };
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "PASS_TARGET_INVALID" };
  const cols = Number(context?.boardSettings?.cols);
  const rows = Number(context?.boardSettings?.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1 || x < 0 || y < 0 || x >= cols || y >= rows) {
    return { accepted: false, reason: "PASS_TARGET_OUT_OF_BOUNDS" };
  }
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const bonusPass = Boolean(pending.continuationId && continuation?.id === pending.continuationId);
  const next = {
    ...pending,
    target: { x, y },
    status: "route-selection",
  };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: next },
    event: {
      type: "PASS_TARGET_SELECTED",
      team: pending.team,
      metadata: { passId, target: { x, y }, continuationId: bonusPass ? continuation.id : null },
    },
    timeline: { groupId: bonusPass ? continuation.id : null, undoMode: bonusPass ? "atomic" : "step", allowNoop: true },
  };
}

export function confirmPassRoute(state, context, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  if (!pending || pending.kind !== "pass" || pending.status !== "route-selection" || !pending.target) {
    return { accepted: false, reason: "PASS_NOT_ROUTE_SELECTING" };
  }
  if (!passId || passId !== String(pending.id || "")) return { accepted: false, reason: "PASS_NOT_ROUTE_SELECTING" };
  const passer = state.pieces.find(piece => String(piece?.id || "") === String(pending.passerId || "")) || null;
  if (!passer || passer.team === "BALL" || passer.inactive || teamKeyForPiece(passer) !== pending.team || !hasBall(state, passer)) {
    return { accepted: false, reason: "PASSER_INVALID" };
  }
  const pathMode = context?.ruleSet?.actions?.pass?.pathMode === "center-to-center" ? "center-to-center" : "corner-to-center";
  const cornerId = routeCornerId(command);
  if (!validRouteCornerId(cornerId, pathMode)) return { accepted: false, reason: "PASS_ROUTE_INVALID" };
  const plan = buildPassPlan({
    passer,
    passerCard: context.gameplayCardsById[String(passer.cardId || "")],
    pieces: state.pieces,
    cardById: context.gameplayCardsById,
    settings: context.boardSettings,
    target: pending.target,
    cornerId,
    rules: context.ruleSet,
  });
  if (plan.originBlocked) return { accepted: false, reason: "PASS_ROUTE_ORIGIN_BLOCKED" };

  const continuation = normalizeActionContinuation(state.actionContinuation);
  const bonusPass = Boolean(pending.continuationId && continuation?.id === pending.continuationId);
  if (pending.continuationId && (!bonusPass
    || continuation.status !== CONTINUATION_STATUS.ACTION_ACTIVE
    || continuation.actionType !== "PASS"
    || continuation.pieceId !== String(passer.id)
    || continuation.team !== pending.team)) return { accepted: false, reason: "BONUS_PASS_NOT_ACTIVE" };

  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = bonusPass
    ? {
        allowed: true,
        entry: { id: command.id, type: "PASS", pieceId: passer.id, bonus: true },
        actionLog: tracker.actionLog,
        usedActions: tracker.usedActions,
        matchActionState: tracker.matchActionState,
      }
    : activateTrackerAction(tracker, { type: "PASS", pieceId: passer.id, team: pending.team, entryId: command.id });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "PASS_NOT_AVAILABLE" };

  const baseNext = {
    ...pending,
    status: "completing",
    cornerId: plan.origin.cornerId,
    plan,
    entryId: activation.entry.id,
    actionLog: activation.actionLog,
    usedActions: activation.usedActions,
    matchActionState: activation.matchActionState,
    bonusContinuationId: bonusPass ? continuation.id : null,
    pendingDecision: null,
    pendingRoll: null,
  };
  const nextResolution = passRequiresInterceptionSequence(plan, pending.team)
    ? pendingPassInput(baseNext, 0)
    : baseNext;
  return {
    accepted: true,
    nextState: {
      ...state,
      actionResolution: nextResolution,
      ...(bonusPass ? {} : {
        tracker: {
          ...state.tracker,
          actionLog: activation.actionLog,
          usedActions: activation.usedActions,
          matchActionState: activation.matchActionState,
        },
      }),
    },
    event: {
      type: "PASS_CONFIRMED",
      team: pending.team,
      metadata: {
        passId,
        passerId: passer.id,
        cornerId: plan.origin.cornerId,
        status: nextResolution.status,
        continuationId: bonusPass ? continuation.id : null,
      },
    },
    timeline: { groupId: bonusPass ? continuation.id : activation.entry.id, undoMode: bonusPass ? "atomic" : "step", allowNoop: true },
  };
}

export function cancelPass(state, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  if (!pending || pending.kind !== "pass" || !["targeting", "route-selection"].includes(pending.status)) {
    return { accepted: false, reason: "PASS_NOT_CANCELLABLE" };
  }
  if (!passId || passId !== String(pending.id || "")) return { accepted: false, reason: "PASS_NOT_CANCELLABLE" };
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const bonusPass = Boolean(pending.continuationId && continuation?.id === pending.continuationId);
  const nextContinuation = bonusPass ? {
    ...continuation,
    status: CONTINUATION_STATUS.READY,
    actionType: null,
    pieceId: null,
    movementStarted: false,
    transaction: { ...continuation.transaction, actionType: "BONUS_ACTION" },
  } : continuation;
  return {
    accepted: true,
    nextState: {
      ...state,
      actionResolution: null,
      ...(bonusPass ? { actionContinuation: nextContinuation } : {}),
    },
    event: {
      type: "PASS_CANCELLED",
      team: pending.team,
      metadata: { passId, continuationId: bonusPass ? nextContinuation.id : null },
    },
    timeline: { groupId: bonusPass ? nextContinuation.id : null, undoMode: bonusPass ? "atomic" : "step", allowNoop: true },
  };
}
