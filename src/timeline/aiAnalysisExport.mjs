import { cloneGameState } from "../game/gameState.mjs";
import { rowLetter } from "../board/boardGeometry.mjs";
import { createGameplayCardMap } from "../cards/gameplayCard.mjs";
import { normalizeRuleSet } from "../rules/ruleSets.mjs";
import { normalizeTimeline, timelineStateAt } from "./timelineEngine.mjs";

export const AI_ANALYSIS_EXPORT_TYPE = "football-board-ai-analysis";
export const AI_ANALYSIS_EXPORT_SCHEMA_VERSION = 9;

export function analysisCoord(piece) {
  if (!piece || !Number.isFinite(Number(piece.x)) || !Number.isFinite(Number(piece.y))) return null;
  return `${rowLetter(piece.y)}${Number(piece.x) + 1}`;
}

function cardMap(cards) {
  return createGameplayCardMap(cards);
}

function referencedCardIdsForActiveTimeline(timeline) {
  const ids = new Set();
  const collect = state => {
    (Array.isArray(state?.pieces) ? state.pieces : []).forEach(piece => {
      const cardId = String(piece?.cardId || "").trim();
      if (cardId) ids.add(cardId);
    });
  };
  collect(timeline.initialState);
  timeline.entries.slice(0, timeline.cursor).forEach(entry => {
    collect(entry.before);
    collect(entry.after);
  });
  return ids;
}

function teamForPiece(piece) {
  if (piece?.team === "A") return "blue";
  if (piece?.team === "B") return "red";
  return null;
}

function compactPiece(piece, cardsById) {
  const cardId = String(piece?.cardId || "").trim() || null;
  const card = cardId ? cardsById.get(cardId) : null;
  return {
    pieceId: String(piece?.id || ""),
    team: teamForPiece(piece),
    isBall: piece?.team === "BALL",
    cardId,
    name: card?.name || null,
    position: card?.position || String(piece?.label || "").trim() || null,
    coord: analysisCoord(piece),
    inactive: Boolean(piece?.inactive),
  };
}

function compactTracker(tracker = {}) {
  return {
    gameStarted: Boolean(tracker?.gameStarted),
    currentAttackingTeam: tracker?.startingTeam === "blue" ? "blue" : "red",
    currentTurn: Math.max(0, Number(tracker?.currentTurn) || 0),
    phase: String(tracker?.turnPhase || "attack"),
    actionLimits: {
      attack: Math.max(0, Number(tracker?.settings?.attackActions) || 0),
      defense: Math.max(0, Number(tracker?.settings?.defenseActions) || 0),
      turns: Math.max(0, Number(tracker?.settings?.turns) || 0),
    },
    actionsUsed: {
      blue: Math.max(0, Number(tracker?.usedActions?.blue) || 0),
      red: Math.max(0, Number(tracker?.usedActions?.red) || 0),
    },
    personalActionsByPieceId: Object.fromEntries(Object.entries(tracker?.personalActionsByPieceId || {})
      .map(([pieceId, used]) => [String(pieceId), Math.max(0, Math.min(3, Number(used) || 0))])
      .filter(([pieceId, used]) => pieceId && used > 0)),
  };
}

function compactActionTransaction(value) {
  if (!value || typeof value !== "object" || !String(value.id || "").trim()) return null;
  return {
    id: String(value.id),
    actionType: String(value.actionType || "UNKNOWN"),
    team: value.team === "blue" ? "blue" : value.team === "red" ? "red" : null,
    source: String(value.source || "gameplay"),
    undoMode: value.undoMode === "atomic" ? "atomic" : "step",
  };
}

function compactResumePolicy(value) {
  if (!value || typeof value !== "object") return null;
  return {
    type: String(value.type || ""),
    team: value.team === "blue" ? "blue" : value.team === "red" ? "red" : null,
    nextTurn: Math.max(0, Number(value.nextTurn) || 0),
    phase: String(value.phase || "attack"),
  };
}

