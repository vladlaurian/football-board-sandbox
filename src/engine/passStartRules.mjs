import { beginContinuationAction, CONTINUATION_STATUS, normalizeActionContinuation } from "../match/actionContinuation.mjs";
import { ACTION_TRANSACTION_UNDO_MODE, createActionTransaction, transactionForActionState } from "../match/actionTransaction.mjs";
import { consumeActionEvent, createPendingDecision, createPendingRoll, createRollEvent, withPendingDecision, withPendingRoll } from "../match/actionResolutionEngine.mjs";
import { PASS_CORNERS, applyInterceptorChoice, buildPassPlan, cardStat, interceptorChoiceCandidates, passRequiresInterceptionSequence, teamKeyForPiece } from "../rules/passEngine.mjs";
import { createDelayedResolution } from "../match/delayedResolution.mjs";
import { resolveInterception } from "../rules/interceptionEngine.mjs";
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

function decisionIdForCommand(command) {
  return String(command.payload?.decisionId || "").trim();
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

function pendingPassRoll(pending, interceptorIndex = 0) {
  const interceptor = pending?.plan?.interceptors?.[interceptorIndex];
  const team = teamKeyForPiece(interceptor?.defender);
  return createPendingRoll({
    requestId: `pass_roll_${pending.id}_${interceptorIndex}`,
    actionId: pending.id,
    team,
    dieType: 20,
    subjectId: interceptor?.defender?.id,
    reactionIndex: interceptorIndex,
    context: { actionType: "PASS", reactionType: "INTERCEPTION" },
  });
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
  return withPendingRoll({ ...pending, interceptorIndex }, pendingPassRoll(pending, interceptorIndex));
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
  if (plan.goalkeeperRouteBlocked) return { accepted: false, reason: "PASS_ROUTE_GOALKEEPER_BLOCKED" };

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

export function selectPassInterceptor(state, context, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  const decisionId = decisionIdForCommand(command);
  const selectedPieceId = String(command.payload?.pieceId || "").trim();
  if (!pending || pending.kind !== "pass" || pending.status !== "awaiting-interceptor-choice" || !pending.pendingDecision) {
    return { accepted: false, reason: "PASS_NOT_INTERCEPTOR_SELECTING" };
  }
  if (!passId || passId !== String(pending.id || "")) return { accepted: false, reason: "PASS_NOT_INTERCEPTOR_SELECTING" };
  if (!decisionId || decisionId !== String(pending.pendingDecision.id || "")) return { accepted: false, reason: "PASS_INTERCEPTOR_DECISION_STALE" };
  if (!selectedPieceId) return { accepted: false, reason: "PASS_INTERCEPTOR_INVALID" };

  const interceptorIndex = Math.max(0, Math.floor(Number(pending.interceptorIndex) || 0));
  const candidates = interceptorChoiceCandidates(pending.plan?.interceptors, interceptorIndex);
  const candidateIds = candidates.map(item => String(item?.defender?.id || ""));
  const decisionIds = (pending.pendingDecision.options || []).map(option => String(option?.defenderId || option?.id || ""));
  const decisionMatchesPlan = candidates.length >= 2
    && candidateIds.length === decisionIds.length
    && candidateIds.every(id => decisionIds.includes(id))
    && String(pending.pendingDecision.type || "") === "CHOOSE_INTERCEPTOR"
    && String(pending.pendingDecision.context?.actionId || "") === String(pending.id || "")
    && Number(pending.pendingDecision.context?.interceptorIndex) === interceptorIndex;
  if (!decisionMatchesPlan) return { accepted: false, reason: "PASS_INTERCEPTOR_DECISION_STALE" };

  const selected = candidates.find(item => String(item?.defender?.id || "") === selectedPieceId);
  const defenseTeam = teamKeyForPiece(selected?.defender);
  if (!selected || !defenseTeam || pending.pendingDecision.team !== defenseTeam) return { accepted: false, reason: "PASS_INTERCEPTOR_INVALID" };
  const modifierCap = context?.ruleSet?.actions?.interception?.useProgressiveBonus === false
    ? 0
    : (context?.ruleSet?.actions?.interception?.modifierCap ?? 4);
  const applied = applyInterceptorChoice(pending.plan?.interceptors, interceptorIndex, selectedPieceId, modifierCap);
  if (!applied) return { accepted: false, reason: "PASS_INTERCEPTOR_INVALID" };

  const nextPlan = {
    ...pending.plan,
    interceptors: applied.interceptors,
    interceptorPriority: {
      ...(pending.plan?.interceptorPriority || {}),
      selections: [
        ...(pending.plan?.interceptorPriority?.selections || []),
        applied.selection,
      ],
    },
  };
  const nextResolution = withPendingRoll({
    ...pending,
    interceptorIndex,
    plan: nextPlan,
  }, pendingPassRoll({ ...pending, plan: nextPlan }, interceptorIndex));
  return {
    accepted: true,
    nextState: { ...state, actionResolution: nextResolution },
    event: {
      type: "PASS_INTERCEPTOR_SELECTED",
      team: defenseTeam,
      metadata: {
        passId,
        decisionId,
        interceptorIndex,
        interceptorChoice: applied.selection,
        continuationId: pending.bonusContinuationId || null,
      },
    },
    timeline: {
      groupId: pending.bonusContinuationId || pending.entryId || null,
      undoMode: pending.bonusContinuationId ? "atomic" : "step",
      allowNoop: true,
    },
  };
}

export function submitPassInterceptionRoll(state, context, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  if (!pending || pending.kind !== "pass" || pending.status !== "awaiting-interception-roll" || !pending.pendingRoll) {
    return { accepted: false, reason: "PASS_NOT_INTERCEPTION_ROLLING" };
  }
  if (!passId || passId !== String(pending.id || "")) return { accepted: false, reason: "PASS_NOT_INTERCEPTION_ROLLING" };
  const interceptorIndex = Math.max(0, Math.floor(Number(pending.interceptorIndex) || 0));
  const interceptor = pending.plan?.interceptors?.[interceptorIndex];
  const defenderId = String(interceptor?.defender?.id || "");
  const team = teamKeyForPiece(interceptor?.defender);
  const rawRollEvent = command.payload?.rollEvent;
  const rollEvent = createRollEvent({
    id: rawRollEvent?.id,
    requestId: rawRollEvent?.requestId,
    actionId: rawRollEvent?.actionId,
    team: rawRollEvent?.team,
    dieType: rawRollEvent?.dieType,
    natural: rawRollEvent?.natural,
    source: rawRollEvent?.source,
    createdAt: rawRollEvent?.createdAt,
    subjectId: rawRollEvent?.subjectId,
    reactionIndex: rawRollEvent?.reactionIndex,
  });
  if (!rollEvent || !defenderId || !team) return { accepted: false, reason: "PASS_INTERCEPTION_ROLL_INVALID" };
  const consumed = consumeActionEvent(pending, rollEvent);
  if (!consumed || rollEvent.team !== team || String(rollEvent.subjectId || "") !== defenderId || Number(rollEvent.reactionIndex) !== interceptorIndex) {
    return { accepted: false, reason: "PASS_INTERCEPTION_ROLL_INVALID" };
  }
  const createdAt = Number(command.payload?.createdAt);
  if (!Number.isFinite(createdAt) || createdAt < 0) return { accepted: false, reason: "PASS_INTERCEPTION_ROLL_TIME_INVALID" };
  const resolutionTransaction = {
    id: `resolution_${pending.id}_${command.id}`,
    source: "roll-resolution",
    undoMode: "atomic",
  };
  const delayedResolution = createDelayedResolution({
    kind: "pass-interception",
    actionId: pending.id,
    team,
    value: rollEvent.natural,
    delayMs: Math.max(2000, Number(context?.ruleSet?.actions?.pass?.resolutionDelayMs) || 2000),
    createdAt,
    payload: {
      defenderId,
      interceptorIndex,
      rollEvent,
      undoTransaction: resolutionTransaction,
    },
  });
  const nextResolution = {
    ...consumed,
    status: "awaiting-interception-resolution",
    lastRoll: { team, value: rollEvent.natural, eventId: rollEvent.id, requestId: rollEvent.requestId },
    lastResolution: null,
    resolutionTransaction,
  };
  const dice = {
    ...state.dice,
    dieType: rollEvent.dieType,
    blueResult: team === "blue" ? rollEvent.natural : state.dice?.blueResult,
    redResult: team === "red" ? rollEvent.natural : state.dice?.redResult,
    blueLastDieType: team === "blue" ? rollEvent.dieType : state.dice?.blueLastDieType,
    redLastDieType: team === "red" ? rollEvent.dieType : state.dice?.redLastDieType,
  };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: nextResolution, dice },
    event: {
      type: "DICE_ROLLED",
      team,
      metadata: {
        rollSource: rollEvent.source,
        rollEvent,
        chosenResult: rollEvent.source === "CHOSEN" ? rollEvent.natural : null,
        delayedResolution,
        undoTransaction: resolutionTransaction,
      },
    },
    timeline: {
      groupId: pending.bonusContinuationId || null,
      undoMode: pending.bonusContinuationId ? "atomic" : "step",
      allowNoop: true,
    },
  };
}

