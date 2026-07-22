import React from "react";

// The board and Inspector share one fixed 1:1 vector ball. A Unicode football
// glyph has font-specific bounds and cannot guarantee visual centering.
export function MatchBallIcon({ className = "" }) {
  return <svg className={`match-ball-icon ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="29.5" fill="#edf4f6" stroke="#aebfc7" strokeWidth="2.4" />
    <circle cx="23" cy="20" r="12" fill="#fff" opacity=".90" />
    <circle cx="35" cy="39" r="21" fill="#bdcdd4" opacity=".34" />
  </svg>;
}
