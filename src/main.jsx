import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { RotateCcw, Plus, Minus, Undo2, Edit3, X, Dices } from "lucide-react";
import "./styles.css";

const firebaseConfig = {
  apiKey: "AIzaSyCywPIebtVMzK-Ig2nddKck7XpTbyZONBw",
  authDomain: "football-board-sandbox.firebaseapp.com",
  projectId: "football-board-sandbox",
  storageBucket: "football-board-sandbox.firebasestorage.app",
  messagingSenderId: "532677098723",
  appId: "1:532677098723:web:d296e40dd849f35a7999d6"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

function userStateRef(uid) {
  return doc(db, "users", uid, "footballBoard", "mainState");
}

function sessionRef(code) {
  return doc(db, "sessions", String(code || "").toUpperCase());
}

function generateSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

const ENCODED_ARRAY_MARKER = "__footballBoardArray";

function encodeForFirestore(value) {
  if (Array.isArray(value)) {
    return {
      [ENCODED_ARRAY_MARKER]: true,
      items: value.reduce((acc, item, index) => {
        acc[String(index)] = encodeForFirestore(item);
        return acc;
      }, {}),
      length: value.length,
    };
  }

  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value;
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (item !== undefined && typeof item !== "function") {
        acc[key] = encodeForFirestore(item);
      }
      return acc;
    }, {});
  }

  return value;
}

function decodeFromFirestore(value) {
  if (value && typeof value === "object" && value[ENCODED_ARRAY_MARKER]) {
    const items = value.items || {};
    const length = Number(value.length ?? Object.keys(items).length);
    return Array.from({ length }, (_, index) => decodeFromFirestore(items[String(index)]));
  }

  if (Array.isArray(value)) {
    return value.map(decodeFromFirestore);
  }

  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value;
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = decodeFromFirestore(item);
      return acc;
    }, {});
  }

  return value;
}

