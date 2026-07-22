import React from "react";

// The board and Inspector share one fixed 1:1 vector ball. A Unicode football
// glyph has font-specific bounds and cannot guarantee visual centering.
export function MatchBallIcon({ className = "" }) {
  return <svg className={`match-ball-icon ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="29.5" fill="#edf3f5" stroke="#182c38" strokeWidth="2.4" />
    <circle cx="22" cy="18" r="9" fill="#fff" opacity=".72" />
    <path d="M32 21 42 28.2 38.1 40H25.9L22 28.2 32 21Z" fill="#152a37" />
    <path d="m32 4.6 8.2 4.8-1.5 8.3-6.7 3.4-6.7-3.4-1.5-8.3L32 4.6Z" fill="#152a37" />
    <path d="m7 19.7 7.9-4.4 7.1 5.4-1.4 8.3-8.1 2.2-5.4-5.9L7 19.7Z" fill="#152a37" />
    <path d="m57 19.7-7.9-4.4-7.1 5.4 1.4 8.3 8.1 2.2 5.4-5.9v-5.6Z" fill="#152a37" />
    <path d="m14.2 47.5 6.8-5.5 8.3 2.2 1.1 8.2-7.2 5.4-7.7-3.4-1.3-6.9Z" fill="#152a37" />
    <path d="m49.8 47.5-6.8-5.5-8.3 2.2-1.1 8.2 7.2 5.4 7.7-3.4 1.3-6.9Z" fill="#152a37" />
  </svg>;
}
