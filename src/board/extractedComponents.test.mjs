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

test("extracted Board, History, Tracker, and shared Card Preview JSX components render through Vite", async (t) => {
  const server = await createServer({
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
  });
  t.after(() => server.close());

  const { BoardCanvas } = await server.ssrLoadModule("/src/board/BoardCanvas.jsx");
  const { HistoryPanel } = await server.ssrLoadModule("/src/match/HistoryPanel.jsx");
  const { TrackerPanel } = await server.ssrLoadModule("/src/tracker/TrackerPanel.jsx");
  const { CardPreview } = await server.ssrLoadModule("/src/cards/CardPreview.jsx");
  const { CardVisualCanvas } = await server.ssrLoadModule("/src/cards/CardVisualCanvas.jsx");

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

  const trackerMarkup = renderToStaticMarkup(
    React.createElement(TrackerPanel, {
      visible: true,
      lockUI: false,
      minimized: false,
      readOnly: false,
      position: { x: 0, y: 0 },
      size: { w: 390, h: 390 },
      onPointerMove: noop,
      onPointerUp: noop,
      onTitlePointerDown: noop,
      onMinimize: noop,
      onClose: noop,
      gameStarted: true,
      onStartOrRestart: noop,
      onChangePossession: noop,
      onReset: noop,
      trackerSettings: { attackActions: 5, defenseActions: 4, turns: 20 },
      trackerRoleFor: team => team === "blue" ? "attack" : "defense",
      trackerActionCountFor: team => team === "blue" ? 5 : 4,
      usedActions: { blue: 1, red: 0 },
      gameMode: "match",
      actionLog: { blue: [{ type: "MOVE" }], red: [] },
      onToggleAction: noop,
      onRemoveLastAction: noop,
      currentTurn: 1,
      onSelectTurn: noop,
      onResizeDown: noop,
    }),
  );
  assert.match(trackerMarkup, /tracker-panel/);
  assert.match(trackerMarkup, /MV/);

  const cardRenderContext = {
    appTheme: "Style 1",
    customCardTheme: "Custom",
    getCardTheme: card => card.theme,
    cardTextColors: () => ({ header: "#ffffff", headerFront: "#ffffff", headerBack: "#ffffff", positionFront: "#ffffff", positionBack: "#ffffff" }),
    safeColor: value => value || "#ffffff",
    colorToRgbTriplet: () => "255, 255, 255",
    VisualCanvas: CardVisualCanvas,
    normalizeCardVisualLayout: () => ({ front: { header: { x: 0, y: 0, w: 100, h: 20 }, position: { x: 0, y: 20, w: 100, h: 20 }, attributes: { x: 0, y: 40, w: 100, h: 20 } }, back: {} }),
    effectiveTextStylesForCard: () => ({}),
    zoneTextStyleVars: () => ({}),
    normalizeFrontStars: () => ({ count: 0 }),
    zoneTextStyleVarsStable: () => ({}),
    cardLayoutTitle: () => "",
    zonePairDistanceVarsStable: () => ({}),
    zoneNumberStyleVarsStable: () => ({}),
    normalizeStatValue: value => value,
    PREFERRED_FOOT_OPTIONS: ["Right", "Left"],
    defensiveGridAdjustStyle: () => ({}),
    opponentGoalStyleVarsStable: () => ({}),
    normalizeCustomZones: () => [],
    clamp: value => value,
    updateCardVisualLayoutBox: noop,
    updateCardCustomZoneBox: noop,
    areaHasCell: () => false,
    selectedLayout: null,
    onSelectLayout: noop,
  };
  const cardPreviewMarkup = renderToStaticMarkup(
    React.createElement(CardPreview, {
      card: { id: "card-1", name: "Victor", position: "GK", theme: "Style 1", graphics: {} },
      side: "front",
      team: "blue",
      renderContext: cardRenderContext,
    }),
  );
  assert.match(cardPreviewMarkup, /card-preview card-front theme-style-1 blue/);
  assert.match(cardPreviewMarkup, /card-visual-canvas/);
  assert.match(cardPreviewMarkup, /Victor/);

  const cardBackMarkup = renderToStaticMarkup(
    React.createElement(CardPreview, {
      card: { id: "card-1", name: "Victor", position: "GK", theme: "Style 1", graphics: {}, passiveAttributes: [{ id: "attr-1", name: "Passing", value: 8 }], bonuses: [] },
      side: "back",
      team: "blue",
      renderContext: {
        ...cardRenderContext,
        normalizeCardVisualLayout: () => ({ front: {}, back: { header: { x: 0, y: 0, w: 100, h: 20 }, position: { x: 0, y: 20, w: 100, h: 20 }, attributes: { x: 0, y: 40, w: 100, h: 40 } } }),
      },
    }),
  );
  assert.match(cardBackMarkup, /Passing/);
});