function compactState(state, cardsById) {
  return {
    pieces: (Array.isArray(state?.pieces) ? state.pieces : []).map(piece => compactPiece(piece, cardsById)),
    tracker: compactTracker(state?.tracker),
    dice: {
      dieType: Math.max(2, Number(state?.dice?.dieType) || 20),
      blueResult: state?.dice?.blueResult ?? null,
      redResult: state?.dice?.redResult ?? null,
    },
    actionContinuation: state?.actionContinuation ? {
      kind: String(state.actionContinuation.kind || ""),
      source: String(state.actionContinuation.source || ""),
      team: state.actionContinuation.team === "blue" ? "blue" : state.actionContinuation.team === "red" ? "red" : null,
      status: String(state.actionContinuation.status || ""),
      resumePolicy: compactResumePolicy(state.actionContinuation.resumePolicy),
      actionType: state.actionContinuation.actionType || null,
      pieceId: state.actionContinuation.pieceId || null,
      transaction: compactActionTransaction(state.actionContinuation.transaction),
    } : null,
  };
}

function compactRuleSet(ruleSet) {
  const normalized = normalizeRuleSet(ruleSet);
  return {
    id: normalized.id,
    name: normalized.name,
    notes: normalized.notes || null,
    schemaVersion: normalized.schemaVersion,
    actions: {
      pass: {
        status: normalized.actions.pass.status,
        rollMode: "manual",
        pathMode: normalized.actions.pass.pathMode,
        longPassThreshold: normalized.actions.pass.longPassThreshold,
        resolutionDelayMs: normalized.actions.pass.resolutionDelayMs,
      },
      interception: {
        status: normalized.actions.interception.status,
        rollMode: "manual",
        defenderRollStatId: normalized.actions.interception.defenderRollStatId,
        useStandardModifiers: normalized.actions.interception.useStandardModifiers,
        useProgressiveBonus: normalized.actions.interception.useProgressiveBonus,
        modifierCap: normalized.actions.interception.modifierCap,
        equalRollOutcome: normalized.actions.interception.equalRollOutcome,
      },
    },
  };
}

function piecesById(state) {
  return new Map((Array.isArray(state?.pieces) ? state.pieces : [])
    .filter(piece => piece?.id)
    .map(piece => [String(piece.id), piece]));
}

function changedPieces(before, after, cardsById) {
  const beforeById = piecesById(before);
  const afterById = piecesById(after);
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes = [];
  ids.forEach(pieceId => {
    const previous = beforeById.get(pieceId);
    const next = afterById.get(pieceId);
    const origin = analysisCoord(previous);
    const destination = analysisCoord(next);
    const previousInactive = Boolean(previous?.inactive);
    const nextInactive = Boolean(next?.inactive);
    const previousCardId = String(previous?.cardId || "") || null;
    const nextCardId = String(next?.cardId || "") || null;
    if (origin === destination && previousInactive === nextInactive && previousCardId === nextCardId) return;
    changes.push({
      pieceId,
      team: teamForPiece(next || previous),
      isBall: (next || previous)?.team === "BALL",
      name: compactPiece(next || previous, cardsById).name,
      position: compactPiece(next || previous, cardsById).position,
      origin,
      destination,
      inactiveBefore: previousInactive,
      inactiveAfter: nextInactive,
      cardIdBefore: previousCardId,
      cardIdAfter: nextCardId,
    });
  });
  return changes;
}

function addedTrackerActions(before, after) {
  const added = [];
  for (const team of ["blue", "red"]) {
    const beforeIds = new Set((before?.tracker?.actionLog?.[team] || []).map(entry => String(entry?.id || "")));
    (after?.tracker?.actionLog?.[team] || []).forEach(entry => {
      if (!beforeIds.has(String(entry?.id || ""))) {
        added.push({
          id: String(entry?.id || ""),
          type: String(entry?.type || "UNKNOWN"),
          pieceId: String(entry?.pieceId || "") || null,
          team,
        });
      }
    });
  }
  return added;
}

function actorForEntry(entry, before, after, movements, cardsById) {
  const action = addedTrackerActions(before, after)[0];
  const pieceId = action?.pieceId || movements.find(change => !change.isBall)?.pieceId || null;
  if (!pieceId) return null;
  const piece = piecesById(after).get(pieceId) || piecesById(before).get(pieceId);
  const compact = compactPiece(piece, cardsById);
  return {
    pieceId,
    name: compact.name,
    position: compact.position,
    startCoord: analysisCoord(piecesById(before).get(pieceId)),
  };
}

