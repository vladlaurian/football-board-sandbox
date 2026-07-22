import {
  dispatchSinglePlayerGameCommand,
  dispatchSinglePlayerGameCommandSequence,
  dispatchSinglePlayerMatchStart,
} from "./singlePlayerController.mjs";

/**
 * The only UI-facing gateway for an Engine-owned Single Player Match command.
 *
 * The controller remains pure: it evaluates a command and produces the next
 * Timeline cursor state. This gateway owns the boundary between that result
 * and a UI projection. A rejected command never reaches `publish`.
 */
export function runSinglePlayerMatchCommand({
  kind = "command",
  request = {},
  publish,
} = {}) {
  const dispatched = kind === "match-start"
    ? dispatchSinglePlayerMatchStart(request)
    : kind === "sequence"
      ? dispatchSinglePlayerGameCommandSequence(request)
      : dispatchSinglePlayerGameCommand(request);
  const accepted = kind === "sequence"
    ? Boolean(dispatched?.accepted)
    : Boolean(dispatched?.result?.accepted);

  if (accepted && typeof publish === "function") {
    publish({ timeline: dispatched.timeline, state: dispatched.state });
  }
  return dispatched;
}
