import { GAMEPLAY_ACTION_TYPE, GAMEPLAY_COMMAND_TYPE, movementCommandMode, validateGameplayCommandEnvelope } from "./gameplayCommand.mjs";

const MOVEMENT_ACTIONS = new Set([
  GAMEPLAY_ACTION_TYPE.MOVE,
  GAMEPLAY_ACTION_TYPE.GROUP_MOVE,
  GAMEPLAY_ACTION_TYPE.BONUS_MOVE,
  GAMEPLAY_ACTION_TYPE.THREE_TWO,
  GAMEPLAY_ACTION_TYPE.FREE_MOVE,
]);

export function routeGameplayCommand(command, context = {}) {
  const envelope = validateGameplayCommandEnvelope(command, context);
  if (!envelope.valid) return { accepted: false, reason: envelope.reason, domain: null };
  if (command.commandType === GAMEPLAY_COMMAND_TYPE.ACTION_STEP && MOVEMENT_ACTIONS.has(command.actionType)) {
    return { accepted: true, reason: null, domain: "movement", mode: movementCommandMode(command) };
  }
  return { accepted: false, reason: "unsupported-command", domain: null };
}
