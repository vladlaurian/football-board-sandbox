export const ACTION_FLOW_STAGE = Object.freeze({
  SELECT_TARGET: "targeting",
  SELECT_OPTION: "route-selection",
  AWAIT_DECISION: "awaiting-interceptor-choice",
  AWAIT_ROLL: "awaiting-interception-roll",
  COMPLETING: "completing",
});

function safeId(value) {
  return String(value || "").trim();
}

export function createActionEventId(prefix = "event", now = Date.now(), entropy = Math.random()) {
  return `${prefix}_${now}_${Math.floor(Number(entropy) * 0xFFFFFF).toString(36).padStart(5, "0")}`;
}

export function createPendingDecision({ id, type, team = null, options = [], context = {} } = {}) {
  const decisionId = safeId(id);
  const decisionType = safeId(type);
  if (!decisionId || !decisionType) return null;
  return {
    id: decisionId,
    type: decisionType,
    team: team === "blue" || team === "red" ? team : null,
    options: Array.isArray(options) ? options.map(option => ({ ...option })) : [],
    context: context && typeof context === "object" ? { ...context } : {},
  };
}

export function createPendingRoll({ requestId, actionId, team, dieType = 20, subjectId = null, reactionIndex = null, context = {} } = {}) {
  const safeRequestId = safeId(requestId);
  const safeActionId = safeId(actionId);
  if (!safeRequestId || !safeActionId || !["blue", "red"].includes(team)) return null;
  return {
    requestId: safeRequestId,
    actionId: safeActionId,
    team,
    dieType: Math.max(2, Number(dieType) || 20),
    subjectId: safeId(subjectId) || null,
    reactionIndex: Number.isFinite(Number(reactionIndex)) ? Number(reactionIndex) : null,
    context: context && typeof context === "object" ? { ...context } : {},
  };
}

export function createRollEvent({ id, requestId, actionId, team, dieType = 20, natural, source = "RANDOM", createdAt = Date.now(), subjectId = null, reactionIndex = null } = {}) {
  const eventId = safeId(id);
  const safeRequestId = safeId(requestId);
  const safeActionId = safeId(actionId);
  const safeNatural = Number(natural);
  if (!eventId || !safeRequestId || !safeActionId || !["blue", "red"].includes(team)) return null;
  if (!Number.isInteger(safeNatural) || safeNatural < 1 || safeNatural > Number(dieType || 20)) return null;
  return {
    id: eventId,
    requestId: safeRequestId,
    actionId: safeActionId,
    team,
    dieType: Number(dieType) || 20,
    natural: safeNatural,
    source: source === "CHOSEN" ? "CHOSEN" : "RANDOM",
    createdAt: Number(createdAt) || Date.now(),
    subjectId: safeId(subjectId) || null,
    reactionIndex: Number.isFinite(Number(reactionIndex)) ? Number(reactionIndex) : null,
  };
}

export function rollEventMatchesPendingRoll(event, pendingRoll) {
  return Boolean(
    event && pendingRoll
    && safeId(event.requestId) === safeId(pendingRoll.requestId)
    && safeId(event.actionId) === safeId(pendingRoll.actionId)
    && event.team === pendingRoll.team
    && (!pendingRoll.subjectId || safeId(event.subjectId) === safeId(pendingRoll.subjectId))
    && (pendingRoll.reactionIndex === null || Number(event.reactionIndex) === Number(pendingRoll.reactionIndex))
  );
}

export function hasConsumedActionEvent(flow, eventId) {
  const id = safeId(eventId);
  return Boolean(id && Array.isArray(flow?.consumedEventIds) && flow.consumedEventIds.includes(id));
}

export function consumeActionEvent(flow, event) {
  if (!flow || !event || hasConsumedActionEvent(flow, event.id)) return null;
  if (!rollEventMatchesPendingRoll(event, flow.pendingRoll)) return null;
  return {
    ...flow,
    pendingRoll: null,
    lastRollEvent: { ...event },
    consumedEventIds: [...(Array.isArray(flow.consumedEventIds) ? flow.consumedEventIds : []), event.id],
  };
}

export function withPendingDecision(flow, decision) {
  return { ...flow, status: ACTION_FLOW_STAGE.AWAIT_DECISION, pendingDecision: decision, pendingRoll: null };
}

export function withPendingRoll(flow, pendingRoll) {
  return { ...flow, status: ACTION_FLOW_STAGE.AWAIT_ROLL, pendingDecision: null, pendingRoll };
}

export function clearPendingInput(flow, status = flow?.status) {
  return { ...flow, status, pendingDecision: null, pendingRoll: null };
}
