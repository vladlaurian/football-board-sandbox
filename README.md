# Final Board v11.1 — Separate Multiplayer Session Cards

Stable build based on v11.0.

## Changes

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
