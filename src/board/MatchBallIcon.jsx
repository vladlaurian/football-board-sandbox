import React from "react";

// The board and Inspector share one fixed 1:1 vector ball. A Unicode football
// glyph has font-specific bounds and cannot guarantee visual centering.
export function MatchBallIcon({ className = "" }) {
  return <svg className={`match-ball-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10.65" fill="#e5eef2" stroke="#17303e" strokeWidth="1.15" />
    <circle cx="9" cy="8" r="3.1" fill="#fff" opacity=".62" />
    <path d="M12 6.65 15.25 9l-1.24 3.78h-4.02L8.75 9 12 6.65Z" fill="#172b38" />
    <path d="m8.75 9-3.42 1.12-1.1 3.6 2.48 2.46 3.28-3.41M15.25 9l3.42 1.12 1.1 3.6-2.48 2.46-3.28-3.41M9.99 12.78l-3.28 3.41 1.48 3.55 3.81.85M14.01 12.78l3.28 3.41-1.48 3.55-3.81.85" fill="none" stroke="#172b38" strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}
