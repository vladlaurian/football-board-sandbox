import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Plus, Minus, Undo2, Edit3, X, Dices } from "lucide-react";
import "./styles.css";

const DEFAULT_SETTINGS = {
  cols: 40,
  rows: 29,
  cellSize: 28,
  goalDepth: 2,
  goalWidth: 5,
  boxDepth: 6,
  boxWidth: 17,
  smallDepth: 2,
  smallWidth: 9,
  penaltyDistance: 5,
  penaltyY: 14,
  centerCircleRadius: 4,
  arcRadius: 4,
  cornerArcRadius: 1,
};

const POSITION_OPTIONS = [
  "GK", "LB", "LWB", "CB", "RB", "RWB",
  "CDM", "CM", "CAM", "AM",
  "LM", "RM", "LW", "RW",
  "LF", "RF", "CF", "ST"
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function forceOddDirectional(value, previousValue, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded % 2 !== 0) return rounded;

  // Dacă utilizatorul apasă săgeata în jos, mergem la imparul inferior.
  // Dacă apasă săgeata în sus, mergem la imparul superior.
  if (Number(previousValue) > rounded) return rounded - 1;
  return rounded + 1;
}

function rowLetter(index) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function toCoord(x, y) {
  return `${rowLetter(y)}${x + 1}`;
}

function fromCoord(coord) {
  const match = String(coord).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return { x: 0, y: 0 };
  const letters = match[1];
  const number = Number(match[2]);
  let y = 0;
  for (let i = 0; i < letters.length; i++) {
    y = y * 26 + (letters.charCodeAt(i) - 64);
  }
  return { x: number - 1, y: y - 1 };
}

const FORMATION_SLOTS = [
  {
    id: 1,
    name: "4-4-2",
    players: [
      ["GK", "O1"], ["LB", "G8"], ["CB", "L7"], ["CB", "R7"], ["RB", "W8"],
      ["LM", "D16"], ["CM", "L13"], ["CM", "R13"], ["RM", "Z16"],
      ["ST", "M16"], ["ST", "Q16"]
    ]
  },
  {
    id: 2,
    name: "4-2-3-1",
    players: [
      ["GK", "O1"], ["LWB", "Y8"], ["CB", "R7"], ["CB", "L7"], ["RWB", "E8"],
      ["CDM", "M11"], ["CDM", "Q11"], ["LW", "C19"], ["AM", "O16"], ["RW", "AA19"],
      ["ST", "O19"]
    ]
  },
  {
    id: 3,
    name: "3-5-2 (1)",
    players: [
      ["GK", "O1"], ["CB", "K7"], ["CB", "O7"], ["CB", "S7"],
      ["LM", "D16"], ["CM", "K13"], ["CM", "O13"], ["CM", "S13"], ["RM", "Z16"],
      ["ST", "M16"], ["ST", "Q16"]
    ]
  },
  ...Array.from({ length: 12 }, (_, i) => ({ id: i + 4, name: `Slot ${i + 4} - 4-4-2`, players: [["GK", "O1"], ["LB", "G8"], ["CB", "L7"], ["CB", "R7"], ["RB", "W8"], ["LM", "D16"], ["CM", "L13"], ["CM", "R13"], ["RM", "Z16"], ["ST", "M16"], ["ST", "Q16"]] }))
];

function loadStoredFormations() {
  try {
    const raw = localStorage.getItem("football-board-formations-v18");
    if (!raw) return FORMATION_SLOTS;
    const stored = JSON.parse(raw);
    return FORMATION_SLOTS.map(base => {
      const saved = stored.find(s => s.id === base.id);
      if (!saved) return base;
      if (!saved.players || saved.players.length === 0) return base;
      return saved;
    });
  } catch {
    return FORMATION_SLOTS;
  }
}

