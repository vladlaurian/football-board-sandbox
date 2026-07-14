# Final Board v12.1 — Responsive Compact Multiplayer Tracker

Stable source build of the Football Board Sandbox.

## v12.0 changes

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


## v12.0 — Multiplayer host-controlled tracker

- The host is the only participant who can activate, configure, start, reset, or modify the match tracker in an online session.
- Activating the tracker on the host automatically opens it for connected guests.
- Guests receive the tracker state live and see all action marks, turns, roles, and settings in read-only mode.
- Each participant keeps an independent local tracker position, size, and minimized/hidden state.
- Guests can move, resize, minimize, hide, and reopen the tracker locally without changing it for anyone else.
- The host closing the tracker disables it for the entire session.
- Tracker controls and Inspector flip controls now use explicit cross-browser/touch sizing so they render consistently in Chrome, Firefox, and coarse-pointer environments.


## v12.1 — Responsive compact tracker

- Reduced the tracker title bar, window controls, action buttons, team fields, and turn row vertically.
- Reduced the minimum tracker height so it can be used as a thinner bar above the pitch.
- Blue/Red, action dots, and Attack/Defense stay on one line while enough width is available.
- When the tracker becomes narrow, only the action dots move to a second line; team name and role remain aligned at the top.
- Reduced action-dot and turn-button dimensions while preserving cross-browser and touch normalization.
- Multiplayer tracker logic and host/guest permissions are unchanged.

## v12.2 — Inactive players

- Added an `INACTIVE` / `ACTIVE` control in Inspector for pucks with attached cards.
- In multiplayer, each participant can change the status only for pucks owned by their team.
- Inactive pucks remain selectable but cannot be dragged.
- Inactive pucks are clearly translucent on the board.
- Defensive areas are never rendered for inactive players, in either selected-player or all-player D.A. mode.
- Inspector hides the card while the player is inactive and shows a large `INACTIVE` status instead.
- Reactivating the player restores the card, puck appearance, drag behavior, and defensive-area behavior.
- Inactive state is stored on the puck and is included in normal local, cloud, scenario, and multiplayer board synchronization.
