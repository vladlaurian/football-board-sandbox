import React from "react";
import { formationStarterCoordinates } from "../board/formationLayout.mjs";

// Read-only. Never touches live pieces — computes slot coordinates purely
// from the formation template, exactly like the real Engine application
// will, so what the coach sees here is what will actually land on the board.
// Slots authored right at the goal line or sharing a row with a neighbour
// (e.g. ST next to CAM) would otherwise clip against the box edge or overlap
// illegibly at this small scale. Both are purely a rendering concern of this
// mini preview — the real board keeps the formation's exact coordinates.
const EDGE_INSET_PERCENT = 8;
const insetPercent = (value, size) => EDGE_INSET_PERCENT + (value / Math.max(1, size - 1)) * (100 - 2 * EDGE_INSET_PERCENT);
const COLLISION_THRESHOLD_PERCENT = 9;

export function FormationPreview({ team, formation, boardSettings }) {
  if (!formation) return null;
  const cols = Number(boardSettings?.cols) || 44;
  const rows = Number(boardSettings?.rows) || 29;
  const coords = formationStarterCoordinates(team, formation, boardSettings || { cols, rows });
  const positioned = coords.map((coord, index) => ({
    coord, index,
    left: insetPercent(coord.x, cols),
    top: insetPercent(coord.y, rows),
  }));
  // Nudge any slot that lands within a hair of an already-placed one — a
  // deterministic, order-stable spread (monotonically growing so it can
  // never oscillate back onto the same collision) rather than random jitter.
  const placed = [];
  positioned.forEach(slot => {
    const { left, top: originalTop } = slot;
    let top = originalTop;
    let attempt = 1;
    while (placed.some(other => Math.hypot(other.left - left, other.top - top) < COLLISION_THRESHOLD_PERCENT) && attempt <= 6) {
      const direction = attempt % 2 === 1 ? 1 : -1;
      top = originalTop + direction * attempt * COLLISION_THRESHOLD_PERCENT * 0.6;
      attempt += 1;
    }
    slot.left = left;
    slot.top = Math.min(100 - EDGE_INSET_PERCENT / 2, Math.max(EDGE_INSET_PERCENT / 2, top));
    placed.push(slot);
  });
  return (
    <div className="formation-preview" aria-label={`${formation.name} preview`}>
      <div className="formation-preview-pitch">
        <div className="formation-preview-halfway" style={{ left: "50%" }} />
        {positioned.map(slot => (
          <div
            key={slot.coord.id}
            className={`formation-preview-slot ${team === "A" ? "team-a" : "team-b"}`}
            style={{ left: `${slot.left}%`, top: `${slot.top}%` }}
          >
            {formation.starterRoleRecipe?.[slot.index] || "?"}
          </div>
        ))}
      </div>
    </div>
  );
}