const DEFAULT_SETTINGS = {
  cols: 44,
  rows: 29,
  cellSize: 28,
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

function isLegacyDefaultPitch(rawSettings = {}) {
  return (
    Number(rawSettings.cols) === 40 &&
    Number(rawSettings.rows) === 29 &&
    Number(rawSettings.goalDepth ?? 2) === 2 &&
    Number(rawSettings.goalWidth ?? 5) === 5 &&
    Number(rawSettings.boxDepth ?? 6) === 6 &&
    Number(rawSettings.boxWidth ?? 17) === 17 &&
    Number(rawSettings.smallDepth ?? 2) === 2 &&
    Number(rawSettings.smallWidth ?? 9) === 9
  );
}

function normalizeSettingsForApp(rawSettings = {}) {
  const shouldUpgradeLegacyDefault = isLegacyDefaultPitch(rawSettings);
  const next = shouldUpgradeLegacyDefault
    ? { ...rawSettings, cols: 44, boxDepth: 7, smallDepth: 3, goalDepth: 2, goalWidth: 5, penaltyDistance: 5, penaltyY: 14 }
    : { ...DEFAULT_SETTINGS, ...rawSettings };

  // v3.4 a putut salva accidental Pătrățel = 50 în cloud.
  // Revenim la default-ul stabil 28 fără să afectăm proporțiile logice ale terenului.
  if (!Number.isFinite(Number(next.cellSize)) || Number(next.cellSize) > 40) {
    next.cellSize = 28;
  }

  next.cols = clamp(Number(next.cols) || DEFAULT_SETTINGS.cols, 12, 100);
  next.rows = forceOddDirectional(Number(next.rows) || DEFAULT_SETTINGS.rows, DEFAULT_SETTINGS.rows, DEFAULT_SETTINGS.rows);
  next.goalWidth = forceOddDirectional(Number(next.goalWidth) || DEFAULT_SETTINGS.goalWidth, DEFAULT_SETTINGS.goalWidth, DEFAULT_SETTINGS.goalWidth);
  next.penaltyY = clamp(Number(next.penaltyY) || Math.floor(next.rows / 2), 0, next.rows - 1);
  return next;
}

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

function goalTopForSettings(settingsLike = DEFAULT_SETTINGS) {
  return Math.floor(((settingsLike.rows ?? DEFAULT_SETTINGS.rows) - (settingsLike.goalWidth ?? DEFAULT_SETTINGS.goalWidth)) / 2);
}

function isInsideGoalMouthY(y, settingsLike = DEFAULT_SETTINGS) {
  const top = goalTopForSettings(settingsLike);
  const bottom = top + (settingsLike.goalWidth ?? DEFAULT_SETTINGS.goalWidth) - 1;
  return y >= top && y <= bottom;
}

function invisiblePaddingForSettings(settingsLike = DEFAULT_SETTINGS) {
  return Number(settingsLike.invisiblePadding ?? DEFAULT_SETTINGS.invisiblePadding ?? 2);
}

function clampBoardXForY(x, y, settingsLike = DEFAULT_SETTINGS) {
  const cols = settingsLike.cols ?? DEFAULT_SETTINGS.cols;
  const pad = invisiblePaddingForSettings(settingsLike);
  return clamp(x, -pad, cols + pad - 1);
}

function clampBoardY(y, settingsLike = DEFAULT_SETTINGS) {
  const rows = settingsLike.rows ?? DEFAULT_SETTINGS.rows;
  const pad = invisiblePaddingForSettings(settingsLike);
  return clamp(y, -pad, rows + pad - 1);
}

function normalizeGridPosition(x, y, settingsLike = DEFAULT_SETTINGS) {
  const safeY = clampBoardY(Math.round(Number(y) || 0), settingsLike);
  const safeX = clampBoardXForY(Math.round(Number(x) || 0), safeY, settingsLike);
  const fieldX = clamp(safeX, 0, (settingsLike.cols ?? DEFAULT_SETTINGS.cols) - 1);
  const fieldY = clamp(safeY, 0, (settingsLike.rows ?? DEFAULT_SETTINGS.rows) - 1);
  return {
    x: safeX,
    y: safeY,
    coord: toCoord(fieldX, fieldY),
    square: {
      id: toCoord(fieldX, fieldY),
      coord: toCoord(fieldX, fieldY),
      x: safeX,
      y: safeY,
      lengthIndex: safeX + 1,
      widthLetter: rowLetter(fieldY),
    },
  };
}

function withBoardPosition(piece, settingsLike = DEFAULT_SETTINGS) {
  // x/y rămân poziția vizuală reală, inclusiv fracționară când Snap este OFF.
  // coord/position reprezintă pătrățica logică, rotunjită la celula cea mai apropiată.
  const rawY = clampBoardY(Number(piece.y) || 0, settingsLike);
  const rawX = clampBoardXForY(Number(piece.x) || 0, rawY, settingsLike);
  const grid = normalizeGridPosition(rawX, rawY, settingsLike);
  return {
    ...piece,
    x: rawX,
    y: rawY,
    coord: grid.coord,
    position: {
      coord: grid.coord,
      x: grid.x,
      y: grid.y,
    },
  };
}

function normalizePiecesForBoard(pieces, settingsLike = DEFAULT_SETTINGS) {
  return (pieces || []).map(piece => withBoardPosition(piece, settingsLike));
}

function createSquareObject(x, y, pieces = [], settingsLike = DEFAULT_SETTINGS) {
  const grid = normalizeGridPosition(x, y, settingsLike);
  const occupants = normalizePiecesForBoard(pieces, settingsLike).filter(piece => piece.coord === grid.coord);
  return {
    id: grid.coord,
    coord: grid.coord,
    x: grid.x,
    y: grid.y,
    lengthIndex: grid.x + 1,
    widthLetter: rowLetter(grid.y),
    occupied: occupants.length > 0,
    pieces: occupants,
    piece: occupants[0] || null,
  };
}

function buildBoardApi(settingsLike, piecesLike) {
  const boardPieces = normalizePiecesForBoard(piecesLike, settingsLike);
  return {
    cols: settingsLike.cols,
    rows: settingsLike.rows,
    toCoord: (x, y) => toCoord(x, y),
    fromCoord,
    normalizePosition: (x, y) => normalizeGridPosition(x, y, settingsLike),
    getPieces: () => boardPieces,
    getPiece: (pieceId) => boardPieces.find(piece => piece.id === pieceId) || null,
    getPiecesByTeam: (team) => boardPieces.filter(piece => piece.team === team),
    getPieceAt: (coord) => {
      const { x, y } = fromCoord(coord);
      const normalized = normalizeGridPosition(x, y, settingsLike).coord;
      return boardPieces.find(piece => piece.coord === normalized) || null;
    },
    getPiecesAt: (coord) => {
      const { x, y } = fromCoord(coord);
      const normalized = normalizeGridPosition(x, y, settingsLike).coord;
      return boardPieces.filter(piece => piece.coord === normalized);
    },
    isEmpty: (coord) => {
      const { x, y } = fromCoord(coord);
      const normalized = normalizeGridPosition(x, y, settingsLike).coord;
      return !boardPieces.some(piece => piece.coord === normalized);
    },
    getSquare: (coord) => {
      const { x, y } = fromCoord(coord);
      return createSquareObject(x, y, boardPieces, settingsLike);
    },
    getAllSquares: () => {
      const squares = [];
      for (let y = 0; y < settingsLike.rows; y++) {
        for (let x = 0; x < settingsLike.cols; x++) {
          squares.push(createSquareObject(x, y, boardPieces, settingsLike));
        }
      }
      return squares;
    },
    movePiece: (pieceId, coord) => {
      const { x, y } = fromCoord(coord);
      const grid = normalizeGridPosition(x, y, settingsLike);
      return boardPieces.map(piece => piece.id === pieceId ? withBoardPosition({ ...piece, x: grid.x, y: grid.y }, settingsLike) : piece);
    },
    distance: (fromCoordValue, toCoordValue) => {
      const a = fromCoord(fromCoordValue);
      const b = fromCoord(toCoordValue);
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      return {
        dx,
        dy,
        orthogonal: dx + dy,
        diagonal: Math.max(dx, dy),
        straight: Math.sqrt(dx * dx + dy * dy),
      };
    },
    adjacentSquares: (coord, includeDiagonals = false) => {
      const { x, y } = fromCoord(coord);
      const deltas = includeDiagonals
        ? [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]
        : [[0,-1],[1,0],[0,1],[-1,0]];
      return deltas
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter(pos => pos.x >= 0 && pos.y >= 0 && pos.x < settingsLike.cols && pos.y < settingsLike.rows)
        .map(pos => createSquareObject(pos.x, pos.y, boardPieces, settingsLike));
    },
  };
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
  const localSettings = { ...DEFAULT_SETTINGS, cols, rows };
  const pad = invisiblePaddingForSettings(localSettings);

  function addFormation(team, formation) {
    const isBlue = team === "A";
    formation.players.forEach(([label, coord], i) => {
      const pos = fromCoord(coord);
      const x = isBlue ? pos.x : cols - 1 - pos.x;
      pieces.push({
        id: `${team}-${i}`,
        team,
        label,
        x: clampBoardXForY(x, pos.y, localSettings),
        y: clampBoardY(pos.y, localSettings),
      });
    });
  }

  function addBench(team) {
    const isBlue = team === "A";
    const benchX = isBlue ? -pad : cols + pad - 1;
    const benchX2 = isBlue ? -pad + 1 : cols + pad - 2;
    const startY = Math.max(1, midY - 4);
    pieces.push({ id: `${team}-R-GK`, team, label: "GK", x: benchX, y: startY });
    for (let i = 0; i < 6; i++) {
      pieces.push({
        id: `${team}-R-${i + 1}`,
        team,
        label: "",
        x: i % 2 === 0 ? benchX : benchX2,
        y: startY + 2 + Math.floor(i / 2) * 2,
      });
    }
  }

  addFormation("A", blueFormation);
  addFormation("B", redFormation);
  addBench("A");
  addBench("B");

  pieces.push({ id: "BALL", team: "BALL", label: "●", x: Math.floor(cols / 2), y: midY });
  return normalizePiecesForBoard(pieces, localSettings);
}

function App() {
  const [settings, setSettings] = useState(() => normalizeSettingsForApp(DEFAULT_SETTINGS));
  const [formations, setFormations] = useState(() => loadStoredFormations());
  const [blueFormationId, setBlueFormationId] = useState(1);
  const [redFormationId, setRedFormationId] = useState(2);
  const [gameSituations, setGameSituations] = useState(() => loadStoredGameSituations());
  const [activeSituationId, setActiveSituationId] = useState(1);
  const [activeSituationName, setActiveSituationName] = useState("Situația 1");
  const [pieces, setPieces] = useState(() => normalizePiecesForBoard(createInitialPieces(DEFAULT_SETTINGS.cols, DEFAULT_SETTINGS.rows, FORMATION_SLOTS[0], FORMATION_SLOTS[1]), DEFAULT_SETTINGS));
  const [selectedId, setSelectedId] = useState(null);
  const [editingPiece, setEditingPiece] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [zoom, setZoom] = useState(0.8);
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
  const [historySize, setHistorySize] = useState({ w: 280, h: 360 });
  const [historyDragging, setHistoryDragging] = useState(null);
  const [historyResizing, setHistoryResizing] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [dicePanelVisible, setDicePanelVisible] = useState(false);
  const [dicePanelPosition, setDicePanelPosition] = useState({ x: 420, y: 180 });
  const [dicePanelSize, setDicePanelSize] = useState({ w: 300, h: 150 });
  const [dicePanelDragging, setDicePanelDragging] = useState(null);
  const [dicePanelResizing, setDicePanelResizing] = useState(null);
  const [touchMode, setTouchMode] = useState(() => navigator.maxTouchPoints > 0);
  const [lockUI, setLockUI] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Local");
  const [cloudError, setCloudError] = useState("");
  const pitchRef = useRef(null);
  const boardWrapRef = useRef(null);
  const isApplyingCloudRef = useRef(false);
  const autosaveTimerRef = useRef(null);
  const touchGestureRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const boardPanRef = useRef(null);
  const beforeLockViewRef = useRef(null);
  const clientIdRef = useRef(`client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const sessionSaveTimerRef = useRef(null);
  const isApplyingSessionRef = useRef(false);

  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [sessionStatus, setSessionStatus] = useState("Offline");
  const [sessionPlayers, setSessionPlayers] = useState(0);

  const pitchStyle = useMemo(() => ({
    "--cols": settings.cols,
    "--rows": settings.rows,
    "--cell": `${settings.cellSize}px`,
    transform: `scale(${zoom})`,
  }), [settings, zoom]);

  const pitchShellStyle = useMemo(() => ({
    transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px))`,
  }), [panOffset]);


  const boardApi = useMemo(() => buildBoardApi(settings, pieces), [settings, pieces]);

  useEffect(() => {
    // Debug/development hook: the board now has a logical coordinate API.
    // Example in Console: window.__footballBoardApi.getPieceAt("O15")
    window.__footballBoardApi = boardApi;
    return () => {
      if (window.__footballBoardApi === boardApi) delete window.__footballBoardApi;
    };
  }, [boardApi]);

  function buildCloudState(overrides = {}) {
    return {
      version: "pitch-44-goal-5x2",
      settings,
      formations,
      gameSituations,
      activeSituationId,
      activeSituationName,
      blueFormationId,
      redFormationId,
      pieces: normalizePiecesForBoard(pieces, settings),
      dieType,
      dieResult,
      touchMode,
      snapToGrid,
      showCoordinates,
      ...overrides,
    };
  }

  function applyCloudState(data) {
    if (!data) return;
    if (data.settings) setSettings(normalizeSettingsForApp(data.settings));
    if (data.formations) setFormations(data.formations);
    if (data.gameSituations) setGameSituations(data.gameSituations);
    if (typeof data.activeSituationId === "number") setActiveSituationId(data.activeSituationId);
    if (data.activeSituationName) setActiveSituationName(data.activeSituationName);
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
    if (data.pieces) setPieces(normalizePiecesForBoard(data.pieces, data.settings ? normalizeSettingsForApp(data.settings) : settings));
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) setDieResult(data.dieResult);
    if (typeof data.touchMode === "boolean") setTouchMode(data.touchMode);
    if (typeof data.snapToGrid === "boolean") setSnapToGrid(data.snapToGrid);
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
  }

  function buildLiveBoardState(overrides = {}) {
    return {
      version: "pitch-44-goal-5x2",
      settings,
      pieces: normalizePiecesForBoard(pieces, settings),
      dieType,
      dieResult,
      snapToGrid,
      showCoordinates,
      blueFormationId,
      redFormationId,
      actionLog,
      ...overrides,
    };
  }

  function applyLiveBoardState(data) {
    if (!data) return;
    const nextSettings = data.settings ? normalizeSettingsForApp(data.settings) : settings;
    if (data.settings) setSettings(nextSettings);
    if (data.pieces) setPieces(normalizePiecesForBoard(data.pieces, nextSettings));
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) setDieResult(data.dieResult);
    if (typeof data.snapToGrid === "boolean") setSnapToGrid(data.snapToGrid);
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
    if (data.actionLog) setActionLog(data.actionLog);
  }

  async function saveSessionState(overrides = {}) {
    if (!user || !sessionCode) return;
    try {
      const code = sessionCode.toUpperCase();
      await setDoc(sessionRef(code), {
        board: encodeForFirestore(buildLiveBoardState(overrides)),
        updatedAt: serverTimestamp(),
        updatedBy: clientIdRef.current,
      }, { merge: true });
      setSessionStatus("Online saved");
    } catch (error) {
      console.error(error);
      setSessionStatus("Online error");
    }
  }

  async function createSession() {
    if (!user) {
      setSessionStatus("Login first");
      return;
    }
    const code = generateSessionCode();
    setSessionStatus("Creating...");
    await setDoc(sessionRef(code), {
      code,
      ownerUid: user.uid,
      ownerEmail: user.email || "",
      players: {
        [user.uid]: {
          email: user.email || "",
          joinedAt: new Date().toISOString(),
          clientId: clientIdRef.current,
        }
      },
      board: encodeForFirestore(buildLiveBoardState()),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: clientIdRef.current,
    }, { merge: true });
    setSessionCode(code);
    setJoinCode(code);
    setSessionStatus("Online");
  }

  async function joinSession() {
    if (!user) {
      setSessionStatus("Login first");
      return;
    }
    const code = String(joinCode || "").trim().toUpperCase();
    if (!code) return;

    try {
      setSessionStatus("Joining...");
      const ref = sessionRef(code);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setSessionStatus("Code not found");
        return;
      }

      await setDoc(ref, {
        players: {
          [user.uid]: {
            email: user.email || "",
            joinedAt: new Date().toISOString(),
            clientId: clientIdRef.current,
          }
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setSessionCode(code);
      setSessionStatus("Online");
    } catch (error) {
      console.error(error);
      setSessionStatus("Join error");
    }
  }

  function leaveSession() {
    setSessionCode("");
    setSessionPlayers(0);
    setSessionStatus("Offline");
  }


  async function saveCloudState(overrides = {}, label = "Cloud saved") {
    if (!user) return;
    try {
      setCloudStatus("Saving...");
      const payload = encodeForFirestore(buildCloudState(overrides));
      await setDoc(userStateRef(user.uid), {
        ...payload,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setCloudStatus(label);
      setCloudError("");
    } catch (error) {
      console.error(error);
      setCloudStatus("Cloud error");
      setCloudError(error.message || String(error));
    }
  }

  async function loadCloudState(currentUser) {
    try {
      setCloudStatus("Loading cloud...");
      const ref = userStateRef(currentUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        isApplyingCloudRef.current = true;
        applyCloudState(decodeFromFirestore(snap.data()));
        window.setTimeout(() => {
          isApplyingCloudRef.current = false;
        }, 300);
        setCloudStatus("Cloud loaded");
      } else {
        await setDoc(ref, {
          ...encodeForFirestore(buildCloudState()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setCloudStatus("Local data uploaded");
      }
      setCloudReady(true);
      setCloudError("");
    } catch (error) {
      console.error(error);
      setCloudStatus("Cloud error");
      setCloudError(error.message || String(error));
      setCloudReady(false);
    }
  }

  async function loginWithGoogle() {
    try {
      setCloudStatus("Login...");
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      setCloudStatus("Login error");
      setCloudError(error.message || String(error));
    }
  }

  async function logout() {
    await signOut(auth);
    setCloudReady(false);
    setCloudStatus("Local");
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        loadCloudState(currentUser);
      } else {
        setCloudReady(false);
        setCloudStatus("Local");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !sessionCode) return;

    setSessionStatus("Connecting...");
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRef(code), (snapshot) => {
      if (!snapshot.exists()) {
        setSessionStatus("Session missing");
        return;
      }

      const data = snapshot.data();
      const players = data.players || {};
      setSessionPlayers(Object.keys(players).length);
      setSessionStatus("Online");

      if (data.updatedBy === clientIdRef.current) return;

      if (data.board) {
        isApplyingSessionRef.current = true;
        applyLiveBoardState(decodeFromFirestore(data.board));
        window.setTimeout(() => {
          isApplyingSessionRef.current = false;
        }, 250);
      }
    }, (error) => {
      console.error(error);
      setSessionStatus("Online error");
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode || isApplyingSessionRef.current) return;

    if (sessionSaveTimerRef.current) {
      window.clearTimeout(sessionSaveTimerRef.current);
    }

    setSessionStatus("Online saving...");
    sessionSaveTimerRef.current = window.setTimeout(() => {
      saveSessionState();
    }, 180);

    return () => {
      if (sessionSaveTimerRef.current) {
        window.clearTimeout(sessionSaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    sessionCode,
    settings,
    pieces,
    dieType,
    dieResult,
    snapToGrid,
    showCoordinates,
    blueFormationId,
    redFormationId,
    actionLog,
  ]);

  useEffect(() => {
    if (!user || !cloudReady || isApplyingCloudRef.current) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    setCloudStatus("Saving...");
    autosaveTimerRef.current = window.setTimeout(() => {
      saveCloudState({}, "Saved");
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    cloudReady,
    settings,
    formations,
    gameSituations,
    activeSituationId,
    activeSituationName,
    blueFormationId,
    redFormationId,
    pieces,
    dieType,
    dieResult,
    touchMode,
    snapToGrid,
    showCoordinates,
  ]);

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
    setPieces(prev => normalizePiecesForBoard(prev.map(p => ({
      ...p,
      y: clamp(p.y, 0, next.rows - 1),
      x: clampBoardXForY(p.x, clamp(p.y, 0, next.rows - 1), next),
    })), next));
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
      const next = normalizePiecesForBoard([...others, ...temp, ball].filter(Boolean), settings);
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
        return [p.label, normalizeGridPosition(x, y, settings).coord];
      });

    const nextFormations = formations.map(f =>
      f.id === Number(slotId)
        ? { id: Number(slotId), name: name.trim() || `Formație ${slotId}`, players: teamPieces }
        : f
    );

    setFormations(nextFormations);
    localStorage.setItem("football-board-formations-v18", JSON.stringify(nextFormations));
    saveCloudState({ formations: nextFormations }, `Formation ${slotId} saved`);
    alert(`Formația a fost salvată în slotul ${slotId}.`);
  }

  function createCurrentSnapshot() {
    return {
      settings,
      pieces: normalizePiecesForBoard(pieces, settings),
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
    setPieces(normalizePiecesForBoard(situation.snapshot.pieces, situation.snapshot.settings || settings));
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
    saveCloudState({ gameSituations: nextSituations, activeSituationName: cleanName }, `Scenario saved`);
    logSnapshot(`Save situație: ${cleanName}`);
  }

  function resetPieces() {
    pushHistory();
    const fresh = createInitialPieces(settings.cols, settings.rows, getFormationById(blueFormationId), getFormationById(redFormationId));
    setPieces(fresh);
    logSnapshot("Reset poziții", fresh);
  }

  function saveBoard() {
    localStorage.setItem("football-board-sandbox-v34", JSON.stringify({ settings, pieces, zoom }));
    alert("Salvat în browser.");
  }

  function normalizeLoadedSettings(s) {
    if ("penaltyDistance" in s) return normalizeSettingsForApp(s);
    const penaltyDistance = s.penaltyLeftX ?? DEFAULT_SETTINGS.penaltyDistance;
    const penaltyY = s.penaltyLeftY ?? Math.floor((s.rows ?? DEFAULT_SETTINGS.rows) / 2);
    return normalizeSettingsForApp({
      ...DEFAULT_SETTINGS,
      ...s,
      penaltyDistance,
      penaltyY,
    });
  }

  function loadBoard() {
    const raw =
      localStorage.getItem("football-board-sandbox-v34") ||
      localStorage.getItem("football-board-sandbox-v22") ||
      localStorage.getItem("football-board-sandbox-v21") ||
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
    const loadedSettings = normalizeLoadedSettings(saved.settings);
    setPieces(normalizePiecesForBoard(saved.pieces, loadedSettings));
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
    const restoredSettings = normalizeSettingsForApp(JSON.parse(entry.settings));
    setPieces(normalizePiecesForBoard(JSON.parse(entry.pieces), restoredSettings));
    setSettings(restoredSettings);
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
    setPieces(normalizePiecesForBoard(JSON.parse(last), settings));
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
      y = clampBoardY(Math.floor(localY / settings.cellSize), settings);
      x = clampBoardXForY(Math.floor(localX / settings.cellSize), y, settings);
    } else {
      y = clampBoardY(localY / settings.cellSize - 0.5, settings);
      x = clampBoardXForY(localX / settings.cellSize - 0.5, y, settings);
    }

    setPieces(prev => normalizePiecesForBoard(prev.map(p => p.id === pieceId ? { ...p, x, y } : p), settings));
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
      if (moved) logSnapshot(`${moved.team === "A" ? "Blue" : moved.team === "B" ? "Red" : "Ball"} ${moved.label} → ${withBoardPosition(moved, settings).coord}`);
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
    setPieces(prev => normalizePiecesForBoard(prev.map(p => p.id === editingPiece.id ? { ...p, label: clean } : p), settings));
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

  const leftPenaltyX = settings.penaltyDistance;
  const rightPenaltyX = settings.cols - settings.penaltyDistance;
  const penaltyY = settings.penaltyY;

  function arcMask(side) {
    const r = settings.arcRadius;
    const cx = side === "left" ? leftPenaltyX : rightPenaltyX;
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


  function goalGrid(side) {
    const verticalLines = Array.from({ length: settings.goalDepth + 1 }, (_, i) => i)
      // Nu redesenăm linia porții: pentru stânga excludem x=goalDepth, pentru dreapta excludem x=0.
      .filter(i => side === "left" ? i < settings.goalDepth : i > 0);
    const horizontalLines = Array.from({ length: settings.goalWidth + 1 }, (_, i) => i);

    return (
      <svg className="goal-grid" viewBox={`0 0 ${settings.goalDepth} ${settings.goalWidth}`} preserveAspectRatio="none" aria-hidden="true">
        {verticalLines.map(i => (
          <line key={`v-${i}`} x1={i} y1={0} x2={i} y2={settings.goalWidth} />
        ))}
        {horizontalLines.map(i => (
          <line key={`h-${i}`} x1={0} y1={i} x2={settings.goalDepth} y2={i} />
        ))}
      </svg>
    );
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
    const y = clampBoardY(Math.floor(localY / settings.cellSize), settings);
    return {
      x: clampBoardXForY(Math.floor(localX / settings.cellSize), y, settings),
      y,
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

  function canStartBoardPan(e) {
    if (measureMode || editingPiece) return false;
    if (e.pointerType === "touch") return false;
    const target = e.target;
    if (!target) return false;
    if (target.closest && target.closest(".piece")) return false;
    return target === boardWrapRef.current || target === pitchRef.current || (target.closest && target.closest(".pitch-shell"));
  }

  function startBoardPan(e) {
    if (!canStartBoardPan(e)) return;
    e.preventDefault();
    boardWrapRef.current?.setPointerCapture?.(e.pointerId);
    boardPanRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    };
  }

  function moveBoardPan(e) {
    const pan = boardPanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    e.preventDefault();
    setPanOffset({
      x: pan.originX + (e.clientX - pan.startX),
      y: pan.originY + (e.clientY - pan.startY),
    });
  }

  function endBoardPan(e) {
    if (boardPanRef.current && boardPanRef.current.pointerId === e.pointerId) {
      boardPanRef.current = null;
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

  function onHistoryResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    setHistoryResizing({
      startX: e.clientX,
      startY: e.clientY,
      originW: historySize.w,
      originH: historySize.h,
    });
  }

  function onHistoryResizeMove(e) {
    if (!historyResizing) return;
    setHistorySize({
      w: clamp(historyResizing.originW + (e.clientX - historyResizing.startX), 220, 700),
      h: clamp(historyResizing.originH + (e.clientY - historyResizing.startY), 160, 700),
    });
  }

  function onDicePanelPointerDown(e) {
    e.preventDefault();
    setDicePanelDragging({
      startX: e.clientX,
      startY: e.clientY,
      originX: dicePanelPosition.x,
      originY: dicePanelPosition.y,
    });
  }

  function onDicePanelPointerMove(e) {
    if (!dicePanelDragging) return;
    const nextX = dicePanelDragging.originX + (e.clientX - dicePanelDragging.startX);
    const nextY = dicePanelDragging.originY + (e.clientY - dicePanelDragging.startY);
    setDicePanelPosition({
      x: clamp(nextX, 0, window.innerWidth - 80),
      y: clamp(nextY, 0, window.innerHeight - 50),
    });
  }

  function onDicePanelResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    setDicePanelResizing({
      startX: e.clientX,
      startY: e.clientY,
      originW: dicePanelSize.w,
      originH: dicePanelSize.h,
    });
  }

  function onDicePanelResizeMove(e) {
    if (!dicePanelResizing) return;
    setDicePanelSize({
      w: clamp(dicePanelResizing.originW + (e.clientX - dicePanelResizing.startX), 220, 520),
      h: clamp(dicePanelResizing.originH + (e.clientY - dicePanelResizing.startY), 120, 420),
    });
  }

  function fitWidth() {
    const wrap = boardWrapRef.current;
    if (!wrap) return;
    const pitchWidth = settings.cols * settings.cellSize + 6;
    const available = Math.max(240, wrap.clientWidth - 28);
    setZoom(clamp(Number((available / pitchWidth).toFixed(2)), 0.2, 3));
  }

  function fitHeight() {
    const wrap = boardWrapRef.current;
    if (!wrap) return;
    const pitchHeight = settings.rows * settings.cellSize + 6;
    const available = Math.max(240, wrap.clientHeight - 28);
    setZoom(clamp(Number((available / pitchHeight).toFixed(2)), 0.2, 3));
  }

  function resetView() {
    setZoom(lockUI ? 1.0 : 0.8);
  }

  function touchDistance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function touchMidpoint(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  function onBoardTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = e.touches;
      touchGestureRef.current = {
        mode: "two-finger",
        startDistance: touchDistance(t1, t2),
        startMid: touchMidpoint(t1, t2),
        startZoom: zoom,
        startPan: panOffset,
      };
      return;
    }

    if (e.touches.length === 1 && e.target === pitchRef.current) {
      const touch = e.touches[0];
      const now = Date.now();
      const last = lastTapRef.current;
      const dx = touch.clientX - last.x;
      const dy = touch.clientY - last.y;
      const closeEnough = Math.sqrt(dx * dx + dy * dy) < 32;
      if (now - last.time < 320 && closeEnough) {
        e.preventDefault();
        resetView();
        lastTapRef.current = { time: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      }
    }
  }

  function onBoardTouchMove(e) {
    const gesture = touchGestureRef.current;
    if (!gesture || gesture.mode !== "two-finger" || e.touches.length !== 2) return;
    e.preventDefault();
    const [t1, t2] = e.touches;
    const currentDistance = touchDistance(t1, t2);
    const currentMid = touchMidpoint(t1, t2);
    const ratio = currentDistance / Math.max(1, gesture.startDistance);
    const nextZoom = clamp(Number((gesture.startZoom * ratio).toFixed(3)), 0.2, 3);
    const nextPan = {
      x: gesture.startPan.x + (currentMid.x - gesture.startMid.x),
      y: gesture.startPan.y + (currentMid.y - gesture.startMid.y),
    };
    setZoom(nextZoom);
    setPanOffset(nextPan);
  }

  function onBoardWheel(e) {
    // Zoom din rotița mouse-ului numai când cursorul este peste tablă.
    // Nu afectează inputurile / meniurile din topbar.
    if (!boardWrapRef.current) return;
    e.preventDefault();

    const direction = e.deltaY < 0 ? 1 : -1;
    const step = e.ctrlKey ? 0.05 : 0.1;
    setZoom(z => clamp(Number((z + direction * step).toFixed(2)), 0.2, 3));
  }

  function onBoardTouchEnd(e) {
    if (e.touches.length < 2) {
      touchGestureRef.current = null;
    }
  }

  function onHistoryPointerUp() {
    setHistoryDragging(null);
    setHistoryResizing(null);
  }

  function onDicePanelPointerUp() {
    setDicePanelDragging(null);
    setDicePanelResizing(null);
  }

  return (
    <div className={`app ${touchMode ? "touch-mode" : ""} ${lockUI ? "locked-ui" : ""}`}>
      <div className="topbar">
        <strong>Football Board Sandbox <span>Multiplayer 0.3.1</span></strong>
        <div className="authbox">
          {!authReady ? (
            <span>Auth...</span>
          ) : user ? (
            <>
              <span className="user-email">{user.email}</span>
              <span className={`cloud-pill ${cloudError ? "cloud-error" : ""}`}>{cloudStatus}</span>
              <button onClick={() => saveCloudState({}, "Cloud saved")}>Cloud Save</button>
              <button onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <span className="cloud-pill">Local</span>
              <button onClick={loginWithGoogle}>Login Google</button>
            </>
          )}
        </div>

        <div className={`sessionbox ${sessionCode ? "session-online" : ""}`}>
          {sessionCode ? (
            <>
              <span className="session-pill">ONLINE</span>
              <span className="session-code">Code: {sessionCode}</span>
              <span className="session-players">Players: {sessionPlayers || 1}/2</span>
              <span className="session-status">{sessionStatus}</span>
              <button onClick={leaveSession}>Leave</button>
            </>
          ) : (
            <>
              <button onClick={createSession}>Create Session</button>
              <input
                className="join-code"
                value={joinCode}
                maxLength={6}
                placeholder="CODE"
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
              />
              <button onClick={joinSession}>Join</button>
              <span className="session-status">{sessionStatus}</span>
            </>
          )}
        </div>

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
        <button className={touchMode ? "toggle-on" : ""} onClick={() => setTouchMode(v => !v)}>
          Touch {touchMode ? "ON" : "OFF"}
        </button>
        <button className={lockUI ? "toggle-on" : ""} onClick={() => { beforeLockViewRef.current = { zoom, panOffset }; setPanOffset({x:0,y:0}); setZoom(z=>Math.min(3, Number((z+0.2).toFixed(2)))); setLockUI(true); }}>
          Lock UI
        </button>
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

      </div>
      <div className="controlbar">
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

        <div className="situation-control">
          <span>Situație</span>
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

        <button className={historyVisible ? "toggle-on" : ""} onClick={() => setHistoryVisible(v => !v)}>
          History {historyVisible ? "ON" : "OFF"}
        </button>
        <button className={dicePanelVisible ? "toggle-on" : ""} onClick={() => setDicePanelVisible(v => !v)}>
          Zaruri {dicePanelVisible ? "ON" : "OFF"}
        </button>
      </div>

      <div
        className="board-wrap"
        ref={boardWrapRef}
        onPointerDown={startBoardPan}
        onPointerMove={moveBoardPan}
        onPointerUp={endBoardPan}
        onPointerCancel={endBoardPan}
        onWheel={onBoardWheel}
        onTouchStart={onBoardTouchStart}
        onTouchMove={onBoardTouchMove}
        onTouchEnd={onBoardTouchEnd}
        onTouchCancel={onBoardTouchEnd}
      >
        <div className="pitch-shell" style={pitchShellStyle}>
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
              <svg className="measure-svg" viewBox={`${-invisiblePaddingForSettings(settings)} ${-invisiblePaddingForSettings(settings)} ${settings.cols + invisiblePaddingForSettings(settings) * 2} ${settings.rows + invisiblePaddingForSettings(settings) * 2}`} preserveAspectRatio="none">
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

            <div className="goal left-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }}>
              {goalGrid("left")}
            </div>
            <div className="goal right-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }}>
              {goalGrid("right")}
            </div>

            <div className="penalty-dot penalty-dot-line" style={{ left: `calc(${leftPenaltyX} * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />
            <div className="penalty-dot penalty-dot-line" style={{ left: `calc(${rightPenaltyX} * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />

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
                data-coord={withBoardPosition(p, settings).coord}
                title={`${p.label} ${withBoardPosition(p, settings).coord}`}
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


      {lockUI && (
        <div className="locked-controls">
          <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
          <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
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
          <button onClick={() => { const saved = beforeLockViewRef.current; setLockUI(false); if (saved) { setZoom(saved.zoom); setPanOffset(saved.panOffset); } else { setZoom(0.8); setPanOffset({x:0,y:0}); } }}>Unlock</button>
        </div>
      )}

      {measureInfo && (
        <div className="measure-panel">
          Riglă: ΔX {measureInfo.dx} · ΔY {measureInfo.dy} · ortogonal {measureInfo.manhattan} · diagonal {measureInfo.chess} · drept {measureInfo.straight}
        </div>
      )}

      {historyVisible && !lockUI && (
      <div
        className="history-panel"
        style={{ left: historyPosition.x, top: historyPosition.y, width: historySize.w, height: historySize.h }}
        onPointerMove={(e) => {
          onHistoryPointerMove(e);
          onHistoryResizeMove(e);
        }}
        onPointerUp={onHistoryPointerUp}
        onPointerCancel={onHistoryPointerUp}
      >
        <div className="history-title" onPointerDown={onHistoryPointerDown}>
          <strong>History</strong>
          <div className="history-actions">
            <button onPointerDown={(e) => e.stopPropagation()} onClick={clearHistory}>Clear</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setHistoryVisible(false)}>_</button>
          </div>
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
        <div className="history-resize" onPointerDown={onHistoryResizeDown} />
      </div>
      )}

      {dicePanelVisible && !lockUI && (
        <div
          className="dice-panel"
          style={{ left: dicePanelPosition.x, top: dicePanelPosition.y, width: dicePanelSize.w, height: dicePanelSize.h }}
          onPointerMove={(e) => {
            onDicePanelPointerMove(e);
            onDicePanelResizeMove(e);
          }}
          onPointerUp={onDicePanelPointerUp}
          onPointerCancel={onDicePanelPointerUp}
        >
          <div className="dice-panel-title" onPointerDown={onDicePanelPointerDown}>
            <strong>Zaruri</strong>
            <div className="dice-actions">
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setDicePanelVisible(false)}>_</button>
            </div>
          </div>
          <div className="dice-panel-body">
            <div className="dice-box floating-dice-box">
              <Dices size={18} />
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
          <div className="dice-resize" onPointerDown={onDicePanelResizeDown} />
        </div>
      )}

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
