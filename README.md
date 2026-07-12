# Final Board v11.5 — Measured Special Ability Auto-Fit

Stable build based on v11.0.

## Changes

- Special Ability now keeps its normal configured font size until the rendered text actually overflows its layout box.
- On overflow, the shared card renderer measures the real available space and reduces the font only as much as necessary.
- The same measured fit applies to duplicated Special Ability zones.
- Glyph-safe line height and bottom reserve keep `g`, `j`, `p`, `q`, and `y` visible after shrinking.
- Editor, Inspector, and Export continue to use the same renderer.


- Keeps **Reset Position** and **Reset Cards** behavior from v11.0.
- Removes the complete multiplayer card library from `/sessions/{sessionId}`.
- Stores session card copies separately in `/sessions/{sessionId}/cards/{cardId}`.
- Loads session cards through a dedicated realtime listener.
- Live board saves no longer resend the full card library.
- Adds visible error handling for session creation.
- **Leave** only exits locally; the session code remains valid.
- **End Session** is available to the host and permanently deletes the session plus all session-card documents.
- Browser close or refresh does not end a session.
- Sessions expire after 24 hours without real session activity. Join attempts detect and clean expired sessions.
- Session activity refreshes `expiresAt`; presence heartbeats do not extend session lifetime.
- Personal cards remain unchanged in `/users/{uid}/footballBoardCards/{cardId}`.

## Required Firestore access

The existing session rules must also cover the cards subcollection. Example authenticated rule:

```text
match /sessions/{sessionId} {
  allow read, write: if request.auth != null;

  match /cards/{cardId} {
    allow read, write: if request.auth != null;
  }
}
```

Use rules appropriate to the deployed project if access is more restrictive.

## Expiration and cleanup

- Host **End Session** performs complete deletion immediately.
- A session untouched for 24 hours is treated as expired.
- When an expired code is used, the client deletes its card documents and parent session document.
- `expiresAt` is included so a server-side TTL or scheduled cleanup can be added later without changing the data model. Firestore TTL alone does not delete subcollections, so complete unattended cleanup would require a backend cleanup function.

## Backup format

Native Storage V2 backup remains unchanged.


## v11.1.1 hotfix
- Moved `timestampToMillis` to module scope so session expiry checks work during guest join.
- Fixes `ReferenceError: timestampToMillis is not defined`.


## v11.3 front-name and Special Ability fixes

- Replaced the Preferred Foot-only descender fix with one canonical glyph-safe rule shared by card text.
- Single-line name, position, section title, stat label/value, duplicate field and Preferred Foot text now preserve descenders such as g, j, p, q and y.
- Special Ability keeps multiline wrapping with a safe minimum line box.
- The same CardVisualCanvas renderer remains the source for Editor, Inspector and Export.
- No editor-only, inspector-only or export-only text correction was introduced.


## v11.3 changes

- Added a front-name-only vertical font cap so large names keep full descenders without changing back-card name rendering.
- Restored progressive Special Ability text fitting with five density levels based on content length.
- Applied the same Special Ability fitting to duplicated Special Ability blocks.
- Kept the shared card renderer, so Editor, Inspector and Export use identical rules.


## v11.5
- Special Ability now auto-fits from real measured overflow, while preserving safe descenders.
- End Session blocks pending session writes, marks the session as ending, disconnects guests, deletes session cards, and invalidates the code.
