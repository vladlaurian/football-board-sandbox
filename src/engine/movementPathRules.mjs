import { getMovementGeometry } from "../board/movementState.mjs";

export function movementPathSquares(from, to, { includeDestination = true } = {}) {
  const geometry = getMovementGeometry(from, to);
  if (geometry.kind === "same" || geometry.kind === "mixed") return [];
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const end = includeDestination ? steps : Math.max(0, steps - 1);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  return Array.from({ length: end }, (_, index) => ({
    x: Number(from.x) + stepX * (index + 1),
    y: Number(from.y) + stepY * (index + 1),
  }));
}

export function firstPlayerBlockingMovementPath({ pieces = [], movingPieceId, from, to, includeDestination = false } = {}) {
  const path = movementPathSquares(from, to, { includeDestination });
  for (const square of path) {
    // docs/GAMEPLAY_RULES_FOUNDATIONS.md section 3: an inactive player "has
    // no body that blocks a route or movement path" — its occupied cell only
    // stays unavailable as a finishing cell, which is a separate, callers-own
    // occupancy check, not this route-blocking one.
    const piece = pieces.find(item => item?.id !== movingPieceId
      && item?.team !== "BALL"
      && !item?.inactive
      && Number(item?.x) === square.x
      && Number(item?.y) === square.y);
    if (piece) return { piece, square };
  }
  return null;
}
