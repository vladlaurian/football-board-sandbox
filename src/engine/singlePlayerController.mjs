import { createGameState } from "../game/gameState.mjs";
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
  const nextTimeline = commitTimelineEntry(currentTimeline, {
    id: event.commandId,
    type: event.type,
    label: String(label || event.type),
    team: event.team,
    groupId: result.timeline?.groupId || null,
    metadata: event.metadata,
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