const DEFAULT_GAME_SITUATIONS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Situația ${i + 1}`,
  snapshot: null,
}));

function loadStoredGameSituations() {
  try {
    const raw = localStorage.getItem("football-board-game-situations-v20");
    if (!raw) return DEFAULT_GAME_SITUATIONS;
    const stored = JSON.parse(raw);
    return DEFAULT_GAME_SITUATIONS.map(base => stored.find(s => s.id === base.id) || base);
  } catch {
    return DEFAULT_GAME_SITUATIONS;
  }
}

function createInitialPieces(cols, rows, blueFormation = FORMATION_SLOTS[0], redFormation = FORMATION_SLOTS[1]) {
  const pieces = [];
  const midY = Math.floor(rows / 2);

  function addFormation(team, formation) {
    const isBlue = team === "A";
    formation.players.forEach(([label, coord], i) => {
      const pos = fromCoord(coord);
      const x = isBlue ? pos.x : cols - 1 - pos.x;
      pieces.push({
        id: `${team}-${i}`,
        team,
        label,
        x: clamp(x, 0, cols - 1),
        y: clamp(pos.y, 0, rows - 1),
      });
    });
  }

  addFormation("A", blueFormation);
  addFormation("B", redFormation);

  pieces.push({ id: "BALL", team: "BALL", label: "●", x: Math.floor(cols / 2), y: midY });
  return pieces;
}

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [formations, setFormations] = useState(() => loadStoredFormations());
  const [blueFormationId, setBlueFormationId] = useState(1);
  const [redFormationId, setRedFormationId] = useState(2);
  const [gameSituations, setGameSituations] = useState(() => loadStoredGameSituations());
  const [activeSituationId, setActiveSituationId] = useState(1);
  const [activeSituationName, setActiveSituationName] = useState("Situația 1");
  const [pieces, setPieces] = useState(() => createInitialPieces(DEFAULT_SETTINGS.cols, DEFAULT_SETTINGS.rows, FORMATION_SLOTS[0], FORMATION_SLOTS[1]));
  const [selectedId, setSelectedId] = useState(null);
  const [editingPiece, setEditingPiece] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [history, setHistory] = useState([]);
  const [dieType, setDieType] = useState(20);
  const [dieResult, setDieResult] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState(null);
  const [measureEnd, setMeasureEnd] = useState(null);
  const [actionLog, setActionLog] = useState([]);
  const [historyPosition, setHistoryPosition] = useState({ x: window.innerWidth - 300, y: 118 });
  const [historyDragging, setHistoryDragging] = useState(null);
  const pitchRef = useRef(null);

  const pitchStyle = useMemo(() => ({
    "--cols": settings.cols,
    "--rows": settings.rows,
    "--cell": `${settings.cellSize}px`,
    transform: `scale(${zoom})`,
  }), [settings, zoom]);

  function pushHistory(nextPieces = pieces) {
    setHistory(h => [...h.slice(-60), JSON.stringify(nextPieces)]);
  }

  function updateSetting(key, value) {
    let cleanValue = Number(value);
    if (key === "rows" || key === "goalWidth") {
      cleanValue = forceOddDirectional(cleanValue, settings[key], settings[key]);
    }
    const next = { ...settings, [key]: cleanValue };

    if (key === "cols") {
      next.penaltyDistance = clamp(next.penaltyDistance, 1, Math.floor(cleanValue / 2));
    }
    if (key === "rows") {
      next.rows = forceOddDirectional(cleanValue, settings.rows, settings.rows);
      next.penaltyY = Math.floor(next.rows / 2);
    }
    if (key === "goalWidth") {
      next.goalWidth = forceOddDirectional(cleanValue, settings.goalWidth, settings.goalWidth);
    }

    setSettings(next);
    setPieces(prev => prev.map(p => ({
      ...p,
      x: clamp(p.x, 0, next.cols - 1),
      y: clamp(p.y, 0, next.rows - 1),
    })));
  }

  function getFormationById(id) {
    return formations.find(f => f.id === Number(id)) || formations[0];
  }

  function applyFormation(team, formationId) {
    const formation = getFormationById(formationId);
    pushHistory();
    setPieces(prev => {
      const ball = prev.find(p => p.team === "BALL");
      const others = prev.filter(p => p.team !== team && p.team !== "BALL");
      const temp = createInitialPieces(
        settings.cols,
        settings.rows,
        team === "A" ? formation : getFormationById(blueFormationId),
        team === "B" ? formation : getFormationById(redFormationId)
      ).filter(p => p.team === team);
      const next = [...others, ...temp, ball].filter(Boolean);
      logSnapshot(`${team === "A" ? "Blue" : "Red"} formation: ${formation.name}`, next);
      return next;
    });
  }

  function saveCurrentAsFormation(team, slotId) {
    const slot = formations.find(f => f.id === Number(slotId));
    const defaultName = slot?.name?.startsWith("Slot ") ? "" : slot?.name;
    const name = window.prompt(`Nume formație pentru slotul ${slotId}:`, defaultName || `Formație ${slotId}`);
    if (name === null) return;

    const teamPieces = pieces
      .filter(p => p.team === team)
      .map(p => {
        const x = team === "A" ? Math.round(p.x) : settings.cols - 1 - Math.round(p.x);
        const y = Math.round(p.y);
        return [p.label, toCoord(clamp(x, 0, settings.cols - 1), clamp(y, 0, settings.rows - 1))];
      });

    const nextFormations = formations.map(f =>
      f.id === Number(slotId)
        ? { id: Number(slotId), name: name.trim() || `Formație ${slotId}`, players: teamPieces }
        : f
    );

    setFormations(nextFormations);
    localStorage.setItem("football-board-formations-v18", JSON.stringify(nextFormations));
    alert(`Formația a fost salvată în slotul ${slotId}.`);
  }

  function createCurrentSnapshot() {
    return {
      settings,
      pieces,
      zoom,
      blueFormationId,
      redFormationId,
      dieType,
      dieResult,
    };
  }

  function applyGameSituation(id) {
    const situation = gameSituations.find(s => s.id === Number(id));
    if (!situation) return;

    setActiveSituationId(Number(id));
    setActiveSituationName(situation.name);

    if (!situation.snapshot) return;

    pushHistory();
    setSettings(situation.snapshot.settings);
    setPieces(situation.snapshot.pieces);
    setZoom(situation.snapshot.zoom ?? 0.9);
    setBlueFormationId(situation.snapshot.blueFormationId ?? 1);
    setRedFormationId(situation.snapshot.redFormationId ?? 2);
    setDieType(situation.snapshot.dieType ?? 20);
    setDieResult(situation.snapshot.dieResult ?? null);
    logSnapshot(`Load situație: ${situation.name}`, situation.snapshot.pieces);
  }

  function saveActiveGameSituation() {
    const cleanName = activeSituationName.trim() || `Situația ${activeSituationId}`;
    const nextSituations = gameSituations.map(s =>
      s.id === Number(activeSituationId)
        ? { ...s, name: cleanName, snapshot: createCurrentSnapshot() }
        : s
    );

    setGameSituations(nextSituations);
    localStorage.setItem("football-board-game-situations-v20", JSON.stringify(nextSituations));
    setActiveSituationName(cleanName);
    logSnapshot(`Save situație: ${cleanName}`);
  }

  function resetPieces() {
    pushHistory();
    const fresh = createInitialPieces(settings.cols, settings.rows, getFormationById(blueFormationId), getFormationById(redFormationId));
    setPieces(fresh);
    logSnapshot("Reset poziții", fresh);
  }

  function saveBoard() {
    localStorage.setItem("football-board-sandbox-v20", JSON.stringify({ settings, pieces, zoom }));
    alert("Salvat în browser.");
  }

  function normalizeLoadedSettings(s) {
    if ("penaltyDistance" in s) return s;
    const penaltyDistance = s.penaltyLeftX ?? DEFAULT_SETTINGS.penaltyDistance;
    const penaltyY = s.penaltyLeftY ?? Math.floor((s.rows ?? DEFAULT_SETTINGS.rows) / 2);
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      penaltyDistance,
      penaltyY,
    };
  }

  function loadBoard() {
    const raw =
      localStorage.getItem("football-board-sandbox-v20") ||
      localStorage.getItem("football-board-sandbox-v19") ||
      localStorage.getItem("football-board-sandbox-v18") ||
      localStorage.getItem("football-board-sandbox-v17") ||
      localStorage.getItem("football-board-sandbox-v16") ||
      localStorage.getItem("football-board-sandbox-v15") ||
      localStorage.getItem("football-board-sandbox-v14") ||
      localStorage.getItem("football-board-sandbox-v13") ||
      localStorage.getItem("football-board-sandbox-v12") ||
      localStorage.getItem("football-board-sandbox-v11") ||
      localStorage.getItem("football-board-sandbox-v10") ||
      localStorage.getItem("football-board-sandbox-v09") ||
      localStorage.getItem("football-board-sandbox-v08") ||
      localStorage.getItem("football-board-sandbox-v07") ||
      localStorage.getItem("football-board-sandbox-v06") ||
      localStorage.getItem("football-board-sandbox-v05") ||
      localStorage.getItem("football-board-sandbox-v04") ||
      localStorage.getItem("football-board-sandbox-v03");
    if (!raw) return alert("Nu există salvare încă.");
    const saved = JSON.parse(raw);
    setSettings(normalizeLoadedSettings(saved.settings));
    setPieces(saved.pieces);
    setZoom(saved.zoom ?? 1);
  }

  function logSnapshot(label, nextPieces = pieces) {
    setActionLog(prev => [
      ...prev.slice(-79),
      {
        id: `${Date.now()}-${Math.random()}`,
        label,
        pieces: JSON.stringify(nextPieces),
        settings: JSON.stringify(settings),
        zoom,
        dieType,
        dieResult,
        createdAt: new Date().toLocaleTimeString(),
      }
    ]);
  }

  function restoreSnapshot(entry) {
    setPieces(JSON.parse(entry.pieces));
    setSettings(JSON.parse(entry.settings));
    setZoom(entry.zoom ?? 1);
    setDieType(entry.dieType ?? 20);
    setDieResult(entry.dieResult ?? null);
  }

  function clearHistory() {
    if (!window.confirm("Șterg history-ul?")) return;
    setActionLog([]);
  }

  function rollDie() {
    const result = Math.floor(Math.random() * dieType) + 1;
    setDieResult(result);
    logSnapshot(`Zar D${dieType}: ${result}`);
  }

  function undo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    setPieces(JSON.parse(last));
    setHistory(h => h.slice(0, -1));
  }

  function movePieceFromPointer(pieceId, e) {
    const pitch = pitchRef.current;
    const rect = pitch.getBoundingClientRect();
    const localX = (e.clientX - rect.left) / zoom;
    const localY = (e.clientY - rect.top) / zoom;

    let x;
    let y;

    if (snapToGrid) {
      x = clamp(Math.floor(localX / settings.cellSize), 0, settings.cols - 1);
      y = clamp(Math.floor(localY / settings.cellSize), 0, settings.rows - 1);
    } else {
      x = clamp(localX / settings.cellSize - 0.5, 0, settings.cols - 1);
      y = clamp(localY / settings.cellSize - 0.5, 0, settings.rows - 1);
    }

    setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, x, y } : p));
  }

  function onPointerDown(pieceId, e) {
    e.preventDefault();
    e.stopPropagation();
    if (editingPiece) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(pieceId);
    pushHistory();
    movePieceFromPointer(pieceId, e);
  }

  function onPointerMove(pieceId, e) {
    if (selectedId !== pieceId) return;
    movePieceFromPointer(pieceId, e);
  }

  function onPointerUp() {
    if (selectedId) {
      const moved = pieces.find(p => p.id === selectedId);
      if (moved) logSnapshot(`${moved.team === "A" ? "Blue" : moved.team === "B" ? "Red" : "Ball"} ${moved.label} → ${rowLetter(Math.floor(moved.y))}${Math.floor(moved.x) + 1}`);
    }
    setSelectedId(null);
  }

  function openEdit(piece) {
    if (piece.team === "BALL") return;
    setEditingPiece(piece);
    setEditLabel(piece.label);
  }

  function saveEdit() {
    if (!editingPiece) return;
    const clean = editLabel.trim().slice(0, 5) || "?";
    setPieces(prev => prev.map(p => p.id === editingPiece.id ? { ...p, label: clean } : p));
    setEditingPiece(null);
    setEditLabel("");
  }

  const line = (style, extraClass = "") => <div className={`pitch-line ${extraClass}`} style={style} />;

  const boxTop = Math.floor((settings.rows - settings.boxWidth) / 2);
  const smallTop = Math.floor((settings.rows - settings.smallWidth) / 2);
  const goalTop = Math.floor((settings.rows - settings.goalWidth) / 2);
  const centerX = settings.cols / 2;
  const centerY = settings.rows / 2;
  const centerDotX = Math.floor(settings.cols / 2);
  const centerDotY = Math.floor(settings.rows / 2);

  const leftPenaltyX = settings.penaltyDistance - 1;
  const rightPenaltyX = settings.cols - settings.penaltyDistance;
  const penaltyY = settings.penaltyY;

  function arcMask(side) {
    const r = settings.arcRadius;
    const cx = (side === "left" ? leftPenaltyX : rightPenaltyX) + 0.5;
    const cy = penaltyY + 0.5;
    const boxEdgeX = side === "left" ? settings.boxDepth : settings.cols - settings.boxDepth;

    const left = cx - r;
    const top = cy - r;
    const diameter = r * 2;

    if (side === "left") {
      // Show only the part outside the left penalty box, i.e. to the right of the penalty-box vertical line.
      const maskLeft = boxEdgeX;
      const maskWidth = Math.max(0, left + diameter - boxEdgeX);
      return {
        mask: {
          left: `calc(${maskLeft} * var(--cell))`,
          top: `calc(${top} * var(--cell))`,
          width: `calc(${maskWidth} * var(--cell))`,
          height: `calc(${diameter} * var(--cell))`,
        },
        circle: {
          left: `calc(${left - maskLeft} * var(--cell))`,
          top: `0px`,
          width: `calc(${diameter} * var(--cell))`,
          height: `calc(${diameter} * var(--cell))`,
        }
      };
    }

    // Show only the part outside the right penalty box, i.e. to the left of the penalty-box vertical line.
    const maskLeft = left;
    const maskWidth = Math.max(0, boxEdgeX - left);
    return {
      mask: {
        left: `calc(${maskLeft} * var(--cell))`,
        top: `calc(${top} * var(--cell))`,
        width: `calc(${maskWidth} * var(--cell))`,
        height: `calc(${diameter} * var(--cell))`,
      },
      circle: {
        left: `0px`,
        top: `0px`,
        width: `calc(${diameter} * var(--cell))`,
        height: `calc(${diameter} * var(--cell))`,
      }
    };
  }

  const leftArc = arcMask("left");
  const rightArc = arcMask("right");

  const selectedPiece = pieces.find(p => p.id === selectedId);
  const coordinateCells = useMemo(() => {
    if (!showCoordinates) return [];
    const cells = [];
    for (let y = 0; y < settings.rows; y++) {
      for (let x = 0; x < settings.cols; x++) {
        cells.push({ x, y });
      }
    }
    return cells;
  }, [showCoordinates, settings.cols, settings.rows]);

  const measureInfo = useMemo(() => {
    if (!measureStart || !measureEnd) return null;
    const dx = Math.abs(measureEnd.x - measureStart.x);
    const dy = Math.abs(measureEnd.y - measureStart.y);
    return {
      dx,
      dy,
      manhattan: dx + dy,
      chess: Math.max(dx, dy),
      straight: Math.sqrt(dx * dx + dy * dy).toFixed(2),
    };
  }, [measureStart, measureEnd]);

  function getGridCellFromPointer(e) {
    const pitch = pitchRef.current;
    const rect = pitch.getBoundingClientRect();
    const localX = (e.clientX - rect.left) / zoom;
    const localY = (e.clientY - rect.top) / zoom;
    return {
      x: clamp(Math.floor(localX / settings.cellSize), 0, settings.cols - 1),
      y: clamp(Math.floor(localY / settings.cellSize), 0, settings.rows - 1),
    };
  }

  function onPitchPointerDown(e) {
    if (!measureMode) return;
    if (e.target !== pitchRef.current) return;
    const cell = getGridCellFromPointer(e);
    if (!measureStart || (measureStart && measureEnd)) {
      setMeasureStart(cell);
      setMeasureEnd(null);
    } else {
      setMeasureEnd(cell);
    }
  }

  function onHistoryPointerDown(e) {
    e.preventDefault();
    setHistoryDragging({
      startX: e.clientX,
      startY: e.clientY,
      originX: historyPosition.x,
      originY: historyPosition.y,
    });
  }

  function onHistoryPointerMove(e) {
    if (!historyDragging) return;
    const nextX = historyDragging.originX + (e.clientX - historyDragging.startX);
    const nextY = historyDragging.originY + (e.clientY - historyDragging.startY);
    setHistoryPosition({
      x: clamp(nextX, 0, window.innerWidth - 80),
      y: clamp(nextY, 0, window.innerHeight - 50),
    });
  }

  function onHistoryPointerUp() {
    setHistoryDragging(null);
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>Football Board Sandbox <span>v2.0</span></strong>

        <label>Teren L<input type="number" value={settings.cols} min="12" max="100" onChange={e => updateSetting("cols", e.target.value)} /></label>
        <label>Teren l impar<input type="number" value={settings.rows} min="8" max="70" onChange={e => updateSetting("rows", e.target.value)} /></label>
        <label>Pătrățel<input type="number" value={settings.cellSize} min="16" max="70" onChange={e => updateSetting("cellSize", e.target.value)} /></label>

        <label>Poartă X<input type="number" value={settings.goalDepth} min="1" max="12" onChange={e => updateSetting("goalDepth", e.target.value)} /></label>
        <label>Poartă Y impar<input type="number" value={settings.goalWidth} min="2" max="30" onChange={e => updateSetting("goalWidth", e.target.value)} /></label>

        <label>Careu mare X<input type="number" value={settings.boxDepth} min="2" max="36" onChange={e => updateSetting("boxDepth", e.target.value)} /></label>
        <label>Careu mare Y<input type="number" value={settings.boxWidth} min="4" max="60" onChange={e => updateSetting("boxWidth", e.target.value)} /></label>

        <label>Careu mic X<input type="number" value={settings.smallDepth} min="1" max="24" onChange={e => updateSetting("smallDepth", e.target.value)} /></label>
        <label>Careu mic Y<input type="number" value={settings.smallWidth} min="2" max="40" onChange={e => updateSetting("smallWidth", e.target.value)} /></label>

        <label>11m dist<input type="number" value={settings.penaltyDistance} min="1" max={Math.floor(settings.cols/2)} onChange={e => updateSetting("penaltyDistance", e.target.value)} /></label>
        <label>11m Y<input type="number" value={settings.penaltyY} min="0" max={settings.rows} onChange={e => updateSetting("penaltyY", e.target.value)} /></label>

        <label>Cerc centru<input type="number" value={settings.centerCircleRadius} min="1" max="20" onChange={e => updateSetting("centerCircleRadius", e.target.value)} /></label>
        <label>Semicerc<input type="number" value={settings.arcRadius} min="1" max="20" onChange={e => updateSetting("arcRadius", e.target.value)} /></label>
        <label>Arc colț<input type="number" value={settings.cornerArcRadius} min="1" max="5" onChange={e => updateSetting("cornerArcRadius", e.target.value)} /></label>

        <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
        <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
        <button onClick={undo}><Undo2 size={16} /> Undo</button>
        <button onClick={resetPieces}><RotateCcw size={16} /> Reset</button>
        <button className={snapToGrid ? "toggle-on" : ""} onClick={() => setSnapToGrid(v => !v)}>
          Snap {snapToGrid ? "ON" : "OFF"}
        </button>
        <button className={showCoordinates ? "toggle-on" : ""} onClick={() => setShowCoordinates(v => !v)}>
          Coordonate
        </button>
        <button className={measureMode ? "toggle-on" : ""} onClick={() => {
          setMeasureMode(v => !v);
          setMeasureStart(null);
          setMeasureEnd(null);
        }}>
          Riglă
        </button>

        <div className="dice-box">
          <Dices size={16} />
          <select value={dieType} onChange={e => setDieType(Number(e.target.value))}>
            <option value={20}>D20</option>
            <option value={12}>D12</option>
            <option value={10}>D10</option>
            <option value={8}>D8</option>
            <option value={6}>D6</option>
            <option value={4}>D4</option>
          </select>
          <button onClick={rollDie}>Roll</button>
          <span className={`die-result ${dieResult === 1 ? "die-min" : dieResult === dieType ? "die-max" : ""}`}>{dieResult === null ? "—" : dieResult}</span>
        </div>
      </div>



      <div className="formationbar">
        <strong>Formații:</strong>

        <div className="formation-control blue">
          <span>Blue</span>
          <select value={blueFormationId} onChange={e => {
            const id = Number(e.target.value);
            setBlueFormationId(id);
            applyFormation("A", id);
          }}>
            {formations.map(f => <option key={f.id} value={f.id}>{f.id}. {f.name}</option>)}
          </select>
          <button onClick={() => saveCurrentAsFormation("A", blueFormationId)}>Save</button>
        </div>

        <div className="formation-control red">
          <span>Red</span>
          <select value={redFormationId} onChange={e => {
            const id = Number(e.target.value);
            setRedFormationId(id);
            applyFormation("B", id);
          }}>
            {formations.map(f => <option key={f.id} value={f.id}>{f.id}. {f.name}</option>)}
          </select>
          <button onClick={() => saveCurrentAsFormation("B", redFormationId)}>Save</button>
        </div>
      </div>
      <div className="situationsbar">
        <strong>Situații de joc:</strong>
        <select value={activeSituationId} onChange={e => applyGameSituation(Number(e.target.value))}>
          {gameSituations.map(s => (
            <option key={s.id} value={s.id}>{s.id}. {s.name}{s.snapshot ? "" : " (gol)"}</option>
          ))}
        </select>
        <input
          className="situation-name"
          value={activeSituationName}
          onChange={e => setActiveSituationName(e.target.value)}
          onFocus={e => e.target.select()}
        />
        <button onClick={saveActiveGameSituation}>Save</button>
      </div>

      <div className="board-wrap">
        <div className="pitch-shell">
          <div className="pitch" ref={pitchRef} style={pitchStyle} onPointerDown={onPitchPointerDown}>
            <div className="half-line" />
            <div className="center-circle" style={{
              width: `calc(${settings.centerCircleRadius * 2} * var(--cell))`,
              height: `calc(${settings.centerCircleRadius * 2} * var(--cell))`,
              left: `calc((${centerX} - ${settings.centerCircleRadius}) * var(--cell))`,
              top: `calc((${centerY} - ${settings.centerCircleRadius}) * var(--cell))`,
            }} />
            <div className="center-dot" style={{
              left: `calc(${centerX} * var(--cell) - var(--cell) * .08 + 1px)`,
              top: `calc((${centerDotY} + .5) * var(--cell) - var(--cell) * .08)`
            }} />

            {selectedPiece && (
              <div className="selected-cell" style={{
                left: `calc(${Math.floor(selectedPiece.x)} * var(--cell))`,
                top: `calc(${Math.floor(selectedPiece.y)} * var(--cell))`,
              }} />
            )}

            {coordinateCells.map(c => (
              <div key={`${c.x}-${c.y}`} className="coord-label" style={{
                left: `calc(${c.x} * var(--cell))`,
                top: `calc(${c.y} * var(--cell))`,
              }}>
                {rowLetter(c.y)}{c.x + 1}
              </div>
            ))}

            {measureStart && (
              <div className="measure-point start" style={{
                left: `calc((${measureStart.x} + .5) * var(--cell) - var(--cell) * .13)`,
                top: `calc((${measureStart.y} + .5) * var(--cell) - var(--cell) * .13)`,
              }} />
            )}
            {measureEnd && (
              <div className="measure-point end" style={{
                left: `calc((${measureEnd.x} + .5) * var(--cell) - var(--cell) * .13)`,
                top: `calc((${measureEnd.y} + .5) * var(--cell) - var(--cell) * .13)`,
              }} />
            )}
            {measureStart && measureEnd && (
              <svg className="measure-svg" viewBox={`0 0 ${settings.cols} ${settings.rows}`} preserveAspectRatio="none">
                <line
                  x1={measureStart.x + .5}
                  y1={measureStart.y + .5}
                  x2={measureEnd.x + .5}
                  y2={measureEnd.y + .5}
                />
              </svg>
            )}


            {line({ left: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` }, "left-box")}
            {line({ right: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` }, "right-box")}
            {line({ left: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` }, "left-box")}
            {line({ right: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` }, "right-box")}

            <div className="goal left-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }} />
            <div className="goal right-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }} />

            <div className="penalty-dot" style={{ left: `calc((${leftPenaltyX} + .5) * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />
            <div className="penalty-dot" style={{ left: `calc((${rightPenaltyX} + .5) * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />

            <div className="arc-mask" style={leftArc.mask}><div className="arc-circle" style={leftArc.circle} /></div>
            <div className="arc-mask" style={rightArc.mask}><div className="arc-circle" style={rightArc.circle} /></div>

            <div className="corner-mask corner-tl" style={{
              width: `calc(${settings.cornerArcRadius} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius} * var(--cell))`,
            }}>
              <div className="corner-circle" style={{
                left: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                top: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
                height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              }} />
            </div>
            <div className="corner-mask corner-tr" style={{
              width: `calc(${settings.cornerArcRadius} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius} * var(--cell))`,
            }}>
              <div className="corner-circle" style={{
                right: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                top: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
                height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              }} />
            </div>
            <div className="corner-mask corner-bl" style={{
              width: `calc(${settings.cornerArcRadius} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius} * var(--cell))`,
            }}>
              <div className="corner-circle" style={{
                left: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                bottom: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
                height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              }} />
            </div>
            <div className="corner-mask corner-br" style={{
              width: `calc(${settings.cornerArcRadius} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius} * var(--cell))`,
            }}>
              <div className="corner-circle" style={{
                right: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                bottom: `calc(-${settings.cornerArcRadius} * var(--cell))`,
                width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
                height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              }} />
            </div>


            {pieces.map(p => (
              <div
                key={p.id}
                className={`piece ${p.team === "A" ? "team-a" : p.team === "B" ? "team-b" : "ball"} ${selectedId === p.id ? "selected" : ""}`}
                style={{
                  left: `calc(${p.x} * var(--cell) + var(--cell) * ${p.team === "BALL" ? 0.2 : 0.08})`,
                  top: `calc(${p.y} * var(--cell) + var(--cell) * ${p.team === "BALL" ? 0.2 : 0.08})`,
                }}
                onPointerDown={(e) => onPointerDown(p.id, e)}
                onPointerMove={(e) => onPointerMove(p.id, e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => openEdit(p)}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="status">
        Zoom {Math.round(zoom * 100)}% · {settings.cols} x {settings.rows} · Dublu click pe jucător ca să schimbi textul
      </div>

      {measureInfo && (
        <div className="measure-panel">
          Riglă: ΔX {measureInfo.dx} · ΔY {measureInfo.dy} · ortogonal {measureInfo.manhattan} · diagonal {measureInfo.chess} · drept {measureInfo.straight}
        </div>
      )}

      <div
        className="history-panel"
        style={{ left: historyPosition.x, top: historyPosition.y }}
        onPointerMove={onHistoryPointerMove}
        onPointerUp={onHistoryPointerUp}
        onPointerCancel={onHistoryPointerUp}
      >
        <div className="history-title" onPointerDown={onHistoryPointerDown}>
          <strong>History</strong>
          <button onClick={clearHistory}>Clear</button>
        </div>
        <div className="history-list">
          {actionLog.length === 0 && <div className="history-empty">Nu există pași încă.</div>}
          {actionLog.map((entry, index) => (
            <button key={entry.id} className="history-item" onClick={() => restoreSnapshot(entry)}>
              <span>{index + 1}. {entry.label}</span>
              <small>{entry.createdAt}</small>
            </button>
          ))}
        </div>
      </div>

      {editingPiece && (
        <div className="modal-backdrop" onPointerDown={() => setEditingPiece(null)}>
          <div className="modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title">
              <strong>Editează jucător</strong>
              <button className="icon-btn" onClick={() => setEditingPiece(null)}><X size={18} /></button>
            </div>
            <p>{editingPiece.team === "A" ? "Echipa albastră" : "Echipa roșie"} · {editingPiece.id}</p>
            <select
              className="position-select"
              value={POSITION_OPTIONS.includes(editLabel) ? editLabel : ""}
              onChange={e => setEditLabel(e.target.value)}
            >
              <option value="">Alege poziție...</option>
              {POSITION_OPTIONS.map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>

            <input
              className="label-input"
              value={editLabel}
              autoFocus
              maxLength={5}
              onChange={e => setEditLabel(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditingPiece(null);
              }}
            />
            <button className="save-label" onClick={saveEdit}><Edit3 size={16} /> Salvează text</button>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
