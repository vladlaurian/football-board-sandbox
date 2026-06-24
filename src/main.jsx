import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Save, Upload, Plus, Minus, Undo2, Edit3, X } from "lucide-react";
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

  penaltyLeftX: 6,
  penaltyRightX: 35,
  penaltyLeftY: 13,
  penaltyRightY: 13,

  centerCircleRadius: 4,
  arcRadius: 4,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

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

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pieces, setPieces] = useState(() => createInitialPieces(DEFAULT_SETTINGS.cols, DEFAULT_SETTINGS.rows));
  const [selectedId, setSelectedId] = useState(null);
  const [editingPiece, setEditingPiece] = useState(null);
  const [editLabel, setEditLabel] = useState("");
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
    setHistory(h => [...h.slice(-60), JSON.stringify(nextPieces)]);
  }

  function updateSetting(key, value) {
    const next = { ...settings, [key]: Number(value) };

    if (key === "cols") {
      next.penaltyLeftX = clamp(next.penaltyLeftX, 0, Number(value) - 1);
      next.penaltyRightX = clamp(next.penaltyRightX, 0, Number(value) - 1);
    }
    if (key === "rows") {
      next.penaltyLeftY = clamp(next.penaltyLeftY, 0, Number(value) - 1);
      next.penaltyRightY = clamp(next.penaltyRightY, 0, Number(value) - 1);
    }

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
    localStorage.setItem("football-board-sandbox-v04", JSON.stringify({ settings, pieces, zoom }));
    alert("Salvat în browser.");
  }

  function loadBoard() {
    const raw =
      localStorage.getItem("football-board-sandbox-v04") ||
      localStorage.getItem("football-board-sandbox-v03");
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

  function penaltyArcPath(side) {
    const r = settings.arcRadius;
    const boxEdgeX = side === "left" ? settings.boxDepth : settings.cols - settings.boxDepth;
    const cx = side === "left" ? settings.penaltyLeftX : settings.penaltyRightX;
    const cy = side === "left" ? settings.penaltyLeftY : settings.penaltyRightY;

    const dx = Math.abs(boxEdgeX - cx);
    if (dx >= r) return "";

    const dy = Math.sqrt(r * r - dx * dx);

    const x = boxEdgeX;
    const y1 = cy - dy;
    const y2 = cy + dy;

    // Left penalty arc should bulge toward the field: to the right of left box edge.
    // Right penalty arc should bulge toward the field: to the left of right box edge.
    const sweep = side === "left" ? 1 : 0;

    return `M ${x} ${y1} A ${r} ${r} 0 0 ${sweep} ${x} ${y2}`;
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>Football Board Sandbox <span>v0.4</span></strong>

        <label>Teren L<input type="number" value={settings.cols} min="12" max="100" onChange={e => updateSetting("cols", e.target.value)} /></label>
        <label>Teren l<input type="number" value={settings.rows} min="8" max="70" onChange={e => updateSetting("rows", e.target.value)} /></label>
        <label>Pătrățel<input type="number" value={settings.cellSize} min="16" max="70" onChange={e => updateSetting("cellSize", e.target.value)} /></label>

        <label>Poartă X<input type="number" value={settings.goalDepth} min="1" max="12" onChange={e => updateSetting("goalDepth", e.target.value)} /></label>
        <label>Poartă Y<input type="number" value={settings.goalWidth} min="2" max="30" onChange={e => updateSetting("goalWidth", e.target.value)} /></label>

        <label>Careu mare X<input type="number" value={settings.boxDepth} min="2" max="36" onChange={e => updateSetting("boxDepth", e.target.value)} /></label>
        <label>Careu mare Y<input type="number" value={settings.boxWidth} min="4" max="60" onChange={e => updateSetting("boxWidth", e.target.value)} /></label>

        <label>Careu mic X<input type="number" value={settings.smallDepth} min="1" max="24" onChange={e => updateSetting("smallDepth", e.target.value)} /></label>
        <label>Careu mic Y<input type="number" value={settings.smallWidth} min="2" max="40" onChange={e => updateSetting("smallWidth", e.target.value)} /></label>

        <label>11m st X<input type="number" value={settings.penaltyLeftX} min="0" max={settings.cols - 1} onChange={e => updateSetting("penaltyLeftX", e.target.value)} /></label>
        <label>11m st Y<input type="number" value={settings.penaltyLeftY} min="0" max={settings.rows - 1} onChange={e => updateSetting("penaltyLeftY", e.target.value)} /></label>
        <label>11m dr X<input type="number" value={settings.penaltyRightX} min="0" max={settings.cols - 1} onChange={e => updateSetting("penaltyRightX", e.target.value)} /></label>
        <label>11m dr Y<input type="number" value={settings.penaltyRightY} min="0" max={settings.rows - 1} onChange={e => updateSetting("penaltyRightY", e.target.value)} /></label>

        <label>Cerc centru<input type="number" value={settings.centerCircleRadius} min="1" max="20" onChange={e => updateSetting("centerCircleRadius", e.target.value)} /></label>
        <label>Semicerc<input type="number" value={settings.arcRadius} min="1" max="20" onChange={e => updateSetting("arcRadius", e.target.value)} /></label>

        <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
        <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
        <button onClick={undo}><Undo2 size={16} /> Undo</button>
        <button onClick={saveBoard}><Save size={16} /> Save</button>
        <button onClick={loadBoard}><Upload size={16} /> Load</button>
        <button onClick={resetPieces}><RotateCcw size={16} /> Reset</button>
      </div>

      <div className="board-wrap">
        <div className="pitch-shell">
          <div className="pitch" ref={pitchRef} style={pitchStyle}>
            <div className="half-line" />
            <div className="center-circle" style={{
              width: `calc(${settings.centerCircleRadius * 2} * var(--cell))`,
              height: `calc(${settings.centerCircleRadius * 2} * var(--cell))`,
              left: `calc((${centerX} - ${settings.centerCircleRadius}) * var(--cell))`,
              top: `calc((${centerY} - ${settings.centerCircleRadius}) * var(--cell))`,
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
              left: `calc(${settings.penaltyLeftX} * var(--cell) + var(--cell) * .42)`,
              top: `calc(${settings.penaltyLeftY} * var(--cell) + var(--cell) * .42)`
            }} />
            <div className="penalty-dot" style={{
              left: `calc(${settings.penaltyRightX} * var(--cell) + var(--cell) * .42)`,
              top: `calc(${settings.penaltyRightY} * var(--cell) + var(--cell) * .42)`
            }} />

            <svg className="arc-svg" viewBox={`0 0 ${settings.cols} ${settings.rows}`} preserveAspectRatio="none">
              <path d={penaltyArcPath("left")} />
              <path d={penaltyArcPath("right")} />
            </svg>

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

      {editingPiece && (
        <div className="modal-backdrop" onPointerDown={() => setEditingPiece(null)}>
          <div className="modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title">
              <strong>Editează jucător</strong>
              <button className="icon-btn" onClick={() => setEditingPiece(null)}><X size={18} /></button>
            </div>
            <p>{editingPiece.team === "A" ? "Echipa albastră" : "Echipa roșie"} · {editingPiece.id}</p>
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
