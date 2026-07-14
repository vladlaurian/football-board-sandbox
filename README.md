# Final Board v11.9 — Compact Sequential Match Tracker

Stable source build of the Football Board Sandbox.

## v11.9 changes

- The floating Tracker can now be stretched horizontally up to the available viewport width.
- The Tracker minimum height is reduced so it can be used as a thin control bar above the pitch.
- Blue and Red action sections are more compact, with smaller action circles and reduced vertical spacing.
- Turn buttons are smaller and stay on one horizontal row; a horizontal scroll remains available when the window is narrow.
- Completed turns remain visibly highlighted.
- The current turn has a separate, stronger highlight.
- Turn progression is sequential: from Turn 3, Turn 4 is available but Turn 5 and later are disabled.
- Previous turns remain selectable for corrections.
- Selecting a different permitted turn still resets both action trackers and updates Attack / Defense roles.

## v11.8 tracker foundation

- **Tracker** button immediately after **D.A.** in the main control bar.
- **Tracker Settings** immediately after **Coordonate** in the upper settings bar.
- Configurable Attack actions, Defense actions, and number of turns.
- Floating Tracker window supports move, resize, minimize, close, and local position/size persistence.
- **Start Game** asks whether Blue or Red attacks first and selects Turn 1 automatically.
- Manual team-colored action circles, automatic Attack / Defense alternation, automatic reset on turn change, and separate **Reset Trackers**.
- Tracker remains local-only and is not synchronized in multiplayer.

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
