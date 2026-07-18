import React from "react";

// The board and Inspector intentionally share this exact glyph. The board
// wrapper remains responsible for position and the established v16.6 hitbox.
export function MatchBallIcon({ className = "" }) {
  return <span className={`match-ball-icon ${className}`.trim()} aria-hidden="true">⚽</span>;
}
