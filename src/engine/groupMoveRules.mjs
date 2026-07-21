import { getMovementGeometry } from "../board/movementState.mjs";
import { teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, hasGroupMoveAuthorization } from "../tracker/actionRules.mjs";
import { normalizeMatchActionState, normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function groupRules(context) {
  const raw = context?.ruleSet?.actions?.groupMove || {};
  return {
    maxPlayers: Math.max(1, Math.min(11, Math.floor(Number(raw.maxPlayers) || 4))),
    zoneLength: Math.max(1, Math.floor(Number(raw.zoneLength) || 10)),
    maxDistance: Math.max(1, Math.floor(Number(raw.maxDistance) || 6)),
    sameDirectionOnly: raw.sameDirectionOnly !== false,
  };
}

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function inBoard(context, x, y) {
  const cols = Math.max(1, Number(context?.boardSettings?.cols) || 0);
  const rows = Math.max(1, Number(context?.boardSettings?.rows) || 0);
  return x >= 0 && x < cols && y >= 0 && y < rows;
}

function hasGameplayMovement(value) {
  return Boolean(
    Math.max(0, Number(value?.spent) || 0) > 0
    || Math.max(0, Number(value?.distance) || 0) > 0
    || value?.threeTwoUsed
    || value?.movementEnded
  );
}

function directionFor(piece, x, y) {
  const dx = Math.sign(x - Number(piece.x));
  const dy = Math.sign(y - Number(piece.y));
  const orientation = dy === 0 ? "horizontal"
    : dx === 0 ? "vertical"
      : dx === dy ? "diagonal-positive"
        : "diagonal-negative";
  return { orientation, dx, dy };
}

function directionMatches(current, next, sameDirectionOnly) {
  if (!current || current.orientation !== next.orientation) return false;
  if (sameDirectionOnly) return current.dx === next.dx && current.dy === next.dy;
  return (current.dx === next.dx && current.dy === next.dy)
    || (current.dx === -next.dx && current.dy === -next.dy);
}

function metadata(piece, extra = {}) {
  return { pieceId: piece?.id || null, movementReason: "GROUP_MOVE", ...extra };
}

export function confirmGroupMoveZone(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const rules = groupRules(context);
  const requestedStart = Number(command.payload?.zoneStartX);
  const cols = Math.max(1, Number(context?.boardSettings?.cols) || 0);
  const zoneLength = Math.min(rules.zoneLength, cols);
  if (!team) return { accepted: false, reason: "GROUP_MOVE_TEAM_INVALID" };
  if (!Number.isInteger(requestedStart) || requestedStart < 0 || requestedStart + zoneLength > cols) return { accepted: false, reason: "GROUP_MOVE_ZONE_INVALID" };
  if (tracker.matchActionState.groupMove?.active) return { accepted: false, reason: "GROUP_MOVE_ALREADY_ACTIVE" };
  const activation = activateTrackerAction(tracker, { type: "GROUP_MOVE", pieceId: `group:${team}`, team, entryId: command.id });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "GROUP_MOVE_NOT_ALLOWED" };
  const matchActionState = normalizeMatchActionState({
    ...activation.matchActionState,
    groupMove: {
      active: true,
      team,
      timelineGroupId: command.id,
      zoneStartX: requestedStart,
      zoneLength,
      maxPlayers: rules.maxPlayers,
      maxDistance: rules.maxDistance,
      sameDirectionOnly: rules.sameDirectionOnly,
      movedPieceIds: [],
      direction: null,
    },
  });
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, matchActionState } },
    event: { type: "GROUP_MOVE_ACTIVATED", team, metadata: { movementReason: "GROUP_MOVE", zoneStartX: requestedStart, zoneLength, maxPlayers: rules.maxPlayers, maxDistance: rules.maxDistance, sameDirectionOnly: rules.sameDirectionOnly } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
  };
}

export function commitGroupMovePlayer(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const group = tracker.matchActionState.groupMove || {};
  const piece = pieceForCommand(state, command);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!group.active || !hasGroupMoveAuthorization(tracker, group.team)) return { accepted: false, reason: "GROUP_MOVE_NOT_ACTIVE" };
  if (!piece || piece.team === "BALL" || piece.inactive || teamKeyForPiece(piece) !== group.team) return { accepted: false, reason: "GROUP_MOVE_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBoard(context, x, y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  if (Number(piece.x) < group.zoneStartX || Number(piece.x) >= group.zoneStartX + group.zoneLength) return { accepted: false, reason: "GROUP_MOVE_OUTSIDE_ZONE" };
  if (group.movedPieceIds.includes(piece.id)) return { accepted: false, reason: "GROUP_MOVE_PIECE_ALREADY_MOVED" };
  if (group.movedPieceIds.length >= group.maxPlayers) return { accepted: false, reason: "GROUP_MOVE_LIMIT_REACHED" };
  if (hasGameplayMovement(state.movementStateByPieceId[piece.id])) return { accepted: false, reason: "GROUP_MOVE_PIECE_ALREADY_MOVED" };
  const ball = state.pieces.find(item => item?.team === "BALL");
  if (ball && Number(ball.x) === Number(piece.x) && Number(ball.y) === Number(piece.y)) return { accepted: false, reason: "GROUP_MOVE_PIECE_HAS_BALL" };
  if (ball && Number(ball.x) === x && Number(ball.y) === y) return { accepted: false, reason: "GROUP_MOVE_BALL_DESTINATION" };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) return { accepted: false, reason: "occupied" };
  const geometry = getMovementGeometry(piece, { x, y });
  if (geometry.kind === "same") return { accepted: false, reason: "same" };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed" };
  if (geometry.distance > group.maxDistance) return { accepted: false, reason: "GROUP_MOVE_DISTANCE" };
  const direction = directionFor(piece, x, y);
  if (group.direction && !directionMatches(group.direction, direction, group.sameDirectionOnly)) return { accepted: false, reason: "GROUP_MOVE_DIRECTION" };
  const pieces = state.pieces.map(item => item.id === piece.id ? { ...item, x, y } : item);
  const matchActionState = normalizeMatchActionState({
    ...tracker.matchActionState,
    groupMove: { ...group, movedPieceIds: [...group.movedPieceIds, piece.id], direction: group.direction || direction },
  });
  return {
    accepted: true,
    nextState: { ...state, pieces, tracker: { ...state.tracker, matchActionState } },
    event: { type: "GROUP_MOVE_PIECE", team: group.team, metadata: metadata(piece, { from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y }, direction: group.direction || direction }) },
    timeline: { groupId: group.timelineGroupId || null, undoMode: "step", allowNoop: false },
  };
}
