const MOVEMENT_AXES = new Set([
  "horizontal",
  "vertical",
  "diagonal-nw-se",
  "diagonal-ne-sw",
]);

export function diagonalCostForDistance(distance) {
  const safeDistance = Math.max(0, Math.floor(Number(distance) || 0));
  return safeDistance + Math.floor(safeDistance / 2);
}

export function inferMovementDistance(axis, spent) {
  const safeSpent = Math.max(0, Math.floor(Number(spent) || 0));
  if (!axis?.startsWith("diagonal")) return safeSpent;
  let distance = 0;
  while (diagonalCostForDistance(distance + 1) <= safeSpent) distance += 1;
  return distance;
}

export function normalizeMovementState(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const axis = MOVEMENT_AXES.has(value?.axis) ? value.axis : null;
    const spent = Math.max(0, Number(value?.spent) || 0);
    const suppliedDistance = Number(value?.distance);
    const distance = Number.isFinite(suppliedDistance) && suppliedDistance >= 0
      ? Math.floor(suppliedDistance)
      : inferMovementDistance(axis, spent);
    const threeTwoUsed = Boolean(value?.threeTwoUsed);
    const movementEnded = Boolean(value?.movementEnded);
    if (axis || spent || distance || threeTwoUsed || movementEnded) {
      out[id] = { axis, spent, distance, threeTwoUsed, movementEnded };
    }
  }
  return out;
}

export function getMovementGeometry(from, to) {
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (!dx && !dy) return { kind: "same", axis: null, distance: 0, cost: 0 };
  if (!dy) return { kind: "straight", axis: "horizontal", distance: ax, cost: ax };
  if (!dx) return { kind: "straight", axis: "vertical", distance: ay, cost: ay };
  if (ax === ay) {
    const axis = Math.sign(dx) === Math.sign(dy) ? "diagonal-nw-se" : "diagonal-ne-sw";
    return { kind: "diagonal", axis, distance: ax, cost: diagonalCostForDistance(ax) };
  }
  return { kind: "mixed", axis: null, distance: null, cost: null };
}
