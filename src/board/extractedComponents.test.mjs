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
  const { CardEditorPanel } = await server.ssrLoadModule("/src/cards/CardEditorPanel.jsx");
  const { CardsPanel } = await server.ssrLoadModule("/src/cards/CardsPanel.jsx");
  const { AssignCardModal } = await server.ssrLoadModule("/src/cards/AssignCardModal.jsx");

  const boardMarkup = renderToStaticMarkup(
    React.createElement(BoardCanvas, {
      boardWrapRef: { current: null },
      pitchRef: { current: null },
      presentationMode: "match",
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
      selectedPiece: { id: "A-1", team: "A", x: 10, y: 10 },
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
      defensiveAreaOverlays: [
        { id: "blue-a", team: "A", x: 2, y: 2 },
        { id: "blue-b", team: "A", x: 3, y: 2 },
        { id: "red-a", team: "B", x: 3, y: 2 },
      ],
      pieces: [
        { id: "A-1", team: "A", label: "ST", x: 10, y: 10 },
        { id: "BALL", team: "BALL", label: "●", x: 10, y: 10 },
      ],
      getPieceDisplayLabel: (piece) => piece.label,
      onPiecePointerDown: noop,
      openEdit: noop,
    }),
  );
  assert.match(boardMarkup, /board-wrap/);
  assert.match(boardMarkup, /match-presentation/);
  assert.match(boardMarkup, /selected-team-blue/);
  assert.match(boardMarkup, /has-possession/);
  assert.match(boardMarkup, /ball-held/);
  assert.match(boardMarkup, /match-ball-aura/);
  assert.match(boardMarkup, /match-def-area-cell/);
  assert.match(boardMarkup, /contested/);

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

  const editorCard = { id: "card-1", name: "Victor", position: "GK", preferredFoot: "Right", theme: "Style 1", graphics: {}, passiveAttributes: [], bonuses: [] };
  const editorController = {
    renderContext: cardRenderContext,
    renderLayoutEditor: noop,
    renderColorPicker: noop,
    renderTextStyleControls: noop,
    renderStarMenu: noop,
    renderSectionTitleEditor: noop,
    renderAttributeListEditor: noop,
    renderDefensiveGridAdjustControl: noop,
    renderOpponentGoalTextControl: noop,
    renderDefensiveAreaEditor: noop,
    updateCardField: noop,
    positionOptions: ["GK"],
    preferredFootOptions: ["Right", "Left"],
  };
  const editorMarkup = renderToStaticMarkup(React.createElement(CardEditorPanel, { card: editorCard, controller: editorController }));
  assert.match(editorMarkup, /card-editor/);
  assert.match(editorMarkup, /card-front/);
  assert.match(editorMarkup, /card-back/);

  const panelMarkup = renderToStaticMarkup(React.createElement(CardsPanel, {
    controller: {
      editingCard: editorCard, editingCardId: editorCard.id, cardsView: "library", cardState: { cards: [editorCard] }, cardById: { [editorCard.id]: editorCard }, rosterSlots: { blue: { starting: [], substitutes: [] }, red: { starting: [], substitutes: [] } }, pieces: [], sessionCode: "", workspaceLocked: false, themeOptions: ["Style 1"], selectedTheme: "Style 1", graphicImportSide: "front", exportCardId: editorCard.id, libraryPositionFilter: "ALL", libraryPositionOptions: ["GK"], visibleLibraryCards: [editorCard], renderCardEditor: () => React.createElement("div", { className: "editor-slot" }), getCardThemeSelection: noop, setGraphicImportSide: noop, setExportCardId: noop, setLibraryPositionFilter: noop, setCardsView: noop, setEditingCardId: noop, close: noop, startGraphicImport: noop, deleteSelectedGraphic: noop, canDeleteGraphic: false, exportSelectedCard: noop, importCardBackup: noop, exportSelectedCardPng: noop, graphicFrontInputRef: { current: null }, graphicBackInputRef: { current: null }, handleFrontGraphicFile: noop, handleBackGraphicFile: noop, createCardFromPosition: noop, sortCardsByPosition: noop, cloneCard: noop, deleteCard: noop, canAssignPiece: () => true, setAssignTarget: noop, removePieceCard: noop,
    },
  }));
  assert.match(panelMarkup, /cards-panel/);
  assert.match(panelMarkup, /Card Library/);

  const assignMarkup = renderToStaticMarkup(React.createElement(AssignCardModal, {
    controller: { isOpen: true, assignCards: [editorCard], activeAssignCards: [editorCard], assignPreviewCardId: editorCard.id, assignPreviewSide: "back", assignPositionFilter: "ALL", assignPositionOptions: ["GK"], pieces: [], renderContext: cardRenderContext, normalizeFrontStars: () => ({ count: 0 }), close: noop, setAssignSortByPosition: noop, setAssignPositionFilter: noop, setAssignPreviewCardId: noop, setAssignPreviewSide: noop, assignCard: noop },
  }));
  assert.match(assignMarkup, /assign-modal/);
  assert.match(assignMarkup, /card-back/);
});
