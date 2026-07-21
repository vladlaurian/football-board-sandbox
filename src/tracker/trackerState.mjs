import { clamp } from "../game/numberUtils.mjs";

const TRACKER_ACTION_TYPES = new Set(["MOVE", "GROUP_MOVE", "PASS", "SHOT", "CROSS", "DRIBBLE", "TACKLING"]);

export const TRACKER_ACTION_ABBR = {
  MOVE: "MV",
  GROUP_MOVE: "GM",
  PASS: "PS",
  SHOT: "SH",
  CROSS: "CR",
  DRIBBLE: "DR",
  TACKLING: "TK",
};

export function normalizeTrackerActionLog(raw) {
  const out = { red: [], blue: [] };
  for (const team of ["red", "blue"]) {
    const list = Array.isArray(raw?.[team]) ? raw[team] : [];
    out[team] = list.map((item, index) => ({
      id: String(item?.id || `${team}-${index}`),
      type: TRACKER_ACTION_TYPES.has(item?.type) ? item.type : "PASS",
      pieceId: item?.pieceId ? String(item.pieceId) : "",
    }));
  }
  return out;
}

export function normalizeMatchActionState(raw) {
  const byPieceId = {};
  const legacyFreeEntry = raw?.byPieceId && typeof raw.byPieceId === "object"
    ? Object.entries(raw.byPieceId).find(([, value]) => Boolean(value?.freeMoveAuthorized))
    : null;
  if (raw?.byPieceId && typeof raw.byPieceId === "object") {
    for (const [id, value] of Object.entries(raw.byPieceId)) {
      if (!value || typeof value !== "object") continue;
      const next = {
        moveUsed: Boolean(value.moveUsed),
        moveAuthorized: Boolean(value.moveAuthorized),
        moveGroupId: value.moveGroupId ? String(value.moveGroupId) : null,
      };
      if (next.moveUsed || next.moveAuthorized || next.moveGroupId) byPieceId[id] = next;
    }
  }
  const hasExplicitFreeMode = Boolean(raw?.freeMode && typeof raw.freeMode === "object");
  return {
    byPieceId,
    groupMove: {
      active: Boolean(raw?.groupMove?.active),
      team: raw?.groupMove?.team === "blue" || raw?.groupMove?.team === "red" ? raw.groupMove.team : null,
      timelineGroupId: raw?.groupMove?.timelineGroupId ? String(raw.groupMove.timelineGroupId) : null,
      zoneStartX: Number.isInteger(Number(raw?.groupMove?.zoneStartX)) ? Number(raw.groupMove.zoneStartX) : null,
      zoneLength: Math.max(0, Math.floor(Number(raw?.groupMove?.zoneLength) || 0)),
      maxPlayers: Math.max(0, Math.floor(Number(raw?.groupMove?.maxPlayers) || 0)),
      maxDistance: Math.max(0, Math.floor(Number(raw?.groupMove?.maxDistance) || 0)),
      sameDirectionOnly: raw?.groupMove?.sameDirectionOnly !== false,
      movedPieceIds: Array.isArray(raw?.groupMove?.movedPieceIds) ? [...new Set(raw.groupMove.movedPieceIds.map(String).filter(Boolean))] : [],
      direction: raw?.groupMove?.direction && typeof raw.groupMove.direction === "object" ? {
        orientation: ["horizontal", "vertical", "diagonal-positive", "diagonal-negative"].includes(raw.groupMove.direction.orientation) ? raw.groupMove.direction.orientation : null,
        dx: [-1, 0, 1].includes(Number(raw.groupMove.direction.dx)) ? Number(raw.groupMove.direction.dx) : 0,
        dy: [-1, 0, 1].includes(Number(raw.groupMove.direction.dy)) ? Number(raw.groupMove.direction.dy) : 0,
      } : null,
    },
    freeMode: {
      active: hasExplicitFreeMode ? Boolean(raw.freeMode.active) : Boolean(legacyFreeEntry),
      pieceId: hasExplicitFreeMode ? (raw.freeMode.pieceId ? String(raw.freeMode.pieceId) : null) : (legacyFreeEntry?.[0] || null),
      team: hasExplicitFreeMode && (raw.freeMode.team === "blue" || raw.freeMode.team === "red") ? raw.freeMode.team : null,
      timelineGroupId: hasExplicitFreeMode && raw.freeMode.timelineGroupId ? String(raw.freeMode.timelineGroupId) : null,
    },
    activeMovement: {
      active: Boolean(raw?.activeMovement?.active),
      kind: raw?.activeMovement?.kind === "normal-move" ? "normal-move" : null,
      pieceId: raw?.activeMovement?.pieceId ? String(raw.activeMovement.pieceId) : null,
      team: raw?.activeMovement?.team === "blue" || raw?.activeMovement?.team === "red" ? raw.activeMovement.team : null,
      timelineGroupId: raw?.activeMovement?.timelineGroupId ? String(raw.activeMovement.timelineGroupId) : null,
    },
  };
}

export function clearGroupMoveState(rawActionState) {
  const current = normalizeMatchActionState(rawActionState);
  if (!current.groupMove.active) return current;
  return normalizeMatchActionState({
    ...current,
    groupMove: {
      active: false,
      team: null,
      timelineGroupId: null,
      zoneStartX: null,
      zoneLength: 0,
      maxPlayers: 0,
      maxDistance: 0,
      movedPieceIds: [],
      direction: null,
    },
  });
}

export function normalizeTrackerSnapshot(raw = {}) {
  const rawSettings = raw.settings || {};
  const settings = {
    attackActions: clamp(Number(rawSettings.attackActions) || 5, 1, 30),
    defenseActions: clamp(Number(rawSettings.defenseActions) || 4, 1, 30),
    turns: clamp(Number(rawSettings.turns) || 20, 1, 100),
  };
  const startingTeam = raw.startingTeam === "blue" ? "blue" : "red";
  const redLimit = startingTeam === "red" ? settings.attackActions : settings.defenseActions;
  const blueLimit = startingTeam === "blue" ? settings.attackActions : settings.defenseActions;
  return {
    enabled: Boolean(raw.enabled),
    gameStarted: Boolean(raw.gameStarted),
    startingTeam,
    currentTurn: clamp(Number(raw.currentTurn) || 0, 0, settings.turns),
    actionLog: normalizeTrackerActionLog(raw.actionLog),
    matchActionState: normalizeMatchActionState(raw.matchActionState),
    turnPhase: ["attack", "defense", "complete"].includes(raw.turnPhase) ? raw.turnPhase : "attack",
    usedActions: {
      red: clamp(Number(raw.usedActions?.red ?? raw.actionLog?.red?.length) || 0, 0, redLimit),
      blue: clamp(Number(raw.usedActions?.blue ?? raw.actionLog?.blue?.length) || 0, 0, blueLimit),
    },
    settings,
  };
}
