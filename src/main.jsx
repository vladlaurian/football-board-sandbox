import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Save, Upload, Plus, Minus, Undo2, Edit3, X } from "lucide-react";
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
    ["LW", 18, midY - 8],
    ["RW", 18, midY + 8],
    ["ST", 19, midY - 2],
    ["ST", 19, midY + 2],
  ];

  const pieces = [];
  a.forEach(([label, x, y], i) => pieces.push({ id: `A-${i}`, team: "A", label, x: clamp(x, 0, Math.floor(cols/2)-1), y: clamp(y, 0, rows - 1) }));
  a.forEach(([label, x, y], i) => pieces.push({ id: `B-${i}`, team: "B", label, x: cols - 1 - clamp(x, 0, Math.floor(cols/2)-1), y: clamp(y, 0, rows - 1) }));
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

  function resetPieces() {
    pushHistory();
    setPieces(createInitialPieces(settings.cols, settings.rows));
  }

  function saveBoard() {
    localStorage.setItem("football-board-sandbox-v10", JSON.stringify({ settings, pieces, zoom }));
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

  const line = (style) => <div className="pitch-line" style={style} />;

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

  return (
    <div className="app">
      <div className="topbar">
        <strong>Football Board Sandbox <span>v1.0</span></strong>

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
        <button onClick={saveBoard}><Save size={16} /> Save</button>
        <button onClick={loadBoard}><Upload size={16} /> Load</button>
        <button onClick={resetPieces}><RotateCcw size={16} /> Reset</button>
      </div>


      <div className="slotsbar">
        <strong>Poziții salvate:</strong>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(slot => (
          <div className="slot" key={slot}>
            <span>{slot}</span>
            <button onClick={() => saveSlot(slot)}>Save</button>
            <button onClick={() => loadSlot(slot)}>Load</button>
            <button className="danger" onClick={() => clearSlot(slot)}>×</button>
          </div>
        ))}
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
            <div className="center-dot" style={{
              left: `calc(${centerX} * var(--cell) - var(--cell) * .08)`,
              top: `calc((${centerDotY} + .5) * var(--cell) - var(--cell) * .08)`
            }} />

            {line({ left: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` })}
            {line({ right: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` })}
            {line({ left: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` })}
            {line({ right: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` })}

            <div className="goal left-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }} />
            <div className="goal right-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }} />

            <div className="penalty-dot" style={{ left: `calc((${leftPenaltyX} + .5) * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />
            <div className="penalty-dot" style={{ left: `calc((${rightPenaltyX} + .5) * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />

            <div className="arc-mask" style={leftArc.mask}><div className="arc-circle" style={leftArc.circle} /></div>
            <div className="arc-mask" style={rightArc.mask}><div className="arc-circle" style={rightArc.circle} /></div>

            <div className="corner-arc corner-tl" style={{
              width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
            }} />
            <div className="corner-arc corner-tr" style={{
              width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
            }} />
            <div className="corner-arc corner-bl" style={{
              width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
            }} />
            <div className="corner-arc corner-br" style={{
              width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
              height: `calc(${settings.cornerArcRadius * 2} * var(--cell))`,
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
