import { createGameState } from "../game/gameState.mjs";
import { atomicTransactionForTransition } from "../match/actionTransaction.mjs";
import { commitTimelineEntry, createTimeline, normalizeTimeline, timelineStateAt } from "../timeline/timelineEngine.mjs";
import { applyGameCommand } from "./gameEngine.mjs";

export function dispatchSinglePlayerGameCommand({ timeline = null, state, context, command, label = "Game action" } = {}) {
  const fallbackState = createGameState(state);
  const currentTimeline = timeline
    ? normalizeTimeline(timeline, fallbackState)
    : createTimeline(fallbackState);
  const before = timelineStateAt(currentTimeline, currentTimeline.cursor);
  const result = applyGameCommand({ state: before, context, command });
  if (!result.accepted) return { result, timeline: currentTimeline, state: before, entry: null };

  const event = result.events?.[0];
  if (!event) throw new Error("Accepted game command did not produce a semantic event.");
  const actionTransaction = atomicTransactionForTransition(result.timeline?.groupId, before, result.nextState);
  const nextTimeline = commitTimelineEntry(currentTimeline, {
    id: event.commandId,
    type: event.type,
    label: String(label || event.type),
    team: event.team,
    groupId: result.timeline?.groupId || null,
    metadata: {
      ...(event.metadata || {}),
      ...(actionTransaction ? { actionTransaction } : {}),
    },
    before,
    after: result.nextState,
  }, { allowNoop: Boolean(result.timeline?.allowNoop) });
  const entry = nextTimeline.entries[nextTimeline.cursor - 1] || null;
  return {
    result,
    timeline: nextTimeline,
    state: timelineStateAt(nextTimeline, nextTimeline.cursor),
    entry,
  };
}

/**
 * Match start is intentionally recorded against an already-playable Timeline
 * baseline. Cursor zero therefore remains the first legal board state while
 * History still contains the semantic MATCH_STARTED audit entry.
 */
export function dispatchSinglePlayerMatchStart({ state, context, command, label = "Match started" } = {}) {
  const before = createGameState(state);
  const result = applyGameCommand({ state: before, context, command });
  if (!result.accepted) return { result, timeline: null, state: before, entry: null };
  const event = result.events?.[0];
  if (!event) throw new Error("Accepted match start did not produce a semantic event.");
  const baseline = createTimeline(result.nextState);
  const timeline = commitTimelineEntry(baseline, {
    id: event.commandId,
    type: event.type,
    label: String(label || event.type),
    team: event.team,
    groupId: null,
    metadata: event.metadata || {},
    before: result.nextState,
    after: result.nextState,
  }, { allowNoop: true });
  return {
    result,
    timeline,
    state: timelineStateAt(timeline, timeline.cursor),
    entry: timeline.entries[timeline.cursor - 1] || null,
  };
}

/**
 * Evaluates a small dependent command sequence before its caller publishes the
 * resulting Timeline. This is used when one UI confirmation represents more
 * than one gameplay transition, such as starting MOVE and making its first
 * physical segment from a direct board click.
 */
export function dispatchSinglePlayerGameCommandSequence({ timeline = null, state, context, commands = [] } = {}) {
  const fallbackState = createGameState(state);
  const initialTimeline = timeline
    ? normalizeTimeline(timeline, fallbackState)
    : createTimeline(fallbackState);
  const initialState = timelineStateAt(initialTimeline, initialTimeline.cursor);
  const steps = Array.isArray(commands) ? commands : [];
  if (!steps.length) {
    return { accepted: false, result: { accepted: false, reason: "COMMAND_SEQUENCE_EMPTY" }, timeline: initialTimeline, state: initialState, entry: null, results: [] };
  }

  let currentTimeline = initialTimeline;
  let currentState = initialState;
  const results = [];
  for (const step of steps) {
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: currentTimeline,
      state: currentState,
      context,
      command: step?.command,
      label: step?.label,
    });
    results.push(dispatched);
    if (!dispatched.result.accepted) {
      return { accepted: false, result: dispatched.result, timeline: initialTimeline, state: initialState, entry: null, results };
    }
    currentTimeline = dispatched.timeline;
    currentState = dispatched.state;
  }

  const last = results[results.length - 1];
  return { accepted: true, result: last.result, timeline: currentTimeline, state: currentState, entry: last.entry, results };
}