function movementReason(entry, movements) {
  if (!movements.length) return null;
  if (entry.type === "THREE_TWO_MOVE") return "THREE_TWO";
  if (entry.type === "GROUP_MOVE_PIECE") return "GROUP_MOVE";
  if (entry.type === "FREE_MOVE") return "FREE_MODE";
  if (entry.metadata?.movementReason === "FREE_BALL" || entry.type === "BALL_MOVED") return "FREE_BALL";
  if (entry.type === "PIECE_MOVED" && entry.groupId) return "NORMAL_MOVE";
  return "MANUAL_MOVE";
}

function semanticType(entry, trackerActions, movements) {
  if (trackerActions[0]?.type) return trackerActions[0].type;
  if (entry.type === "PIECE_MOVED" || entry.type === "BALL_MOVED" || entry.type === "THREE_TWO_MOVE" || entry.type === "GROUP_MOVE_PIECE" || entry.type === "FREE_MOVE") return "MOVE";
  if (entry.type.endsWith("_ACTIVATED")) return entry.type.replace(/_ACTIVATED$/, "");
  if (movements.length) return "MOVE";
  return entry.type;
}

function eventSource(entry) {
  if (entry.metadata?.administrative) return "MANUAL_CORRECTION";
  if (["CARD_ASSIGNED", "CARD_DETACHED", "CARD_DELETED", "BOARD_SETTING_CHANGED", "MATCH_MODE_ENDED"].includes(entry.type)) return "MANUAL_CORRECTION";
  return "GAMEPLAY";
}

function possessionForState(state) {
  const pieces = Array.isArray(state?.pieces) ? state.pieces : [];
  const ball = pieces.find(piece => piece?.team === "BALL");
  if (!ball) return { team: null, ballCarrierId: null, ballCoord: null };
  const carrier = pieces.find(piece => piece?.team !== "BALL" && Number(piece?.x) === Number(ball.x) && Number(piece?.y) === Number(ball.y));
  return {
    team: teamForPiece(carrier),
    ballCarrierId: carrier ? String(carrier.id) : null,
    ballCoord: analysisCoord(ball),
  };
}

function actionEconomy(state, team, actorId) {
  const tracker = state?.tracker || {};
  const activeTeam = tracker.turnPhase === "attack"
    ? tracker.startingTeam
    : tracker.startingTeam === "blue" ? "red" : "blue";
  const teamLimit = activeTeam === team
    ? (tracker.turnPhase === "attack" ? tracker.settings?.attackActions : tracker.settings?.defenseActions)
    : null;
  const actorActionsMaximum = team
    ? (team === tracker.startingTeam ? 3 : 2)
    : null;
  return {
    teamActionsUsed: team ? Math.max(0, Number(tracker.usedActions?.[team]) || 0) : null,
    teamActionsMaximum: team ? Math.max(0, Number(teamLimit) || 0) : null,
    actorId: actorId || null,
    actorActionsUsed: actorId ? Math.max(0, Number(tracker.personalActionsByPieceId?.[actorId]) || 0) : null,
    actorActionsMaximum,
  };
}