function interceptionOrderLabel(orderModifier) {
  const value = Number(orderModifier) || 0;
  if (value === 0) return "first interceptor";
  if (value === 1) return "second interceptor";
  if (value === 2) return "third interceptor";
  if (value === 3) return "fourth interceptor";
  return `${value + 1}th interceptor`;
}

function buildInterceptionResolution({ pending, defender, context }) {
  const interceptor = pending?.plan?.interceptors?.[pending?.interceptorIndex];
  const plan = pending?.plan || {};
  const rules = plan.interceptionRules || {};
  const defenderRollStatId = rules.defenderRollStatId || "stat:interception";
  const interception = cardStat(context?.gameplayCardsById?.[String(defender.cardId || "")], defenderRollStatId);
  const orderModifier = rules.useProgressiveBonus === false ? 0 : (Number(interceptor?.orderModifier) || 0);
  const nonDominantPenalty = rules.useStandardModifiers === false || plan.foot?.dominant ? 0 : 1;
  const previousNaturalOnePenalty = rules.useStandardModifiers === false ? 0 : (Number(pending.naturalOnePenalty) || 0);
  const attackerTargetValue = Number(plan.attackerTargetValue ?? plan.passerPass) || 0;
  const roll = resolveInterception({
    natural: Number(pending.lastRollEvent?.natural),
    defenderStatValue: interception,
    attackerTargetValue,
    progressiveBonus: orderModifier,
    standardModifier: nonDominantPenalty,
    previousNaturalOnePenalty,
    modifierCap: rules.modifierCap ?? 4,
    equalRollOutcome: rules.equalRollOutcome || "pass-succeeds",
  });
  const modifierSources = [
    { label: "Interception", value: interception, source: "card" },
    { label: "Advantage", value: orderModifier, source: "interceptor-order", detail: interceptionOrderLabel(orderModifier) },
    ...(nonDominantPenalty ? [{ label: "Advantage", value: nonDominantPenalty, source: "non-preferred-foot", detail: "non-preferred foot" }] : []),
    ...(previousNaturalOnePenalty ? [{ label: "Disadvantage", value: previousNaturalOnePenalty, source: "previous-natural-1", detail: "previous Natural 1" }] : []),
  ];
  const appliedModifierSources = !roll.capped
    ? modifierSources
    : (() => {
        const direction = Number(roll.modifier) >= 0 ? 1 : -1;
        let remaining = Math.abs(Number(roll.modifier) || 0);
        return modifierSources.reduce((applied, source) => {
          const value = Number(source.value) || 0;
          if (remaining <= 0 || value * direction <= 0) return applied;
          const visibleValue = direction * Math.min(Math.abs(value), remaining);
          remaining -= Math.abs(visibleValue);
          return [...applied, { ...source, value: visibleValue }];
        }, []);
      })();
  return {
    ...roll,
    passerPass: attackerTargetValue,
    attackerTargetValue,
    attackerTargetStatId: plan.attackerTargetStatId || "stat:passing",
    defenderRollStatId,
    interception,
    orderModifier,
    nonDominantPenalty,
    previousNaturalOnePenalty,
    modifierSources,
    appliedModifierSources,
  };
}

