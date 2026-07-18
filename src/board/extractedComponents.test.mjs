import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const noop = () => {};
const settings = {
  cols: 44,
  rows: 29,
  cell: 28,
  invisiblePadding: 2,
  goalDepth: 2,
  goalWidth: 5,
  boxDepth: 7,
  boxWidth: 17,
  smallDepth: 3,
  smallWidth: 9,
  penaltyDistance: 5,
  penaltyY: 14,
  centerCircleRadius: 4,
  arcRadius: 4,
  cornerArcRadius: 1,
};

test("extracted Board and History JSX components render through Vite", async (t) => {
  const server = await createServer({
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
  });
  t.after(() => server.close());

  const { BoardCanvas } = await server.ssrLoadModule("/src/board/BoardCanvas.jsx");
  const { HistoryPanel } = await server.ssrLoadModule("/src/match/HistoryPanel.jsx");

  const boardMarkup = renderToStaticMarkup(
    React.createElement(BoardCanvas, {
      boardWrapRef: { current: null },
      pitchRef: { current: null },
      selectedId: null,
      setHoveredCell: noop,
      startBoardPan: noop,
      moveBoardPan: noop,
      endBoardPan: noop,
      onBoardWheel: noop,
      onBoardTouchStart: noop,
      onBoardTouchMove: noop,
      onBoardTouchEnd: noop,
      pitchShellStyle: {},
      pitchStyle: {},
      settings,
      onPitchPointerDown: noop,
      onPitchPointerMove: noop,
      onPitchPointerUp: noop,
      onPitchPointerCancel: noop,
      selectedPiece: null,
      selectedMovementAxis: null,
      movementAxisSymbol: () => "",
      movementPreview: null,
      hoveredCell: null,
      coordinateCells: [],
      measureMode: false,
      measureStart: null,
      measureEnd: null,
      measureType: "center",
      rulerMarkers: [],
      defensiveAreaOverlays: [],
      pieces: [
        { id: "A-1", team: "A", label: "ST", x: 10, y: 10 },
        { id: "BALL", team: "BALL", label: "●", x: 22, y: 14 },
      ],
      getPieceDisplayLabel: (piece) => piece.label,
      onPiecePointerDown: noop,
      openEdit: noop,
    }),
  );
  assert.match(boardMarkup, /board-wrap/);

  const historyMarkup = renderToStaticMarkup(
    React.createElement(HistoryPanel, {
      visible: true,
      lockUI: false,
      position: { x: 0, y: 0 },
      size: { w: 280, h: 360 },
      onHistoryPointerMove: noop,
      onHistoryResizeMove: noop,
      onPointerUp: noop,
      onTitlePointerDown: noop,
      onHistoryResizeDown: noop,
      onClose: noop,
      historyListRef: { current: null },
      isReplayView: true,
      gameTimeline: { cursor: 0, entries: [], startedAt: "2026-07-18T00:00:00.000Z" },
      clearHistory: noop,
      gameMode: "match",
      sessionCode: "",
      isSessionHost: true,
      restoreTimelineCursor: noop,
    }),
  );
  assert.match(historyMarkup, /history-panel/);
});