function semanticEvent(entry, sequence, cardsById) {
  const before = entry.before || {};
  const after = entry.after || {};
  const movements = changedPieces(before, after, cardsById);
  const trackerActions = addedTrackerActions(before, after);
  const actor = actorForEntry(entry, before, after, movements, cardsById);
  const team = entry.team || actor?.pieceId && teamForPiece(piecesById(after).get(actor.pieceId) || piecesById(before).get(actor.pieceId)) || null;
  const eventState = entry.type === "MATCH_STARTED" ? after : before;
  const passResolution = after?.actionResolution?.kind === "pass"
    ? after.actionResolution
    : before?.actionResolution?.kind === "pass"
      ? before.actionResolution
      : null;
  const passPlan = passResolution?.plan || null;
  const interceptionResolution = entry.metadata?.interceptionResolution
    || entry.metadata?.delayedResolution?.payload?.interceptionResolution
    || passResolution?.lastResolution
    || null;
  const continuation = after?.actionContinuation || before?.actionContinuation || null;
  return {
    eventId: String(entry.id),
    sequence,
    occurredAt: entry.createdAt,
    sourceTimelineEntryId: String(entry.id),
    actionId: String(entry.groupId || entry.id),
    parentActionId: null,
    actionLink: entry.groupId ? "TIMELINE_GROUP" : "NONE",
    actionTransaction: compactActionTransaction(entry.metadata?.actionTransaction),
    turnId: `turn_${Math.max(0, Number(eventState?.tracker?.currentTurn) || 0)}`,
    possessionId: null,
    eventSource: eventSource(entry),
    type: semanticType(entry, trackerActions, movements),
    label: entry.label,
    diceRoll: ["DICE_ROLLED", "EXTRA_ROLL"].includes(entry.type) ? {
      source: entry.metadata?.rollSource === "CHOSEN" ? "CHOSEN" : "RANDOM",
      chosenResult: entry.metadata?.rollSource === "CHOSEN" ? Number(entry.metadata?.chosenResult) || null : null,
      eventId: String(entry.metadata?.rollEvent?.id || "") || null,
      requestId: String(entry.metadata?.rollEvent?.requestId || "") || null,
      actionId: String(entry.metadata?.rollEvent?.actionId || "") || null,
      subjectId: String(entry.metadata?.rollEvent?.subjectId || "") || null,
      reactionIndex: Number.isFinite(Number(entry.metadata?.rollEvent?.reactionIndex)) ? Number(entry.metadata.rollEvent.reactionIndex) : null,
      ...(entry.type === "EXTRA_ROLL" ? { administrative: true } : {}),
    } : null,
    team,
    phase: String(eventState?.tracker?.turnPhase || "attack"),
    actor,
    opponent: null,
    trackerActions,
    movementReason: movementReason(entry, movements),
    movements,
    actionEconomyBefore: actionEconomy(before, team, actor?.pieceId),
    actionEconomyAfter: actionEconomy(after, team, actor?.pieceId),
    possessionBefore: possessionForState(before),
    possessionAfter: possessionForState(after),
    resolution: entry.metadata?.manualResolutionRequired ? {
      status: "MANUAL_DECLARATION",
      reason: `The ${String(entry.metadata?.actionType || "gameplay")} action was declared canonically; its board consequence was intentionally resolved manually during this test match.`,
    } : passPlan ? {
      status: String(passResolution.status || "UNKNOWN").toUpperCase(),
      rollMode: "MANUAL",
      pass: {
        pathMode: passPlan.pathMode,
        origin: passPlan.origin,
        requestedTarget: passPlan.requestedTarget,
        target: passPlan.target,
        distance: passPlan.distance,
        classification: passPlan.isLong ? "LONG_PASS" : "NORMAL_PASS",
        foot: passPlan.foot,
        passerPass: passPlan.passerPass,
        attackerTargetStatId: passPlan.attackerTargetStatId || "stat:passing",
        attackerTargetValue: passPlan.attackerTargetValue ?? passPlan.passerPass,
        directHit: passPlan.directHit,
        interceptorPriority: passPlan.interceptorPriority ? {
          method: passPlan.interceptorPriority.method || "passer-square-center-to-defender-square-center",
          metric: passPlan.interceptorPriority.metric || "euclidean-distance",
          tieBreak: passPlan.interceptorPriority.tieBreak || "defending-team-choice",
          selections: (passPlan.interceptorPriority.selections || []).map(selection => ({
            atIndex: Math.max(0, Number(selection.atIndex) || 0),
            selectedPieceId: selection.selectedPieceId || null,
            candidatePieceIds: Array.isArray(selection.candidatePieceIds) ? selection.candidatePieceIds : [],
            priorityDistanceSquared: Number.isFinite(Number(selection.priorityDistanceSquared)) ? Number(selection.priorityDistanceSquared) : null,
            reason: selection.reason || "defender-choice-equal-distance",
          })),
        } : null,
        interceptorOrder: (passPlan.interceptors || []).map(item => ({
          pieceId: item.defender?.id || null,
          firstEntryT: item.firstEntryT,
          priorityDistance: Number.isFinite(Number(item.priorityDistance)) ? Number(item.priorityDistance) : null,
          priorityDistanceSquared: Number.isFinite(Number(item.priorityDistanceSquared)) ? Number(item.priorityDistanceSquared) : null,
          priorityMethod: item.priorityMethod || passPlan.interceptorPriority?.method || null,
          priorityReason: (passPlan.interceptorPriority?.selections || []).some(selection => selection.selectedPieceId === item.defender?.id)
            ? "defender-choice-equal-distance"
            : "shorter-center-distance",
          orderModifier: item.orderModifier,
        })),
      },
      interceptionRoll: interceptionResolution ? {
        natural: interceptionResolution.natural,
        total: interceptionResolution.total,
        outcome: interceptionResolution.outcome,
        passerPass: interceptionResolution.passerPass,
        attackerTargetStatId: interceptionResolution.attackerTargetStatId || "stat:passing",
        attackerTargetValue: interceptionResolution.attackerTargetValue ?? interceptionResolution.passerPass,
        defenderRollStatId: interceptionResolution.defenderRollStatId || "stat:interception",
        defenderStatValue: interceptionResolution.interception,
        rawModifier: interceptionResolution.rawModifier,
        appliedModifier: interceptionResolution.modifier,
        modifierCap: interceptionResolution.modifierCap,
        capped: Boolean(interceptionResolution.capped),
        modifierSources: interceptionResolution.modifierSources || [],
        appliedModifierSources: interceptionResolution.appliedModifierSources || interceptionResolution.modifierSources || [],
      } : null,
    } : {
      status: "NOT_AUTOMATED",
      reason: "This sandbox action was recorded without an automated gameplay rule or probability calculation.",
    },
    continuation: continuation ? {
      kind: String(continuation.kind || ""),
      source: String(continuation.source || ""),
      origin: continuation.origin ? {
        actionType: String(continuation.origin.actionType || ""),
        outcome: String(continuation.origin.outcome || ""),
        reason: String(continuation.origin.reason || ""),
        sourceEntryId: String(continuation.origin.sourceEntryId || "") || null,
        parentContinuationId: String(continuation.origin.parentContinuationId || "") || null,
      } : null,
      team: continuation.team === "blue" ? "blue" : continuation.team === "red" ? "red" : null,
      status: String(continuation.status || ""),
      resumePolicy: compactResumePolicy(continuation.resumePolicy),
      actionType: continuation.actionType || null,
      pieceId: continuation.pieceId || null,
    } : null,
    bonusAction: entry.type === "BONUS_ACTION_ENDED" || entry.type === "BONUS_ACTION_DECLINED" ? {
      used: entry.type === "BONUS_ACTION_ENDED",
      declined: entry.type === "BONUS_ACTION_DECLINED",
      actionType: entry.metadata?.bonusAction?.actionType || null,
      pieceId: entry.metadata?.bonusAction?.pieceId || null,
      continuationId: String(entry.metadata?.continuationId || "") || null,
    } : null,
    explicitOutcome: entry.metadata?.manualResolutionRequired ? "MANUAL_RESOLUTION_REQUIRED" : entry.type === "PASS_INTERCEPTION_RESOLVED" ? "INTERCEPTION_ROLL_RESOLVED" : entry.type === "PASS_INTERCEPTION_MISSED" ? "INTERCEPTION_MISSED" : entry.type === "PASS_COMPLETED" ? "PASS_COMPLETED" : entry.type === "PASS_INTERCEPTED" ? "INTERCEPTED" : entry.type === "PASS_NATURAL_20" ? "NATURAL_20_INTERCEPTION" : entry.type === "BONUS_ACTION_ENDED" ? "BONUS_ACTION_ENDED" : entry.type === "BONUS_ACTION_DECLINED" ? "BONUS_ACTION_DECLINED" : "NOT_DECLARED",
  };
}

