# Football Board Sandbox v3.6

## v3.6 – Board Coordinates API

- Added internal Board API based on logical grid coordinates (A1, B1, O15 etc.).
- Each piece now also carries:
  - `coord`, for example `O15`
  - `position`, with `{ coord, x, y }`
- Added internal square objects:
  - `coord`
  - `x`, `y`
  - `lengthIndex`
  - `widthLetter`
  - `occupied`
  - `piece` / `pieces`
- Added internal helper API:
  - `getPiece(id)`
  - `getPieceAt(coord)`
  - `getPiecesAt(coord)`
  - `getSquare(coord)`
  - `getAllSquares()`
  - `isEmpty(coord)`
  - `movePiece(id, coord)`
  - `distance(from, to)`
  - `adjacentSquares(coord)`
- Exposed debug API in browser console as:
  - `window.__footballBoardApi`
- No visual/UI changes.
- Snap OFF remains visually free; logical coordinate is calculated from the nearest square.
- Cloud/Login/Touch/Zoom/Pan remain unchanged.
