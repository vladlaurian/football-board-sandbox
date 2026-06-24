import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Save, Upload, Plus, Minus, Undo2 } from "lucide-react";
import "./styles.css";

const DEFAULT_SETTINGS = {
  cols: 42,
  rows: 26,
  cellSize: 28,

  goalDepth: 2,
  goalWidth: 8,

  boxDepth: 9,
  boxWidth: 16,

  smallDepth: 4,
  smallWidth: 8,

  penaltyDistance: 6,
  arcRadius: 4,
};

function createInitialPieces(cols, rows) {
  const midY = Math.floor(rows / 2);
  const a = [
    ["GK", 2, midY],
    ["LB", 8, midY - 8],
    ["CB", 7, midY - 3],
    ["CB", 7, midY + 3],
    ["RB", 8, midY + 8],
    ["CM", 14, midY - 4],
    ["CM", 14, midY + 4],
    ["LW", 19, midY - 9],
    ["RW", 19, midY + 9],
    ["ST", 22, midY - 2],
    ["ST", 22, midY + 2],
  ];

  const pieces = [];
  a.forEach(([label, x, y], i) => pieces.push({ id: `A-${i}`, team: "A", label, x, y: clamp(y, 0, rows - 1) }));
  a.forEach(([label, x, y], i) => pieces.push({ id: `B-${i}`, team: "B", label, x: cols - 1 - x, y: clamp(y, 0, rows - 1) }));
  pieces.push({ id: "BALL", team: "BALL", label: "●", x: Math.floor(cols / 2), y: midY });
  return pieces;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pieces, setPieces] = useState(() => createInitialPieces(DEFAULT_SETTINGS.cols, DEFAULT_SETTINGS.rows));
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState([]);
  const pitchRef = useRef(null);

  const pitchStyle = useMemo(() => ({
    "--cols": settings.cols,
    "--rows": settings.rows,
    "--cell": `${settings.cellSize}px`,
    transform: `scale(${zoom})`,
  }), [settings, zoom]);

  function pushHistory(nextPieces = pieces) {
    setHistory(h => [...h.slice(-30), JSON.stringify(nextPieces)]);
  }

  function updateSetting(key, value) {
    const next = { ...settings, [key]: Number(value) };
    setSettings(next);
    setPieces(prev => prev.map(p => ({
      ...p,
      x: clamp(p.x, 0, next.cols - 1),
      y: clamp(p.y, 0, next.rows - 1),
    })));
  }

  function resetPieces() {
    pushHistory();
    setPieces(createInitialPieces(settings.cols, settings.rows));
  }

  function saveBoard() {
    localStorage.setItem("football-board-sandbox-v02", JSON.stringify({ settings, pieces, zoom }));
    alert("Salvat în browser.");
  }

  function loadBoard() {
    const raw = localStorage.getItem("football-board-sandbox-v02");
    if (!raw) return alert("Nu există salvare încă.");
    const saved = JSON.parse(raw);
    setSettings(saved.settings);
    setPieces(saved.pieces);
    setZoom(saved.zoom ?? 1);
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
    const x = clamp(Math.floor(localX / settings.cellSize), 0, settings.cols - 1);
    const y = clamp(Math.floor(localY / settings.cellSize), 0, settings.rows - 1);

    setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, x, y } : p));
  }

  function onPointerDown(pieceId, e) {
    e.preventDefault();
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
    setSelectedId(null);
  }

  const line = (style, extraClass = "") => <div className={`pitch-line ${extraClass}`} style={style} />;

  const boxTop = Math.floor((settings.rows - settings.boxWidth) / 2);
  const smallTop = Math.floor((settings.rows - settings.smallWidth) / 2);
  const goalTop = Math.floor((settings.rows - settings.goalWidth) / 2);
  const centerCircleSize = Math.max(6, Math.round(Math.min(settings.cols, settings.rows) * 0.24));

  const leftPenaltyX = settings.penaltyDistance;
  const rightPenaltyX = settings.cols - 1 - settings.penaltyDistance;
  const penaltyY = Math.floor(settings.rows / 2);

  return (
    <div className="app">
      <div className="topbar">
        <strong>Football Board Sandbox <span>v0.2</span></strong>

        <label>Teren L
          <input type="number" value={settings.cols} min="12" max="90" onChange={e => updateSetting("cols", e.target.value)} />
        </label>

        <label>Teren l
          <input type="number" value={settings.rows} min="8" max="60" onChange={e => updateSetting("rows", e.target.value)} />
        </label>

        <label>Pătrățel
          <input type="number" value={settings.cellSize} min="16" max="64" onChange={e => updateSetting("cellSize", e.target.value)} />
        </label>

        <label>Poartă X
          <input type="number" value={settings.goalDepth} min="1" max="8" onChange={e => updateSetting("goalDepth", e.target.value)} />
        </label>

        <label>Poartă Y
          <input type="number" value={settings.goalWidth} min="2" max="24" onChange={e => updateSetting("goalWidth", e.target.value)} />
        </label>

        <label>Careu mare X
          <input type="number" value={settings.boxDepth} min="2" max="30" onChange={e => updateSetting("boxDepth", e.target.value)} />
        </label>

        <label>Careu mare Y
          <input type="number" value={settings.boxWidth} min="4" max="50" onChange={e => updateSetting("boxWidth", e.target.value)} />
        </label>

        <label>Careu mic X
          <input type="number" value={settings.smallDepth} min="1" max="18" onChange={e => updateSetting("smallDepth", e.target.value)} />
        </label>

        <label>Careu mic Y
          <input type="number" value={settings.smallWidth} min="2" max="32" onChange={e => updateSetting("smallWidth", e.target.value)} />
        </label>

        <label>11m
          <input type="number" value={settings.penaltyDistance} min="1" max="24" onChange={e => updateSetting("penaltyDistance", e.target.value)} />
        </label>

        <label>Arc
          <input type="number" value={settings.arcRadius} min="1" max="12" onChange={e => updateSetting("arcRadius", e.target.value)} />
        </label>

        <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.25, 2.8))}><Minus size={16} /></button>
        <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.25, 2.8))}><Plus size={16} /></button>
        <button onClick={undo}><Undo2 size={16} /> Undo</button>
        <button onClick={saveBoard}><Save size={16} /> Save</button>
        <button onClick={loadBoard}><Upload size={16} /> Load</button>
        <button onClick={resetPieces}><RotateCcw size={16} /> Reset</button>
      </div>

      <div className="board-wrap">
        <div className="pitch" ref={pitchRef} style={pitchStyle}>
          <div className="half-line" />
          <div className="center-circle" style={{
            width: `calc(${centerCircleSize} * var(--cell))`,
            height: `calc(${centerCircleSize} * var(--cell))`,
            left: `calc((${settings.cols / 2} - ${centerCircleSize / 2}) * var(--cell))`,
            top: `calc((${settings.rows / 2} - ${centerCircleSize / 2}) * var(--cell))`,
          }} />

          {line({ left: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` })}
          {line({ right: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` })}
          {line({ left: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` })}
          {line({ right: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` })}

          <div className="goal left-goal" style={{
            top: `calc(${goalTop} * var(--cell))`,
            width: `calc(${settings.goalDepth} * var(--cell))`,
            height: `calc(${settings.goalWidth} * var(--cell))`
          }} />
          <div className="goal right-goal" style={{
            top: `calc(${goalTop} * var(--cell))`,
            width: `calc(${settings.goalDepth} * var(--cell))`,
            height: `calc(${settings.goalWidth} * var(--cell))`
          }} />

          <div className="penalty-dot" style={{
            left: `calc(${leftPenaltyX} * var(--cell) + var(--cell) * .42)`,
            top: `calc(${penaltyY} * var(--cell) + var(--cell) * .42)`
          }} />
          <div className="penalty-dot" style={{
            left: `calc(${rightPenaltyX} * var(--cell) + var(--cell) * .42)`,
            top: `calc(${penaltyY} * var(--cell) + var(--cell) * .42)`
          }} />

          <div className="penalty-arc left-arc" style={{
            width: `calc(${settings.arcRadius * 2} * var(--cell))`,
            height: `calc(${settings.arcRadius * 2} * var(--cell))`,
            left: `calc((${leftPenaltyX} - ${settings.arcRadius}) * var(--cell))`,
            top: `calc((${penaltyY} - ${settings.arcRadius}) * var(--cell))`,
          }} />
          <div className="penalty-arc right-arc" style={{
            width: `calc(${settings.arcRadius * 2} * var(--cell))`,
            height: `calc(${settings.arcRadius * 2} * var(--cell))`,
            left: `calc((${rightPenaltyX} - ${settings.arcRadius}) * var(--cell))`,
            top: `calc((${penaltyY} - ${settings.arcRadius}) * var(--cell))`,
          }} />

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
            >
              {p.label}
            </div>
          ))}
        </div>
      </div>

      <div className="status">
        Zoom {Math.round(zoom * 100)}% · {settings.cols} x {settings.rows} · Drag & drop liber · Save local în browser
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