function linkSequentialMoveEvents(events) {
  const pendingMoveActionByPieceId = new Map();
  for (const event of events) {
    if (event.type === "MOVE" && event.trackerActions.some(action => action.type === "MOVE" && action.pieceId)) {
      const moveAction = event.trackerActions.find(action => action.type === "MOVE" && action.pieceId);
      pendingMoveActionByPieceId.set(moveAction.pieceId, {
        actionId: event.actionId,
        sourceTimelineEntryId: event.sourceTimelineEntryId,
      });
    }

    const movedPlayer = event.movements.find(movement => !movement.isBall);
    if (
      event.actionLink === "NONE" &&
      event.movementReason === "MANUAL_MOVE" &&
      event.type === "MOVE" &&
      movedPlayer?.pieceId &&
      pendingMoveActionByPieceId.has(movedPlayer.pieceId)
    ) {
      const action = pendingMoveActionByPieceId.get(movedPlayer.pieceId);
      event.actionId = action.actionId;
      event.actionLink = "TRACKER_MOVE_ACTIVATION";
      event.movementReason = "NORMAL_MOVE";
      event.parentActionId = null;
      pendingMoveActionByPieceId.delete(movedPlayer.pieceId);
    }

    if (["PHASE_ENDED", "TURN_CHANGED"].includes(event.type)) pendingMoveActionByPieceId.clear();
  }
  return events;
}