export function resolvePassInterception(state, context, command) {
  const pending = state.actionResolution;
  const passId = passIdForCommand(command);
  const rollEventId = String(command.payload?.rollEventId || "").trim();
  if (!pending || pending.kind !== "pass" || pending.status !== "awaiting-interception-resolution") {
    return { accepted: false, reason: "PASS_NOT_INTERCEPTION_RESOLVING" };
  }
  if (!passId || passId !== String(pending.id || "") || !rollEventId || rollEventId !== String(pending.lastRollEvent?.id || "")) {
    return { accepted: false, reason: "PASS_INTERCEPTION_RESOLUTION_STALE" };
  }
  if (!Array.isArray(pending.consumedEventIds) || !pending.consumedEventIds.includes(rollEventId)) {
    return { accepted: false, reason: "PASS_INTERCEPTION_RESOLUTION_STALE" };
  }
  const interceptorIndex = Math.max(0, Math.floor(Number(pending.interceptorIndex) || 0));
  const interceptor = pending.plan?.interceptors?.[interceptorIndex];
  const defenderId = String(interceptor?.defender?.id || "");
  const defender = state.pieces.find(piece => String(piece?.id || "") === defenderId) || null;
  const team = teamKeyForPiece(defender);
  if (!defender || !team || team !== pending.lastRollEvent?.team || !context?.gameplayCardsById?.[String(defender.cardId || "")]) {
    return { accepted: false, reason: "PASS_INTERCEPTION_RESOLUTION_CONTEXT_INVALID" };
  }
  const resolution = buildInterceptionResolution({ pending, defender, context });
  const nextResolution = { ...pending, status: "interception-resolved", lastResolution: resolution };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: nextResolution },
    event: {
      type: "PASS_INTERCEPTION_RESOLVED",
      team,
      metadata: {
        passId,
        defenderId,
        interceptorIndex,
        rollEventId,
        interceptionResolution: resolution,
        undoTransaction: pending.resolutionTransaction || null,
      },
    },
    timeline: {
      groupId: pending.bonusContinuationId || pending.entryId || null,
      undoMode: pending.bonusContinuationId ? "atomic" : "step",
      allowNoop: false,
    },
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
