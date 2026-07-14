# Final Board v11.8 — Manual Match Tracker

Stable source build of the Football Board Sandbox.

## v11.8 changes

- Adds a **Tracker** button immediately after **D.A.** in the main control bar.
- Adds **Tracker Settings** immediately after **Coordonate** in the upper settings bar.
- Tracker Settings supports configurable:
  - Attack actions (default 5)
  - Defense actions (default 4)
  - Number of turns (default 20)
- Adds a floating Tracker window that can be moved, resized, minimized, and closed.
- Tracker window position, size, and settings are remembered locally.
- **Start Game** asks whether Blue or Red attacks first and automatically selects Turn 1.
- Each team has its own color-coded manual action circles.
- The attacking team receives the Attack action count; the defending team receives the Defense action count.
- Selecting a new turn automatically resets both teams' action circles and alternates Attack / Defense roles.
- **Reset Trackers** clears both action rows without changing the current turn.
- The turn tracker is green and supports the configured number of turns.
- Tracker is local-only in this version and is not synchronized in multiplayer.

## Preserved behavior

- Inspector remembers the last viewed Front / Back face.
- Back-face permissions remain enforced in private multiplayer sessions.
- `Allow Flip` disappears after approval and is replaced by disabled `Flip Allowed`.
- Special Ability measured auto-fit and glyph-safe rendering remain unchanged.
- Multiplayer session cards remain stored in `/sessions/{sessionId}/cards/{cardId}`.
- Host End Session protection, session expiry, Storage V2 backups, card editor, exports, and board tools remain unchanged.

## Run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