function openingAttackingTeam(timeline) {
  const matchStart = timeline.entries.find(entry => entry.type === "MATCH_STARTED");
  if (matchStart?.team === "blue" || matchStart?.team === "red") return matchStart.team;
  const sourceState = matchStart?.after || timeline.initialState;
  return sourceState?.tracker?.startingTeam === "blue" ? "blue" : "red";
}

function matchContext(state, appVersion, openingTeam) {
  const settings = state?.settings || {};
  const columns = Math.max(0, Number(settings.cols) || 0);
  return {
    appVersion: String(appVersion || ""),
    mode: "MANUAL_SANDBOX",
    openingAttackingTeam: openingTeam,
    teams: {
      blue: { pieceTeamId: "A", attacksToward: "right", opponentGoalColumn: columns },
      red: { pieceTeamId: "B", attacksToward: "left", opponentGoalColumn: 1 },
    },
    pitch: {
      columns,
      rows: Math.max(0, Number(settings.rows) || 0),
      goalDepth: Math.max(0, Number(settings.goalDepth) || 0),
      goalWidth: Math.max(0, Number(settings.goalWidth) || 0),
      penaltyBoxDepth: Math.max(0, Number(settings.boxDepth) || 0),
      penaltyBoxWidth: Math.max(0, Number(settings.boxWidth) || 0),
    },
  };
}

export function createAiAnalysisExport(recording, metadata = {}) {
  if (!recording?.timeline || !Array.isArray(recording.timeline.entries)) {
    throw new Error("Match recording timeline is missing or invalid");
  }
  const timeline = normalizeTimeline(recording.timeline, recording.finalState || {});
  const allCardsById = cardMap(recording.cardSnapshot);
  const activeCardIds = referencedCardIdsForActiveTimeline(timeline);
  const cardsById = new Map([...allCardsById.entries()].filter(([cardId]) => activeCardIds.has(cardId)));
  const initialState = timeline.initialState;
  const finalState = timelineStateAt(timeline, timeline.cursor);
  const activeEntries = timeline.entries.slice(0, timeline.cursor);
  const events = linkSequentialMoveEvents(activeEntries.map((entry, index) => semanticEvent(entry, index + 1, cardsById)));
  const context = matchContext(initialState, recording.appVersion || metadata.appVersion, openingAttackingTeam(timeline));
  return {
    exportType: AI_ANALYSIS_EXPORT_TYPE,
    schemaVersion: AI_ANALYSIS_EXPORT_SCHEMA_VERSION,
    exportedAt: metadata.exportedAt || new Date().toISOString(),
    sourceRecording: {
      recordingId: timeline.recordingId,
      name: String(recording.name || "Match"),
      appVersion: String(recording.appVersion || metadata.appVersion || ""),
      startedAt: timeline.startedAt,
      endedAt: timeline.endedAt,
    },
    matchContext: context,
    rulesetSnapshot: {
      mode: "MANUAL_UNAUTOMATED",
      version: "manual-sandbox-v1",
      note: "Gameplay formulas, outcomes, and probabilities are not automated in this export version. Unknown intent remains explicit instead of being inferred.",
      ruleSet: compactRuleSet(recording.ruleSetSnapshot || initialState.ruleSet),
      tracker: compactTracker(initialState.tracker).actionLimits,
      dieType: Math.max(2, Number(initialState?.dice?.dieType) || 20),
    },
    gameplayCardSnapshot: [...cardsById.values()].map(card => cloneGameState(card)),
    initialState: compactState(initialState, cardsById),
    semanticTimeline: events,
    finalState: compactState(finalState, cardsById),
    matchSummary: {
      timelineEntryCount: activeEntries.length,
      retainedTimelineEntryCount: timeline.entries.length,
      semanticEventCount: events.length,
      lastCursor: timeline.cursor,
      recordedTurns: Math.max(0, Number(finalState?.tracker?.currentTurn) || 0),
      automationCoverage: "MANUAL_UNAUTOMATED",
      declaredOutcomes: 0,
      calculatedProbabilities: 0,
    },
  };
}
