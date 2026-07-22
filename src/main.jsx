import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInAnonymously, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { RotateCcw, Plus, Minus, Undo2, Redo2, Edit3, X, Dices } from "lucide-react";
import { createGameState, mergeGameState } from "./game/gameState.mjs";
import { GAME_COMMAND_TYPE } from "./engine/gameCommands.mjs";
import { createMatchContext } from "./engine/matchContext.mjs";
import { dispatchSinglePlayerGameCommand, dispatchSinglePlayerGameCommandSequence, dispatchSinglePlayerMatchStart } from "./engine/singlePlayerController.mjs";
import { firstPlayerBlockingMovementPath } from "./engine/movementPathRules.mjs";
import { evaluateThreeTwoMove } from "./engine/threeTwoMoveRules.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./engine/groupMoveRules.mjs";
import {
  isBenchReservePiece,
  normalizeFormationPlayers,
  normalizeFormationSlots,
} from "./board/formationUtils.mjs";
import {
  buildBoardApi,
  clampBoardXForY,
  clampBoardY,
  fromCoord,
  goalTopForSettings,
  invisiblePaddingForSettings,
  normalizeGridPosition,
  normalizePiecesForBoard,
  toCoord,
} from "./board/boardGeometry.mjs";
import { diagonalCostForDistance, getMovementGeometry, normalizeMovementState } from "./board/movementState.mjs";
import { createDefaultScenarioSlots, normalizeScenarioSlots } from "./board/scenarioUtils.mjs";
import {
  createDefaultRuleSet,
  createRuleSet,
  findRuleSet,
  normalizeRuleSet,
  normalizeRuleSets,
} from "./rules/ruleSets.mjs";
import {
  PASS_CORNERS,
  applyInterceptorChoice,
  buildPassPlan,
  cardStat,
  interceptorChoiceCandidates,
  passRequiresInterceptionSequence,
  teamKeyForPiece,
} from "./rules/passEngine.mjs";
import { resolveInterception } from "./rules/interceptionEngine.mjs";
import { BoardCanvas } from "./board/BoardCanvas.jsx";
import { MatchBallIcon } from "./board/MatchBallIcon.jsx";
import { clamp } from "./game/numberUtils.mjs";
import { deriveInteractionState } from "./game/interactionState.mjs";
import {
  closeTimeline,
  commitTimelineEntry,
  createTimeline,
  moveTimelineCursor,
  normalizeTimeline,
  atomicTimelineTransactionId,
  redoAtomicTimelineTransaction,
  redoTimeline,
  timelineStateAt,
  undoAtomicTimelineTransaction,
  undoTimeline,
} from "./timeline/timelineEngine.mjs";
import {
  createMatchRecording,
  matchRecordingNeedsExport,
  readMatchRecording,
  referencedCardIdsForTimeline,
  selectRecordingCards,
} from "./timeline/matchRecording.mjs";
import { createAiAnalysisExport } from "./timeline/aiAnalysisExport.mjs";
import {
  CONTINUATION_RESUME_TYPE,
  CONTINUATION_STATUS,
  beginContinuationAction,
  completeContinuationAction,
  createBonusCardActionContinuation,
  endContinuationAction,
  normalizeActionContinuation,
} from "./match/actionContinuation.mjs";
import {
  ACTION_TRANSACTION_UNDO_MODE,
  atomicTransactionForTransition,
  createActionTransaction,
  transactionForActionState,
} from "./match/actionTransaction.mjs";
import {
  consumeActionEvent,
  createActionEventId,
  createPendingDecision,
  createPendingRoll,
  createRollEvent,
  withPendingDecision,
  withPendingRoll,
} from "./match/actionResolutionEngine.mjs";
import {
  canonicalDelayedResolutionContext,
  diagnoseCanonicalDelayedResolution,
  createDelayedResolution,
  delayedResolutionAtCursor,
  delayedResolutionRemaining,
  shouldScheduleCanonicalDelayedResolution,
} from "./match/delayedResolution.mjs";
import { createResolutionExecutionRegistry } from "./match/resolutionExecutionRegistry.mjs";
import {
  canAccessPrimaryToolbar,
  createSharedTimelineMeta,
  hydrateSessionTimeline,
  nullableFiniteNumber,
  normalizeSessionStatusLabel,
  shouldApplySessionBoardProjection,
  timelineReconciliationMode,
  timelineDiceRollId,
  shouldRollbackFailedTimelineCommit,
} from "./multiplayer/sessionTimeline.mjs";
import { createMultiplayerTraceId, createMultiplayerTracer } from "./multiplayer/debugTracer.mjs";
import { canControlBonusAction, validateBonusActionEndIntent } from "./multiplayer/bonusActionAuthority.mjs";
import { canControlResolution } from "./multiplayer/resolutionAuthority.mjs";
import {
  clearGroupMoveState,
  normalizeMatchActionState,
  normalizeTrackerSnapshot,
} from "./tracker/trackerState.mjs";
import {
  activateTrackerAction,
  canUseTrackerActionForPiece,
  canUseTrackerFreeModeForPiece,
  createEmptyTrackerTurnState,
  hasGroupMoveAuthorization,
  isTeamActiveForTrackerPhase,
  movementAuthorizationForPiece,
  nextTrackerPhase,
  opposingTeam,
  toggleFreeModeState,
  toggleTrackerActionMarker,
  trackerActionLimitForTeam,
  trackerActionStatusForTeam,
  trackerPhaseBlockReason,
  trackerRoleForTeam,
  trackerTurnChangeDecision,
} from "./tracker/actionRules.mjs";
import { HistoryPanel } from "./match/HistoryPanel.jsx";
import { TrackerPanel } from "./tracker/TrackerPanel.jsx";
import { CardPreview } from "./cards/CardPreview.jsx";
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
const storage = getStorage(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const CARD_EXPORT_WIDTH = 360;
const CARD_EXPORT_HEIGHT = 540;
const CARD_EXPORT_PIXEL_RATIO = 4;
const APP_VERSION = "v20.27.0";


const BASE_LAYOUT_STYLE_KEYS = {
  front: {
    header: { textStyles: ["headerFront"], textColors: ["headerFront"] },
    position: { textStyles: ["positionFront"], textColors: ["positionFront"] },
    attributes: { textStyles: [], textColors: [], copyFrontStarsStyle: true },
  },
  back: {
    header: { textStyles: ["headerBack"], textColors: ["headerBack"] },
    position: { textStyles: ["positionBack"], textColors: ["positionBack"] },
    attributes: { textStyles: ["attributes", "attributesValue", "attributesTitle"], textColors: ["attributes", "attributesValue", "attributesTitle"] },
    bonuses: { textStyles: ["bonuses", "bonusesValue", "bonusesTitle"], textColors: ["bonuses", "bonusesValue", "bonusesTitle"] },
    defensiveArea: { textStyles: ["defensiveArea", "defensiveAreaTitle", "defensiveAreaGoal"], textColors: ["defensiveArea", "defensiveAreaTitle", "defensiveAreaActive"], copyDefensiveGridAdjust: true },
    specialAbility: { textStyles: ["specialAbility", "specialAbilityTitle"], textColors: ["specialAbility", "specialAbilityTitle"] },
    preferredFoot: { textStyles: ["preferredFoot"], textColors: ["preferredFoot"] },
  },
};

function normalizeGameMode(value) { return value === "match" ? "match" : "editor"; }
function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function userStateV2Ref(uid) {
  return doc(db, "users", uid, "footballBoard", "mainStateV2");
}

function userCardsCollectionRef(uid) {
  return collection(db, "users", uid, "footballBoardCards");
}

function userCardRef(uid, cardId) {
  return doc(db, "users", uid, "footballBoardCards", String(cardId));
}

function sessionRef(code) {
  return doc(db, "sessions", String(code || "").toUpperCase());
}

function sessionCardsCollectionRef(code) {
  return collection(db, "sessions", String(code || "").toUpperCase(), "cards");
}

function sessionTimelineEntriesCollectionRef(code) {
  return collection(db, "sessions", String(code || "").toUpperCase(), "timelineEntries");
}
function sessionRuntimeCollectionRef(code) {
  return collection(db, "sessions", String(code || "").toUpperCase(), "runtime");
}

function sessionRuntimeRef(code, key) {
  return doc(sessionRuntimeCollectionRef(code), String(key || "state"));
}

function sessionCardRef(code, cardId) {
  return doc(db, "sessions", String(code || "").toUpperCase(), "cards", String(cardId));
}

function sessionTimelineEntryRef(code, recordingId, sequence) {
  const safeRecordingId = String(recordingId || "match").replace(/[^a-zA-Z0-9_-]/g, "_");
  return doc(sessionTimelineEntriesCollectionRef(code), `${safeRecordingId}_${String(sequence).padStart(6, "0")}`);
}

const SESSION_INACTIVITY_MS = 24 * 60 * 60 * 1000;

function nextSessionExpiryDate() {
  return new Date(Date.now() + SESSION_INACTIVITY_MS);
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSessionExpired(data) {
  const expiry = timestampToMillis(data?.expiresAt);
  if (expiry) return expiry <= Date.now();
  const lastActivity = timestampToMillis(data?.updatedAt) || timestampToMillis(data?.createdAt);
  return !!lastActivity && Date.now() - lastActivity >= SESSION_INACTIVITY_MS;
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
  "GK", "LWB", "LB", "CB", "RB", "RWB",
  "LW", "LM", "CDM", "CAM", "CM", "RM", "RW", "ST"
];

const CARD_POSITION_OPTIONS = [
  "GK", "LWB", "LB", "CB", "RB", "RWB", "LW", "LM", "CDM", "CAM", "CM", "RM", "RW", "ST"
];

const PREFERRED_FOOT_OPTIONS = ["Left", "Right", "Both"];

const TEAM_LAYOUT_POSITIONS = ["GK", "LWB", "LB", "CB", "RB", "RWB", "LM", "CDM", "CM", "CAM", "RM", "LW", "ST", "RW"];
const TEAM_SLOT_POSITIONS = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
const CARD_THEMES = ["Style 1", "Style 2", "Style 3", "Style 4", "Style 5", "Style 6", "Style 7"];
const CUSTOM_CARD_THEME = "Custom";

const DEFAULT_CARD_VISUAL_LAYOUT = {
  front: {
    header: { x: 12, y: 5, w: 62, h: 10 },
    position: { x: 76, y: 5, w: 12, h: 10 },
    attributes: { x: 12, y: 72, w: 34, h: 20 },
  },
  back: {
    header: { x: 12, y: 5, w: 62, h: 10 },
    position: { x: 76, y: 5, w: 12, h: 10 },
    attributes: { x: 12, y: 18, w: 34, h: 34 },
    bonuses: { x: 54, y: 18, w: 34, h: 34 },
    defensiveArea: { x: 12, y: 62, w: 38, h: 30 },
    specialAbility: { x: 54, y: 66, w: 34, h: 26 },
    preferredFoot: { x: 54, y: 72, w: 34, h: 20 },
  },
};

const ZONE_LABELS = {
  header: "Header",
  position: "Position",
  attributes: "Attributes",
  bonuses: "Bonuses",
  defensiveArea: "Defensive Area",
  specialAbility: "Special Ability",
  preferredFoot: "Preferred Foot",
};

function normalizeCardVisualLayout(layout) {
  const source = layout && typeof layout === "object" ? layout : {};
  const normalizeSide = (side) => {
    const defaults = DEFAULT_CARD_VISUAL_LAYOUT[side] || {};
    const current = source[side] && typeof source[side] === "object" ? source[side] : {};
    return Object.fromEntries(Object.entries(defaults).map(([key, box]) => {
      const migratedPreferredFoot = side === "back" && key === "preferredFoot"
        ? (source?.back?.preferredFoot || source?.front?.bonuses)
        : null;
      const raw = current[key] && typeof current[key] === "object" ? current[key] : (migratedPreferredFoot && typeof migratedPreferredFoot === "object" ? migratedPreferredFoot : {});
      return [key, {
        x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : box.x,
        y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : box.y,
        w: Number.isFinite(Number(raw.w)) ? Number(raw.w) : box.w,
        h: Number.isFinite(Number(raw.h)) ? Number(raw.h) : box.h,
      }];
    }));
  };
  return { front: normalizeSide("front"), back: normalizeSide("back") };
}


const CARD_TEXT_COLOR_DEFAULTS = {
  header: "#ffffff",
  headerFront: "#ffffff",
  positionFront: "#ffffff",
  headerBack: "#ffffff",
  positionBack: "#ffffff",
  preferredFoot: "#ffffff",
  attributes: "#ffffff",
  bonuses: "#ffffff",
  attributesValue: "#ffffff",
  bonusesValue: "#ffffff",
  attributesTitle: "#ffffff",
  bonusesTitle: "#ffffff",
  defensiveArea: "#ffffff",
  defensiveAreaTitle: "#ffffff",
  defensiveAreaActive: "#50be78",
  specialAbility: "#ffffff",
  specialAbilityTitle: "#ffffff",
};

const CARD_TEXT_STYLE_DEFAULTS = {
  headerFront: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  positionFront: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  headerBack: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  positionBack: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  preferredFoot: { align: "left", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  attributes: { align: "left", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  attributesValue: { align: "right", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  bonuses: { align: "left", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  bonusesValue: { align: "right", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  attributesTitle: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  bonusesTitle: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  defensiveAreaTitle: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, horizontalOffset: 0, statGap: 100 },
  defensiveAreaGoal: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, horizontalOffset: 0, statGap: 100 },
  specialAbilityTitle: { align: "center", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  specialAbility: { align: "center", bold: false, font: "Inter", fontSize: 100, lineHeight: 105, verticalOffset: 0, statGap: 100 },
  defensiveArea: { align: "center", bold: false, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, horizontalOffset: 0, statGap: 100 },
};

const CARD_FONT_OPTIONS = ["Inter", "Arial", "Verdana", "Tahoma", "Georgia", "Times New Roman", "Trebuchet MS", "Courier New"];

function normalizeTextStyles(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalizeOne = (key) => {
    const defaults = CARD_TEXT_STYLE_DEFAULTS[key] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
    const current = source[key] && typeof source[key] === "object" ? source[key] : {};
    const align = ["left", "center", "right"].includes(current.align) ? current.align : defaults.align;
    const font = CARD_FONT_OPTIONS.includes(current.font) ? current.font : defaults.font;
    return {
      align,
      bold: typeof current.bold === "boolean" ? current.bold : defaults.bold,
      font,
      fontSize: clamp(Number(current.fontSize ?? defaults.fontSize), 50, 260),
      lineHeight: clamp(Number(current.lineHeight ?? defaults.lineHeight), 70, 180),
      verticalOffset: clamp(
        Number(current.verticalOffset ?? defaults.verticalOffset ?? 0),
        (key === "attributes" || key === "bonuses") ? -200 : -100,
        (key === "attributes" || key === "bonuses") ? 200 : 100
      ),
      horizontalOffset: clamp(Number(current.horizontalOffset ?? defaults.horizontalOffset ?? 0), -100, 100),
      statGap: clamp(Number(current.statGap ?? defaults.statGap), 0, 300),
    };
  };
  return Object.fromEntries(Object.keys(CARD_TEXT_STYLE_DEFAULTS).map(key => [key, normalizeOne(key)]));
}

function cardTextStyles(card) {
  return normalizeTextStyles(card?.textStyles);
}

function zoneTextStyleVars(styles, key, hasStats = false) {
  const s = normalizeTextStyles(styles)[key] || CARD_TEXT_STYLE_DEFAULTS[key] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const justify = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  const gridJustify = s.align === "left" ? "start" : s.align === "right" ? "end" : "center";
  const yMultiplier = (key === "attributes" || key === "bonuses") ? 0.8 : 0.4;
  return {
    "--zone-align": s.align,
    "--zone-justify": justify,
    "--zone-grid-justify": gridJustify,
    "--zone-font-family": s.font,
    "--zone-font-weight": s.bold ? 950 : 650,
    "--zone-font-scale": s.fontSize / 100,
    "--zone-line-height": s.lineHeight / 100,
    "--zone-y-offset": `${s.verticalOffset * yMultiplier}cqh`,
    ...(hasStats ? { "--zone-stat-gap": `${Math.round(s.statGap / 100 * 4)}px`, "--zone-stat-gap-wide": `${Math.round(s.statGap / 100 * 8)}px` } : {}),
  };
}

function opponentGoalStyleVars(styles) {
  const s = normalizeTextStyles(styles).defensiveAreaGoal || CARD_TEXT_STYLE_DEFAULTS.defensiveAreaGoal;
  return {
    "--goal-font-family": s.font,
    "--goal-font-weight": s.bold ? 950 : 650,
    "--goal-font-scale": s.fontSize / 100,
    "--goal-x-offset": `${s.horizontalOffset * 0.42}cqw`,
    "--goal-y-offset": `${s.verticalOffset * 0.28}cqh`,
  };
}

function zonePairDistanceVars(styles, key, metrics = {}) {
  const s = normalizeTextStyles(styles)[key] || CARD_TEXT_STYLE_DEFAULTS[key] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const normalizedDistance = clamp(Number(s.statGap ?? 300), 0, 300);
  const shiftPercent = Math.max(0, Math.min(1, (300 - normalizedDistance) / 300));
  const longestLabelChars = clamp(Number(metrics.longestLabelChars ?? 0), 0, 80);
  const maxValueChars = clamp(Number(metrics.maxValueChars ?? 2), 1, 8);
  return {
    // Distance moves the Numbers column as one compact right-aligned block.
    // The closest point is capped by the longest visible label in this zone, so
    // numbers cannot cross into the text when custom/long stats are added.
    "--zone-stat-gap": "0px",
    "--zone-stat-gap-wide": "0px",
    "--zone-distance-shift-raw": `${(shiftPercent * 28).toFixed(2)}cqw`,
    "--zone-longest-label-ch": longestLabelChars,
    "--zone-number-ch": maxValueChars,
  };
}


function zoneTextStyleVarsStable(styles, key, hasStats = false) {
  const s = normalizeTextStyles(styles)[key] || CARD_TEXT_STYLE_DEFAULTS[key] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const justify = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  const gridJustify = s.align === "left" ? "start" : s.align === "right" ? "end" : "center";
  const yMultiplier = (key === "attributes" || key === "bonuses") ? 0.56 : 0.14;
  return {
    "--zone-align": s.align,
    "--zone-justify": justify,
    "--zone-grid-justify": gridJustify,
    "--zone-font-family": s.font,
    "--zone-font-weight": s.bold ? 950 : 650,
    "--zone-font-scale": s.fontSize / 100,
    "--zone-line-height": s.lineHeight / 100,
    "--zone-y-offset": `${s.verticalOffset * yMultiplier}px`,
    ...(hasStats ? { "--zone-stat-gap": `${Math.round(s.statGap / 100 * 4)}px`, "--zone-stat-gap-wide": `${Math.round(s.statGap / 100 * 8)}px` } : {}),
  };
}

function zoneNumberStyleVarsStable(styles, textKey, numberKey) {
  const normalized = normalizeTextStyles(styles);
  const base = normalized[textKey] || CARD_TEXT_STYLE_DEFAULTS[textKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const number = normalized[numberKey] || CARD_TEXT_STYLE_DEFAULTS[numberKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const defaultNumber = CARD_TEXT_STYLE_DEFAULTS[numberKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const font = number.font && number.font !== defaultNumber.font ? number.font : base.font;
  const numberSizeOffset = (number.fontSize - 100) / 100;
  const baseScale = Math.max(0.1, base.fontSize / 100);
  const finalScale = Math.max(0.1, baseScale + numberSizeOffset);
  const relativeNumberScale = finalScale / baseScale;
  return {
    "--zone-number-font-family": font,
    "--zone-number-font-weight": (base.bold || number.bold) ? 950 : 650,
    "--zone-number-font-scale": relativeNumberScale,
  };
}

function zonePairDistanceVarsStable(styles, key, metrics = {}) {
  const s = normalizeTextStyles(styles)[key] || CARD_TEXT_STYLE_DEFAULTS[key] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const normalizedDistance = clamp(Number(s.statGap ?? 300), 0, 300);
  const gapPx = Math.round((normalizedDistance / 300) * 10);
  return {
    "--zone-stat-gap": `${gapPx}px`,
    "--zone-stat-gap-wide": `${gapPx}px`,
    "--zone-distance-shift-raw": "0px",
    "--zone-longest-label-ch": clamp(Number(metrics.longestLabelChars ?? 0), 0, 80),
    "--zone-number-ch": clamp(Number(metrics.maxValueChars ?? 2), 1, 8),
  };
}

function opponentGoalStyleVarsStable(styles) {
  const s = normalizeTextStyles(styles).defensiveAreaGoal || CARD_TEXT_STYLE_DEFAULTS.defensiveAreaGoal;
  return {
    "--goal-font-family": s.font,
    "--goal-font-weight": s.bold ? 950 : 650,
    "--goal-font-scale": s.fontSize / 100,
    "--goal-x-offset": `${s.horizontalOffset * 0.12}px`,
    "--goal-y-offset": `${s.verticalOffset * 0.12}px`,
  };
}

function zoneNumberStyleVars(styles, textKey, numberKey) {
  const normalized = normalizeTextStyles(styles);
  const base = normalized[textKey] || CARD_TEXT_STYLE_DEFAULTS[textKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const number = normalized[numberKey] || CARD_TEXT_STYLE_DEFAULTS[numberKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const defaultNumber = CARD_TEXT_STYLE_DEFAULTS[numberKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const font = number.font && number.font !== defaultNumber.font ? number.font : base.font;
  const numberSizeOffset = (number.fontSize - 100) / 100;
  const baseScale = Math.max(0.1, base.fontSize / 100);
  const finalScale = Math.max(0.1, baseScale + numberSizeOffset);
  const relativeNumberScale = finalScale / baseScale;
  return {
    "--zone-number-font-family": font,
    "--zone-number-font-weight": (base.bold || number.bold) ? 950 : 650,
    "--zone-number-font-scale": relativeNumberScale,
  };
}


function StableTextStyleControls({ cardId, styleKey, stats = false, current, isOpen, onToggle, onPatch, onPreview, onPreviewEnd, panelAlign = "right", buttonLabel = "Text", titleMode = false, numbersMode = false, inlinePanel = false, hideLine = false, fontSizeMin = 50 }) {
  if (!cardId || !CARD_TEXT_STYLE_DEFAULTS[styleKey]) return null;

  const safeCurrent = current || CARD_TEXT_STYLE_DEFAULTS[styleKey] || CARD_TEXT_STYLE_DEFAULTS.headerFront;
  const [rangeDraft, setRangeDraft] = useState({});
  const activeRangeRef = useRef(null);

  useEffect(() => {
    if (!activeRangeRef.current) setRangeDraft({});
  }, [cardId, styleKey, safeCurrent.fontSize, safeCurrent.lineHeight, safeCurrent.verticalOffset, safeCurrent.statGap]);

  const stopPanelEvent = e => e.stopPropagation();
  const set = patch => { onPreviewEnd && onPreviewEnd(); onPatch && onPatch(patch); };
  const rangeValue = key => rangeDraft[key] ?? safeCurrent[key] ?? 0;

  const setRangeDraftValue = key => e => {
    const value = Number(e.currentTarget.value);
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPreview && onPreview({ [key]: value });
  };

  const commitRangeValue = (key, rawValue) => {
    const value = Number(rawValue);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPreviewEnd && onPreviewEnd();
    onPatch && onPatch({ [key]: value });
    onPreview && onPreview(null);
  };

  const beginRange = key => () => {
    activeRangeRef.current = key;
  };

  const finishRange = key => e => {
    commitRangeValue(key, e.currentTarget.value);
  };

  const keyRange = key => e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter"].includes(e.key)) {
      commitRangeValue(key, e.currentTarget.value);
    }
  };

  const clampRangeValue = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const nudgeRange = (key, min, max, step, direction) => {
    const value = clampRangeValue((Number(rangeValue(key)) || 0) + step * direction, min, max);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPreviewEnd && onPreviewEnd();
    onPatch && onPatch({ [key]: value });
    onPreview && onPreview(null);
  };

  const rangeSpec = key => {
    if (key === "verticalOffset") {
      if (styleKey === "headerBack" || styleKey === "positionBack") return { min: -35, max: 35, step: 0.5 };
      if (!numbersMode && (styleKey === "attributes" || styleKey === "bonuses")) return { min: -200, max: 200, step: 1 };
    }
    return null;
  };

  const renderRange = (label, key, min, max, suffix = "", step = 1) => {
    const spec = rangeSpec(key);
    const effectiveMin = spec?.min ?? min;
    const effectiveMax = spec?.max ?? max;
    const effectiveStep = spec?.step ?? step;
    return (
      <label className="text-style-range-row">
        <span className="text-style-range-label">{label}</span>
        <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, effectiveMin, effectiveMax, effectiveStep, -1)} aria-label={`${label} minus`}>−</button>
        <input type="range" min={effectiveMin} max={effectiveMax} step={effectiveStep} value={rangeValue(key)} onPointerDown={beginRange(key)} onInput={setRangeDraftValue(key)} onPointerUp={finishRange(key)} onPointerCancel={finishRange(key)} onMouseUp={finishRange(key)} onTouchEnd={finishRange(key)} onBlur={finishRange(key)} onKeyUp={keyRange(key)} />
        <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, effectiveMin, effectiveMax, effectiveStep, 1)} aria-label={`${label} plus`}>+</button>
        <span className="text-style-range-value">{rangeValue(key)}{suffix}</span>
      </label>
    );
  };

  return (
    <div className={`text-style-controls align-${panelAlign} ${numbersMode ? "numbers-mode" : ""} ${inlinePanel ? "inline-panel" : ""} ${isOpen ? "open" : ""}`} onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
      <button type="button" className={`text-style-toggle ${isOpen ? "active" : ""}`} aria-expanded={isOpen} onClick={onToggle}>{buttonLabel}</button>
      {isOpen ? (
        <div className="text-style-panel" onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
          {!numbersMode ? (
            <div className="text-align-buttons" aria-label="Text align">
              <button type="button" className={safeCurrent.align === "left" ? "selected" : ""} onClick={() => set({ align: "left" })}>L</button>
              <button type="button" className={safeCurrent.align === "center" ? "selected" : ""} onClick={() => set({ align: "center" })}>C</button>
              <button type="button" className={safeCurrent.align === "right" ? "selected" : ""} onClick={() => set({ align: "right" })}>R</button>
              <button type="button" className={safeCurrent.bold ? "selected" : ""} onClick={() => set({ bold: !safeCurrent.bold })}>B</button>
            </div>
          ) : (
            <div className="text-align-buttons numbers-bold-only" aria-label="Numbers style">
              <button type="button" className={safeCurrent.bold ? "selected" : ""} onClick={() => set({ bold: !safeCurrent.bold })}>B</button>
            </div>
          )}
          {!titleMode && !numbersMode ? <label>Font<select value={safeCurrent.font} onChange={e => set({ font: e.target.value })}>{CARD_FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}</select></label> : null}
          {renderRange("Size", "fontSize", fontSizeMin, 260, "%")}
          {!titleMode && !numbersMode && !hideLine ? renderRange("Line", "lineHeight", 70, 180, "%") : null}
          {!titleMode && !numbersMode ? renderRange("Y", "verticalOffset", -100, 100, "") : null}
        </div>
      ) : null}
    </div>
  );
}


function hexToRgbParts(value) {
  const clean = safeColor(value, "#ffffff").slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbPartsToHex(r, g, b) {
  const toHex = n => clamp(Math.round(Number(n) || 0), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgbParts(h, s, v) {
  h = ((Number(h) || 0) % 360 + 360) % 360;
  s = clamp(Number(s) || 0, 0, 1);
  v = clamp(Number(v) || 0, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function StableColorPicker({ current, label, isOpen, onToggle, onChange, onKeepOpen }) {
  const stopPanelEvent = e => e.stopPropagation();
  const safeCurrent = safeColor(current);
  const [draftColor, setDraftColor] = useState(safeCurrent);
  const activeDragRef = useRef(null);
  const draftColorRef = useRef(safeCurrent);
  const rafRef = useRef(null);
  const pendingCommitRef = useRef(null);
  const capturedTargetRef = useRef(null);
  const capturedPointerIdRef = useRef(null);
  const svRef = useRef(null);
  const hueRef = useRef(null);

  useEffect(() => {
    if (!activeDragRef.current) {
      const next = safeColor(current);
      setDraftColor(next);
      draftColorRef.current = next;
    }
  }, [current, isOpen]);

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  }, []);

  const safeDraft = safeColor(draftColor, safeCurrent);
  const hsv = useMemo(() => rgbToHsv(hexToRgbParts(safeDraft)), [safeDraft]);
  const rgb = useMemo(() => hexToRgbParts(safeDraft), [safeDraft]);

  const setDraft = value => {
    const next = safeColor(value, draftColorRef.current || safeCurrent);
    draftColorRef.current = next;
    setDraftColor(next);
    return next;
  };

  const scheduleChange = value => {
    const next = setDraft(value);
    pendingCommitRef.current = next;
    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingCommitRef.current;
        pendingCommitRef.current = null;
        if (pending) onChange && onChange(pending);
      });
    }
    return next;
  };

  const flushScheduledChange = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (pending) onChange && onChange(pending);
  };

  const commitColor = value => {
    const next = setDraft(value);
    onChange && onChange(next);
    // Re-assert the same open panel after React updates the card state.
    // This prevents the color panel from collapsing right after a selection.
    window.setTimeout(() => onKeepOpen && onKeepOpen(), 0);
  };

  const hsvToHex = patch => {
    const base = rgbToHsv(hexToRgbParts(draftColorRef.current || safeDraft));
    const nextHsv = { ...base, ...patch };
    const nextRgb = hsvToRgbParts(nextHsv.h, nextHsv.s, nextHsv.v);
    return rgbPartsToHex(nextRgb.r, nextRgb.g, nextRgb.b);
  };

  const colorFromSaturationValueEvent = e => {
    if (!svRef.current) return draftColorRef.current || safeDraft;
    const rect = svRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    return hsvToHex({ s: x, v: 1 - y });
  };

  const colorFromHueEvent = e => {
    if (!hueRef.current) return draftColorRef.current || safeDraft;
    const rect = hueRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    return hsvToHex({ h: Math.round(x * 359) });
  };

  const capturePointer = e => {
    capturedTargetRef.current = e.currentTarget;
    capturedPointerIdRef.current = e.pointerId;
    try {
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const releasePointer = e => {
    const target = capturedTargetRef.current || e.currentTarget;
    const pointerId = capturedPointerIdRef.current ?? e.pointerId;
    try {
      if (target?.releasePointerCapture && target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {}
    capturedTargetRef.current = null;
    capturedPointerIdRef.current = null;
  };

  const beginDrag = picker => e => {
    e.preventDefault();
    e.stopPropagation();
    activeDragRef.current = picker;
    capturePointer(e);
    scheduleChange(picker === "sv" ? colorFromSaturationValueEvent(e) : colorFromHueEvent(e));
  };

  const drag = picker => e => {
    if (activeDragRef.current !== picker) return;
    e.preventDefault();
    e.stopPropagation();
    scheduleChange(picker === "sv" ? colorFromSaturationValueEvent(e) : colorFromHueEvent(e));
  };

  const finishDrag = picker => e => {
    if (activeDragRef.current !== picker) return;
    e.preventDefault();
    e.stopPropagation();
    scheduleChange(picker === "sv" ? colorFromSaturationValueEvent(e) : colorFromHueEvent(e));
    flushScheduledChange();
    activeDragRef.current = null;
    releasePointer(e);
    window.setTimeout(() => onKeepOpen && onKeepOpen(), 0);
  };

  const cancelDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    flushScheduledChange();
    activeDragRef.current = null;
    releasePointer(e);
    window.setTimeout(() => onKeepOpen && onKeepOpen(), 0);
  };

  const setRgbChannel = key => e => {
    const value = clamp(Number(e.currentTarget.value) || 0, 0, 255);
    const next = { ...rgb, [key]: value };
    commitColor(rgbPartsToHex(next.r, next.g, next.b));
  };

  return (
    <div className={`stable-color-picker ${isOpen ? "open" : ""}`} onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
      <button type="button" className={`color-picker-toggle ${isOpen ? "active" : ""}`} title={`${label} color`} aria-expanded={isOpen} onClick={onToggle}>
        <span className="color-current" style={{ background: safeDraft }} /> <em>{label}</em>
      </button>
      {isOpen ? (
        <div className="color-panel custom-color-panel" onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
          <div
            ref={svRef}
            className="color-sv-plane"
            style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            onPointerDown={beginDrag("sv")}
            onPointerMove={drag("sv")}
            onPointerUp={finishDrag("sv")}
            onPointerCancel={cancelDrag}
            role="slider"
            aria-label={`${label} saturation and brightness`}
          >
            <span className="color-sv-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
          <div
            ref={hueRef}
            className="color-hue-bar"
            onPointerDown={beginDrag("hue")}
            onPointerMove={drag("hue")}
            onPointerUp={finishDrag("hue")}
            onPointerCancel={cancelDrag}
            role="slider"
            aria-label={`${label} hue`}
          >
            <span className="color-hue-cursor" style={{ left: `${(hsv.h / 359) * 100}%` }} />
          </div>
          <div className="color-rgb-row">
            <label><span>R</span><input type="number" min="0" max="255" value={rgb.r} onChange={setRgbChannel("r")} /></label>
            <label><span>G</span><input type="number" min="0" max="255" value={rgb.g} onChange={setRgbChannel("g")} /></label>
            <label><span>B</span><input type="number" min="0" max="255" value={rgb.b} onChange={setRgbChannel("b")} /></label>
          </div>
          <div className="color-swatch-grid">
            {COLOR_SWATCHES.map(color => (
              <button
                type="button"
                key={color}
                className={safeDraft.toLowerCase() === color.toLowerCase() ? "selected" : ""}
                style={{ background: color }}
                onClick={() => commitColor(color)}
                title={color}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StableOpponentGoalTextControl({ cardId, current, isOpen, onToggle, onPatch, onPreview }) {
  if (!cardId) return null;
  const safeCurrent = current || CARD_TEXT_STYLE_DEFAULTS.defensiveAreaGoal;
  const [rangeDraft, setRangeDraft] = useState({});
  const activeRangeRef = useRef(null);

  useEffect(() => {
    if (!activeRangeRef.current) setRangeDraft({});
  }, [cardId, safeCurrent.fontSize, safeCurrent.verticalOffset, safeCurrent.horizontalOffset]);

  const stopPanelEvent = e => e.stopPropagation();
  const clampTextValue = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const rangeValue = key => rangeDraft[key] ?? safeCurrent[key] ?? 0;

  const setDirect = patch => {
    activeRangeRef.current = null;
    setRangeDraft({});
    onPatch && onPatch(patch);
  };

  const setRangeDraftValue = key => e => {
    const value = Number(e.currentTarget.value);
    const nextDraft = { ...rangeDraft, [key]: value };
    setRangeDraft(nextDraft);
    onPreview && onPreview({ ...safeCurrent, ...nextDraft });
  };

  const commitRangeValue = (key, rawValue, min, max) => {
    const value = clampTextValue(rawValue, min, max);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPatch && onPatch({ [key]: value });
  };

  const beginRange = key => () => {
    activeRangeRef.current = key;
  };

  const finishRange = (key, min, max) => e => {
    commitRangeValue(key, e.currentTarget.value, min, max);
  };

  const nudgeRange = (key, min, max, direction) => {
    const value = clampTextValue((Number(rangeValue(key)) || 0) + direction, min, max);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPatch && onPatch({ [key]: value });
  };

  const keyRange = (key, min, max) => e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter"].includes(e.key)) {
      commitRangeValue(key, e.currentTarget.value, min, max);
    }
  };

  const slider = (label, key, min, max, suffix = "") => (
    <label className="text-style-range-row grid-adjust-range-row" key={key}>
      <span className="text-style-range-label">{label}</span>
      <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, min, max, -1)} aria-label={`${label} minus`}>−</button>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={rangeValue(key)}
        onPointerDown={beginRange(key)}
        onInput={setRangeDraftValue(key)}
        onPointerUp={finishRange(key, min, max)}
        onPointerCancel={finishRange(key, min, max)}
        onMouseUp={finishRange(key, min, max)}
        onTouchEnd={finishRange(key, min, max)}
        onBlur={finishRange(key, min, max)}
        onKeyUp={keyRange(key, min, max)}
      />
      <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, min, max, 1)} aria-label={`${label} plus`}>+</button>
      <span className="text-style-range-value">{rangeValue(key)}{suffix}</span>
    </label>
  );

  return (
    <div className={`grid-adjust-control opponent-goal-text-control ${isOpen ? "open" : ""}`} onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
      <button type="button" className={`text-style-toggle grid-adjust-toggle ${isOpen ? "active" : ""}`} aria-expanded={isOpen} onClick={onToggle}>Text</button>
      {isOpen ? (
        <div className="text-style-panel grid-adjust-panel opponent-goal-text-panel" onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
          <div className="text-align-buttons" aria-label="Opponent goal text style">
            <button type="button" className={safeCurrent.bold ? "selected" : ""} onClick={() => setDirect({ bold: !safeCurrent.bold })}>B</button>
          </div>
          <label>Font<select value={safeCurrent.font} onChange={e => setDirect({ font: e.target.value })}>{CARD_FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
          {slider("Size", "fontSize", 50, 260, "%")}
          {slider("Y", "verticalOffset", -100, 100, "")}
          {slider("X", "horizontalOffset", -100, 100, "")}
        </div>
      ) : null}
    </div>
  );
}

function StableDefensiveGridAdjustControl({ cardId, current, isOpen, onToggle, onPatch, onPreview }) {
  if (!cardId) return null;
  const safeCurrent = current || DEFENSIVE_GRID_ADJUST_DEFAULTS;
  const [rangeDraft, setRangeDraft] = useState({});
  const activeRangeRef = useRef(null);

  useEffect(() => {
    if (!activeRangeRef.current) setRangeDraft({});
  }, [cardId, safeCurrent.width, safeCurrent.height, safeCurrent.offsetX, safeCurrent.offsetY]);

  const stopPanelEvent = e => e.stopPropagation();
  const clampGridValue = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const rangeValue = key => rangeDraft[key] ?? safeCurrent[key] ?? 0;

  // Important: while dragging, keep the slider controlled only by local draft state.
  // Do not update the full card state on every input event; that re-renders the editor
  // and breaks pointer capture, so the range behaves like click-only. Commit on release.
  const setRangeDraftValue = key => e => {
    const value = Number(e.currentTarget.value);
    const nextDraft = { ...rangeDraft, [key]: value };
    setRangeDraft(nextDraft);
    onPreview && onPreview({ ...safeCurrent, ...nextDraft });
  };

  const commitRangeValue = (key, rawValue, min, max) => {
    const value = clampGridValue(rawValue, min, max);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPatch && onPatch({ [key]: value });
  };

  const beginRange = key => () => {
    activeRangeRef.current = key;
  };

  const finishRange = (key, min, max) => e => {
    commitRangeValue(key, e.currentTarget.value, min, max);
  };

  const nudgeRange = (key, min, max, direction) => {
    const value = clampGridValue((Number(rangeValue(key)) || 0) + direction, min, max);
    activeRangeRef.current = null;
    setRangeDraft(prev => ({ ...prev, [key]: value }));
    onPatch && onPatch({ [key]: value });
  };

  const keyRange = (key, min, max) => e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter"].includes(e.key)) {
      commitRangeValue(key, e.currentTarget.value, min, max);
    }
  };

  const slider = (label, key, min, max) => (
    <label className="text-style-range-row grid-adjust-range-row" key={key}>
      <span className="text-style-range-label">{label}</span>
      <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, min, max, -1)} aria-label={`${label} minus`}>−</button>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={rangeValue(key)}
        onPointerDown={beginRange(key)}
        onInput={setRangeDraftValue(key)}
        onChange={setRangeDraftValue(key)}
        onPointerUp={finishRange(key, min, max)}
        onPointerCancel={finishRange(key, min, max)}
        onMouseUp={finishRange(key, min, max)}
        onTouchEnd={finishRange(key, min, max)}
        onBlur={finishRange(key, min, max)}
        onKeyUp={keyRange(key, min, max)}
      />
      <button type="button" className="text-style-range-step" onClick={() => nudgeRange(key, min, max, 1)} aria-label={`${label} plus`}>+</button>
      <span className="text-style-range-value">{rangeValue(key)}</span>
    </label>
  );

  return (
    <div className={`text-style-controls grid-adjust-control align-left ${isOpen ? "open" : ""}`} onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
      <button type="button" className={`text-style-toggle grid-adjust-toggle ${isOpen ? "active" : ""}`} aria-expanded={isOpen} onClick={onToggle}>Adjust Grid</button>
      {isOpen ? (
        <div className="text-style-panel grid-adjust-panel" onPointerDown={stopPanelEvent} onMouseDown={stopPanelEvent} onClick={stopPanelEvent}>
          {slider("Width", "width", 40, 220)}
          {slider("Height", "height", 40, 220)}
          {slider("Move X", "offsetX", -80, 80)}
          {slider("Move Y", "offsetY", -80, 80)}
        </div>
      ) : null}
    </div>
  );
}

const CARD_LAYOUT_TITLE_DEFAULTS = {
  attributes: "Attributes",
  bonuses: "Bonuses",
  defensiveArea: "Defensive Area",
  specialAbility: "Special Ability",
};

function cardLayoutTitle(card, key) {
  const titles = card?.layoutTitles && typeof card.layoutTitles === "object" ? card.layoutTitles : {};
  return String(titles[key] ?? CARD_LAYOUT_TITLE_DEFAULTS[key] ?? "");
}

function makeCustomZone(side = "front", index = 1) {
  const safeSide = side === "back" ? "back" : "front";
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    side: safeSide,
    name: safeSide === "front" ? `Front Layout ${index}` : `Back Layout ${index}`,
    box: safeSide === "front"
      ? { x: 14, y: 58, w: 34, h: 14 }
      : { x: 14, y: 54, w: 34, h: 18 },
  };
}

function normalizeCustomTextStyle(style = {}, titleMode = false) {
  const source = style && typeof style === "object" ? style : {};
  return {
    align: ["left", "center", "right"].includes(source.align) ? source.align : "center",
    bold: typeof source.bold === "boolean" ? source.bold : !!titleMode,
    fontSize: clamp(Number(source.fontSize ?? 100), 50, 260),
    lineHeight: titleMode ? 100 : clamp(Number(source.lineHeight ?? 105), 70, 180),
    verticalOffset: titleMode ? 0 : clamp(Number(source.verticalOffset ?? 0), -100, 100),
  };
}

function customTextStyleVars(style = {}, titleMode = false) {
  const s = normalizeCustomTextStyle(style, titleMode);
  const justify = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  return {
    "--zone-align": s.align,
    "--zone-justify": justify,
    "--zone-font-weight": s.bold ? 950 : 650,
    "--zone-font-scale": s.fontSize / 100,
    "--zone-line-height": s.lineHeight / 100,
    "--zone-y-offset": `${s.verticalOffset * 0.4}cqh`,
  };
}

function normalizeCustomZone(raw, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const side = source.side === "back" ? "back" : "front";
  const fallback = makeCustomZone(side, index + 1);
  const rawBox = source.box && typeof source.box === "object" ? source.box : source;
  const box = {
    x: clamp(Number(rawBox.x ?? fallback.box.x), 0, 100),
    y: clamp(Number(rawBox.y ?? fallback.box.y), 0, 100),
    w: clamp(Number(rawBox.w ?? rawBox.width ?? fallback.box.w), 4, 100),
    h: clamp(Number(rawBox.h ?? rawBox.height ?? fallback.box.h), 4, 100),
  };
  box.w = Math.min(box.w, 100 - box.x);
  box.h = Math.min(box.h, 100 - box.y);
  return {
    id: String(source.id || fallback.id),
    side,
    name: String(source.name ?? source.title ?? fallback.name),
    box,
  };
}

function normalizeCustomZones(card) {
  return Array.isArray(card?.customZones) ? card.customZones.map((zone, index) => normalizeCustomZone(zone, index)) : [];
}


const COLOR_SWATCHES = ["#ffffff", "#f8fafc", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#38bdf8", "#3b82f6", "#8b5cf6", "#ec4899"];
const CARD_FRONT_FIELDS = ["DEF", "ATT"];
const LEGACY_THEME_MAP = {
  "Realistic": "Style 1",
  "GOALS Style": "Style 2",
  "Fortnite Style": "Style 3",
  "Anime Style": "Style 4",
  "Comic Style": "Style 5",
  "Minimal": "Style 6",
};

function normalizeStatItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item?.id || `stat_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(item?.name ?? item?.label ?? "New"),
    value: cleanTwoDigitValue(item?.value ?? 0),
    showOnCard: item?.showOnCard === false ? false : true,
  }));
}

function defaultAttributesForPosition(position, section) {
  const isGk = position === "GK";
  const names = section === "passive"
    ? (isGk ? ["Reflexes", "Diving Saves", "GK Penalty"] : ["Speed", "1vs1 Defending", "Aerial", "Passing", "Ball Control"])
    : (isGk ? ["Long Pass", "Cross Claiming", "Penalty"] : ["Tackling", "Interception", "Long Pass", "Crossing", "Dribbling", "Accuracy", "Long Shot", "Finishing", "Heading", "Penalty"]);
  return names.map((name, index) => ({ id: `${section}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`, name, value: 10, showOnCard: true }));
}

function emptyDefensiveArea() {
  return [];
}

const DEFENSIVE_GRID_ADJUST_DEFAULTS = { width: 100, height: 100, offsetX: 0, offsetY: 0 };

function normalizeDefensiveGridAdjust(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    width: clamp(Number(source.width ?? DEFENSIVE_GRID_ADJUST_DEFAULTS.width) || DEFENSIVE_GRID_ADJUST_DEFAULTS.width, 40, 220),
    height: clamp(Number(source.height ?? DEFENSIVE_GRID_ADJUST_DEFAULTS.height) || DEFENSIVE_GRID_ADJUST_DEFAULTS.height, 40, 220),
    offsetX: clamp(Number(source.offsetX ?? DEFENSIVE_GRID_ADJUST_DEFAULTS.offsetX) || 0, -80, 80),
    offsetY: clamp(Number(source.offsetY ?? DEFENSIVE_GRID_ADJUST_DEFAULTS.offsetY) || 0, -80, 80),
  };
}

function hasCustomGraphics(card) {
  return Boolean(card?.graphics?.frontDataUrl || card?.graphics?.backDataUrl);
}


function isInlineImageDataUrl(value) {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function isCorsSafeExportImageSrc(value) {
  if (isInlineImageDataUrl(value)) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return (
      url.hostname === "football-board-sandbox.firebasestorage.app" ||
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app") ||
      url.hostname.endsWith(".googleapis.com")
    );
  } catch {
    return false;
  }
}

function deepStripInlineImageDataUrls(value) {
  if (isInlineImageDataUrl(value)) return "";
  if (Array.isArray(value)) return value.map(item => deepStripInlineImageDataUrls(item));
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value;
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (item !== undefined && typeof item !== "function") {
        acc[key] = deepStripInlineImageDataUrls(item);
      }
      return acc;
    }, {});
  }
  return value;
}

function stripInlineGraphicsFromCardState(state) {
  if (!state || !Array.isArray(state.cards)) return state;
  return deepStripInlineImageDataUrls(state);
}

function stripInlineImagesFromCloudState(state) {
  return deepStripInlineImageDataUrls(state);
}

function getCardTheme(card, fallback = "Style 1") {
  if (hasCustomGraphics(card)) return CUSTOM_CARD_THEME;
  return CARD_THEMES.includes(card?.theme) ? card.theme : (CARD_THEMES.includes(fallback) ? fallback : "Style 1");
}
const FRONT_STAR_DEFAULTS = { count: 2, size: 22, spacing: 4, x: 0, y: 0 };

function normalizeFrontStars(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    count: clamp(Math.round(Number(raw.count ?? FRONT_STAR_DEFAULTS.count)) || 0, 0, 10),
    size: clamp(Number(raw.size ?? FRONT_STAR_DEFAULTS.size) || FRONT_STAR_DEFAULTS.size, 4, 80),
    spacing: clamp(Number(raw.spacing ?? FRONT_STAR_DEFAULTS.spacing) || 0, 0, 80),
    x: clamp(Number(raw.x ?? FRONT_STAR_DEFAULTS.x) || 0, -120, 120),
    y: clamp(Number(raw.y ?? FRONT_STAR_DEFAULTS.y) || 0, -120, 120),
  };
}



const GLOBAL_BACK_STAT_SECTIONS = ["passiveAttributes", "bonuses"];
const GLOBAL_BACK_STYLE_KEYS = new Set(["attributes", "attributesValue", "attributesTitle", "bonuses", "bonusesValue", "bonusesTitle"]);
const GLOBAL_BACK_TITLE_KEYS = new Set(["attributes", "bonuses"]);

function normalizedStatName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function makeGlobalStatId(section, name, index = 0) {
  const slug = normalizedStatName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `stat-${index + 1}`;
  return `stat:${slug}`;
}

function statDefinitionsFromCard(card, section) {
  return normalizeStatItems(card?.[section] || []).map((item, index) => ({
    id: makeGlobalStatId(section, item.name, index),
    name: String(item.name || "New"),
  }));
}

function sameStatStructure(card, definitions, section) {
  const list = normalizeStatItems(card?.[section] || []);
  return list.length === definitions.length && list.every((item, index) => normalizedStatName(item.name) === normalizedStatName(definitions[index]?.name));
}


function extractGlobalBackPresentation(card) {
  const colors = normalizeTextColors(card?.textColors);
  const styles = normalizeTextStyles(card?.textStyles);
  const layout = normalizeCardVisualLayout(card?.visualLayout || card?.layout);
  const titles = { ...CARD_LAYOUT_TITLE_DEFAULTS, ...(card?.layoutTitles || {}) };
  return {
    textColors: Object.fromEntries([...GLOBAL_BACK_STYLE_KEYS].map(key => [key, colors[key]])),
    textStyles: Object.fromEntries([...GLOBAL_BACK_STYLE_KEYS].map(key => [key, styles[key]])),
    layoutTitles: Object.fromEntries([...GLOBAL_BACK_TITLE_KEYS].map(key => [key, titles[key]])),
    visualLayout: {
      attributes: clonePlain(layout.back.attributes),
      bonuses: clonePlain(layout.back.bonuses),
    },
  };
}

function sameGlobalBackPresentation(card, presentation) {
  return JSON.stringify(extractGlobalBackPresentation(card)) === JSON.stringify(presentation);
}

function applyGlobalBackPresentation(card, presentation) {
  if (!presentation) return card;
  const currentLayout = normalizeCardVisualLayout(card?.visualLayout || card?.layout);
  return {
    ...card,
    textColors: { ...normalizeTextColors(card?.textColors), ...(presentation.textColors || {}) },
    textStyles: { ...normalizeTextStyles(card?.textStyles), ...(presentation.textStyles || {}) },
    layoutTitles: { ...CARD_LAYOUT_TITLE_DEFAULTS, ...(card?.layoutTitles || {}), ...(presentation.layoutTitles || {}) },
    visualLayout: {
      ...currentLayout,
      back: {
        ...currentLayout.back,
        attributes: clonePlain(presentation.visualLayout?.attributes || currentLayout.back.attributes),
        bonuses: clonePlain(presentation.visualLayout?.bonuses || currentLayout.back.bonuses),
      },
    },
  };
}

function deriveBackStatsSchema(cards = [], rawSchema = null) {
  if (rawSchema && rawSchema.version === 1 && ((rawSchema.passiveAttributes || []).length || (rawSchema.bonuses || []).length || cards.length === 0)) {
    return {
      version: 1,
      passiveAttributes: (rawSchema.passiveAttributes || []).map((item, index) => ({ id: String(item.id || makeGlobalStatId("passiveAttributes", item.name, index)), name: String(item.name || "New") })),
      bonuses: (rawSchema.bonuses || []).map((item, index) => ({ id: String(item.id || makeGlobalStatId("bonuses", item.name, index)), name: String(item.name || "New") })),
      presentation: cards[0] ? extractGlobalBackPresentation(cards[0]) : (rawSchema.presentation || null),
      migrationError: String(rawSchema.migrationError || ""),
    };
  }
  const reference = cards[0];
  if (!reference) return { version: 1, passiveAttributes: [], bonuses: [], presentation: null, migrationError: "" };
  const presentation = extractGlobalBackPresentation(reference);
  const schema = {
    version: 1,
    passiveAttributes: statDefinitionsFromCard(reference, "passiveAttributes"),
    bonuses: statDefinitionsFromCard(reference, "bonuses"),
    presentation,
  };
  const mismatches = cards.flatMap(card => {
    const issues = GLOBAL_BACK_STAT_SECTIONS.filter(section => !sameStatStructure(card, schema[section], section)).map(section => `${card.name || card.id}: ${section}`);
    if (!sameGlobalBackPresentation(card, presentation)) issues.push(`${card.name || card.id}: Attributes/Bonuses layout or style`);
    return issues;
  });
  return { ...schema, migrationError: mismatches.length ? `Global stats migration stopped. Different structures found: ${mismatches.join(", ")}` : "" };
}

function materializeCardStats(card, schema) {
  const next = { ...card };
  for (const section of GLOBAL_BACK_STAT_SECTIONS) {
    const oldList = normalizeStatItems(card?.[section] || []);
    const byId = new Map(oldList.map(item => [String(item.id || ""), item]));
    const byName = new Map(oldList.map(item => [normalizedStatName(item.name), item]));
    next[section] = (schema?.[section] || []).map((definition) => {
      const existing = byId.get(String(definition.id)) || byName.get(normalizedStatName(definition.name));
      return {
        id: definition.id,
        name: definition.name,
        value: existing ? normalizeStatValue(existing.value) : 10,
        showOnCard: existing ? existing.showOnCard !== false : true,
      };
    });
  }
  return applyGlobalBackPresentation(next, schema?.presentation);
}

function cardStatById(card, statId) {
  const id = String(statId || "");
  for (const section of GLOBAL_BACK_STAT_SECTIONS) {
    const item = (card?.[section] || []).find(entry => String(entry?.id || "") === id);
    if (item) return Number(item.value) || 0;
  }
  return 0;
}

function createPlayerCard(position = "ST") {
  const safePosition = CARD_POSITION_OPTIONS.includes(position) ? position : "ST";
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: "New Player",
    position: safePosition,
    passiveAttributes: defaultAttributesForPosition(safePosition, "passive"),
    bonuses: defaultAttributesForPosition(safePosition, "bonus"),
    preferredFoot: "Right",
    starsFront: { ...FRONT_STAR_DEFAULTS },
    theme: "Style 1",
    defensiveArea: emptyDefensiveArea(),
    defensiveGridAdjust: { ...DEFENSIVE_GRID_ADJUST_DEFAULTS },
    artwork: { mode: "default", customDataUrl: "" },
    graphics: { frontDataUrl: "", backDataUrl: "", previousTheme: "Style 1" },
    specialAbility: "",
    customZones: [],
    deletedLayoutZones: [],
    textColors: { ...CARD_TEXT_COLOR_DEFAULTS },
    textStyles: normalizeTextStyles(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}


function normalizeCardPosition(rawPosition) {
  const clean = String(rawPosition || "").trim().toUpperCase();
  return CARD_POSITION_OPTIONS.includes(clean) ? clean : "ST";
}

function normalizeImportedCard(card) {
  const rawPosition = card?.position ?? card?.Position ?? card?.POSITION ?? card?.pos ?? card?.Post ?? card?.post;
  const safePosition = normalizeCardPosition(rawPosition);
  const base = createPlayerCard(safePosition);
  const normalized = {
    ...base,
    ...(card || {}),
    position: safePosition,
    passiveAttributes: normalizeStatItems(Array.isArray(card?.passiveAttributes) ? card.passiveAttributes : (Array.isArray(card?.attributes) ? card.attributes : [])),
    bonuses: normalizeStatItems(Array.isArray(card?.bonuses) ? card.bonuses : []),
    preferredFoot: PREFERRED_FOOT_OPTIONS.includes(card?.preferredFoot) ? card.preferredFoot : "Right",
    starsFront: normalizeFrontStars(card?.starsFront || card?.frontStars || card?.stars),
    theme: (card?.theme === CUSTOM_CARD_THEME || card?.theme === "Custom") ? CUSTOM_CARD_THEME : (CARD_THEMES.includes(card?.theme) ? card.theme : (LEGACY_THEME_MAP[card?.theme] || base.theme || "Style 1")),
    defensiveArea: Array.isArray(card?.defensiveArea) ? card.defensiveArea : [],
    defensiveGridAdjust: normalizeDefensiveGridAdjust(card?.defensiveGridAdjust || card?.defensive_grid_adjust),
    artwork: card?.artwork || { mode: "default", customDataUrl: "" },
    graphics: {
      frontDataUrl: String(card?.graphics?.frontDataUrl || card?.customGraphics?.frontDataUrl || card?.frontGraphic || ""),
      backDataUrl: String(card?.graphics?.backDataUrl || card?.customGraphics?.backDataUrl || card?.backGraphic || ""),
      frontExportDataUrl: String(card?.graphics?.frontExportDataUrl || card?.graphics?.frontLocalDataUrl || card?.customGraphics?.frontExportDataUrl || ""),
      backExportDataUrl: String(card?.graphics?.backExportDataUrl || card?.graphics?.backLocalDataUrl || card?.customGraphics?.backExportDataUrl || ""),
      previousTheme: CARD_THEMES.includes(card?.graphics?.previousTheme) ? card.graphics.previousTheme : (CARD_THEMES.includes(card?.previousTheme) ? card.previousTheme : base.theme),
    },
    specialAbility: String(card?.specialAbility ?? card?.special_ability ?? card?.special ?? ""),
    customZones: normalizeCustomZones(card),
    deletedLayoutZones: Array.isArray(card?.deletedLayoutZones) ? card.deletedLayoutZones.map(String) : [],
    textColors: normalizeTextColors(card?.textColors || card?.colors || card?.text_colors),
    textStyles: normalizeTextStyles(card?.textStyles || card?.text_styles),
  };
  return normalized;
}

function createDefaultCardState() {
  return {
    cards: [],
    teams: {
      blue: TEAM_SLOT_POSITIONS.map((position, index) => ({ id: `blue-${index + 1}`, position, cardId: null })),
      red: TEAM_SLOT_POSITIONS.map((position, index) => ({ id: `red-${index + 1}`, position, cardId: null })),
    },
    assignments: {},
    backStatsSchema: { version: 1, passiveAttributes: [], bonuses: [] },
    theme: "Style 1",
  };
}

function normalizeCardState(raw) {
  const base = createDefaultCardState();
  if (!raw || typeof raw !== "object") return base;
  const importedCards = Array.isArray(raw.cards) ? raw.cards.map(card => normalizeImportedCard(card)) : [];
  const backStatsSchema = deriveBackStatsSchema(importedCards, raw.backStatsSchema);
  const cards = backStatsSchema.migrationError ? importedCards : importedCards.map(card => materializeCardStats(card, backStatsSchema));

  // New invariant: card-to-puck links live on pieces[].cardId only.
  // cardState is now only the card library + visual card settings.
  // Keep empty legacy containers so old UI/import code cannot rehydrate stale links.
  return {
    cards,
    teams: {
      blue: base.teams.blue,
      red: base.teams.red,
    },
    assignments: {},
    backStatsSchema,
    theme: CARD_THEMES.includes(raw.theme) ? raw.theme : (LEGACY_THEME_MAP[raw.theme] || base.theme),
  };
}

function getLegacyAssignments(rawCardState) {
  if (!rawCardState || typeof rawCardState !== "object" || !rawCardState.assignments || typeof rawCardState.assignments !== "object") return {};
  return Object.fromEntries(
    Object.entries(rawCardState.assignments)
      .map(([pieceId, cardId]) => [String(pieceId || "").trim(), String(cardId || "").trim()])
      .filter(([pieceId, cardId]) => pieceId && cardId)
  );
}

function normalizeSessionCardsById(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([cardId, card]) => {
        const normalized = normalizeImportedCard({ ...(card || {}), id: String(card?.id || cardId) });
        return [String(normalized.id), normalized];
      })
      .filter(([cardId]) => cardId)
  );
}

function buildSessionCardAssignments(rawPieces) {
  return Object.fromEntries(
    (rawPieces || [])
      .filter(piece => piece?.team !== "BALL" && String(piece?.id || "").trim() && String(piece?.cardId || "").trim())
      .map(piece => [String(piece.id), String(piece.cardId)])
  );
}

function applySessionCardAssignments(rawPieces, rawAssignments) {
  if (!rawAssignments || typeof rawAssignments !== "object") return rawPieces || [];
  return (rawPieces || []).map(piece => ({
    ...piece,
    cardId: piece?.team === "BALL" ? null : (String(rawAssignments[piece.id] || "").trim() || null),
  }));
}

function sanitizePiecesCardIds(rawPieces, cardStateLike, settingsLike = DEFAULT_SETTINGS, legacyAssignments = {}, sessionCardsByIdLike = {}) {
  const normalizedCardState = normalizeCardState(cardStateLike);
  const normalizedSessionCards = normalizeSessionCardsById(sessionCardsByIdLike);
  const validCardIds = new Set([
    ...(normalizedCardState.cards || []).map(card => String(card.id)),
    ...Object.keys(normalizedSessionCards).map(cardId => String(cardId)),
  ]);
  const usedCardIds = new Set();

  return normalizePiecesForBoard(rawPieces || [], settingsLike).map(piece => {
    const directCardId = String(piece?.cardId || "").trim();
    const legacyCardId = String(legacyAssignments?.[piece.id] || "").trim();
    const nextCardId = directCardId || legacyCardId;

    // Important invariant for Firestore merge saves:
    // cardId must always be present. Use null for empty, never omit the field.
    // If the field is omitted, setDoc(..., { merge: true }) may keep an older
    // nested cardId and make the card jump back to the previous puck after reload.
    if (piece.team === "BALL" || !nextCardId || !validCardIds.has(nextCardId) || usedCardIds.has(nextCardId)) {
      return { ...piece, cardId: null };
    }

    usedCardIds.add(nextCardId);
    return { ...piece, cardId: nextCardId };
  });
}

function buildCardLibraryState(cardStateLike) {
  const normalized = normalizeCardState(cardStateLike);
  return stripInlineGraphicsFromCardState({
    ...normalized,
    teams: createDefaultCardState().teams,
    assignments: {},
  });
}

function buildSessionLibraryById(cardStateLike) {
  const libraryState = buildCardLibraryState(cardStateLike);
  return Object.fromEntries(
    (libraryState.cards || [])
      .map(card => {
        const normalized = normalizeImportedCard(card);
        return [String(normalized.id), deepStripInlineImageDataUrls(normalized)];
      })
      .filter(([cardId]) => cardId)
  );
}

function buildCardStateFromSessionLibrary(sessionLibraryByIdLike = {}) {
  const sessionCards = normalizeSessionCardsById(sessionLibraryByIdLike);
  return normalizeCardState({
    ...createDefaultCardState(),
    cards: Object.values(sessionCards),
    assignments: {},
  });
}

function cleanTwoDigitValue(value) {
  const raw = String(value ?? "").trim();
  const negative = raw.startsWith("-");
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits === "") return negative ? "-" : 0;
  const number = clamp(Number(digits), 0, 99);
  return negative ? -number : number;
}

function normalizeStatValue(value) {
  if (value === "-") return 0;
  return clamp(Number(value) || 0, -99, 99);
}

function normalizeTextColors(raw = {}) {
  return { ...CARD_TEXT_COLOR_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
}

function safeColor(value, fallback = "#ffffff") {
  const clean = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback;
}

function colorToRgbTriplet(value, fallback = "#ffffff") {
  const hex = safeColor(value, fallback).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function cardTextColors(card) {
  return normalizeTextColors(card?.textColors);
}

function areaHasCell(area, dx, dy) {
  return (area || []).some(cell => Number(cell.dx) === dx && Number(cell.dy) === dy);
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

function ensureBenchReserveCount(pieces, settingsLike = DEFAULT_SETTINGS, reserveCount = 7) {
  const localSettings = normalizeSettingsForApp(settingsLike);
  const normalized = normalizePiecesForBoard(pieces || [], localSettings);
  const existingIds = new Set(normalized.map(piece => piece.id));
  const pad = invisiblePaddingForSettings(localSettings);
  const startY = Math.max(1, goalTopForSettings(localSettings) - 8);
  const additions = [];

  ["A", "B"].forEach(team => {
    const isBlue = team === "A";
    const benchX = isBlue ? -pad : localSettings.cols + pad - 1;
    for (let i = 0; i < reserveCount; i++) {
      const id = `${team}-R-${i + 1}`;
      if (!existingIds.has(id)) {
        additions.push({
          id,
          team,
          label: "",
          x: benchX,
          y: startY + i,
        });
      }
    }
  });

  return normalizePiecesForBoard([...normalized, ...additions], localSettings);
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
    return normalizeFormationSlots(JSON.parse(raw), FORMATION_SLOTS);
  } catch {
    return FORMATION_SLOTS;
  }
}

const DEFAULT_GAME_SITUATIONS = createDefaultScenarioSlots(12);

function loadStoredGameSituations() {
  try {
    const raw = localStorage.getItem("football-board-game-situations-v20");
    if (!raw) return DEFAULT_GAME_SITUATIONS;
    const stored = JSON.parse(raw);
    return normalizeScenarioSlots(stored, DEFAULT_GAME_SITUATIONS);
  } catch {
    return DEFAULT_GAME_SITUATIONS;
  }
}

function loadStoredRuleSets() {
  try {
    const raw = localStorage.getItem("football-board-rule-sets-v1");
    return normalizeRuleSets(raw ? JSON.parse(raw) : []);
  } catch {
    return normalizeRuleSets([]);
  }
}

function loadStoredActiveRuleSet(ruleSets) {
  try {
    const savedId = localStorage.getItem("football-board-active-rule-set-v1");
    return normalizeRuleSet(findRuleSet(ruleSets, savedId));
  } catch {
    return normalizeRuleSet(findRuleSet(ruleSets));
  }
}

function createInitialPieces(cols, rows, blueFormation = FORMATION_SLOTS[0], redFormation = FORMATION_SLOTS[1]) {
  const pieces = [];
  const midY = Math.floor(rows / 2);
  const localSettings = { ...DEFAULT_SETTINGS, cols, rows };
  const pad = invisiblePaddingForSettings(localSettings);

  function addFormation(team, formation) {
    const isBlue = team === "A";
    normalizeFormationPlayers(formation?.players).forEach(([label, coord], i) => {
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
    const startY = Math.max(1, goalTopForSettings(localSettings) - 8);

    for (let i = 0; i < 7; i++) {
      pieces.push({
        id: `${team}-R-${i + 1}`,
        team,
        label: "",
        x: benchX,
        y: startY + i,
      });
    }
  }

  addFormation("A", blueFormation);
  addFormation("B", redFormation);
  addBench("A");
  addBench("B");

  pieces.push({ id: "BALL", team: "BALL", label: "●", x: Math.floor(cols / 2), y: midY });
  return ensureBenchReserveCount(pieces, localSettings, 7);
}


function DraggableActionPrompt({ promptKey, className = "", children }) {
  const storageKey = `football-board-action-prompt-position-${promptKey}-v1`;
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return saved;
    } catch {}
    return { x: Math.max(12, Math.round(window.innerWidth / 2 - 180)), y: 138 };
  });
  const dragRef = useRef(null);

  function onPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = {
      x: clamp(event.clientX - drag.dx, 0, Math.max(0, window.innerWidth - 320)),
      y: clamp(event.clientY - drag.dy, 0, Math.max(0, window.innerHeight - 90)),
    };
    setPosition(next);
  }

  function stopDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
  }

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
  }, [position, storageKey]);

  return <div
    className={`pass-action-prompt draggable-action-prompt ${className}`.trim()}
    style={{ left: `${position.x}px`, top: `${position.y}px`, transform: "none" }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
  >{children}</div>;
}

function App() {
  const [settings, setSettings] = useState(() => normalizeSettingsForApp(DEFAULT_SETTINGS));
  const [formations, setFormations] = useState(() => loadStoredFormations());
  const [blueFormationId, setBlueFormationId] = useState(1);
  const [redFormationId, setRedFormationId] = useState(2);
  const [gameSituations, setGameSituations] = useState(() => loadStoredGameSituations());
  const [activeSituationId, setActiveSituationId] = useState(1);
  const [activeSituationName, setActiveSituationName] = useState("Scenario 1");
  const [ruleSets, setRuleSets] = useState(() => loadStoredRuleSets());
  const [activeRuleSet, setActiveRuleSet] = useState(() => loadStoredActiveRuleSet(loadStoredRuleSets()));
  const [ruleSetSelectionId, setRuleSetSelectionId] = useState(() => loadStoredActiveRuleSet(loadStoredRuleSets()).id);
  const [ruleSetDraft, setRuleSetDraft] = useState(() => loadStoredActiveRuleSet(loadStoredRuleSets()));
  const [rulesPanelOpen, setRulesPanelOpen] = useState(false);
  const [pieces, setPieces] = useState(() => normalizePiecesForBoard(createInitialPieces(DEFAULT_SETTINGS.cols, DEFAULT_SETTINGS.rows, FORMATION_SLOTS[0], FORMATION_SLOTS[1]), DEFAULT_SETTINGS));
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [inspectedPieceId, setInspectedPieceId] = useState(null);
  const [cardState, setCardState] = useState(() => {
    try {
      const raw = localStorage.getItem("football-board-player-cards-v1");
      if (raw && !localStorage.getItem("football-board-player-cards-v1-pre-global-stats-v1")) {
        localStorage.setItem("football-board-player-cards-v1-pre-global-stats-v1", raw);
      }
      return raw ? normalizeCardState(JSON.parse(raw)) : normalizeCardState();
    } catch {
      return normalizeCardState();
    }
  });
  const [cardsPanelOpen, setCardsPanelOpen] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [defAreaMode, setDefAreaMode] = useState(0);
  const [cardsView, setCardsView] = useState("library");
  const [libraryPositionFilter, setLibraryPositionFilter] = useState("ALL");
  const [assignPositionFilter, setAssignPositionFilter] = useState("ALL");
  const [assignSortByPosition, setAssignSortByPosition] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [openTextPanelKey, setOpenTextPanelKey] = useState(null);
  const [openColorPanelKey, setOpenColorPanelKey] = useState(null);
  const [openGridAdjustKey, setOpenGridAdjustKey] = useState(null);
  const [previewTextStyleDraft, setPreviewTextStyleDraft] = useState(null);
  const [selectedLayout, setSelectedLayout] = useState(null);
  const [layoutStyleClipboard, setLayoutStyleClipboard] = useState(null);
  const [exportCardId, setExportCardId] = useState("");
  const graphicFrontInputRef = useRef(null);
  const graphicBackInputRef = useRef(null);
  const pendingGraphicFrontRef = useRef(null);
  const [graphicImportCardId, setGraphicImportCardId] = useState("");
  const [graphicImportSide, setGraphicImportSide] = useState("front");
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignPreviewCardId, setAssignPreviewCardId] = useState(null);
  const [assignPreviewSide, setAssignPreviewSide] = useState("front");
  const [inspectorPosition, setInspectorPosition] = useState({ x: Math.max(12, window.innerWidth - 450), y: 150 });
  const [inspectorSize, setInspectorSize] = useState({ w: 420, h: 650 });
  const [inspectorDragging, setInspectorDragging] = useState(null);
  const [inspectorResizing, setInspectorResizing] = useState(null);
  const INSPECTOR_CARD_CANONICAL_WIDTH = 360;
  const [inspectorCardZoom, setInspectorCardZoom] = useState(1);
  const [inspectorCardPan, setInspectorCardPan] = useState({ x: 0, y: 0 });
  const [inspectorCardSide, setInspectorCardSide] = useState("front");
  const [preferredInspectorCardSide, setPreferredInspectorCardSide] = useState("front");
  const [inspectorCardFitScale, setInspectorCardFitScale] = useState(1);
  const inspectorCardViewportRef = useRef(null);
  const inspectorCardPointersRef = useRef(new Map());
  const inspectorCardGestureRef = useRef(null);
  const inspectorCardZoomRef = useRef(1);
  const inspectorCardPanRef = useRef({ x: 0, y: 0 });
  const [editingPiece, setEditingPiece] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [zoom, setZoom] = useState(0.8);
  const [dieType, setDieType] = useState(20);
  const [blueDieResult, setBlueDieResult] = useState(null);
  const [redDieResult, setRedDieResult] = useState(null);
  const [blueLastDieType, setBlueLastDieType] = useState(20);
  const [redLastDieType, setRedLastDieType] = useState(20);
  const [blueDieRolling, setBlueDieRolling] = useState(false);
  const [redDieRolling, setRedDieRolling] = useState(false);
  const [blueDiceAnimationValue, setBlueDiceAnimationValue] = useState(null);
  const [redDiceAnimationValue, setRedDiceAnimationValue] = useState(null);
  const [diceNotice, setDiceNotice] = useState(null);
  const [diceCooldownUntil, setDiceCooldownUntil] = useState(0);
  // A host-controlled test aid. It changes only the source of a manual roll;
  // all downstream dice, Timeline, reaction, and multiplayer flow remains the
  // same as a normal roll.
  const [chooseRollEnabled, setChooseRollEnabled] = useState(false);
  const [chooseRollForTeam, setChooseRollForTeam] = useState(null);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureType, setMeasureType] = useState("center");
  const [passMark, setPassMark] = useState(8);
  const [shotMark, setShotMark] = useState(12);
  const [measureStart, setMeasureStart] = useState(null);
  const [measureEnd, setMeasureEnd] = useState(null);
  const [sharedRulerOwnerUid, setSharedRulerOwnerUid] = useState("");
  const [sharedRulerOwnerTeam, setSharedRulerOwnerTeam] = useState("");
  const [historyPosition, setHistoryPosition] = useState({ x: window.innerWidth - 300, y: 118 });
  const [historySize, setHistorySize] = useState({ w: 280, h: 360 });
  const [historyVisible, setHistoryVisible] = useState(false);
  const [dicePanelVisible, setDicePanelVisible] = useState(false);
  const [dicePanelPosition, setDicePanelPosition] = useState({ x: 420, y: 180 });
  // Dice window layout is intentionally local to each browser.  The compact
  // default keeps both results and Roll buttons visible on first open; any
  // later resize remains in memory for this running session only.
  const [dicePanelSize, setDicePanelSize] = useState({ w: 330, h: 250 });
  const [dicePanelDragging, setDicePanelDragging] = useState(null);
  const [dicePanelResizing, setDicePanelResizing] = useState(null);
  const [rulerPanelPosition, setRulerPanelPosition] = useState({ x: 20, y: 150 });
  const [rulerPanelSize, setRulerPanelSize] = useState({ w: 280, h: 230 });
  const [rulerPanelDragging, setRulerPanelDragging] = useState(null);
  const [rulerPanelResizing, setRulerPanelResizing] = useState(null);
  const [trackerVisible, setTrackerVisible] = useState(false);
  const [trackerMinimized, setTrackerMinimized] = useState(false);
  const [trackerSettingsOpen, setTrackerSettingsOpen] = useState(false);
  const [trackerSettings, setTrackerSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("football-board-tracker-settings-v1") || "null");
      return {
        attackActions: clamp(Number(saved?.attackActions) || 5, 1, 30),
        defenseActions: clamp(Number(saved?.defenseActions) || 4, 1, 30),
        turns: clamp(Number(saved?.turns) || 20, 1, 100),
      };
    } catch { return { attackActions: 5, defenseActions: 4, turns: 20 }; }
  });
  const [trackerSettingsDraft, setTrackerSettingsDraft] = useState(trackerSettings);
  const [trackerPosition, setTrackerPosition] = useState(() => {
    try { return JSON.parse(localStorage.getItem("football-board-tracker-position-v1")) || { x: 24, y: 420 }; }
    catch { return { x: 24, y: 420 }; }
  });
  const [trackerSize, setTrackerSize] = useState(() => {
    try { return JSON.parse(localStorage.getItem("football-board-tracker-size-v1")) || { w: 390, h: 390 }; }
    catch { return { w: 390, h: 390 }; }
  });
  const [trackerDragging, setTrackerDragging] = useState(null);
  const [trackerResizing, setTrackerResizing] = useState(null);
  const [trackerStartChoiceOpen, setTrackerStartChoiceOpen] = useState(false);
  const [trackerGameStarted, setTrackerGameStarted] = useState(false);
  const [trackerStartingTeam, setTrackerStartingTeam] = useState("red");
  const [trackerCurrentTurn, setTrackerCurrentTurn] = useState(0);
  const [trackerUsedActions, setTrackerUsedActions] = useState({ red: 0, blue: 0 });
  const [trackerActionLog, setTrackerActionLog] = useState({ red: [], blue: [] });
  const [matchActionState, setMatchActionState] = useState(() => normalizeMatchActionState({}));
  const [turnPhase, setTurnPhase] = useState("attack");
  const [pendingEndTurn, setPendingEndTurn] = useState(null);
  const [pendingAutoMove, setPendingAutoMove] = useState(null);
  const [actionResolution, setActionResolution] = useState(null);
  const [passTargetIntentPending, setPassTargetIntentPending] = useState(false);
  const [passCancelIntentPending, setPassCancelIntentPending] = useState(false);
  const [bonusActionEndIntentPending, setBonusActionEndIntentPending] = useState(false);
  const [diceRollIntentPending, setDiceRollIntentPending] = useState(false);
  const [actionStartIntentPending, setActionStartIntentPending] = useState(false);
  const [pendingInteractionPieceId, setPendingInteractionPieceId] = useState(null);
  const [normalMoveCommitIntentPending, setNormalMoveCommitIntentPending] = useState(false);
  const [freeModeIntentPending, setFreeModeIntentPending] = useState(false);
  const [freeBallMoveIntentPending, setFreeBallMoveIntentPending] = useState(false);
  const [actionContinuation, setActionContinuation] = useState(null);
  const [passResultNotice, setPassResultNotice] = useState(null);
  const [liveDelayedResolutionEntryId, setLiveDelayedResolutionEntryId] = useState("");
  const [trackerSharedEnabled, setTrackerSharedEnabled] = useState(false);
  const [gameMode, setGameMode] = useState("editor");
  const [freeBallActive, setFreeBallActive] = useState(false);
  const [movementStateByPieceId, setMovementStateByPieceId] = useState({});
  const movementStateRef = useRef({});
  const [gameTimeline, setGameTimeline] = useState(null);
  const gameTimelineRef = useRef(null);
  // Match Mode may exist briefly before Tracker has a real kickoff. This ref
  // marks whether the current recording already owns its playable baseline;
  // it is orchestration state, not gameplay state and never participates in
  // Undo/Redo.
  const matchPlayableStartEstablishedRef = useRef(false);
  const [pendingEditorModeExit, setPendingEditorModeExit] = useState(false);
  const [replayRecording, setReplayRecording] = useState(null);
  const isReplayView = Boolean(replayRecording);
  const replayModeRef = useRef(false);
  const replayWorkspaceRef = useRef(null);
  const matchCardSnapshotRef = useRef({ recordingId: "", cards: [] });
  const matchContextRef = useRef(null);
  const exportedRecordingRevisionRef = useRef(new Map());
  const pendingTimelineBeforeRef = useRef(null);
  const timelineSyncQueueRef = useRef(Promise.resolve());
  const pendingTimelineSyncCountRef = useRef(0);
  const [illegalMoveNotice, setIllegalMoveNotice] = useState(null);
  const [pendingTurnChange, setPendingTurnChange] = useState(null);
  const [turnAdvanceNotice, setTurnAdvanceNotice] = useState(false);
  const [startedTurnNotice, setStartedTurnNotice] = useState(null);
  const [matchOverNotice, setMatchOverNotice] = useState(false);
  const [pendingThreeTwoMove, setPendingThreeTwoMove] = useState(null);
  const [groupMoveZoneDraft, setGroupMoveZoneDraft] = useState(null);
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
  const lastPieceTapRef = useRef({ time: 0, pieceId: "" });
  const multiTouchUntilRef = useRef(0);
  const boardPanRef = useRef(null);
  const groupMoveZoneDragRef = useRef(null);
  const measureInteractionRef = useRef(null);
  const beforeLockViewRef = useRef(null);
  const clientIdRef = useRef(`client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const multiplayerTracerRef = useRef(createMultiplayerTracer());
  const actionTraceIdsRef = useRef(new Map());
  const historyDragRef = useRef(null);
  const historyResizeRef = useRef(null);
  const historyListRef = useRef(null);
  const dicePanelDragRef = useRef(null);
  const dicePanelResizeRef = useRef(null);
  const trackerDragRef = useRef(null);
  const trackerResizeRef = useRef(null);
  const trackerSharedEnabledRef = useRef(false);
  const diceNoticeTimerRef = useRef(null);
  const diceCooldownTimerRef = useRef(null);
  const diceCooldownUntilRef = useRef(0);
  const diceRollingRef = useRef({ blue: false, red: false });
  const pendingDiceRollRef = useRef({ blue: null, red: null });
  const diceSeenRollIdsRef = useRef({ blue: "", red: "" });
  const diceSnapshotInitializedRef = useRef(false);
  const sessionSaveTimerRef = useRef(null);
  const sessionSaveInFlightRef = useRef(false);
  const sessionHydratedRef = useRef(false);
  const sessionSavePendingRef = useRef(false);
  const sessionLastSaveAtRef = useRef(0);
  const sessionEndingRef = useRef(false);
  const isApplyingSessionRef = useRef(false);
  const autosaveDirtyRef = useRef(false);
  const autosaveIntervalRef = useRef(null);
  const cloudCardHashesRef = useRef(new Map());
  const piecesRef = useRef(pieces);
  const settingsRef = useRef(settings);
  const cardStateRef = useRef(cardState);
  const activeRuleSetRef = useRef(activeRuleSet);
  const actionResolutionRef = useRef(actionResolution);
  const passTargetIntentPendingRef = useRef(false);
  const passCancelIntentPendingRef = useRef(false);
  const bonusActionEndIntentPendingRef = useRef(false);
  const diceRollIntentPendingRef = useRef(false);
  const actionStartIntentPendingRef = useRef(false);
  const normalMoveCommitIntentPendingRef = useRef(false);
  const freeModeIntentPendingRef = useRef(false);
  const freeBallMoveIntentPendingRef = useRef(false);
  const processedBonusActionEndIntentIdsRef = useRef(new Set());
  const processedPassTargetIntentIdsRef = useRef(new Set());
  const processedPassCancelIntentIdsRef = useRef(new Set());
  const processedDiceRollIntentIdsRef = useRef(new Set());
  const processedActionStartIntentIdsRef = useRef(new Set());
  const processedNormalMoveCommitIntentIdsRef = useRef(new Set());
  const processedFreeModeIntentIdsRef = useRef(new Set());
  const processedFreeBallMoveIntentIdsRef = useRef(new Set());
  const actionContinuationRef = useRef(actionContinuation);
  const delayedResolutionTimerRef = useRef(null);
  const delayedResolutionEntryIdRef = useRef("");
  const delayedResolutionExecutionRef = useRef(createResolutionExecutionRegistry());
  const shownPassResultEntryIdsRef = useRef(new Set());
  const liveTimelinePresentationReadyRef = useRef(false);
  const [sessionCardsById, setSessionCardsById] = useState({});
  const sessionCardsByIdRef = useRef({});
  const [sessionLibraryById, setSessionLibraryById] = useState({});
  const sessionLibraryByIdRef = useRef({});
  const sessionAssignmentsRef = useRef({});
  const sharedTimelineMetaRef = useRef(null);
  const sessionTimelineEntriesRef = useRef([]);
  // Firebase listeners and delayed timers are intentionally long-lived. They
  // must read current ownership from a ref instead of a render-time closure.
  const sessionAuthorityRef = useRef({ sessionCode: "", userUid: "", ownerUid: "", isHost: false });

  const SESSION_LIVE_SAVE_INTERVAL_MS = 250;
  const CLOUD_AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000;

  useEffect(() => { piecesRef.current = pieces; }, [pieces]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { cardStateRef.current = cardState; }, [cardState]);
  useEffect(() => { if (cardState?.backStatsSchema?.migrationError) window.alert(cardState.backStatsSchema.migrationError); }, [cardState?.backStatsSchema?.migrationError]);
  useEffect(() => { activeRuleSetRef.current = activeRuleSet; }, [activeRuleSet]);
  useEffect(() => { actionResolutionRef.current = actionResolution; }, [actionResolution]);
  useEffect(() => { passTargetIntentPendingRef.current = passTargetIntentPending; }, [passTargetIntentPending]);
  useEffect(() => { passCancelIntentPendingRef.current = passCancelIntentPending; }, [passCancelIntentPending]);
  useEffect(() => { bonusActionEndIntentPendingRef.current = bonusActionEndIntentPending; }, [bonusActionEndIntentPending]);
  useEffect(() => { diceRollIntentPendingRef.current = diceRollIntentPending; }, [diceRollIntentPending]);
  useEffect(() => { actionStartIntentPendingRef.current = actionStartIntentPending; }, [actionStartIntentPending]);
  useEffect(() => { normalMoveCommitIntentPendingRef.current = normalMoveCommitIntentPending; }, [normalMoveCommitIntentPending]);
  useEffect(() => { freeModeIntentPendingRef.current = freeModeIntentPending; }, [freeModeIntentPending]);
  useEffect(() => { freeBallMoveIntentPendingRef.current = freeBallMoveIntentPending; }, [freeBallMoveIntentPending]);
  useEffect(() => {
    if (actionResolution?.kind !== "pass" || actionResolution.status !== "targeting") {
      setPassTargetIntentPending(false);
      passTargetIntentPendingRef.current = false;
      setPassCancelIntentPending(false);
      passCancelIntentPendingRef.current = false;
    }
  }, [actionResolution]);
  useEffect(() => { actionContinuationRef.current = actionContinuation; }, [actionContinuation]);
  useEffect(() => {
    if (actionResolution?.kind !== "pass" || actionResolution.status !== "awaiting-interception-roll") return;
    // A reaction roll is never optional UI. Opening Dice and pinning D20
    // removes an avoidable extra click while keeping the roll itself manual.
    setDicePanelVisible(true);
    setDieType(20);
  }, [actionResolution]);
  useEffect(() => { movementStateRef.current = movementStateByPieceId; }, [movementStateByPieceId]);
  useEffect(() => { gameTimelineRef.current = gameTimeline; }, [gameTimeline]);
  useEffect(() => {
    const cancelPendingPassWithEscape = event => {
      if (event.key !== "Escape") return;
      const pending = actionResolutionRef.current;
      if (pending?.kind === "pass" && ["targeting", "route-selection"].includes(pending.status)) cancelPassTargeting();
    };
    window.addEventListener("keydown", cancelPendingPassWithEscape);
    return () => window.removeEventListener("keydown", cancelPendingPassWithEscape);
  }, []);
  useEffect(() => { sessionCardsByIdRef.current = sessionCardsById; }, [sessionCardsById]);
  useEffect(() => { sessionLibraryByIdRef.current = sessionLibraryById; }, [sessionLibraryById]);

  useEffect(() => {
    if (!isReplayView || !historyVisible || !gameTimeline) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const list = historyListRef.current;
      const target = list?.querySelector(`[data-history-cursor="${gameTimeline.cursor}"]`);
      if (!list || !target) return;
      const listRect = list.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const padding = 6;
      let delta = 0;
      if (targetRect.top < listRect.top + padding) {
        delta = targetRect.top - listRect.top - padding;
      } else if (targetRect.bottom > listRect.bottom - padding) {
        delta = targetRect.bottom - listRect.bottom + padding;
      }
      if (delta) list.scrollTo({ top: list.scrollTop + delta, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isReplayView, historyVisible, gameTimeline?.cursor]);

  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [sessionStatus, setSessionStatus] = useState("Offline");

  useEffect(() => {
    if (!sessionCode) sessionEndingRef.current = false;
  }, [sessionCode]);
  const [sessionPlayers, setSessionPlayers] = useState(0);
  const [myTeam, setMyTeam] = useState("spectator");
  const [sessionOwnerUid, setSessionOwnerUid] = useState("");
  const [teamOwners, setTeamOwners] = useState({ blue: "", red: "" });
  const [cardVisibilityMode, setCardVisibilityMode] = useState("");
  const [cardRevealPermissions, setCardRevealPermissions] = useState({});
  const [cardRevealRequests, setCardRevealRequests] = useState({});
  const [sessionParticipants, setSessionParticipants] = useState({});
  const [joinSetup, setJoinSetup] = useState(null);
  const presenceClockRef = useRef(Date.now());
  const isSharedRulerOwner = !!sessionCode && !!user?.uid && sharedRulerOwnerUid === user.uid;
  const sharedRulerReadOnly = !!sessionCode && measureMode && !isSharedRulerOwner;
  const canUseSharedRuler = !sessionCode || myTeam === "blue" || myTeam === "red";
  const isSessionHost = !!sessionCode && !!user?.uid && user.uid === sessionOwnerUid;
  const isSessionGuest = Boolean(sessionCode && !isSessionHost);
  sessionAuthorityRef.current = {
    sessionCode: String(sessionCode || ""),
    userUid: String(user?.uid || ""),
    ownerUid: String(sessionOwnerUid || ""),
    isHost: Boolean(isSessionHost),
  };
  const canAccessPrimaryToolbarControls = canAccessPrimaryToolbar({
    sessionActive: Boolean(sessionCode),
    isSessionHost,
  });
  const trackerReadOnly = isReplayView || (!!sessionCode && !isSessionHost);

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

  useEffect(() => {
    if (replayModeRef.current) return;
    try {
      localStorage.setItem("football-board-player-cards-v1", JSON.stringify(buildCardLibraryState(cardState)));
    } catch (error) {
      console.warn("Player cards could not be saved locally. The imported graphics may be too large.", error);
    }
  }, [cardState]);


  useEffect(() => {
    if (replayModeRef.current) return;
    if (!user?.uid) return;
    const cardsWithInlineGraphics = (cardState.cards || []).flatMap(card => {
      const graphics = card.graphics || {};
      const items = [];
      if (isInlineImageDataUrl(graphics.frontDataUrl)) items.push({ cardId: card.id, side: "front", dataUrl: graphics.frontDataUrl });
      if (isInlineImageDataUrl(graphics.backDataUrl)) items.push({ cardId: card.id, side: "back", dataUrl: graphics.backDataUrl });
      return items;
    });
    if (!cardsWithInlineGraphics.length) return;

    let cancelled = false;
    (async () => {
      try {
        setCloudStatus("Uploading old images...");
        for (const item of cardsWithInlineGraphics) {
          if (cancelled) return;
          const url = await uploadCardGraphicDataUrl(item.cardId, item.side, item.dataUrl);
          if (cancelled) return;
          updateCardState(prev => ({
            ...prev,
            cards: prev.cards.map(card => {
              if (card.id !== item.cardId) return card;
              const graphics = card.graphics || {};
              const key = item.side === "front" ? "frontDataUrl" : "backDataUrl";
              if (graphics[key] !== item.dataUrl) return card;
              return {
                ...card,
                graphics: { ...graphics, [key]: url },
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
        }
        if (!cancelled) {
          setCloudStatus("Images uploaded");
          setCloudError("");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setCloudStatus("Image upload error");
          setCloudError(error.message || String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, cardState.cards]);

  function stripCardsFromCardState(rawCardState) {
    if (!rawCardState) return rawCardState;
    const normalized = buildCardLibraryState(normalizeCardState(rawCardState));
    return { ...normalized, cards: [] };
  }

  function stripCardLibrariesFromSituations(rawSituations = []) {
    return (rawSituations || []).map(situation => {
      if (!situation?.snapshot?.cardState) return situation;
      return {
        ...situation,
        snapshot: {
          ...situation.snapshot,
          cardState: stripCardsFromCardState(situation.snapshot.cardState),
        },
      };
    });
  }

  function hydrateCardState(rawCardState, cards) {
    const base = rawCardState ? normalizeCardState(rawCardState) : normalizeCardState({});
    return normalizeCardState({ ...base, cards: Array.isArray(cards) ? cards : base.cards });
  }

  function prepareCardForCloud(card) {
    const clean = stripInlineImagesFromCloudState(card);
    if (!clean || typeof clean !== "object") return clean;
    const { updatedAtCloud: _updatedAtCloud, ...withoutCloudMetadata } = clean;
    return withoutCloudMetadata;
  }

  function getCardCloudHash(card) {
    return JSON.stringify(prepareCardForCloud(card));
  }

  async function writeCardsToCloud(uid, cards) {
    const normalizedCards = (cards || []).filter(card => card?.id);
    const desiredIds = new Set(normalizedCards.map(card => String(card.id)));
    const nextHashes = new Map();
    const operations = [];

    for (const card of normalizedCards) {
      const cardId = String(card.id);
      const hash = getCardCloudHash(card);
      nextHashes.set(cardId, hash);
      if (cloudCardHashesRef.current.get(cardId) !== hash) {
        operations.push({ type: "set", ref: userCardRef(uid, cardId), data: encodeForFirestore(prepareCardForCloud(card)) });
      }
    }

    for (const existingId of cloudCardHashesRef.current.keys()) {
      if (!desiredIds.has(existingId)) operations.push({ type: "delete", ref: userCardRef(uid, existingId) });
    }

    for (let start = 0; start < operations.length; start += 450) {
      const batch = writeBatch(db);
      for (const operation of operations.slice(start, start + 450)) {
        if (operation.type === "set") batch.set(operation.ref, { ...operation.data, updatedAtCloud: serverTimestamp() }, { merge: false });
        else batch.delete(operation.ref);
      }
      await batch.commit();
    }

    cloudCardHashesRef.current = nextHashes;
    return operations.length;
  }

  async function readCardsFromCloud(uid) {
    const snapshot = await getDocs(userCardsCollectionRef(uid));
    const cards = snapshot.docs.map(item => {
      const decoded = decodeFromFirestore(item.data());
      if (!decoded || typeof decoded !== "object") return decoded;
      const { updatedAtCloud: _updatedAtCloud, ...card } = decoded;
      return card;
    }).filter(Boolean);
    cloudCardHashesRef.current = new Map(cards.filter(card => card?.id).map(card => [String(card.id), getCardCloudHash(card)]));
    return cards;
  }

  function buildPersistentTrackerSnapshot(overrides = {}) {
    return normalizeTrackerSnapshot({
      enabled: overrides.enabled ?? (sessionCode ? trackerSharedEnabled : trackerVisible),
      gameStarted: overrides.gameStarted ?? trackerGameStarted,
      startingTeam: overrides.startingTeam ?? trackerStartingTeam,
      currentTurn: overrides.currentTurn ?? trackerCurrentTurn,
      usedActions: overrides.usedActions ?? trackerUsedActions,
      actionLog: overrides.actionLog ?? trackerActionLog,
      matchActionState: overrides.matchActionState ?? matchActionState,
      turnPhase: overrides.turnPhase ?? turnPhase,
      settings: overrides.settings ?? trackerSettings,
    });
  }

  function buildCloudState(overrides = {}) {
    const effectiveSettings = overrides.settings ? normalizeSettingsForApp(overrides.settings) : settingsRef.current;
    const effectiveCardState = overrides.cardState ? normalizeCardState(overrides.cardState) : cardStateRef.current;
    const effectivePieces = overrides.pieces || piecesRef.current;
    const effectiveGameSituations = overrides.gameSituations || gameSituations;
    const effectiveRuleSets = normalizeRuleSets(overrides.ruleSets || ruleSets);
    const effectiveRuleSet = normalizeRuleSet(overrides.activeRuleSet || activeRuleSetRef.current);
    const effectiveTrackerState = buildPersistentTrackerSnapshot(overrides.trackerState || {});
    const { pieces: _overridePieces, cardState: _overrideCardState, settings: _overrideSettings, gameSituations: _overrideGameSituations, trackerState: _overrideTrackerState, ruleSets: _overrideRuleSets, activeRuleSet: _overrideActiveRuleSet, ...restOverrides } = overrides;
    return stripInlineImagesFromCloudState({
      version: "pitch-44-goal-5x2",
      formations,
      gameSituations: stripCardLibrariesFromSituations(effectiveGameSituations),
      activeSituationId,
      activeSituationName,
      ruleSets: effectiveRuleSets,
      activeRuleSetId: effectiveRuleSet.id,
      activeRuleSet: effectiveRuleSet,
      blueFormationId,
      redFormationId,
      dieType,
      dieResult: { blue: blueDieResult, red: redDieResult },
      touchMode,
      showCoordinates,
      trackerState: effectiveTrackerState,
      gameMode: normalizeGameMode(overrides.gameMode ?? gameMode),
      movementStateByPieceId: normalizeMovementState(overrides.movementStateByPieceId ?? movementStateRef.current),
      ...restOverrides,
      settings: effectiveSettings,
      pieces: sanitizePiecesCardIds(effectivePieces, effectiveCardState, effectiveSettings),
      cardState: stripCardsFromCardState(effectiveCardState),
    });
  }

  function applyStoredState(data, storedCards = cardStateRef.current.cards) {
    if (!data) return;
    const nextSettings = data.settings ? normalizeSettingsForApp(data.settings) : settings;
    const nextCardState = data.cardState ? hydrateCardState(data.cardState, storedCards) : cardState;
    const nextPieces = data.pieces
      ? ensureBenchReserveCount(sanitizePiecesCardIds(data.pieces, nextCardState, nextSettings), nextSettings)
      : sanitizePiecesCardIds(pieces, nextCardState, nextSettings);

    if (data.settings) setSettings(nextSettings);
    if (data.formations) setFormations(normalizeFormationSlots(data.formations, FORMATION_SLOTS));
    const nextScenarios = data.gameSituations
      ? normalizeScenarioSlots(data.gameSituations, DEFAULT_GAME_SITUATIONS)
      : gameSituations;
    const nextScenarioId = typeof data.activeSituationId === "number" ? data.activeSituationId : activeSituationId;
    if (data.gameSituations) setGameSituations(nextScenarios);
    if (typeof data.activeSituationId === "number") setActiveSituationId(nextScenarioId);
    const selectedScenario = nextScenarios.find(scenario => scenario.id === Number(nextScenarioId));
    if (selectedScenario) setActiveSituationName(selectedScenario.name);
    if (data.ruleSets || data.activeRuleSet) {
      const nextRuleSets = normalizeRuleSets(data.ruleSets || ruleSets);
      const nextActiveRuleSet = normalizeRuleSet(data.activeRuleSet || findRuleSet(nextRuleSets, data.activeRuleSetId));
      setRuleSets(nextRuleSets);
      setActiveRuleSet(nextActiveRuleSet);
      setRuleSetSelectionId(nextActiveRuleSet.id);
      setRuleSetDraft(nextActiveRuleSet);
      activeRuleSetRef.current = nextActiveRuleSet;
      localStorage.setItem("football-board-rule-sets-v1", JSON.stringify(nextRuleSets));
      localStorage.setItem("football-board-active-rule-set-v1", nextActiveRuleSet.id);
    }
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
    if (data.pieces) {
      piecesRef.current = nextPieces;
      setPieces(nextPieces);
    }
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) {
      if (data.dieResult && typeof data.dieResult === "object") {
        setBlueDieResult(data.dieResult.blue ?? null);
        setRedDieResult(data.dieResult.red ?? null);
      } else {
        setBlueDieResult(data.dieResult ?? null);
        setRedDieResult(null);
      }
    }
    if (typeof data.touchMode === "boolean") setTouchMode(data.touchMode);
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
    if (!sessionCode) {
      setGameMode(normalizeGameMode(data.gameMode));
      setMovementStateByPieceId(normalizeMovementState(data.movementStateByPieceId));
    }
    if (data.trackerState && !sessionCode) {
      const restoredTracker = normalizeTrackerSnapshot(data.trackerState);
      setTrackerVisible(restoredTracker.enabled);
      if (restoredTracker.enabled) setTrackerMinimized(false);
      setTrackerSettings(restoredTracker.settings);
      setTrackerSettingsDraft(restoredTracker.settings);
      setTrackerGameStarted(restoredTracker.gameStarted);
      setTrackerStartingTeam(restoredTracker.startingTeam);
      setTrackerCurrentTurn(restoredTracker.currentTurn);
      setTrackerUsedActions(restoredTracker.usedActions);
      setTrackerActionLog(restoredTracker.actionLog);
      setMatchActionState(restoredTracker.matchActionState);
      setTurnPhase(restoredTracker.turnPhase);
    }
    if (data.cardState) setCardState(nextCardState);
  }

  function pieceTeamKey(piece) {
    if (!piece || piece.team === "BALL") return piece?.team === "BALL" ? "ball" : "";
    return piece.team === "A" ? "blue" : piece.team === "B" ? "red" : "";
  }

  function canControlPieceStatus(piece) {
    if (replayModeRef.current) return false;
    if (!piece || piece.team === "BALL") return false;
    if (!sessionCode) return true;
    return myTeam !== "spectator" && pieceTeamKey(piece) === myTeam;
  }

  function canMovePiece(piece) {
    if (replayModeRef.current) return false;
    if (!piece) return false;
    if (piece.inactive) return false;
    if (!sessionCode) return true;
    if (piece.team === "BALL") return true;
    return myTeam !== "spectator" && pieceTeamKey(piece) === myTeam;
  }

  function canAssignPiece(piece) {
    return !!piece && piece.team !== "BALL" && !piece.inactive && canControlPieceStatus(piece);
  }

  function isOwnCardPiece(piece) {
    return !!piece && piece.team !== "BALL" && myTeam !== "spectator" && pieceTeamKey(piece) === myTeam;
  }

  function hasBackPermission(cardId) {
    if (!cardId || !user?.uid) return false;
    return !!cardRevealPermissions?.[cardId]?.[user.uid];
  }

  function canViewCardBack(piece, cardId) {
    if (!sessionCode || !cardVisibilityMode || cardVisibilityMode === "open") return true;
    if (isOwnCardPiece(piece)) return true;
    return hasBackPermission(cardId);
  }

  function canPreviewMovementForPiece(piece) {
    if (!piece || piece.team === "BALL") return false;
    if (!sessionCode || isOwnCardPiece(piece)) return true;
    if (cardVisibilityMode === "open") return true;
    if (cardVisibilityMode === "private") return canViewCardBack(piece, piece.cardId);
    return false;
  }

  async function setSessionCardMode(mode) {
    if (!sessionCode || sessionEndingRef.current || !user?.uid || user.uid !== sessionOwnerUid || !["open", "private"].includes(mode)) return;
    await updateDoc(sessionRef(sessionCode.toUpperCase()), { cardVisibilityMode: mode, updatedAt: serverTimestamp(), expiresAt: nextSessionExpiryDate() });
  }

  async function requestCardFlip(cardId) {
    if (!sessionCode || sessionEndingRef.current || !user?.uid || !cardId || cardVisibilityMode !== "private") return;
    const ref = sessionRef(sessionCode.toUpperCase());
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const requests = { ...(data.cardRevealRequests || {}) };
      requests[cardId] = { ...(requests[cardId] || {}), [user.uid]: true };
      transaction.set(ref, { cardRevealRequests: requests, updatedAt: serverTimestamp(), expiresAt: nextSessionExpiryDate() }, { merge: true });
    });
  }

  async function allowCardFlip(cardId, viewerUid) {
    if (!sessionCode || sessionEndingRef.current || !user?.uid || !cardId || !viewerUid) return;
    const ownerPiece = (piecesRef.current || []).find(piece => piece.cardId === cardId);
    if (!isOwnCardPiece(ownerPiece)) return;
    const ref = sessionRef(sessionCode.toUpperCase());
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const permissions = { ...(data.cardRevealPermissions || {}) };
      permissions[cardId] = { ...(permissions[cardId] || {}), [viewerUid]: true };
      const requests = { ...(data.cardRevealRequests || {}) };
      const cardRequests = { ...(requests[cardId] || {}) };
      delete cardRequests[viewerUid];
      if (Object.keys(cardRequests).length) requests[cardId] = cardRequests;
      else delete requests[cardId];
      transaction.set(ref, { cardRevealPermissions: permissions, cardRevealRequests: requests, updatedAt: serverTimestamp(), expiresAt: nextSessionExpiryDate() }, { merge: true });
    });
  }

  function handleInspectorSideChange(nextSide) {
    if (nextSide === "back" && inspectedCard && !canViewCardBack(inspectedPiece, inspectedCard.id)) return;
    setInspectorCardSide(nextSide);
    setPreferredInspectorCardSide(nextSide);
  }

  function buildLiveBoardState(overrides = {}) {
    const effectiveSettings = overrides.settings ? normalizeSettingsForApp(overrides.settings) : settingsRef.current;
    const effectivePieces = overrides.pieces || piecesRef.current;
    const {
      pieces: _overridePieces,
      cardState: _overrideCardState,
      settings: _overrideSettings,
      sessionLibraryById: _legacySessionLibraryById,
      sessionCardsById: _legacySessionCardsById,
      activeRuleSet: _overrideActiveRuleSet,
      ...restOverrides
    } = overrides;
    const effectiveSessionLibraryById = normalizeSessionCardsById(sessionLibraryByIdRef.current);
    const sessionCardSourceState = Object.keys(effectiveSessionLibraryById).length
      ? buildCardStateFromSessionLibrary(effectiveSessionLibraryById)
      : cardStateRef.current;
    const liveState = {
      version: "pitch-44-goal-5x2",
      dieType,
      dieResult: { blue: blueDieResult, red: redDieResult },
      showCoordinates,
      blueFormationId,
      redFormationId,
      activeRuleSet: normalizeRuleSet(overrides.activeRuleSet || activeRuleSetRef.current),
      ...restOverrides,
      settings: effectiveSettings,
      pieces: sanitizePiecesCardIds(effectivePieces, sessionCardSourceState, effectiveSettings, {}, sessionCardsByIdRef.current),
    };
    return liveState;
  }

  function applyLiveBoardState(data, sharedAssignments = null) {
    if (!data) return;
    const nextSettings = data.settings ? normalizeSettingsForApp(data.settings) : settings;
    const nextSessionLibraryById = normalizeSessionCardsById(data.sessionLibraryById || sessionLibraryByIdRef.current);
    const nextSessionCardState = Object.keys(nextSessionLibraryById).length
      ? buildCardStateFromSessionLibrary(nextSessionLibraryById)
      : cardStateRef.current;
    const nextSessionCardsById = normalizeSessionCardsById(data.sessionCardsById || sessionCardsByIdRef.current);
    const incomingPieces = data.pieces ? data.pieces : piecesRef.current;
    const assignedPieces = applySessionCardAssignments(incomingPieces, sharedAssignments);
    const nextPieces = data.pieces || sharedAssignments
      ? ensureBenchReserveCount(sanitizePiecesCardIds(assignedPieces, nextSessionCardState, nextSettings, {}, nextSessionCardsById), nextSettings)
      : sanitizePiecesCardIds(piecesRef.current, nextSessionCardState, nextSettings, {}, nextSessionCardsById);

    if (data.sessionLibraryById) {
      sessionLibraryByIdRef.current = nextSessionLibraryById;
      setSessionLibraryById(nextSessionLibraryById);
    }
    if (data.sessionCardsById) {
      sessionCardsByIdRef.current = nextSessionCardsById;
      setSessionCardsById(nextSessionCardsById);
    }
    if (data.settings) setSettings(nextSettings);
    if (data.pieces || sharedAssignments) {
      piecesRef.current = nextPieces;
      setPieces(nextPieces);
    }
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) {
      if (data.dieResult && typeof data.dieResult === "object") {
        setBlueDieResult(data.dieResult.blue ?? null);
        setRedDieResult(data.dieResult.red ?? null);
      } else {
        setBlueDieResult(data.dieResult ?? null);
        setRedDieResult(null);
      }
    }
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
    if (data.activeRuleSet) {
      const nextActiveRuleSet = normalizeRuleSet(data.activeRuleSet);
      activeRuleSetRef.current = nextActiveRuleSet;
      setActiveRuleSet(nextActiveRuleSet);
      setRuleSetDraft(nextActiveRuleSet);
      setRuleSetSelectionId(nextActiveRuleSet.id);
    }
    if (!sessionCode) {
      setGameMode(normalizeGameMode(data.gameMode));
      setMovementStateByPieceId(normalizeMovementState(data.movementStateByPieceId));
    }
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
  }

  function buildSharedTimelineMeta(timeline) {
    return createSharedTimelineMeta(timeline, clientIdRef.current, captureTimelineGameState());
  }

  function buildTimelineTrackerSnapshot(state) {
    const tracker = normalizeTrackerSnapshot(state.tracker);
    return {
      ...tracker,
      // Panel visibility is session UI state, not timeline gameplay state.
      enabled: trackerSharedEnabledRef.current,
      gameMode: normalizeGameMode(state.gameMode),
      movementStateByPieceId: normalizeMovementState(state.movementStateByPieceId),
      updatedBy: user?.uid || "",
    };
  }

  function resetTransientGameplayUI({ restoreCanonical = false } = {}) {
    cancelDelayedResolutionTimer();
    setSelectedId(null);
    setHoveredCell(null);
    setPassTargetIntentPending(false);
    passTargetIntentPendingRef.current = false;
    setPassCancelIntentPending(false);
    passCancelIntentPendingRef.current = false;
    setBonusActionEndIntentPending(false);
    bonusActionEndIntentPendingRef.current = false;
    setDiceRollIntentPending(false);
    diceRollIntentPendingRef.current = false;
    setActionStartIntentPending(false);
    actionStartIntentPendingRef.current = false;
    setPendingAutoMove(null);
    setPendingThreeTwoMove(null);
    if (restoreCanonical) {
      const timeline = gameTimelineRef.current;
      const state = timeline && timelineStateAt(timeline, timeline.cursor);
      if (state) applyTimelineGameState(state, { preserveLocalSelection: false });
    }
  }

  function enqueueTimelineSync(previousTimeline, nextTimeline, state, entry = null, options = {}) {
    const traceId = String(entry?.metadata?.traceId || entry?.metadata?.rollEvent?.traceId || createMultiplayerTraceId(entry?.type || "timeline"));
    pendingTimelineSyncCountRef.current += 1;
    multiplayerTracerRef.current.multiplayer("TIMELINE_SYNC_QUEUED", {
      traceId,
      type: entry?.type || "BASELINE",
      previousRevision: previousTimeline?.revision ?? null,
      nextRevision: nextTimeline?.revision ?? null,
      pendingCount: pendingTimelineSyncCountRef.current,
    });
    timelineSyncQueueRef.current = timelineSyncQueueRef.current
      .then(() => syncTimelineStateToSession(previousTimeline, nextTimeline, state, entry, { ...options, traceId }))
      .catch(error => {
        multiplayerTracerRef.current.error("TIMELINE_SYNC_FAILED", error, {
          traceId,
          type: entry?.type || "BASELINE",
          failedRevision: nextTimeline?.revision ?? null,
        });
        console.error("Timeline sync queue failed", error);
        if (previousTimeline && shouldRollbackFailedTimelineCommit(gameTimelineRef.current, nextTimeline)) {
          multiplayerTracerRef.current.multiplayer("TIMELINE_OPTIMISTIC_ROLLBACK", {
            traceId,
            fromRevision: nextTimeline?.revision ?? null,
            toRevision: previousTimeline?.revision ?? null,
          });
          replaceGameTimeline(previousTimeline);
          // A rejected optimistic gameplay commit must also discard every local
          // interaction derived from that rejected revision. Keeping selection
          // here creates a ghost targeting cursor over canonical gameplay.
          applyTimelineGameState(timelineStateAt(previousTimeline, previousTimeline.cursor), { preserveLocalSelection: false });
          resetTransientGameplayUI();
        } else {
          multiplayerTracerRef.current.guard("TIMELINE_ROLLBACK_SKIPPED", "failed commit is no longer the current optimistic revision", {
            traceId,
            currentRevision: gameTimelineRef.current?.revision ?? null,
            failedRevision: nextTimeline?.revision ?? null,
          });
        }
      })
      .finally(() => {
        pendingTimelineSyncCountRef.current = Math.max(0, pendingTimelineSyncCountRef.current - 1);
      });
    return timelineSyncQueueRef.current;
  }

  async function syncTimelineStateToSession(previousTimeline, nextTimeline, state, entry = null, { baseline = false, traceId = "" } = {}) {
    if (!sessionCode || sessionEndingRef.current || isApplyingSessionRef.current) return true;
    const code = sessionCode.toUpperCase();
    const previous = previousTimeline ? normalizeTimeline(previousTimeline, state) : null;
    const next = normalizeTimeline(nextTimeline, state);
    const nextState = createGameState(state);
    const sessionDocumentRef = sessionRef(code);
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // Read only for semantic conflict detection. The actual write is a batch
        // without a document-version precondition, so unrelated heartbeat/dice
        // writes cannot invalidate a gameplay commit after this read.
        const snap = await getDoc(sessionDocumentRef);
        if (!snap.exists()) throw new Error("Session missing");
        const remoteMeta = snap.data().sharedTimeline || null;
        if (!baseline && remoteMeta && previous && remoteMeta.recordingId === previous.recordingId) {
          const remoteRevision = Math.max(0, Number(remoteMeta.revision) || 0);
          if (remoteRevision !== previous.revision) {
            const conflict = new Error("Timeline changed on another client");
            conflict.code = "timeline-conflict";
            throw conflict;
          }
        }
        if (!baseline && remoteMeta && remoteMeta.recordingId !== next.recordingId) {
          const conflict = new Error("A different match recording is active");
          conflict.code = "timeline-conflict";
          throw conflict;
        }

        const sharedTracker = buildTimelineTrackerSnapshot(nextState);
        const sharedTimeline = buildSharedTimelineMeta(next);
        const blueRollId = timelineDiceRollId(next, "blue");
        const redRollId = timelineDiceRollId(next, "red");
        const sharedDice = {
          blue: { value: nextState.dice.blueResult, dieType: nextState.dice.blueLastDieType, rollId: blueRollId },
          red: { value: nextState.dice.redResult, dieType: nextState.dice.redLastDieType, rollId: redRollId },
        };
        const batch = writeBatch(db);

        if (baseline) {
          const board = buildLiveBoardState({
            settings: nextState.settings,
            pieces: nextState.pieces,
            activeRuleSet: nextState.ruleSet,
            dieType: nextState.dice.dieType,
            dieResult: { blue: nextState.dice.blueResult, red: nextState.dice.redResult },
          });
          batch.set(sessionDocumentRef, {
            board: encodeForFirestore(board),
            sharedTracker: encodeForFirestore(sharedTracker),
            sharedTimeline: encodeForFirestore(sharedTimeline),
            sharedDice: encodeForFirestore(sharedDice),
            cardAssignments: buildSessionCardAssignments(nextState.pieces),
            cardAssignmentsUpdatedBy: clientIdRef.current,
            updatedAt: serverTimestamp(),
            expiresAt: nextSessionExpiryDate(),
            updatedBy: clientIdRef.current,
          }, { merge: true });
        } else {
          batch.update(sessionDocumentRef, {
            "sharedTimeline.cursor": sharedTimeline.cursor,
            "sharedTimeline.revision": sharedTimeline.revision,
            "sharedTimeline.entryCount": sharedTimeline.entryCount,
            "sharedTimeline.endedAt": sharedTimeline.endedAt || null,
            "sharedTimeline.updatedBy": sharedTimeline.updatedBy,
            sharedTracker: encodeForFirestore(sharedTracker),
            sharedDice: encodeForFirestore(sharedDice),
            updatedAt: serverTimestamp(),
            expiresAt: nextSessionExpiryDate(),
            updatedBy: clientIdRef.current,
          });
        }
        if (entry) {
          batch.set(sessionTimelineEntryRef(code, next.recordingId, entry.sequence), {
            recordingId: next.recordingId,
            sequence: entry.sequence,
            entry: encodeForFirestore(entry),
            updatedAt: serverTimestamp(),
          }, { merge: false });
        }

        multiplayerTracerRef.current.multiplayer("HOST_COMMIT_STARTED", { traceId, type: entry?.type || "BASELINE", revision: next.revision, attempt, isHost: isSessionHost });
        console.info("[TimelineSync] COMMIT_STARTED", { type: entry?.type || "BASELINE", revision: next.revision, attempt });
        await batch.commit();
        multiplayerTracerRef.current.multiplayer("HOST_COMMIT_CONFIRMED", { traceId, type: entry?.type || "BASELINE", revision: next.revision, attempt, isHost: isSessionHost });
        console.info("[TimelineSync] COMMIT_CONFIRMED", { type: entry?.type || "BASELINE", revision: next.revision, attempt });
        sessionLastSaveAtRef.current = Date.now();
        if (!sessionEndingRef.current) setSessionStatus("Online saved");
        return true;
      } catch (error) {
        const retryable = ["aborted", "failed-precondition", "unavailable", "deadline-exceeded", "resource-exhausted"].includes(error?.code);
        multiplayerTracerRef.current.error("HOST_COMMIT_FAILED", error, { traceId, type: entry?.type || "BASELINE", revision: next.revision, attempt, isHost: isSessionHost });
        console.error("[TimelineSync] COMMIT_FAILED", { type: entry?.type || "BASELINE", revision: next.revision, attempt, code: error?.code, error });
        if (error?.code === "timeline-conflict") {
          if (!sessionEndingRef.current) setSessionStatus("Timeline conflict — refreshing");
          throw error;
        }
        if (!retryable || attempt >= maxAttempts) {
          if (!sessionEndingRef.current) setSessionStatus("Timeline sync error");
          throw error;
        }
        await new Promise(resolve => window.setTimeout(resolve, 150 * (2 ** (attempt - 1))));
      }
    }
    return false;
  }

  function cancelDelayedResolutionTimer() {
    if (delayedResolutionTimerRef.current) {
      window.clearTimeout(delayedResolutionTimerRef.current);
      delayedResolutionTimerRef.current = null;
    }
    delayedResolutionEntryIdRef.current = "";
    setLiveDelayedResolutionEntryId("");
  }

  function scheduleDelayedResolution(request) {
    const traceId = String(request?.payload?.traceId || request?.payload?.rollEvent?.traceId || request?.traceId || actionTraceIdsRef.current.get(request?.actionId) || "");
    if (!request) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "missing delayed-resolution request", { traceId });
      return;
    }
    if (replayModeRef.current) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "replay mode", { traceId, actionId: request.actionId });
      return;
    }
    const entryId = String(request.entryId || "");
    if (!entryId) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "missing timeline entry id", { traceId, actionId: request.actionId });
      return;
    }
    // Repeated Firestore snapshots must not restart the same suspense timer.
    if (delayedResolutionEntryIdRef.current === entryId && delayedResolutionTimerRef.current) {
      multiplayerTracerRef.current.guard("RESOLUTION_SCHEDULE_SKIPPED", "already scheduled", { traceId, entryId });
      return;
    }
    cancelDelayedResolutionTimer();
    delayedResolutionEntryIdRef.current = entryId;
    setLiveDelayedResolutionEntryId(entryId);
    if (sessionCode && !sessionAuthorityRef.current.isHost) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "not host", { traceId, entryId, actionId: request.actionId, ownerUid: sessionAuthorityRef.current.ownerUid, userUid: sessionAuthorityRef.current.userUid });
      return;
    }
    multiplayerTracerRef.current.multiplayer("HOST_RESOLUTION_SCHEDULED", { traceId, entryId, actionId: request.actionId, resolveAt: request.resolveAt });
    delayedResolutionTimerRef.current = window.setTimeout(() => {
      delayedResolutionTimerRef.current = null;
      if (sessionCode && !sessionAuthorityRef.current.isHost) {
        multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "host authority lost before timer fired", { traceId, entryId, actionId: request.actionId, ownerUid: sessionAuthorityRef.current.ownerUid, userUid: sessionAuthorityRef.current.userUid });
        delayedResolutionEntryIdRef.current = "";
        setLiveDelayedResolutionEntryId("");
        return;
      }
      const currentTimeline = gameTimelineRef.current;
      const canonical = canonicalDelayedResolutionContext(currentTimeline);
      if (!canonical || canonical.request.entryId !== entryId) {
        const diagnosis = diagnoseCanonicalDelayedResolution(currentTimeline, entryId);
        multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "stale timeline or missing canonical request", {
          traceId,
          entryId,
          canonicalEntryId: canonical?.request?.entryId || "",
          diagnosis,
        });
        delayedResolutionEntryIdRef.current = "";
        setLiveDelayedResolutionEntryId("");
        return;
      }
      // The host resolves from the canonical Timeline cursor state. React refs
      // may lag behind a Firestore hydration and must never veto authority.
      multiplayerTracerRef.current.multiplayer("HOST_RESOLUTION_STARTED", { traceId, entryId, actionId: canonical.request.actionId });
      const execution = delayedResolutionExecutionRef.current.run(
        { entryId, actionId: canonical.request.actionId },
        () => applyDelayedActionResolution(canonical.request, canonical.actionResolution),
      );
      if (execution.status === "already-active") {
        multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "resolution already executing", { traceId, entryId, actionId: canonical.request.actionId });
        return;
      }
      if (execution.status === "failed") {
        multiplayerTracerRef.current.error("RESOLUTION_FAILED", execution.error, {
          traceId,
          entryId,
          actionId: canonical.request.actionId,
          requestId: canonical.request?.payload?.rollEvent?.requestId || "",
          eventId: canonical.request?.payload?.rollEvent?.id || "",
        });
        return;
      }
      multiplayerTracerRef.current.multiplayer("HOST_RESOLUTION_COMPLETED", { traceId, entryId, actionId: canonical.request.actionId });
    }, delayedResolutionRemaining(request));
  }

  function handleLiveTimelineEntries(previousTimeline, hydratedTimeline) {
    const previousEntryIds = new Set((previousTimeline?.entries || []).map(entry => String(entry?.id || "")));
    const introducedEntries = (hydratedTimeline?.entries || []).filter(entry => entry?.id && !previousEntryIds.has(String(entry.id)));
    const hasPresentationBaseline = liveTimelinePresentationReadyRef.current;
    liveTimelinePresentationReadyRef.current = true;

    // A newly joined client restores the current game silently. Result notices
    // belong to a live outcome, never to hydration, replay, or cursor travel.
    if (hasPresentationBaseline) {
      introducedEntries.forEach(entry => presentPassResultEntry(entry));
    }

    if (introducedEntries.some(entry => ["PASS_INTERCEPTION_MISSED", "PASS_COMPLETED", "PASS_INTERCEPTED", "PASS_NATURAL_20"].includes(entry?.type))) {
      cancelDelayedResolutionTimer();
    }

    // A normal live roll may arrive here from the other player. A historical
    // cursor or a timeline that already has a later outcome never owns a timer.
    if (hydratedTimeline?.cursor !== hydratedTimeline?.entries?.length) return;
    const state = timelineStateAt(hydratedTimeline, hydratedTimeline.cursor);
    const request = delayedResolutionAtCursor(hydratedTimeline, state?.actionResolution);
    if (request) scheduleDelayedResolution(request);
  }

  function ensureHostCanonicalDelayedResolution(timeline) {
    const state = timelineStateAt(timeline, timeline?.cursor);
    const request = delayedResolutionAtCursor(timeline, state?.actionResolution);
    if (shouldScheduleCanonicalDelayedResolution({
      sessionActive: Boolean(sessionCode),
      isHost: sessionAuthorityRef.current.isHost,
      replayMode: replayModeRef.current,
      sessionEnding: sessionEndingRef.current,
      timeline,
      request,
    })) scheduleDelayedResolution(request);
  }

  function hydrateSharedTimelineIfReady() {
    const meta = sharedTimelineMetaRef.current;
    const hydrated = hydrateSessionTimeline(meta, sessionTimelineEntriesRef.current, captureTimelineGameState());
    if (!hydrated) return;
    const localTimeline = gameTimelineRef.current;
    const reconciliationMode = timelineReconciliationMode(localTimeline, hydrated, pendingTimelineSyncCountRef.current);
    if (reconciliationMode === "ignore") return;
    if (reconciliationMode === "replace") {
      replaceGameTimeline(hydrated);
      handleLiveTimelineEntries(localTimeline, hydrated);
    }
    applyTimelineGameState(timelineStateAt(hydrated, hydrated.cursor), {
      preserveLocalSelection: reconciliationMode === "restore",
    });
    // Host authority is derived from canonical state, not only from the brief
    // moment when a remote DICE_ROLLED entry is first detected.
    ensureHostCanonicalDelayedResolution(hydrated);
  }

  async function saveSessionState(overrides = {}) {
    if (!user || !sessionCode || sessionEndingRef.current) return;
    if (!sessionHydratedRef.current) return;
    try {
      const code = sessionCode.toUpperCase();
      await updateDoc(sessionRef(code), {
        board: encodeForFirestore(buildLiveBoardState(overrides)),
        updatedAt: serverTimestamp(),
        expiresAt: nextSessionExpiryDate(),
        updatedBy: clientIdRef.current,
      });
      sessionLastSaveAtRef.current = Date.now();
      setSessionStatus("Online saved");
    } catch (error) {
      console.error(error);
      if (!sessionEndingRef.current) setSessionStatus("Online error");
    }
  }

  async function setChooseRollMode(enabled) {
    if (sessionCode && !isSessionHost) return;
    const nextEnabled = Boolean(enabled);
    setChooseRollEnabled(nextEnabled);
    if (!nextEnabled) setChooseRollForTeam(null);
    if (!sessionCode || sessionEndingRef.current) return;
    try {
      await updateDoc(sessionRef(sessionCode.toUpperCase()), {
        chooseRollEnabled: nextEnabled,
        updatedAt: serverTimestamp(),
        expiresAt: nextSessionExpiryDate(),
        updatedBy: clientIdRef.current,
      });
    } catch (error) {
      console.error("Choose Roll sync failed", error);
      setSessionStatus("Online error");
    }
  }

  function scheduleSessionLiveSave() {
    if (!user || !sessionCode || gameMode === "match" || sessionEndingRef.current || isApplyingSessionRef.current || !sessionHydratedRef.current) return;
    sessionSavePendingRef.current = true;
    setSessionStatus("Online saving...");

    if (sessionSaveTimerRef.current || sessionSaveInFlightRef.current) return;

    const run = async () => {
      sessionSaveTimerRef.current = null;
      if (!sessionSavePendingRef.current || !user || !sessionCode || sessionEndingRef.current || isApplyingSessionRef.current || !sessionHydratedRef.current) return;

      const elapsed = Date.now() - sessionLastSaveAtRef.current;
      if (elapsed < SESSION_LIVE_SAVE_INTERVAL_MS) {
        sessionSaveTimerRef.current = window.setTimeout(run, SESSION_LIVE_SAVE_INTERVAL_MS - elapsed);
        return;
      }

      sessionSavePendingRef.current = false;
      sessionSaveInFlightRef.current = true;
      await saveSessionState();
      sessionSaveInFlightRef.current = false;

      if (sessionSavePendingRef.current) {
        sessionSaveTimerRef.current = window.setTimeout(run, SESSION_LIVE_SAVE_INTERVAL_MS);
      }
    };

    sessionSaveTimerRef.current = window.setTimeout(run, 0);
  }

  async function writeSessionCards(code, sessionLibrary) {
    const entries = Object.entries(normalizeSessionCardsById(sessionLibrary));
    for (let start = 0; start < entries.length; start += 450) {
      const batch = writeBatch(db);
      for (const [cardId, card] of entries.slice(start, start + 450)) {
        batch.set(sessionCardRef(code, cardId), {
          card: encodeForFirestore(card),
          updatedAt: serverTimestamp(),
        }, { merge: false });
      }
      await batch.commit();
    }
  }

  async function deleteSessionData(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return;
    const cardsSnapshot = await getDocs(sessionCardsCollectionRef(normalizedCode));
    const cardDocs = cardsSnapshot.docs;
    for (let start = 0; start < cardDocs.length; start += 450) {
      const batch = writeBatch(db);
      for (const cardDoc of cardDocs.slice(start, start + 450)) batch.delete(cardDoc.ref);
      await batch.commit();
    }
    const timelineSnapshot = await getDocs(sessionTimelineEntriesCollectionRef(normalizedCode));
    const timelineDocs = timelineSnapshot.docs;
    for (let start = 0; start < timelineDocs.length; start += 450) {
      const batch = writeBatch(db);
      for (const timelineDoc of timelineDocs.slice(start, start + 450)) batch.delete(timelineDoc.ref);
      await batch.commit();
    }
    const runtimeSnapshot = await getDocs(sessionRuntimeCollectionRef(normalizedCode));
    const runtimeDocs = runtimeSnapshot.docs;
    for (let start = 0; start < runtimeDocs.length; start += 450) {
      const batch = writeBatch(db);
      for (const runtimeDoc of runtimeDocs.slice(start, start + 450)) batch.delete(runtimeDoc.ref);
      await batch.commit();
    }
    await deleteDoc(sessionRef(normalizedCode));
  }

  async function createSession() {
    sessionEndingRef.current = false;
    if (!user || user.isAnonymous) {
      setSessionStatus("Login first");
      return;
    }
    const code = generateSessionCode();
    const sessionLibrarySnapshot = buildSessionLibraryById(cardStateRef.current);
    sessionLibraryByIdRef.current = sessionLibrarySnapshot;
    setSessionLibraryById(sessionLibrarySnapshot);
    setSessionStatus("Creating cards...");

    try {
      await writeSessionCards(code, sessionLibrarySnapshot);
      setSessionStatus("Creating session...");
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
        participants: {
          [user.uid]: {
            email: user.email || "",
            role: "host",
            team: "pending",
            joinedAt: new Date().toISOString(),
            lastSeen: serverTimestamp(),
            clientId: clientIdRef.current,
          }
        },
        teamOwners: { blue: "", red: "" },
        cardVisibilityMode: "",
        cardRevealPermissions: {},
        cardRevealRequests: {},
        sharedDice: {
          blue: { value: null, dieType: 20 },
          red: { value: null, dieType: 20 },
        },
        chooseRollEnabled: false,
        sharedRuler: {
          active: false,
          ownerUid: "",
          ownerClientId: "",
          ownerTeam: "",
          measureType: "center",
          passMark: 8,
          shotMark: 12,
          start: null,
          end: null,
        },
        sharedTracker: {
          enabled: true,
          gameStarted: false,
          startingTeam: "red",
          currentTurn: 0,
          usedActions: { red: 0, blue: 0 },
          settings: { ...trackerSettings },
          gameMode: "editor",
          movementStateByPieceId: {},
          updatedBy: user.uid,
        },
        board: encodeForFirestore(buildLiveBoardState()),
        cardAssignments: buildSessionCardAssignments(piecesRef.current),
        cardAssignmentsUpdatedBy: clientIdRef.current,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: nextSessionExpiryDate(),
        updatedBy: clientIdRef.current,
      }, { merge: false });
      sessionHydratedRef.current = true;
      setSessionCode(code);
      setJoinCode(code);
      setSessionStatus("Online");
    } catch (error) {
      console.error("Session creation failed", error);
      setSessionStatus(`Create error: ${error?.message || "unknown"}`);
      try { await deleteSessionData(code); } catch (cleanupError) { console.error("Partial session cleanup failed", cleanupError); }
    }
  }

  async function completeJoinSession(code, sessionUser, preferredTeam = "", preferredCardMode = "") {
    try {
      setSessionStatus("Joining...");
      const ref = sessionRef(code);
      await runTransaction(db, async transaction => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        const data = snap.data();
        if (isSessionExpired(data)) throw new Error("Session expired");
        const owners = { blue: data.teamOwners?.blue || "", red: data.teamOwners?.red || "" };
        const participants = { ...(data.participants || {}) };
        const hostUid = data.ownerUid || "";
        let team = "spectator";
        let role = participants[sessionUser.uid]?.role || (sessionUser.uid === hostUid ? "host" : "guest");
        let nextCardMode = data.cardVisibilityMode || "";

        if (owners.blue === sessionUser.uid) team = "blue";
        else if (owners.red === sessionUser.uid) team = "red";
        else if (participants[sessionUser.uid]?.team) team = participants[sessionUser.uid].team;
        else if (sessionUser.uid === hostUid && (owners.blue === hostUid || owners.red === hostUid)) team = owners.blue === hostUid ? "blue" : "red";
        else if (!owners.blue && !owners.red && sessionUser.uid !== hostUid) {
          if (!["blue", "red"].includes(preferredTeam) || !["open", "private"].includes(preferredCardMode)) {
            throw new Error("Team and card mode are required");
          }
          team = preferredTeam;
          const otherTeam = team === "blue" ? "red" : "blue";
          owners[team] = sessionUser.uid;
          owners[otherTeam] = hostUid;
          nextCardMode = preferredCardMode;
          if (hostUid) {
            participants[hostUid] = {
              ...(participants[hostUid] || {}),
              role: "host",
              team: otherTeam,
            };
          }
        } else if (!owners.blue && owners.red !== sessionUser.uid && sessionUser.uid !== hostUid) {
          team = "blue";
          owners.blue = sessionUser.uid;
        } else if (!owners.red && owners.blue !== sessionUser.uid && sessionUser.uid !== hostUid) {
          team = "red";
          owners.red = sessionUser.uid;
        } else if (sessionUser.uid === hostUid && !owners.blue && !owners.red) {
          team = "pending";
        } else {
          team = "spectator";
          role = sessionUser.uid === hostUid ? "host" : "spectator";
        }

        participants[sessionUser.uid] = {
          ...(participants[sessionUser.uid] || {}),
          email: sessionUser.email || "Guest",
          guest: !!sessionUser.isAnonymous,
          role,
          team,
          joinedAt: participants[sessionUser.uid]?.joinedAt || new Date().toISOString(),
          lastSeen: serverTimestamp(),
          clientId: clientIdRef.current,
        };

        const players = { ...(data.players || {}) };
        players[sessionUser.uid] = {
          email: sessionUser.email || "Guest",
          guest: !!sessionUser.isAnonymous,
          joinedAt: players[sessionUser.uid]?.joinedAt || new Date().toISOString(),
          clientId: clientIdRef.current,
        };

        transaction.set(ref, {
          teamOwners: owners,
          participants,
          players,
          ...(nextCardMode ? { cardVisibilityMode: nextCardMode } : {}),
          updatedAt: serverTimestamp(),
          expiresAt: nextSessionExpiryDate(),
        }, { merge: true });
      });

      sessionHydratedRef.current = false;
      setJoinSetup(null);
      setSessionCode(code);
      setSessionStatus("Online");
    } catch (error) {
      console.error(error);
      setSessionStatus("Join error");
    }
  }

  async function joinSession() {
    sessionEndingRef.current = false;
    const code = String(joinCode || "").trim().toUpperCase();
    let sessionUser = user;
    if (!sessionUser) {
      try {
        setSessionStatus("Guest login...");
        const credential = await signInAnonymously(auth);
        sessionUser = credential.user;
      } catch (error) {
        console.error(error);
        setSessionStatus("Guest login error");
        return;
      }
    }
    if (!code) return;

    try {
      setSessionStatus("Joining...");
      const ref = sessionRef(code);
      const initialSnap = await getDoc(ref);
      if (!initialSnap.exists()) {
        setSessionStatus("Code not found");
        return;
      }
      const initialData = initialSnap.data();
      if (isSessionExpired(initialData)) {
        setSessionStatus("Session expired");
        try { await deleteSessionData(code); } catch (cleanupError) { console.error("Expired session cleanup failed", cleanupError); }
        return;
      }
      const existingOwners = initialData.teamOwners || {};
      const existingParticipants = initialData.participants || {};
      const isReturning = !!existingParticipants[sessionUser.uid] || existingOwners.blue === sessionUser.uid || existingOwners.red === sessionUser.uid;
      const needsInitialSetup = !isReturning && !existingOwners.blue && !existingOwners.red && initialData.ownerUid !== sessionUser.uid;

      if (needsInitialSetup) {
        setJoinSetup({ code, sessionUser, team: "", cardMode: "" });
        setSessionStatus("Choose team and cards");
        return;
      }

      await completeJoinSession(code, sessionUser);
    } catch (error) {
      console.error(error);
      setSessionStatus("Join error");
    }
  }

  function leaveSession(finalStatus = "Offline") {
    const safeFinalStatus = normalizeSessionStatusLabel(finalStatus);
    sessionHydratedRef.current = false;
    sessionSavePendingRef.current = false;
    if (sessionSaveTimerRef.current) {
      window.clearTimeout(sessionSaveTimerRef.current);
      sessionSaveTimerRef.current = null;
    }
    setSessionCode("");
    setSessionPlayers(0);
    setSessionCardsById({});
    sessionCardsByIdRef.current = {};
    setSessionLibraryById({});
    sessionLibraryByIdRef.current = {};
    sessionAssignmentsRef.current = {};
    sharedTimelineMetaRef.current = null;
    sessionTimelineEntriesRef.current = [];
    gameTimelineRef.current = null;
    setGameTimeline(null);
    setMyTeam("spectator");
    setSessionOwnerUid("");
    setTeamOwners({ blue: "", red: "" });
    setCardVisibilityMode("");
    setCardRevealPermissions({});
    setCardRevealRequests({});
    setSessionParticipants({});
    setTrackerSharedEnabled(false);
    trackerSharedEnabledRef.current = false;
    setMeasureMode(false);
    setSharedRulerOwnerUid("");
    setSharedRulerOwnerTeam("");
    setMeasureStart(null);
    setMeasureEnd(null);
    setRulerPanelDragging(null);
    setRulerPanelResizing(null);
    setSessionStatus(safeFinalStatus);
  }

  async function waitForSessionWritesToFinish(timeoutMs = 15000) {
    const startedAt = Date.now();
    // Timeline writes are serialized through this promise. Await the exact queue
    // that existed when End Session started, then wait for any legacy board save.
    await timelineSyncQueueRef.current;
    while (sessionSaveInFlightRef.current || pendingTimelineSyncCountRef.current > 0) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("Timed out waiting for active session writes to finish");
      }
      await new Promise(resolve => window.setTimeout(resolve, 25));
    }
  }

  async function endSession() {
    if (!sessionCode || !user?.uid || user.uid !== sessionOwnerUid) return;
    if (!window.confirm("End this session permanently? The code will stop working for everyone.")) return;

    const code = sessionCode.toUpperCase();
    sessionEndingRef.current = true;
    sessionHydratedRef.current = false;
    sessionSavePendingRef.current = false;
    if (sessionSaveTimerRef.current) {
      window.clearTimeout(sessionSaveTimerRef.current);
      sessionSaveTimerRef.current = null;
    }
    cancelDelayedResolutionTimer();
    setSessionStatus("Ending session...");

    try {
      await waitForSessionWritesToFinish();
      try {
        await updateDoc(sessionRef(code), {
          status: "ending",
          endedBy: user.uid,
          endedAt: serverTimestamp(),
        });
      } catch (error) {
        // Retrying End Session after the document was already removed is safe.
        if (error?.code !== "not-found") throw error;
      }
      await deleteSessionData(code);
      leaveSession("Session ended");
    } catch (error) {
      sessionEndingRef.current = false;
      sessionHydratedRef.current = true;
      console.error("End session failed", error);
      setSessionStatus(`End error: ${error?.message || "unknown"}`);
    }
  }



  async function saveCloudState(overrides = {}, label = "Cloud saved") {
    if (!user || replayModeRef.current) return;
    try {
      setCloudStatus("Saving cards...");
      const effectiveCardState = overrides.cardState ? normalizeCardState(overrides.cardState) : cardStateRef.current;
      const changedCardDocuments = await writeCardsToCloud(user.uid, buildCardLibraryState(effectiveCardState).cards);
      setCloudStatus(changedCardDocuments ? `Saving board... (${changedCardDocuments} card changes)` : "Saving board...");
      const payload = encodeForFirestore(buildCloudState(overrides));
      await setDoc(userStateV2Ref(user.uid), {
        ...payload,
        storageVersion: 2,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      autosaveDirtyRef.current = false;
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
      const v2Snap = await getDoc(userStateV2Ref(currentUser.uid));

      if (v2Snap.exists()) {
        const cloudCards = await readCardsFromCloud(currentUser.uid);
        const decoded = decodeFromFirestore(v2Snap.data());
        isApplyingCloudRef.current = true;
        applyStoredState(decoded, cloudCards);
        window.setTimeout(() => { isApplyingCloudRef.current = false; }, 300);
        setCloudStatus(`Cloud loaded (${cloudCards.length} cards)`);
      } else {
        cloudCardHashesRef.current = new Map();
        const localCards = buildCardLibraryState(cardStateRef.current).cards || [];
        await writeCardsToCloud(currentUser.uid, localCards);
        await setDoc(userStateV2Ref(currentUser.uid), {
          ...encodeForFirestore(buildCloudState()),
          storageVersion: 2,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: false });
        setCloudStatus("New cloud storage created");
      }
      setCloudReady(true);
      setCloudError("");
    } catch (error) {
      console.error(error);
      setCloudStatus("Cloud load error");
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
      if (currentUser && !currentUser.isAnonymous) {
        loadCloudState(currentUser);
      } else {
        setCloudReady(false);
        setCloudStatus(currentUser?.isAnonymous ? "Guest" : "Local");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const unsub = onSnapshot(sessionRuntimeRef(sessionCode.toUpperCase(), "dice"), snapshot => {
      if (!snapshot.exists()) return;
      const sharedCooldownUntil = Math.max(0, Number(snapshot.data().cooldownUntil) || 0);
      if (sharedCooldownUntil > diceCooldownUntilRef.current) applyDiceCooldown(sharedCooldownUntil);
    }, error => {
      console.error("Dice runtime sync failed", error);
    });
    return () => unsub();
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode) return;

    setSessionStatus("Connecting...");
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRef(code), (snapshot) => {
      if (!snapshot.exists()) {
        sessionEndingRef.current = true;
        leaveSession("Session ended by host");
        return;
      }

      const data = snapshot.data();
      const incomingOwnerUid = String(data.ownerUid || "");
      sessionAuthorityRef.current = {
        sessionCode: code,
        userUid: String(user?.uid || ""),
        ownerUid: incomingOwnerUid,
        isHost: Boolean(user?.uid && user.uid === incomingOwnerUid),
      };
      const incomingChooseRollEnabled = Boolean(data.chooseRollEnabled);
      setChooseRollEnabled(incomingChooseRollEnabled);
      if (!incomingChooseRollEnabled) setChooseRollForTeam(null);
      const incomingTimelineMeta = data.sharedTimeline ? decodeFromFirestore(data.sharedTimeline) : null;
      sharedTimelineMetaRef.current = incomingTimelineMeta;
      if (incomingTimelineMeta) hydrateSharedTimelineIfReady();
      if (data.status === "ending" || data.status === "ended") {
        sessionEndingRef.current = true;
        leaveSession(user?.uid === data.endedBy ? "Session ended" : "Session ended by host");
        return;
      }
      const participants = data.participants || {};
      setSessionParticipants(participants);
      setSessionOwnerUid(incomingOwnerUid);
      setTeamOwners({ blue: data.teamOwners?.blue || "", red: data.teamOwners?.red || "" });
      setCardVisibilityMode(data.cardVisibilityMode || "");
      setCardRevealPermissions(data.cardRevealPermissions || {});
      setCardRevealRequests(data.cardRevealRequests || {});
      const sharedDice = data.sharedDice || {};
      const blueSharedDie = sharedDice.blue || {};
      const redSharedDie = sharedDice.red || {};
      const blueIncomingRollId = String(blueSharedDie.rollId || "");
      const redIncomingRollId = String(redSharedDie.rollId || "");
      const blueIncomingValue = nullableFiniteNumber(blueSharedDie.value);
      const redIncomingValue = nullableFiniteNumber(redSharedDie.value);

      if (!diceRollingRef.current.blue && !pendingDiceRollRef.current.blue) setBlueDieResult(blueIncomingValue);
      if (!diceRollingRef.current.red && !pendingDiceRollRef.current.red) setRedDieResult(redIncomingValue);
      setBlueLastDieType(Math.max(2, Number(blueSharedDie.dieType) || 20));
      setRedLastDieType(Math.max(2, Number(redSharedDie.dieType) || 20));

      if (pendingDiceRollRef.current.blue?.rollId === blueIncomingRollId) {
        pendingDiceRollRef.current.blue = null;
        setBlueDieResult(blueIncomingValue);
      }
      if (pendingDiceRollRef.current.red?.rollId === redIncomingRollId) {
        pendingDiceRollRef.current.red = null;
        setRedDieResult(redIncomingValue);
      }

      if (!diceSnapshotInitializedRef.current) {
        diceSeenRollIdsRef.current = { blue: blueIncomingRollId, red: redIncomingRollId };
        diceSnapshotInitializedRef.current = true;
      } else {
        if (blueIncomingRollId && blueIncomingValue !== null && blueIncomingRollId !== diceSeenRollIdsRef.current.blue) {
          diceSeenRollIdsRef.current.blue = blueIncomingRollId;
          showDiceNotice("blue", blueIncomingValue, Math.max(2, Number(blueSharedDie.dieType) || 20));
        }
        if (redIncomingRollId && redIncomingValue !== null && redIncomingRollId !== diceSeenRollIdsRef.current.red) {
          diceSeenRollIdsRef.current.red = redIncomingRollId;
          showDiceNotice("red", redIncomingValue, Math.max(2, Number(redSharedDie.dieType) || 20));
        }
      }

      const ruler = data.sharedRuler || {};
      const rulerActive = !!ruler.active;
      setMeasureMode(rulerActive);
      setSharedRulerOwnerUid(rulerActive ? (ruler.ownerUid || "") : "");
      setSharedRulerOwnerTeam(rulerActive ? (ruler.ownerTeam || "") : "");
      if (rulerActive) {
        setMeasureType(["center", "corner", "cornerCenter"].includes(ruler.measureType) ? ruler.measureType : "center");
        setPassMark(Math.max(1, Number(ruler.passMark) || 8));
        setShotMark(Math.max(1, Number(ruler.shotMark) || 12));
        setMeasureStart(ruler.start && Number.isFinite(Number(ruler.start.x)) && Number.isFinite(Number(ruler.start.y))
          ? { x: Number(ruler.start.x), y: Number(ruler.start.y) }
          : null);
        setMeasureEnd(ruler.end && Number.isFinite(Number(ruler.end.x)) && Number.isFinite(Number(ruler.end.y))
          ? { x: Number(ruler.end.x), y: Number(ruler.end.y) }
          : null);
      } else if (sessionCode) {
        setMeasureStart(null);
        setMeasureEnd(null);
      }

      const sharedTracker = data.sharedTracker || {};
      // Tracker gameplay state belongs to every active multiplayer session.
      // The legacy enabled field is retained for snapshot compatibility, but
      // panel visibility is local and never gated by the host opening it.
      trackerSharedEnabledRef.current = true;
      setTrackerSharedEnabled(true);

      // An active timeline (or an optimistic mode transition still being
      // written) owns gameplay. Once a recording is closed, editor updates can
      // use the legacy projection again.
      const localTimelineActive = Boolean(gameTimelineRef.current && !gameTimelineRef.current.endedAt);
      const timelineControlsGameplay = Boolean(incomingTimelineMeta && !incomingTimelineMeta.endedAt)
        || localTimelineActive
        || pendingTimelineSyncCountRef.current > 0;
      if (!timelineControlsGameplay) {
        const sharedGameMode = normalizeGameMode(sharedTracker.gameMode);
        const sharedMovementState = normalizeMovementState(sharedTracker.movementStateByPieceId);
        setGameMode(sharedGameMode);
        movementStateRef.current = sharedMovementState;
        setMovementStateByPieceId(sharedMovementState);
        const normalizedTracker = normalizeTrackerSnapshot(sharedTracker);
        setTrackerSettings(normalizedTracker.settings);
        setTrackerSettingsDraft(normalizedTracker.settings);
        setTrackerGameStarted(normalizedTracker.gameStarted);
        setTrackerStartingTeam(normalizedTracker.startingTeam);
        setTrackerCurrentTurn(normalizedTracker.currentTurn);
        setTrackerUsedActions(normalizedTracker.usedActions);
        setTrackerActionLog(normalizedTracker.actionLog);
        setMatchActionState(normalizedTracker.matchActionState);
        setTurnPhase(normalizedTracker.turnPhase);
      }
      const currentUid = user?.uid || "";
      const resolvedTeam = data.teamOwners?.blue === currentUid
        ? "blue"
        : data.teamOwners?.red === currentUid
          ? "red"
          : (participants[currentUid]?.team === "blue" || participants[currentUid]?.team === "red")
            ? participants[currentUid].team
            : "spectator";
      setMyTeam(resolvedTeam);
      presenceClockRef.current = Date.now();
      setSessionPlayers(Object.values(participants).filter(participant => Date.now() - timestampToMillis(participant?.lastSeen) < 40000).length);
      setSessionStatus("Online");

      const isOwnBoardUpdate = data.updatedBy === clientIdRef.current;
      const isOwnAssignmentUpdate = data.cardAssignmentsUpdatedBy === clientIdRef.current;
      const sharedAssignments = data.cardAssignments && typeof data.cardAssignments === "object"
        ? data.cardAssignments
        : null;
      if (sharedAssignments) sessionAssignmentsRef.current = sharedAssignments;

      if (data.board && shouldApplySessionBoardProjection({
        isOwnUpdate: isOwnBoardUpdate,
        timelineActive: timelineControlsGameplay,
      })) {
        isApplyingSessionRef.current = true;
        applyLiveBoardState(decodeFromFirestore(data.board), sharedAssignments);
        sessionHydratedRef.current = true;
        window.setTimeout(() => {
          isApplyingSessionRef.current = false;
        }, 250);
      } else if (sharedAssignments && !isOwnAssignmentUpdate) {
        isApplyingSessionRef.current = true;
        applyLiveBoardState({}, sharedAssignments);
        sessionHydratedRef.current = true;
        window.setTimeout(() => {
          isApplyingSessionRef.current = false;
        }, 250);
      } else {
        sessionHydratedRef.current = true;
      }
    }, (error) => {
      console.error(error);
      setSessionStatus("Online error");
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode) return;
    const code = sessionCode.toUpperCase();
    setSessionStatus("Loading session cards...");
    const unsub = onSnapshot(sessionCardsCollectionRef(code), (snapshot) => {
      if (sessionEndingRef.current) return;
      const nextLibrary = {};
      snapshot.docs.forEach(cardDoc => {
        const raw = cardDoc.data();
        const decoded = decodeFromFirestore(raw?.card ?? raw);
        if (decoded && typeof decoded === "object") nextLibrary[String(cardDoc.id)] = decoded;
      });
      sessionLibraryByIdRef.current = nextLibrary;
      setSessionLibraryById(nextLibrary);
      if (Object.keys(sessionAssignmentsRef.current || {}).length) {
        isApplyingSessionRef.current = true;
        applyLiveBoardState({}, sessionAssignmentsRef.current);
        window.setTimeout(() => { isApplyingSessionRef.current = false; }, 250);
      }
      setSessionStatus("Online");
    }, (error) => {
      console.error("Session cards listener failed", error);
      setSessionStatus("Cards error");
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode) return;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "freeModeIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;
      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setFreeModeIntentPending(false);
          freeModeIntentPendingRef.current = false;
          if (intent.status === "rejected") resetTransientGameplayUI({ restoreCanonical: true });
          else if (String(intent.operation || "") === "end") setSelectedId(null);
          else if (intent.pieceId) setSelectedId(String(intent.pieceId));
        }
        return;
      }
      if (processedFreeModeIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedFreeModeIntentIdsRef.current.add(requestId);
      const piece = (piecesRef.current || []).find(item => String(item.id) === String(intent.pieceId));
      const team = pieceTeamKey(piece);
      const ownerValid = piece && piece.team !== "BALL" && ["blue", "red"].includes(team) && String(teamOwners?.[team] || "") === String(intent.requestedByUid || "");
      let committed = false;
      const operation = String(intent.operation || "toggle");
      if (ownerValid && operation === "move") {
        const freeMode = currentTimelineTrackerSnapshot().matchActionState.freeMode || {};
        const occupied = (piecesRef.current || []).some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === Number(intent.x) && Number(item.y) === Number(intent.y));
        if (freeMode.active && String(freeMode.pieceId) === String(piece.id) && !occupied && Number.isFinite(Number(intent.x)) && Number.isFinite(Number(intent.y))) {
          const geometry = getMovementGeometry(piece, { x: Number(intent.x), y: Number(intent.y) });
          if (geometry.kind !== "same") committed = commitPieceMove(piece, Number(intent.x), Number(intent.y), { legal: true, geometry, moveCost: 0, remaining: 0 }, { authorizationOverride: { allowed: true, mode: "free" } });
        }
      } else if (ownerValid) committed = commitFreeModeToggle(piece, { fromHostIntent: true, requestedOperation: operation });
      updateDoc(sessionRuntimeRef(code, "freeModeIntent"), { status: committed ? "accepted" : "rejected", handledAt: serverTimestamp(), handledBy: clientIdRef.current })
        .catch(error => console.error("Free mode intent acknowledgement failed", error));
    }, error => console.error("Free mode intent listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners]);

  useEffect(() => {
    if (!user || !sessionCode) return;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "freeBallMoveIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;
      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setFreeBallMoveIntentPending(false);
          freeBallMoveIntentPendingRef.current = false;
          if (intent.status === "rejected") resetTransientGameplayUI({ restoreCanonical: true });
        }
        return;
      }
      if (processedFreeBallMoveIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedFreeBallMoveIntentIdsRef.current.add(requestId);
      const team = String(intent.team || "");
      const ownerValid = ["blue", "red"].includes(team) && String(teamOwners?.[team] || "") === String(intent.requestedByUid || "");
      const coordsValid = Number.isFinite(Number(intent.x)) && Number.isFinite(Number(intent.y));
      const committed = ownerValid && coordsValid ? commitFreeBallMove(Number(intent.x), Number(intent.y), { fromHostIntent: true }) : false;
      updateDoc(sessionRuntimeRef(code, "freeBallMoveIntent"), { status: committed ? "accepted" : "rejected", handledAt: serverTimestamp(), handledBy: clientIdRef.current })
        .catch(error => console.error("Free Ball intent acknowledgement failed", error));
    }, error => console.error("Free Ball intent listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "actionStartIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;

      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setActionStartIntentPending(false);
          actionStartIntentPendingRef.current = false;
          if (intent.status === "rejected") {
            setPendingInteractionPieceId(null);
            resetTransientGameplayUI({ restoreCanonical: true });
          }
        }
        return;
      }
      if (processedActionStartIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedActionStartIntentIdsRef.current.add(requestId);

      const piece = (piecesRef.current || []).find(item => String(item.id) === String(intent.pieceId));
      const team = piece ? pieceTeamKey(piece) : "";
      const ownerValid = piece && ["blue", "red"].includes(team) && String(teamOwners?.[team] || "") === String(intent.requestedByUid || "");
      const baseRevisionValid = Number(intent.baseRevision) === Math.max(0, Number(gameTimelineRef.current?.revision) || 0);
      let committed = false;

      if (ownerValid && baseRevisionValid && intent.mode === "normal-move") {
        committed = Boolean(commitNormalMoveStart(piece, { fromHostIntent: true }));
      } else if (ownerValid && baseRevisionValid && intent.mode === "cancel-normal-move") {
        committed = Boolean(commitNormalMoveCancellation(piece, { fromHostIntent: true }));
      } else if (ownerValid && baseRevisionValid && intent.mode === "normal-pass") {
        const noActiveFlow = !actionResolutionRef.current && !actionContinuationRef.current;
        if (noActiveFlow && playerHasBall(piece)) committed = Boolean(beginPassTargeting(piece, { fromHostIntent: true }));
      } else if (ownerValid && baseRevisionValid && intent.mode === "bonus-action") {
        const continuation = actionContinuationRef.current;
        const actionType = String(intent.actionType || "");
        const continuationValid = continuation?.kind === "bonus-card-action"
          && continuation.status === CONTINUATION_STATUS.READY
          && continuation.team === team
          && String(continuation.id) === String(intent.continuationId || "")
          && !actionResolutionRef.current;
        if (continuationValid && !["GROUP_MOVE", "FREE"].includes(actionType)) {
          committed = Boolean(beginBonusCardAction(actionType, piece, { fromHostIntent: true, startPassAtomically: actionType === "PASS" }));
        }
      }

      updateDoc(sessionRuntimeRef(code, "actionStartIntent"), {
        status: committed ? "accepted" : "rejected",
        rejectionReason: committed ? null : "unauthorized-stale-or-invalid-action-start",
        handledAt: serverTimestamp(),
        handledBy: clientIdRef.current,
        canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
      }).catch(error => console.error("Action start intent acknowledgement failed", error));
      multiplayerTracerRef.current.multiplayer("ACTION_START_INTENT_HANDLED", { requestId, mode: intent.mode, actionType: intent.actionType || null, committed });
    }, error => console.error("Action start intent listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "normalMoveCommitIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;

      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setNormalMoveCommitIntentPending(false);
          normalMoveCommitIntentPendingRef.current = false;
          if (intent.status === "rejected") setSessionStatus(`Move rejected: ${intent.rejectionReason || "invalid move"}`);
        }
        return;
      }
      if (processedNormalMoveCommitIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedNormalMoveCommitIntentIdsRef.current.add(requestId);

      const piece = (piecesRef.current || []).find(item => String(item.id) === String(intent.pieceId));
      const team = piece ? pieceTeamKey(piece) : "";
      const activeMovement = currentTimelineTrackerSnapshot().matchActionState.activeMovement || {};
      const ownerValid = piece && ["blue", "red"].includes(team) && String(teamOwners?.[team] || "") === String(intent.requestedByUid || "");
      const movementValid = activeMovement.active
        && activeMovement.kind === "normal-move"
        && String(activeMovement.pieceId || "") === String(piece?.id || "")
        && activeMovement.team === team;
      const baseRevisionValid = Number(intent.baseRevision) === Math.max(0, Number(gameTimelineRef.current?.revision) || 0);
      const coordsValid = Number.isFinite(Number(intent.x)) && Number.isFinite(Number(intent.y));
      let committed = false;
      let rejectionReason = "unauthorized-stale-or-invalid-normal-move";
      if (ownerValid && movementValid && baseRevisionValid && coordsValid) {
        const evaluation = evaluateMove(piece, Number(intent.x), Number(intent.y));
        if (evaluation.legal) {
          committed = Boolean(commitPieceMove(piece, Number(intent.x), Number(intent.y), evaluation, {
            authorizationOverride: { allowed: true, mode: "normal" },
          }));
          if (!committed) rejectionReason = "normal-move-commit-failed";
        } else {
          rejectionReason = evaluation.reason || "illegal-normal-move";
        }
      }
      updateDoc(sessionRuntimeRef(code, "normalMoveCommitIntent"), {
        status: committed ? "accepted" : "rejected",
        rejectionReason: committed ? null : rejectionReason,
        handledAt: serverTimestamp(),
        handledBy: clientIdRef.current,
        canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
      }).catch(error => console.error("Normal Move commit acknowledgement failed", error));
    }, error => console.error("Normal Move commit listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "diceRollIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;

      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          diceRollIntentPendingRef.current = false;
          setDiceRollIntentPending(false);
          if (intent.status === "rejected") resetTransientGameplayUI({ restoreCanonical: true });
        }
        return;
      }
      if (processedDiceRollIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedDiceRollIntentIdsRef.current.add(requestId);
      const team = String(intent.team || "");
      const pending = actionResolutionRef.current;
      const ownerValid = ["blue", "red"].includes(team) && String(teamOwners?.[team] || "") === String(intent.requestedByUid || "");
      const actionValid = !intent.actionId || (pending?.kind === "pass"
        && pending.status === "awaiting-interception-roll"
        && String(pending.id) === String(intent.actionId)
        && String(pending.pendingRoll?.requestId || "") === String(intent.pendingRollRequestId || ""));
      const chosen = intent.chosenResult === null || intent.chosenResult === undefined ? null : Number(intent.chosenResult);
      const chosenValid = chosen === null || (chooseRollEnabled && Number.isInteger(chosen) && chosen >= 1 && chosen <= (pending?.kind === "pass" ? 20 : dieType));
      const valid = ownerValid && actionValid && chosenValid && canRollTeamDie(team, { hostIntent: true });
      if (!valid) {
        updateDoc(sessionRuntimeRef(code, "diceRollIntent"), {
          status: "rejected", rejectionReason: "unauthorized-or-stale-dice-roll", handledAt: serverTimestamp(), handledBy: clientIdRef.current,
        }).catch(error => console.error("Dice roll intent rejection failed", error));
        multiplayerTracerRef.current.guard("DICE_ROLL_INTENT_REJECTED", "unauthorized or stale dice roll", { requestId, team, actionId: intent.actionId || null });
        return;
      }
      void rollTeamDie(team, chosen, { fromHostIntent: true }).then(started => {
        updateDoc(sessionRuntimeRef(code, "diceRollIntent"), {
          status: started ? "accepted" : "rejected",
          rejectionReason: started ? null : "host-roll-not-started",
          handledAt: serverTimestamp(), handledBy: clientIdRef.current,
          canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        }).catch(error => console.error("Dice roll intent acknowledgement failed", error));
        multiplayerTracerRef.current.multiplayer("DICE_ROLL_INTENT_HANDLED", { requestId, team, started });
      });
    }, error => console.error("Dice roll intent listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners, chooseRollEnabled, dieType]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "passTargetIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;

      // Guests only wait for the canonical Timeline update. They never commit
      // PASS_TARGET_SELECTED themselves.
      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setPassTargetIntentPending(false);
          passTargetIntentPendingRef.current = false;
          if (String(intent.status || "") === "rejected") {
            applyTimelineGameState(timelineStateAt(gameTimelineRef.current, gameTimelineRef.current?.cursor), { preserveLocalSelection: false });
            setSelectedId(null);
            setHoveredCell(null);
          }
        }
        return;
      }
      if (processedPassTargetIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedPassTargetIntentIdsRef.current.add(requestId);

      const pending = actionResolutionRef.current;
      const valid = pending?.kind === "pass"
        && pending.status === "targeting"
        && String(pending.id) === String(intent.actionId)
        && pending.team === intent.team
        && Number.isFinite(Number(intent.x))
        && Number.isFinite(Number(intent.y));

      if (!valid) {
        updateDoc(sessionRuntimeRef(code, "passTargetIntent"), {
          status: "rejected",
          rejectionReason: "stale-or-invalid-pass-target",
          handledAt: serverTimestamp(),
          handledBy: clientIdRef.current,
        }).catch(error => console.error("Pass target intent rejection sync failed", error));
        multiplayerTracerRef.current.guard("PASS_TARGET_INTENT_REJECTED", "stale or invalid canonical targeting state", { requestId, actionId: intent.actionId });
        return;
      }

      const committed = commitPassTargetSelection(intent.x, intent.y, pending);
      updateDoc(sessionRuntimeRef(code, "passTargetIntent"), {
        status: committed ? "accepted" : "rejected",
        handledAt: serverTimestamp(),
        handledBy: clientIdRef.current,
        canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
      }).catch(error => console.error("Pass target intent acknowledgement failed", error));
      multiplayerTracerRef.current.multiplayer("PASS_TARGET_INTENT_HANDLED", { requestId, actionId: intent.actionId, committed });
    }, error => {
      console.error("Pass target intent listener failed", error);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "passCancelIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;

      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setPassCancelIntentPending(false);
          passCancelIntentPendingRef.current = false;
          if (String(intent.status || "") === "rejected") {
            applyTimelineGameState(timelineStateAt(gameTimelineRef.current, gameTimelineRef.current?.cursor), { preserveLocalSelection: false });
            setSelectedId(null);
            setHoveredCell(null);
          }
        }
        return;
      }
      if (processedPassCancelIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedPassCancelIntentIdsRef.current.add(requestId);

      const pending = actionResolutionRef.current;
      const valid = pending?.kind === "pass"
        && ["targeting", "route-selection"].includes(pending.status)
        && String(pending.id) === String(intent.actionId)
        && pending.team === intent.team;

      if (!valid) {
        updateDoc(sessionRuntimeRef(code, "passCancelIntent"), {
          status: "rejected",
          rejectionReason: "stale-or-invalid-pass-cancel",
          handledAt: serverTimestamp(),
          handledBy: clientIdRef.current,
        }).catch(error => console.error("Pass cancel intent rejection sync failed", error));
        multiplayerTracerRef.current.guard("PASS_CANCEL_INTENT_REJECTED", "stale or invalid canonical pass state", { requestId, actionId: intent.actionId });
        return;
      }

      const committed = commitPassCancellation(pending);
      updateDoc(sessionRuntimeRef(code, "passCancelIntent"), {
        status: committed ? "accepted" : "rejected",
        handledAt: serverTimestamp(),
        handledBy: clientIdRef.current,
        canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
      }).catch(error => console.error("Pass cancel intent acknowledgement failed", error));
      multiplayerTracerRef.current.multiplayer("PASS_CANCEL_INTENT_HANDLED", { requestId, actionId: intent.actionId, committed });
    }, error => {
      console.error("Pass cancel intent listener failed", error);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user || !sessionCode) return undefined;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionRuntimeRef(code, "bonusActionEndIntent"), snapshot => {
      if (!snapshot.exists()) return;
      const intent = snapshot.data() || {};
      const requestId = String(intent.requestId || "");
      if (!requestId) return;
      if (!sessionAuthorityRef.current.isHost) {
        if (["accepted", "rejected"].includes(String(intent.status || "")) && intent.requestedByClient === clientIdRef.current) {
          setBonusActionEndIntentPending(false);
          bonusActionEndIntentPendingRef.current = false;
          if (String(intent.status || "") === "rejected") {
            applyTimelineGameState(timelineStateAt(gameTimelineRef.current, gameTimelineRef.current?.cursor), { preserveLocalSelection: false });
            setSelectedId(null);
            setHoveredCell(null);
          }
        }
        return;
      }
      if (processedBonusActionEndIntentIdsRef.current.has(requestId) || intent.status !== "pending") return;
      processedBonusActionEndIntentIdsRef.current.add(requestId);
      const continuation = actionContinuationRef.current;
      const valid = validateBonusActionEndIntent({
        intent, continuation, actionResolution: actionResolutionRef.current, teamOwners,
      });
      if (valid) commitEndBonusAction(continuation);
      updateDoc(sessionRuntimeRef(code, "bonusActionEndIntent"), {
        status: valid ? "accepted" : "rejected",
        rejectionReason: valid ? null : "unauthorized-or-stale-bonus-action",
        handledAt: serverTimestamp(), handledBy: clientIdRef.current,
        canonicalRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
      }).catch(error => console.error("Bonus action end intent acknowledgement failed", error));
      multiplayerTracerRef.current.multiplayer("BONUS_ACTION_END_INTENT_HANDLED", { requestId, continuationId: intent.continuationId, valid });
    }, error => console.error("Bonus action end intent listener failed", error));
    return () => unsub();
  }, [user, sessionCode, teamOwners]);

  useEffect(() => {
    if (!user || !sessionCode) return;
    const code = sessionCode.toUpperCase();
    const unsub = onSnapshot(sessionTimelineEntriesCollectionRef(code), (snapshot) => {
      if (sessionEndingRef.current) return;
      sessionTimelineEntriesRef.current = snapshot.docs.map(entryDoc => {
        const raw = entryDoc.data();
        return {
          recordingId: String(raw?.recordingId || ""),
          sequence: Math.max(0, Number(raw?.sequence) || 0),
          entry: decodeFromFirestore(raw?.entry || {}),
        };
      });
      hydrateSharedTimelineIfReady();
    }, (error) => {
      console.error("Session timeline listener failed", error);
      setSessionStatus("Timeline error");
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionCode]);

  useEffect(() => {
    if (!user?.uid || !sessionCode) return;
    const ref = sessionRef(sessionCode.toUpperCase());
    const beat = () => {
      if (sessionEndingRef.current) return;
      updateDoc(ref, {
        [`participants.${user.uid}`]: {
          ...(sessionParticipants[user.uid] || {}),
          email: user.email || "Guest",
          lastSeen: serverTimestamp(),
          clientId: clientIdRef.current,
        }
      }).catch(error => {
        if (!sessionEndingRef.current && error?.code !== "not-found") console.error("Presence heartbeat failed", error);
      });
    };
    beat();
    const heartbeatId = window.setInterval(beat, 15000);
    return () => window.clearInterval(heartbeatId);
  }, [user?.uid, sessionCode]);

  useEffect(() => {
    if (sessionCode) return;
    setChooseRollEnabled(false);
    setChooseRollForTeam(null);
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode) return;
    const refreshCount = () => {
      presenceClockRef.current = Date.now();
      setSessionPlayers(Object.values(sessionParticipants).filter(participant => Date.now() - timestampToMillis(participant?.lastSeen) < 40000).length);
    };
    refreshCount();
    const countId = window.setInterval(refreshCount, 5000);
    return () => window.clearInterval(countId);
  }, [sessionCode, sessionParticipants]);

  useEffect(() => {
    scheduleSessionLiveSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    sessionCode,
    gameMode,
    settings,
    pieces,
    dieType,
    blueDieResult,
    redDieResult,
    showCoordinates,
    blueFormationId,
    redFormationId,
    activeRuleSet,
  ]);

  useEffect(() => () => {
    if (sessionSaveTimerRef.current) {
      window.clearTimeout(sessionSaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!user || !cloudReady || isApplyingCloudRef.current || replayModeRef.current) return;
    autosaveDirtyRef.current = true;
    setCloudStatus("Unsaved changes");
  }, [
    user,
    cloudReady,
    settings,
    formations,
    gameSituations,
    ruleSets,
    activeRuleSet,
    activeSituationId,
    activeSituationName,
    blueFormationId,
    redFormationId,
    pieces,
    dieType,
    blueDieResult,
    redDieResult,
    touchMode,
    showCoordinates,
    cardState,
    trackerVisible,
    trackerSharedEnabled,
    trackerGameStarted,
    trackerStartingTeam,
    trackerCurrentTurn,
    trackerUsedActions,
    trackerActionLog,
    matchActionState,
    trackerSettings,
  ]);

  useEffect(() => {
    if (!user || !cloudReady) return;

    if (autosaveIntervalRef.current) {
      window.clearInterval(autosaveIntervalRef.current);
    }

    autosaveIntervalRef.current = window.setInterval(() => {
      if (!autosaveDirtyRef.current || isApplyingCloudRef.current || replayModeRef.current) return;
      autosaveDirtyRef.current = false;
      saveCloudState({}, "Autosaved");
    }, CLOUD_AUTOSAVE_INTERVAL_MS);

    return () => {
      if (autosaveIntervalRef.current) {
        window.clearInterval(autosaveIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cloudReady]);

  function captureTimelineGameState(overrides = {}) {
    const liveState = createGameState({
      settings: settingsRef.current,
      pieces: piecesRef.current,
      movementStateByPieceId: normalizeMovementState(movementStateRef.current),
      gameMode: normalizeGameMode(gameMode),
      ruleSet: normalizeRuleSet(activeRuleSetRef.current),
      actionResolution: actionResolutionRef.current,
      actionContinuation: actionContinuationRef.current,
      tracker: {
        gameStarted: trackerGameStarted,
        startingTeam: trackerStartingTeam,
        currentTurn: trackerCurrentTurn,
        usedActions: trackerUsedActions,
        actionLog: trackerActionLog,
        matchActionState,
        turnPhase,
        settings: trackerSettings,
      },
      dice: {
        dieType,
        blueResult: blueDieResult,
        redResult: redDieResult,
        blueLastDieType,
        redLastDieType,
      },
    });
    return mergeGameState(liveState, {
      ...overrides,
      ...(Object.prototype.hasOwnProperty.call(overrides, "movementStateByPieceId")
        ? { movementStateByPieceId: normalizeMovementState(overrides.movementStateByPieceId) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(overrides, "gameMode")
        ? { gameMode: normalizeGameMode(overrides.gameMode) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(overrides, "ruleSet")
        ? { ruleSet: normalizeRuleSet(overrides.ruleSet) }
        : {}),
    });
  }

  function mergeTimelineGameState(baseState, overrides = {}) {
    return mergeGameState(baseState, overrides);
  }

  function replaceGameTimeline(nextTimeline) {
    const normalized = normalizeTimeline(nextTimeline, captureTimelineGameState());
    gameTimelineRef.current = normalized;
    setGameTimeline(normalized);
    return normalized;
  }

  function captureAvailableMatchCards() {
    const byId = new Map();
    (cardStateRef.current?.cards || []).forEach(card => {
      if (card?.id) byId.set(String(card.id), clonePlain(card));
    });
    if (sessionCode) {
      Object.values(normalizeSessionCardsById(sessionLibraryByIdRef.current)).forEach(card => {
        if (card?.id) byId.set(String(card.id), clonePlain(card));
      });
      Object.values(normalizeSessionCardsById(sessionCardsByIdRef.current)).forEach(card => {
        if (card?.id && !byId.has(String(card.id))) byId.set(String(card.id), clonePlain(card));
      });
    }
    return [...byId.values()];
  }

  function startGameTimeline(initialState = captureTimelineGameState(), metadata = {}) {
    pendingTimelineBeforeRef.current = null;
    const { syncSession = false, ...timelineMetadata } = metadata;
    const next = replaceGameTimeline(createTimeline(initialState, timelineMetadata));
    matchCardSnapshotRef.current = {
      recordingId: next.recordingId,
      cards: captureAvailableMatchCards(),
    };
    if (syncSession) void enqueueTimelineSync(null, next, initialState, null, { baseline: true });
    return next;
  }

  function singlePlayerMatchContext() {
    if (matchContextRef.current) return matchContextRef.current;
    const context = createMatchContext({
      id: gameTimelineRef.current?.recordingId || "single-player-compatibility-context",
      ruleSet: activeRuleSetRef.current,
      boardSettings: settingsRef.current,
      gameplayCards: captureAvailableMatchCards(),
    });
    matchContextRef.current = context;
    return context;
  }

  function recordTimelineTransition({
    type = "GAME_STATE_CHANGED",
    label = "Game state changed",
    before,
    after,
    team = null,
    groupId = null,
    metadata = null,
    id = null,
    allowNoop = false,
  }) {
    if (replayModeRef.current) return gameTimelineRef.current;
    const safeBefore = before || captureTimelineGameState();
    const safeAfter = after || captureTimelineGameState();
    if (safeAfter.gameMode !== "match") return gameTimelineRef.current;
    const current = gameTimelineRef.current || createTimeline(safeBefore);
    const actionTransaction = atomicTransactionForTransition(groupId, safeBefore, safeAfter);
    const entryMetadata = {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      ...(actionTransaction ? { actionTransaction } : {}),
    };
    const next = commitTimelineEntry(current, {
      ...(id ? { id } : {}),
      type,
      label,
      actorId: user?.uid || clientIdRef.current,
      team,
      groupId,
      metadata: entryMetadata,
      before: safeBefore,
      after: safeAfter,
    }, { allowNoop });
    if (next === current || (next.entries.length === current.entries.length && next.cursor === current.cursor && next.revision === current.revision)) return current;
    const replaced = replaceGameTimeline(next);
    const committedEntry = replaced.entries[replaced.cursor - 1] || null;
    void enqueueTimelineSync(current, replaced, safeAfter, committedEntry);
    return replaced;
  }

  function pushHistory(nextPieces = piecesRef.current || pieces, nextMovement = movementStateRef.current) {
    const currentTimelineState = currentTimelineGameStateSnapshot();
    pendingTimelineBeforeRef.current = currentTimelineState
      ? createGameState({
          ...currentTimelineState,
          pieces: nextPieces,
          movementStateByPieceId: nextMovement,
        })
      : captureTimelineGameState({ pieces: nextPieces, movementStateByPieceId: nextMovement });
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

    const beforeTimeline = captureTimelineGameState();
    const nextPieces = ensureBenchReserveCount((piecesRef.current || pieces).map(p => ({
      ...p,
      y: clamp(p.y, 0, next.rows - 1),
      x: clampBoardXForY(p.x, clamp(p.y, 0, next.rows - 1), next),
    })), next);
    settingsRef.current = next;
    piecesRef.current = nextPieces;
    setSettings(next);
    setPieces(nextPieces);
    recordTimelineTransition({
      type: "BOARD_SETTING_CHANGED",
      label: `Board setting ${key}: ${cleanValue}`,
      before: beforeTimeline,
      after: captureTimelineGameState({ settings: next, pieces: nextPieces }),
    });
  }


  function SettingNumber({ label, name, min, max, step = 1 }) {
    const value = settings[name];
    const numericMin = min === undefined ? -Infinity : Number(min);
    const numericMax = max === undefined ? Infinity : Number(max);
    const safeStep = Number(step) || 1;

    function stepValue(delta) {
      const current = Number(settings[name]) || 0;
      const nextValue = clamp(current + delta * safeStep, numericMin, numericMax);
      updateSetting(name, nextValue);
    }

    return (
      <label className="number-control">
        <span>{label}</span>
        <div className="number-stepper">
          <button type="button" className="step-btn" onClick={() => stepValue(-1)} aria-label={`${label} minus`}>−</button>
          <input type="number" value={value} min={min} max={max} step={step} onChange={e => updateSetting(name, e.target.value)} />
          <button type="button" className="step-btn" onClick={() => stepValue(1)} aria-label={`${label} plus`}>+</button>
        </div>
      </label>
    );
  }

  function getFormationById(id) {
    const formation = formations.find(f => f.id === Number(id)) || formations[0] || FORMATION_SLOTS[0];
    return { ...formation, players: normalizeFormationPlayers(formation.players) };
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
      const next = sanitizePiecesCardIds([...others, ...temp, ball].filter(Boolean), cardStateRef.current, settingsRef.current);
      piecesRef.current = next;
      logSnapshot(`${team === "A" ? "Blue" : "Red"} formation: ${formation.name}`, next);
      return next;
    });
  }

  function saveCurrentAsFormation(team, slotId) {
    const slot = formations.find(f => f.id === Number(slotId));
    const defaultName = slot?.name?.startsWith("Slot ") ? "" : slot?.name;
    const name = window.prompt(`Nume formație pentru slotul ${slotId}:`, defaultName || `Formație ${slotId}`);
    if (name === null) return;

    const teamPieces = (piecesRef.current || pieces)
      .filter(p => p.team === team && !isBenchReservePiece(p))
      .slice(0, 11)
      .map(p => {
        const x = team === "A" ? Math.round(p.x) : settings.cols - 1 - Math.round(p.x);
        const y = Math.round(p.y);
        return [p.label, normalizeGridPosition(x, y, settings).coord];
      });

    const nextFormations = normalizeFormationSlots(formations.map(f =>
      f.id === Number(slotId)
        ? { id: Number(slotId), name: name.trim() || `Formație ${slotId}`, players: teamPieces }
        : f
    ), FORMATION_SLOTS);

    setFormations(nextFormations);
    localStorage.setItem("football-board-formations-v18", JSON.stringify(nextFormations));
    saveCloudState({ formations: nextFormations }, `Formation ${slotId} saved`);
    alert(`Formația a fost salvată în slotul ${slotId}.`);
  }

  function createCurrentSnapshot() {
    return {
      settings,
      pieces: sanitizePiecesCardIds(pieces, cardState, settings),
      zoom,
      blueFormationId,
      redFormationId,
      dieType,
      dieResult: { blue: blueDieResult, red: redDieResult },
      cardState: buildCardLibraryState(cardState),
    };
  }

  function selectScenarioSlot(id) {
    const scenario = gameSituations.find(item => item.id === Number(id));
    if (!scenario) return;
    setActiveSituationId(Number(id));
    setActiveSituationName(scenario.name);
  }

  function loadActiveScenario() {
    const situation = gameSituations.find(s => s.id === Number(activeSituationId));
    if (!situation?.snapshot) {
      window.alert("This Scenario slot is empty.");
      return;
    }
    if (!window.confirm("Load this Scenario? Your current board state will be replaced.")) return;

    pushHistory();
    const snapshotSettings = normalizeSettingsForApp(situation.snapshot.settings || settings);
    const snapshotCardState = situation.snapshot.cardState ? hydrateCardState(situation.snapshot.cardState, cardStateRef.current.cards) : cardState;
    const legacyAssignments = getLegacyAssignments(situation.snapshot.cardState);
    const snapshotPieces = ensureBenchReserveCount(
      sanitizePiecesCardIds(situation.snapshot.pieces, snapshotCardState, snapshotSettings, legacyAssignments),
      snapshotSettings
    );
    setSettings(snapshotSettings);
    piecesRef.current = snapshotPieces;
    setPieces(snapshotPieces);
    setZoom(situation.snapshot.zoom ?? 0.9);
    setBlueFormationId(situation.snapshot.blueFormationId ?? 1);
    setRedFormationId(situation.snapshot.redFormationId ?? 2);
    setDieType(situation.snapshot.dieType ?? 20);
    if (situation.snapshot.dieResult && typeof situation.snapshot.dieResult === "object") {
      setBlueDieResult(situation.snapshot.dieResult.blue ?? null);
      setRedDieResult(situation.snapshot.dieResult.red ?? null);
    } else {
      setBlueDieResult(situation.snapshot.dieResult ?? null);
      setRedDieResult(null);
    }
    if (situation.snapshot.cardState) setCardState(snapshotCardState);
    logSnapshot(`Load Scenario: ${situation.name}`, snapshotPieces, {
      type: "SITUATION_LOADED",
      stateOverrides: {
        settings: snapshotSettings,
        dieType: situation.snapshot.dieType ?? 20,
        blueDieResult: situation.snapshot.dieResult && typeof situation.snapshot.dieResult === "object" ? (situation.snapshot.dieResult.blue ?? null) : (situation.snapshot.dieResult ?? null),
        redDieResult: situation.snapshot.dieResult && typeof situation.snapshot.dieResult === "object" ? (situation.snapshot.dieResult.red ?? null) : null,
      },
    });
  }

  function saveActiveGameSituation() {
    const currentScenario = gameSituations.find(s => s.id === Number(activeSituationId));
    if (currentScenario?.snapshot && !window.confirm("Overwrite this Scenario? The existing saved Scenario will be replaced.")) return;
    const cleanName = activeSituationName.trim() || `Scenario ${activeSituationId}`;
    const nextSituations = gameSituations.map(s =>
      s.id === Number(activeSituationId)
        ? { ...s, name: cleanName, snapshot: createCurrentSnapshot() }
        : s
    );

    setGameSituations(nextSituations);
    localStorage.setItem("football-board-game-situations-v20", JSON.stringify(nextSituations));
    setActiveSituationName(cleanName);
    saveCloudState({ gameSituations: nextSituations, activeSituationName: cleanName }, `Scenario saved`);
    logSnapshot(`Save Scenario: ${cleanName}`);
  }

  const ruleSetEditingLocked = gameMode === "match" || isReplayView || (Boolean(sessionCode) && !isSessionHost);

  function commitRuleSetWorkspace(nextRuleSets, nextActiveRuleSet, label = "Rule Set saved") {
    const normalizedRuleSets = normalizeRuleSets(nextRuleSets);
    const normalizedActiveRuleSet = normalizeRuleSet(nextActiveRuleSet);
    const activeExists = normalizedRuleSets.some(ruleSet => ruleSet.id === normalizedActiveRuleSet.id);
    const savedRuleSets = activeExists
      ? normalizedRuleSets
      : [...normalizedRuleSets, normalizedActiveRuleSet];

    activeRuleSetRef.current = normalizedActiveRuleSet;
    setRuleSets(savedRuleSets);
    setActiveRuleSet(normalizedActiveRuleSet);
    setRuleSetDraft(normalizedActiveRuleSet);
    setRuleSetSelectionId(normalizedActiveRuleSet.id);
    localStorage.setItem("football-board-rule-sets-v1", JSON.stringify(savedRuleSets));
    localStorage.setItem("football-board-active-rule-set-v1", normalizedActiveRuleSet.id);

    if (sessionCode && isSessionHost && gameMode === "editor") {
      void saveSessionState({ activeRuleSet: normalizedActiveRuleSet });
    }
    if (user && cloudReady) {
      void saveCloudState({
        ruleSets: savedRuleSets,
        activeRuleSet: normalizedActiveRuleSet,
      }, label);
    }
  }

  function loadSelectedRuleSet() {
    if (ruleSetEditingLocked) return;
    const selected = findRuleSet(ruleSets, ruleSetSelectionId);
    const draftChanged = JSON.stringify(normalizeRuleSet(ruleSetDraft)) !== JSON.stringify(normalizeRuleSet(activeRuleSet));
    if ((selected.id !== activeRuleSet.id || draftChanged) && !window.confirm("Load this Rule Set? Unsaved changes to the current rules will be lost.")) return;
    commitRuleSetWorkspace(ruleSets, selected, "Rule Set loaded");
  }

  function saveRuleSetDraft() {
    if (ruleSetEditingLocked) return;
    const saved = normalizeRuleSet({ ...ruleSetDraft, id: activeRuleSet.id }, activeRuleSet);
    const nextRuleSets = ruleSets.some(ruleSet => ruleSet.id === saved.id)
      ? ruleSets.map(ruleSet => ruleSet.id === saved.id ? saved : ruleSet)
      : [...ruleSets, saved];
    commitRuleSetWorkspace(nextRuleSets, saved, "Rule Set saved");
  }

  function createNewRuleSet() {
    if (ruleSetEditingLocked) return;
    const name = window.prompt("Name this Rule Set:", "New Rule Set");
    if (name === null) return;
    const created = createRuleSet(ruleSets, name, createDefaultRuleSet());
    commitRuleSetWorkspace([...ruleSets, created], created, "Rule Set created");
  }

  function duplicateActiveRuleSet() {
    if (ruleSetEditingLocked) return;
    const name = window.prompt("Name the copied Rule Set:", `${activeRuleSet.name} copy`);
    if (name === null) return;
    const duplicated = createRuleSet(ruleSets, name, activeRuleSet);
    commitRuleSetWorkspace([...ruleSets, duplicated], duplicated, "Rule Set duplicated");
  }

  function resetPiecePositions() {
    pushHistory();

    const currentPieces = piecesRef.current || pieces;
    const cardIdByPieceId = new Map(
      currentPieces
        .filter(piece => piece.team !== "BALL" && piece.cardId)
        .map(piece => [piece.id, piece.cardId])
    );
    const assignmentCardState = sessionCode && Object.keys(sessionLibraryByIdRef.current || {}).length
      ? buildCardStateFromSessionLibrary(sessionLibraryByIdRef.current)
      : cardStateRef.current;
    const resetPiecesWithAssignments = createInitialPieces(
      settings.cols,
      settings.rows,
      getFormationById(blueFormationId),
      getFormationById(redFormationId)
    ).map(piece => ({
      ...piece,
      cardId: piece.team === "BALL" ? null : (cardIdByPieceId.get(piece.id) || null),
    }));
    const fresh = sanitizePiecesCardIds(
      resetPiecesWithAssignments,
      assignmentCardState,
      settingsRef.current,
      {},
      sessionCardsByIdRef.current
    );

    piecesRef.current = fresh;
    setPieces(fresh);
    logSnapshot("Reset positions", fresh);
  }

  function resetPieceCards() {
    const currentPieces = piecesRef.current || pieces;
    const hasAssignedCards = currentPieces.some(piece => piece.team !== "BALL" && piece.cardId);
    if (!hasAssignedCards) return;
    if (!window.confirm("Detach all cards from all pucks?")) return;

    pushHistory();
    const cleared = currentPieces.map(piece => ({ ...piece, cardId: null }));
    piecesRef.current = cleared;
    setPieces(cleared);
    if (gameMode !== "match" && user && sessionCode && sessionHydratedRef.current) {
      void saveSessionCardAssignments(cleared);
    }
    logSnapshot("Reset cards", cleared);
  }

  function buildFullBackupPayload() {
    const effectiveSettings = normalizeSettingsForApp(settingsRef.current);
    const effectiveCardState = buildCardLibraryState(cardStateRef.current);
    const mainStateV2 = buildCloudState({
      settings: effectiveSettings,
      pieces: piecesRef.current,
      cardState: effectiveCardState,
      gameSituations,
    });
    const cards = effectiveCardState.cards || [];

    return {
      backupType: "football-board-storage-v2-backup",
      backupVersion: 2,
      appVersion: APP_VERSION,
      storageVersion: 2,
      exportedAt: new Date().toISOString(),
      summary: {
        cardCount: cards.length,
        formationCount: mainStateV2.formations?.length || 0,
        gameSituationCount: mainStateV2.gameSituations?.length || 0,
      },
      mainStateV2,
      cards,
    };
  }

  function exportFullBackup() {
    try {
      const payload = buildFullBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `football-board-v9.4-backup-${stamp}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      alert(`Backup v9.4 exportat: ${payload.summary.cardCount} carduri, ${payload.summary.formationCount} formații, ${payload.summary.gameSituationCount} situații.`);
    } catch (error) {
      console.error(error);
      alert(`Backup-ul nu a putut fi exportat: ${error.message || error}`);
    }
  }

  async function restoreFullBackup(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const isV2Backup =
        parsed?.backupType === "football-board-storage-v2-backup" &&
        parsed?.backupVersion === 2 &&
        parsed?.storageVersion === 2 &&
        parsed?.mainStateV2 &&
        Array.isArray(parsed?.cards);

      if (!isV2Backup) {
        throw new Error("Fișier incompatibil. v9.4 acceptă exclusiv backup-uri în formatul nou Storage V2.");
      }

      const cardCount = parsed.cards.length;
      const confirmed = window.confirm(`Restaurezi backup-ul Storage V2 cu ${cardCount} carduri? Datele vor fi încărcate local și ajung în cloud numai după Cloud Save.`);
      if (!confirmed) return;

      isApplyingCloudRef.current = true;
      applyStoredState(parsed.mainStateV2, parsed.cards);
      window.setTimeout(() => { isApplyingCloudRef.current = false; }, 300);
      setCloudStatus("Storage V2 backup restored locally");
      setCloudError("");
      alert(`Backup Storage V2 restaurat local: ${cardCount} carduri. Verifică datele, apoi apasă Cloud Save.`);
    } catch (error) {
      console.error(error);
      alert(`Backup-ul nu a putut fi restaurat: ${error.message || error}`);
    }
  }

  function matchRecordingFilename(name) {
    const safeName = String(name || "match")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "match";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `Football_Board_match_${safeName}_${stamp}.json`;
  }

  function aiAnalysisFilename(name) {
    const safeName = String(name || "match")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "match";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `Football_Board_AI_Analysis_${safeName}_${stamp}.json`;
  }

  function availableCardsForTimelineExport(timeline) {
    const currentCards = captureAvailableMatchCards();
    const stableSnapshot = matchCardSnapshotRef.current.recordingId === timeline.recordingId
      ? matchCardSnapshotRef.current.cards
      : [];
    const byId = new Map(currentCards.filter(card => card?.id).map(card => [String(card.id), clonePlain(card)]));
    stableSnapshot.forEach(card => {
      if (card?.id) byId.set(String(card.id), clonePlain(card));
    });
    return [...byId.values()];
  }

  function exportMatchRecording({ promptForName = true } = {}) {
    if (isReplayView) return false;
    if (sessionCode && !isSessionHost) {
      window.alert("Doar hostul poate salva înregistrarea meciului multiplayer.");
      return false;
    }
    const timeline = gameTimelineRef.current;
    if (!timeline) {
      window.alert("Nu există încă un Match Timeline. Intră în Match Mode pentru a începe o înregistrare.");
      return false;
    }

    const defaultName = `Match ${new Date(timeline.startedAt || Date.now()).toLocaleString("ro-RO")}`;
    let name = defaultName;
    if (promptForName) {
      const requestedName = window.prompt("Numele înregistrării:", defaultName);
      if (requestedName === null) return false;
      name = requestedName.trim() || defaultName;
    }

    try {
      const availableCards = availableCardsForTimelineExport(timeline);
      const cardSnapshot = selectRecordingCards(timeline, availableCards);
      const referencedCardIds = referencedCardIdsForTimeline(timeline);
      const exportedCardIds = new Set(cardSnapshot.map(card => String(card.id)));
      const missingCardIds = referencedCardIds.filter(cardId => !exportedCardIds.has(cardId));
      if (missingCardIds.length) {
        throw new Error(`Lipsesc ${missingCardIds.length} carduri folosite în timeline: ${missingCardIds.join(", ")}`);
      }

      const recording = createMatchRecording(timeline, {
        appVersion: APP_VERSION,
        name,
        cardSnapshot,
        ruleSetSnapshot: timeline.initialState?.ruleSet,
      });
      const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = matchRecordingFilename(name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      exportedRecordingRevisionRef.current.set(timeline.recordingId, timeline.revision);
      window.alert(`Meci salvat: ${timeline.entries.length} pași și ${cardSnapshot.length} carduri folosite.`);
      return true;
    } catch (error) {
      console.error(error);
      window.alert(`Meciul nu a putut fi salvat: ${error.message || error}`);
      return false;
    }
  }

  function saveMatchRecording() {
    return exportMatchRecording({ promptForName: true });
  }

  function exportAiAnalysis() {
    if (isReplayView) return false;
    if (sessionCode && !isSessionHost) {
      window.alert("Doar hostul poate exporta analiza AI a meciului multiplayer.");
      return false;
    }
    const timeline = gameTimelineRef.current;
    if (!timeline) {
      window.alert("Nu există încă un Match Timeline. Intră în Match Mode pentru a începe înregistrarea.");
      return false;
    }

    const defaultName = `Match ${new Date(timeline.startedAt || Date.now()).toLocaleString("ro-RO")}`;
    const requestedName = window.prompt("Numele exportului pentru analiza AI:", defaultName);
    if (requestedName === null) return false;
    const name = requestedName.trim() || defaultName;

    try {
      const availableCards = availableCardsForTimelineExport(timeline);
      const cardSnapshot = selectRecordingCards(timeline, availableCards);
      const referencedCardIds = referencedCardIdsForTimeline(timeline);
      const exportedCardIds = new Set(cardSnapshot.map(card => String(card.id)));
      const missingCardIds = referencedCardIds.filter(cardId => !exportedCardIds.has(cardId));
      if (missingCardIds.length) {
        throw new Error(`Lipsesc ${missingCardIds.length} carduri folosite în timeline: ${missingCardIds.join(", ")}`);
      }

      const recording = createMatchRecording(timeline, {
        appVersion: APP_VERSION,
        name,
        cardSnapshot,
        ruleSetSnapshot: timeline.initialState?.ruleSet,
      });
      const analysis = createAiAnalysisExport(recording, { appVersion: APP_VERSION });
      const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = aiAnalysisFilename(name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.alert(`Export AI salvat: ${analysis.semanticTimeline.length} evenimente semantice. Regulile sunt marcate explicit ca manuale/neautomatizate.`);
      return true;
    } catch (error) {
      console.error(error);
      window.alert(`Exportul AI nu a putut fi salvat: ${error.message || error}`);
      return false;
    }
  }

  function closeReplayTransientUi() {
    setCardsPanelOpen(false);
    setEditingCardId(null);
    setAssignTarget(null);
    setEditingPiece(null);
    setEditLabel("");
    setSelectedId(null);
    setHoveredCell(null);
    setInspectedPieceId(null);
    setInspectorVisible(false);
    setTrackerSettingsOpen(false);
    setTrackerStartChoiceOpen(false);
    setPendingEndTurn(null);
    setPendingTurnChange(null);
    setTurnAdvanceNotice(false);
    setPendingAutoMove(null);
    setPendingThreeTwoMove(null);
    setPendingEditorModeExit(false);
    setIllegalMoveNotice(null);
    setJoinSetup(null);
    setLockUI(false);
    setMeasureMode(false);
    setMeasureStart(null);
    setMeasureEnd(null);
  }

  async function importMatchRecording(file) {
    if (!file) return;
    if (Number(file.size) > 100 * 1024 * 1024) {
      window.alert("Fișierul depășește limita de siguranță de 100 MB pentru Match Recording.");
      return;
    }
    if (sessionCode) {
      window.alert("Ieși din sesiunea multiplayer înainte de a importa un meci. Replay-ul este local și nu scrie în Firebase.");
      return;
    }
    if (blueDieRolling || redDieRolling || pendingEndTurn || pendingTurnChange || pendingAutoMove || pendingThreeTwoMove) {
      window.alert("Finalizează acțiunea sau aruncarea de zar aflată în curs înainte de import.");
      return;
    }

    try {
      const recording = readMatchRecording(JSON.parse(await file.text()));
      if (recording.appVersion && recording.appVersion !== APP_VERSION) {
        const confirmed = window.confirm(
          `Înregistrarea a fost creată cu ${recording.appVersion}, iar aplicația curentă este ${APP_VERSION}. ` +
          "Poți continua în modul de vizionare read-only. Continui?"
        );
        if (!confirmed) return;
      }

      const referencedCardIds = referencedCardIdsForTimeline(recording.timeline);
      const availableCardIds = new Set(recording.cardSnapshot.map(card => String(card?.id || "")));
      const missingCardIds = referencedCardIds.filter(cardId => !availableCardIds.has(cardId));
      if (missingCardIds.length) {
        throw new Error(`Fișier incomplet: lipsesc ${missingCardIds.length} carduri folosite în meci.`);
      }

      if (!isReplayView) {
        replayWorkspaceRef.current = {
          gameState: captureTimelineGameState(),
          timeline: gameTimelineRef.current ? clonePlain(gameTimelineRef.current) : null,
          cardState: clonePlain(cardStateRef.current),
          matchCardSnapshot: clonePlain(matchCardSnapshotRef.current),
          zoom,
          panOffset: clonePlain(panOffset),
          historyVisible,
          trackerVisible,
          trackerMinimized,
          dicePanelVisible,
          inspectorVisible,
          inspectorMinimized,
          cardsPanelOpen,
          editingCardId,
          selectedId,
          inspectedPieceId,
          lockUI,
          measureMode,
          measureType,
          measureStart: clonePlain(measureStart),
          measureEnd: clonePlain(measureEnd),
          autosaveDirty: autosaveDirtyRef.current,
        };
      }

      replayModeRef.current = true;
      setReplayRecording(recording);
      closeReplayTransientUi();

      const replayCardState = normalizeCardState({ cards: recording.cardSnapshot });
      cardStateRef.current = replayCardState;
      setCardState(replayCardState);

      const replayTimeline = normalizeTimeline({ ...recording.timeline, cursor: 0 }, recording.timeline.initialState);
      gameTimelineRef.current = replayTimeline;
      setGameTimeline(replayTimeline);
      applyTimelineGameState(replayTimeline.initialState);
      setHistoryVisible(true);
      setTrackerVisible(true);
      setTrackerMinimized(false);
      setDicePanelVisible(false);
    } catch (error) {
      console.error(error);
      window.alert(`Meciul nu a putut fi importat: ${error.message || error}`);
    }
  }

  function exitReplayView() {
    const workspace = replayWorkspaceRef.current;
    if (!workspace) return;

    isApplyingCloudRef.current = true;
    replayModeRef.current = false;
    setReplayRecording(null);

    const restoredCardState = normalizeCardState(workspace.cardState);
    cardStateRef.current = restoredCardState;
    setCardState(restoredCardState);
    applyTimelineGameState(workspace.gameState);

    const restoredTimeline = workspace.timeline ? normalizeTimeline(workspace.timeline, workspace.gameState) : null;
    gameTimelineRef.current = restoredTimeline;
    setGameTimeline(restoredTimeline);
    matchCardSnapshotRef.current = workspace.matchCardSnapshot || { recordingId: "", cards: [] };
    setZoom(workspace.zoom);
    setPanOffset(workspace.panOffset);
    setHistoryVisible(workspace.historyVisible);
    setTrackerVisible(workspace.trackerVisible);
    setTrackerMinimized(workspace.trackerMinimized);
    setDicePanelVisible(workspace.dicePanelVisible);
    setInspectorVisible(workspace.inspectorVisible);
    setInspectorMinimized(workspace.inspectorMinimized);
    setCardsPanelOpen(workspace.cardsPanelOpen);
    setEditingCardId(workspace.editingCardId);
    setSelectedId(workspace.selectedId);
    setInspectedPieceId(workspace.inspectedPieceId);
    setLockUI(workspace.lockUI);
    setMeasureMode(workspace.measureMode);
    setMeasureType(workspace.measureType);
    setMeasureStart(workspace.measureStart);
    setMeasureEnd(workspace.measureEnd);
    autosaveDirtyRef.current = Boolean(workspace.autosaveDirty);
    replayWorkspaceRef.current = null;
    window.setTimeout(() => { isApplyingCloudRef.current = false; }, 300);
  }

  function saveBoard() {
    localStorage.setItem("football-board-sandbox-v35", JSON.stringify({ settings, pieces: sanitizePiecesCardIds(pieces, cardState, settings), zoom, cardState: buildCardLibraryState(cardState) }));
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
      localStorage.getItem("football-board-sandbox-v35") ||
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
    const loadedSettings = normalizeLoadedSettings(saved.settings);
    const loadedCardState = saved.cardState ? normalizeCardState(saved.cardState) : cardState;
    const legacyAssignments = getLegacyAssignments(saved.cardState);
    const loadedPieces = ensureBenchReserveCount(
      sanitizePiecesCardIds(saved.pieces, loadedCardState, loadedSettings, legacyAssignments),
      loadedSettings
    );
    setSettings(loadedSettings);
    piecesRef.current = loadedPieces;
    setPieces(loadedPieces);
    if (saved.cardState) setCardState(loadedCardState);
    setZoom(saved.zoom ?? 1);
  }

  function logSnapshot(label, nextPieces = piecesRef.current || pieces, options = {}) {
    const before = pendingTimelineBeforeRef.current || captureTimelineGameState();
    pendingTimelineBeforeRef.current = null;
    const after = mergeTimelineGameState(before, {
      pieces: nextPieces,
      ...(options.stateOverrides || {}),
    });
    return recordTimelineTransition({
      type: options.type || "GAME_STATE_CHANGED",
      label,
      before,
      after,
      team: options.team || null,
      groupId: options.groupId || null,
      id: options.id || null,
      metadata: options.metadata || {},
      allowNoop: Boolean(options.allowNoop),
    });
  }

  function applyTimelineGameState(rawState, { preserveLocalSelection = false } = {}) {
    if (!rawState) return;
    const state = createGameState(rawState);
    const nextSettings = normalizeSettingsForApp(state.settings || settingsRef.current);
    const assignmentCardState = sessionCode && Object.keys(sessionLibraryByIdRef.current || {}).length
      ? buildCardStateFromSessionLibrary(sessionLibraryByIdRef.current)
      : cardStateRef.current;
    const nextPieces = ensureBenchReserveCount(
      sanitizePiecesCardIds(state.pieces, assignmentCardState, nextSettings, {}, sessionCardsByIdRef.current),
      nextSettings
    );
    const nextMovement = normalizeMovementState(state.movementStateByPieceId);
    const nextTracker = normalizeTrackerSnapshot(state.tracker);

    settingsRef.current = nextSettings;
    piecesRef.current = nextPieces;
    movementStateRef.current = nextMovement;
    setSettings(nextSettings);
    setPieces(nextPieces);
    setMovementStateByPieceId(nextMovement);
    setGameMode(normalizeGameMode(state.gameMode));
    const nextActiveRuleSet = normalizeRuleSet(state.ruleSet);
    activeRuleSetRef.current = nextActiveRuleSet;
    setActiveRuleSet(nextActiveRuleSet);
    setRuleSetDraft(nextActiveRuleSet);
    setRuleSetSelectionId(nextActiveRuleSet.id);
    // Timeline restoration drives both the rendered React state and the refs
    // read by pointer/dice handlers. Updating only React state leaves a stale
    // pass target mode alive after Undo/Redo until a later render happens to
    // refresh the refs.
    const nextActionResolution = state.actionResolution || null;
    const nextActionContinuation = normalizeActionContinuation(state.actionContinuation);
    actionResolutionRef.current = nextActionResolution;
    actionContinuationRef.current = nextActionContinuation;
    setActionResolution(nextActionResolution);
    setActionContinuation(nextActionContinuation);
    setTrackerSettings(nextTracker.settings);
    setTrackerSettingsDraft(nextTracker.settings);
    setTrackerGameStarted(nextTracker.gameStarted);
    setTrackerStartingTeam(nextTracker.startingTeam);
    setTrackerCurrentTurn(nextTracker.currentTurn);
    setTrackerUsedActions(nextTracker.usedActions);
    setTrackerActionLog(nextTracker.actionLog);
    setMatchActionState(nextTracker.matchActionState);
    setTurnPhase(nextTracker.turnPhase);
    if (state.gameMode === "match" && nextTracker.gameStarted) {
      matchPlayableStartEstablishedRef.current = true;
    }
    setDieType(state.dice.dieType);
    setBlueDieResult(state.dice.blueResult);
    setRedDieResult(state.dice.redResult);
    setBlueLastDieType(state.dice.blueLastDieType);
    setRedLastDieType(state.dice.redLastDieType);
    if (preserveLocalSelection) {
      // Snapshot listeners intentionally live across renders. Read the latest
      // selection through the state updater instead of a captured render value.
      setSelectedId(currentSelectedId => {
        const selectedPieceStillValid = currentSelectedId
          && nextPieces.some(piece => piece.id === currentSelectedId && !piece.inactive);
        if (!selectedPieceStillValid) setHoveredCell(null);
        return selectedPieceStillValid ? currentSelectedId : null;
      });
    } else {
      setSelectedId(null);
      setHoveredCell(null);
    }
  }

  function restoreTimelineCursor(cursor) {
    if (!replayModeRef.current && gameMode !== "match") return;
    if (!replayModeRef.current && sessionCode && !isSessionHost) return;
    const current = gameTimelineRef.current;
    if (!current) return;
    resetTransientGameplayUI();
    setPassResultNotice(null);
    const moved = moveTimelineCursor(current, cursor);
    replaceGameTimeline(moved.timeline);
    applyTimelineGameState(moved.state);
    if (!replayModeRef.current) void enqueueTimelineSync(current, moved.timeline, moved.state);
  }

  function clearHistory() {
    if (gameMode !== "match") return;
    if (sessionCode && !isSessionHost) return;
    if (!window.confirm("Șterg history-ul curent și păstrez starea actuală ca punct de pornire?")) return;
    startGameTimeline(captureTimelineGameState(), { syncSession: Boolean(sessionCode) });
  }

  function showDiceNotice(team, result, currentDieType) {
    if (!Number.isFinite(Number(result))) return;
    if (diceNoticeTimerRef.current) window.clearTimeout(diceNoticeTimerRef.current);
    const noticeId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setDiceNotice({ team, result: Number(result), dieType: currentDieType, id: noticeId });
    diceNoticeTimerRef.current = window.setTimeout(() => {
      setDiceNotice(current => current?.id === noticeId ? null : current);
    }, 5000);
  }

  function applyDiceCooldown(until) {
    const safeUntil = Math.max(0, Number(until) || 0);
    diceCooldownUntilRef.current = safeUntil;
    setDiceCooldownUntil(safeUntil);
    if (diceCooldownTimerRef.current) window.clearTimeout(diceCooldownTimerRef.current);
    const remaining = safeUntil - Date.now();
    if (remaining > 0) {
      diceCooldownTimerRef.current = window.setTimeout(() => {
        diceCooldownUntilRef.current = 0;
        setDiceCooldownUntil(0);
      }, remaining + 40);
    }
  }

  function canRollTeamDie(team, { hostIntent = false } = {}) {
    if (replayModeRef.current) return false;
    if (Date.now() < diceCooldownUntilRef.current) return false;
    if (diceRollingRef.current.blue || diceRollingRef.current.red) return false;
    if (pendingDelayedResolution) return false;
    const pending = actionResolutionRef.current;
    if (pending?.kind === "pass" && pending.status === "awaiting-interceptor-choice") return false;
    if (pending?.kind === "pass" && pending.status === "awaiting-interception-roll") {
      const interceptor = pending.plan?.interceptors?.[pending.interceptorIndex];
      if (teamKeyForPiece(interceptor?.defender) !== team) return false;
    }
    if (!sessionCode) return true;
    if (hostIntent && sessionAuthorityRef.current.isHost) return true;
    return myTeam === team;
  }

  async function reserveDiceRoll() {
    const now = Date.now();
    const until = now + 3000;
    if (!sessionCode) {
      applyDiceCooldown(until);
      return true;
    }
    try {
      // Dice locking lives in its own tiny runtime document. It must never
      // invalidate the session Timeline transaction or heartbeat writes.
      const ref = sessionRuntimeRef(sessionCode.toUpperCase(), "dice");
      await runTransaction(db, async transaction => {
        const snap = await transaction.get(ref);
        const currentUntil = snap.exists() ? Math.max(0, Number(snap.data().cooldownUntil) || 0) : 0;
        if (currentUntil > now) {
          const error = new Error("Dice cooldown");
          error.code = "dice-cooldown";
          throw error;
        }
        transaction.set(ref, {
          cooldownUntil: until,
          reservedBy: clientIdRef.current,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      applyDiceCooldown(until);
      return true;
    } catch (error) {
      if (error?.code === "dice-cooldown") {
        multiplayerTracerRef.current.guard("ROLL_RESERVATION_ABORTED", "active shared cooldown", { sessionCode, clientId: clientIdRef.current });
        return false;
      }
      const advisoryLockUnavailable = ["permission-denied", "missing-or-insufficient-permissions", "unavailable"].includes(error?.code);
      multiplayerTracerRef.current.error("ROLL_RESERVATION_FAILED", error, {
        sessionCode,
        clientId: clientIdRef.current,
        fallback: advisoryLockUnavailable ? "local cooldown" : "none",
      });
      console.error("Dice reservation failed", error);
      if (advisoryLockUnavailable) {
        // The runtime cooldown is advisory coordination, never gameplay authority.
        // Timeline revision validation remains the canonical concurrency guard.
        applyDiceCooldown(until);
        setSessionStatus("Online — local dice lock");
        multiplayerTracerRef.current.multiplayer("ROLL_RESERVATION_FALLBACK", {
          sessionCode,
          clientId: clientIdRef.current,
          reason: error?.code || "runtime lock unavailable",
        });
        return true;
      }
      setSessionStatus("Dice sync error");
      return false;
    }
  }

  async function requestDiceRollIntent(team, chosenResult = null) {
    if (!sessionCode || sessionAuthorityRef.current.isHost || diceRollIntentPendingRef.current) return false;
    const pending = actionResolutionRef.current;
    const requestId = `dice_roll_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    diceRollIntentPendingRef.current = true;
    setDiceRollIntentPending(true);
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "diceRollIntent"), {
        requestId,
        team,
        chosenResult: chosenResult === null || chosenResult === undefined ? null : Number(chosenResult),
        actionId: pending?.kind === "pass" ? pending.id : null,
        pendingRollRequestId: pending?.pendingRoll?.requestId || null,
        requestedByUid: user?.uid || "",
        requestedByClient: clientIdRef.current,
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        status: "pending",
        requestedAt: serverTimestamp(),
      });
      multiplayerTracerRef.current.multiplayer("DICE_ROLL_INTENT_SENT", { requestId, team, actionId: pending?.id || null });
      return true;
    } catch (error) {
      diceRollIntentPendingRef.current = false;
      setDiceRollIntentPending(false);
      multiplayerTracerRef.current.error("DICE_ROLL_INTENT_FAILED", error, { requestId, team });
      return false;
    }
  }

  function requestTeamDieRoll(team) {
    if (!canRollTeamDie(team) || diceRollIntentPendingRef.current) return;
    if (chooseRollEnabled) {
      setChooseRollForTeam(team);
      return;
    }
    void rollTeamDie(team);
  }

  async function rollTeamDie(team, chosenResult = null, { fromHostIntent = false } = {}) {
    if (!canRollTeamDie(team, { hostIntent: fromHostIntent })) return false;
    if (sessionCode && gameMode === "match" && !sessionAuthorityRef.current.isHost && !fromHostIntent) {
      return requestDiceRollIntent(team, chosenResult);
    }
    const forcedPassDie = actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "awaiting-interception-roll";
    const rollingDieType = forcedPassDie ? 20 : dieType;
    const hasChosenResult = chosenResult !== null && chosenResult !== undefined;
    const requestedResult = hasChosenResult ? Number(chosenResult) : null;
    if (hasChosenResult && (!Number.isInteger(requestedResult) || requestedResult < 1 || requestedResult > rollingDieType)) return;
    if (!(await reserveDiceRoll())) return;
    const beforeTimeline = captureTimelineGameState();
    const activeActionTransaction = transactionForActionState(actionResolutionRef.current)
      || (actionContinuationRef.current?.status === CONTINUATION_STATUS.ACTION_ACTIVE
        ? transactionForActionState(actionContinuationRef.current)
        : null);
    if (diceNoticeTimerRef.current) window.clearTimeout(diceNoticeTimerRef.current);
    setDiceNotice(null);
    const setRolling = team === "blue" ? setBlueDieRolling : setRedDieRolling;
    const setAnimationValue = team === "blue" ? setBlueDiceAnimationValue : setRedDiceAnimationValue;
    const setResult = team === "blue" ? setBlueDieResult : setRedDieResult;
    diceRollingRef.current[team] = true;
    setRolling(true);
    setAnimationValue(Math.floor(Math.random() * rollingDieType) + 1);
    let ticks = 0;
    const animation = window.setInterval(() => {
      setAnimationValue(Math.floor(Math.random() * rollingDieType) + 1);
      ticks += 1;
      if (ticks >= 10) window.clearInterval(animation);
    }, 80);
    window.setTimeout(async () => {
      window.clearInterval(animation);
      const result = hasChosenResult ? requestedResult : Math.floor(Math.random() * rollingDieType) + 1;
      const rollSource = hasChosenResult ? "CHOSEN" : "RANDOM";
      const rollId = `${Date.now()}_${clientIdRef.current}_${team}`;
      pendingDiceRollRef.current[team] = sessionCode && gameMode !== "match" ? { rollId, result } : null;
      if (gameMode !== "match") diceSeenRollIdsRef.current[team] = rollId;
      setResult(result);
      setAnimationValue(null);
      diceRollingRef.current[team] = false;
      setRolling(false);
      showDiceNotice(team, result, rollingDieType);
      const preparedPassRoll = preparePassInterceptionRoll(team, result);
      const traceId = preparedPassRoll
        ? (actionTraceIdsRef.current.get(preparedPassRoll.actionId) || createMultiplayerTraceId("pass"))
        : createMultiplayerTraceId("roll");
      if (preparedPassRoll) actionTraceIdsRef.current.set(preparedPassRoll.actionId, traceId);
      multiplayerTracerRef.current.multiplayer("ROLL_BUTTON_PRESSED", { traceId, team, dieType: rollingDieType, chosen: hasChosenResult });
      const rollEvent = preparedPassRoll ? createRollEvent({
        id: createActionEventId(`roll_${preparedPassRoll.actionId}`),
        requestId: preparedPassRoll.requestId,
        actionId: preparedPassRoll.actionId,
        team,
        dieType: rollingDieType,
        natural: result,
        source: rollSource,
        subjectId: preparedPassRoll.defenderId,
        reactionIndex: preparedPassRoll.interceptorIndex,
        traceId,
      }) : null;
      const resolutionTransaction = preparedPassRoll
        ? {
            id: `resolution_${preparedPassRoll.actionId}_${Date.now()}_${clientIdRef.current}`,
            source: "roll-resolution",
            undoMode: "atomic",
          }
        : null;
      const delayedResolution = preparedPassRoll
        ? createDelayedResolution({
            kind: "pass-interception",
            actionId: preparedPassRoll.actionId,
            team,
            value: result,
            delayMs: Math.max(2000, Number(activeRuleSetRef.current.actions?.pass?.resolutionDelayMs) || 2000),
            payload: {
              traceId,
              defenderId: preparedPassRoll.defenderId,
              interceptorIndex: preparedPassRoll.interceptorIndex,
              rollEvent,
              undoTransaction: resolutionTransaction,
            },
          })
        : null;
      const wasPassRoll = Boolean(delayedResolution);
      multiplayerTracerRef.current.multiplayer("ROLL_SENT", {
        traceId,
        team,
        result,
        actionId: preparedPassRoll?.actionId || null,
        requestId: preparedPassRoll?.requestId || null,
      });
      const nextTimeline = recordTimelineTransition({
        type: "DICE_ROLLED",
        label: `${team === "blue" ? "Blue" : "Red"} D${rollingDieType}: ${result}${wasPassRoll ? " (interception)" : ""}${hasChosenResult ? " (chosen)" : ""}`,
        team,
        groupId: activeActionTransaction?.undoMode === ACTION_TRANSACTION_UNDO_MODE.ATOMIC
          ? activeActionTransaction.id
          : null,
        metadata: {
          traceId,
          rollSource,
          rollEvent,
          chosenResult: hasChosenResult ? result : null,
          ...(resolutionTransaction ? { undoTransaction: resolutionTransaction } : {}),
          ...(delayedResolution ? { delayedResolution } : {}),
        },
        before: beforeTimeline,
        after: captureTimelineGameState({
          blueDieResult: team === "blue" ? result : blueDieResult,
          redDieResult: team === "red" ? result : redDieResult,
          blueLastDieType: team === "blue" ? rollingDieType : blueLastDieType,
          redLastDieType: team === "red" ? rollingDieType : redLastDieType,
        }),
        // A roll is a gameplay event even when its visible numeric value is
        // identical to the previous roll. Its unique rollEvent/request IDs
        // must therefore enter Timeline and trigger resolution.
        allowNoop: true,
      });
      if (sessionCode && gameMode === "match" && nextTimeline) {
        const diceEntry = nextTimeline.entries[nextTimeline.cursor - 1];
        diceSeenRollIdsRef.current[team] = `timeline_${nextTimeline.recordingId}_${diceEntry?.id || `baseline_${team}`}`;
      }
      if (delayedResolution && nextTimeline) {
        const diceEntry = nextTimeline.entries[nextTimeline.cursor - 1];
        scheduleDelayedResolution({ ...delayedResolution, entryId: String(diceEntry?.id || "") });
      }
      if (team === "blue") setBlueLastDieType(rollingDieType);
      else setRedLastDieType(rollingDieType);
      if (sessionCode && gameMode !== "match") {
        try {
          const ref = sessionRef(sessionCode.toUpperCase());
          await updateDoc(ref, {
            [`sharedDice.${team}`]: {
              value: result,
              dieType: rollingDieType,
              rollId,
              rollSource,
              rolledBy: user?.uid || "",
              rolledAt: serverTimestamp(),
            },
            updatedAt: serverTimestamp(),
            expiresAt: nextSessionExpiryDate(),
          });
        } catch (error) {
          pendingDiceRollRef.current[team] = null;
          console.error("Dice sync failed", error);
          setSessionStatus("Dice sync error");
        }
      }
    }, 800);
    return true;
  }

  function undo() {
    if (!replayModeRef.current && gameMode !== "match") return;
    if (!replayModeRef.current && sessionCode && !isSessionHost) return;
    const current = gameTimelineRef.current;
    if (!current) return;
    resetTransientGameplayUI();
    setPassResultNotice(null);
    const lastEntry = current.entries?.[(current.cursor || 0) - 1];
    const result = atomicTimelineTransactionId(lastEntry)
      ? undoAtomicTimelineTransaction(current)
      : undoTimeline(current);
    if (!result.state) return;
    replaceGameTimeline(result.timeline);
    applyTimelineGameState(result.state);
    if (!replayModeRef.current) void enqueueTimelineSync(current, result.timeline, result.state);
  }

  function redo() {
    if (!replayModeRef.current && gameMode !== "match") return;
    if (!replayModeRef.current && sessionCode && !isSessionHost) return;
    const current = gameTimelineRef.current;
    if (!current) return;
    cancelDelayedResolutionTimer();
    setPassResultNotice(null);
    const nextEntry = current.entries?.[current.cursor || 0];
    const result = atomicTimelineTransactionId(nextEntry)
      ? redoAtomicTimelineTransaction(current)
      : redoTimeline(current);
    if (!result.state) return;
    replaceGameTimeline(result.timeline);
    applyTimelineGameState(result.state);
    if (!replayModeRef.current) void enqueueTimelineSync(current, result.timeline, result.state);
  }

  function gridPointFromClient(clientX, clientY, { clampToBoard = true } = {}) {
    const pitch = pitchRef.current;
    if (!pitch) return null;
    const rect = pitch.getBoundingClientRect();
    const localX = (clientX - rect.left) / zoom;
    const localY = (clientY - rect.top) / zoom;
    const rawX = Math.floor(localX / settings.cellSize);
    const rawY = Math.floor(localY / settings.cellSize);

    if (!clampToBoard) {
      if (rawX < 0 || rawX >= settings.cols || rawY < 0 || rawY >= settings.rows) return null;
      return { x: rawX, y: rawY };
    }

    const y = clampBoardY(rawY, settings);
    const x = clampBoardXForY(rawX, y, settings);
    return { x, y };
  }

  function findCardForPiece(piece) {
    if (!piece?.cardId) return null;
    const id = String(piece.cardId);
    const sessionCard = sessionCardsByIdRef.current?.[id] || sessionLibraryByIdRef.current?.[id];
    return sessionCard || (cardStateRef.current.cards || []).find(card => String(card.id) === id) || null;
  }
  function getPieceSpeed(piece) {
    const card = findCardForPiece(piece);
    const value = Number(cardStat(card, "stat:speed"));
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }
  function playerHasBall(piece) {
    if (!piece || piece.team === "BALL") return false;
    return (piecesRef.current || pieces).some(item =>
      item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y)
    );
  }

  function cancelFreeBall() {
    setFreeBallActive(false);
    setSelectedId(null);
    setHoveredCell(null);
    setPendingAutoMove(null);
    setPendingThreeTwoMove(null);
  }

  function toggleFreeBall(piece = null) {
    if (gameMode !== "match" || replayModeRef.current) return;
    if (!sessionCode && currentTimelineTrackerSnapshot().matchActionState.freeMode?.active) return;
    if (!sessionCode && currentTimelineTrackerSnapshot().matchActionState.groupMove?.active) return;
    if (!sessionCode && currentTimelineTrackerSnapshot().matchActionState.activeMovement?.active) return;
    if (!sessionCode && actionContinuationRef.current?.kind === "bonus-card-action") return;
    if (sessionCode && (!piece || piece.team === "BALL" || pieceTeamKey(piece) !== myTeam)) return;
    setFreeBallActive(active => {
      const next = !active;
      const ball = (piecesRef.current || pieces).find(item => item.team === "BALL");
      setSelectedId(next ? (ball?.id || null) : null);
      return next;
    });
    setHoveredCell(null);
    setPendingAutoMove(null);
    setPendingThreeTwoMove(null);
  }

  function commitFreeBallMove(x, y, { fromHostIntent = false } = {}) {
    if (gameMode !== "match") return false;
    if (sessionCode && isSessionGuest && !fromHostIntent) return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const ball = before.pieces.find(item => item.team === "BALL");
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        // Free Ball does not read cards or rules. The full persisted MatchContext
        // is introduced with Match start; this phase keeps the controller contract
        // explicit without changing current Match startup behavior.
        context: {
          id: gameTimelineRef.current?.recordingId || "",
          ruleSet: before.ruleSet,
          boardSettings: before.settings,
        },
        command: {
          id: createActionEventId("free_ball_move"),
          type: "FREE_BALL_MOVED",
          payload: { x: Number(x), y: Number(y) },
        },
        label: `Ball ${ball?.label || ""} → ${toCoord(x, y)}`.trim(),
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      return true;
    }
    const currentPieces = piecesRef.current || pieces;
    const ball = currentPieces.find(item => item.team === "BALL");
    if (!ball) return false;
    if (Number(ball.x) === Number(x) && Number(ball.y) === Number(y)) return false;
    pushHistory(currentPieces, movementStateRef.current);
    const nextPieces = ensureBenchReserveCount(currentPieces.map(item =>
      item.team === "BALL" ? { ...item, x, y } : item
    ), settingsRef.current);
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    logSnapshot(`Ball ${ball.label || ""} → ${toCoord(x, y)}`.trim(), nextPieces, {
      type: "BALL_MOVED",
      team: null,
      groupId: null,
      metadata: { movementReason: "FREE_BALL" },
      stateOverrides: { movementStateByPieceId: movementStateRef.current },
    });
    return true;
  }

  async function requestHostFreeBallMove(x, y) {
    if (!sessionCode || !isSessionGuest || freeBallMoveIntentPendingRef.current) return false;
    const requestId = createActionEventId("free_ball_move");
    setFreeBallMoveIntentPending(true);
    freeBallMoveIntentPendingRef.current = true;
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "freeBallMoveIntent"), {
        requestId, team: myTeam, x: Number(x), y: Number(y),
        requestedByUid: user?.uid || "", requestedByClient: clientIdRef.current,
        status: "pending", createdAt: serverTimestamp(),
      }, { merge: false });
      return true;
    } catch (error) {
      setFreeBallMoveIntentPending(false);
      freeBallMoveIntentPendingRef.current = false;
      console.error("Free Ball intent failed", error);
      return false;
    }
  }

  function moveBallFreelyTo(x, y) {
    if (!freeBallActive || gameMode !== "match") return false;
    if (sessionCode && isSessionGuest) {
      void requestHostFreeBallMove(x, y);
      cancelFreeBall();
      return true;
    }
    const committed = commitFreeBallMove(x, y);
    cancelFreeBall();
    return committed;
  }

  function getThreeTwoEligibility(piece, x, y) {
    if (!sessionCode) {
      const state = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      return evaluateThreeTwoMove(state, singlePlayerMatchContext(), {
        id: "three_two_preview",
        type: GAME_COMMAND_TYPE.THREE_TWO_MOVE_COMMITTED,
        payload: { pieceId: piece?.id, x: Number(x), y: Number(y) },
      });
    }
    const geometry = getMovementGeometry(piece, { x, y });
    const current = movementStateRef.current[piece.id] || { axis: null, spent: 0, distance: 0, threeTwoUsed: false, movementEnded: false };
    const boardPieces = piecesRef.current || pieces;
    const hasBall = boardPieces.some(item => item.team === "BALL" && item.x === x && item.y === y);
    if (gameMode !== "match" || piece.team === "BALL" || !hasBall) return { eligible: false, reason: "not-ball", geometry, current };
    const occupiedByAnotherPlayer = boardPieces.some(item => item.id !== piece.id && item.team !== "BALL" && item.x === x && item.y === y);
    if (occupiedByAnotherPlayer) return { eligible: false, reason: "occupied", geometry, current };
    if (current.threeTwoUsed) return { eligible: false, reason: "used", geometry, current };
    if (geometry.kind === "same" || geometry.kind === "mixed") return { eligible: false, reason: "geometry", geometry, current };
    const withinRange = geometry.kind === "straight" ? geometry.distance <= 3 : geometry.distance <= 2;
    if (!withinRange) return { eligible: false, reason: "range", geometry, current };
    const speed = getPieceSpeed(piece);
    if (speed === null) return { eligible: false, reason: "no-speed", geometry, current };
    return { eligible: true, geometry, current, speed };
  }
  function evaluateMove(piece, x, y) {
    const geometry = getMovementGeometry(piece, { x, y });
    const targetOccupiedByPlayer = (piecesRef.current || pieces).some(item => item.id !== piece.id && item.team !== "BALL" && item.x === x && item.y === y);
    if (piece.team !== "BALL" && targetOccupiedByPlayer) return { legal: false, reason: "occupied", geometry };
    if (geometry.kind === "same") return { legal: false, reason: "same", geometry };
    if (gameMode === "editor") return { legal: true, geometry };
    if (piece.team === "BALL") return { legal: false, reason: "free-ball-required", geometry };
    if (geometry.kind === "mixed") return { legal: false, reason: "mixed", geometry };
    if (!sessionCode && gameMode === "match" && firstPlayerBlockingMovementPath({
      pieces: piecesRef.current || pieces,
      movingPieceId: piece.id,
      from: piece,
      to: { x, y },
    })) return { legal: false, reason: "path-blocked", geometry };
    const current = movementStateRef.current[piece.id] || { axis: null, spent: 0, distance: 0, threeTwoUsed: false, movementEnded: false };
    if (current.movementEnded) return { legal: false, reason: "movement-ended", geometry, current, remaining: 0 };
    const speed = getPieceSpeed(piece);
    if (speed === null) return { legal: false, reason: "no-speed", geometry };
    if (current.axis && current.axis !== geometry.axis) return { legal: false, reason: "axis", geometry, speed, current };
    const currentDistance = Math.max(0, Number(current.distance) || 0);
    const moveCost = geometry.kind === "diagonal"
      ? diagonalCostForDistance(currentDistance + geometry.distance) - diagonalCostForDistance(currentDistance)
      : geometry.cost;
    const remaining = Math.max(0, speed - current.spent);
    if (moveCost > remaining) return { legal: false, reason: "speed", geometry, moveCost, speed, current, remaining };
    return { legal: true, geometry, moveCost, speed, current, remaining };
  }
  function evaluateGroupMove(piece, x, y) {
    const geometry = getMovementGeometry(piece, { x, y });
    const targetOccupiedByPlayer = (piecesRef.current || pieces).some(item => item.id !== piece.id && item.team !== "BALL" && item.x === x && item.y === y);
    if (piece.team !== "BALL" && targetOccupiedByPlayer) return { legal: false, reason: "occupied", geometry };
    if (geometry.kind === "same") return { legal: false, reason: "same", geometry };
    if (geometry.kind === "mixed") return { legal: false, reason: "mixed", geometry };
    if (!sessionCode && gameMode === "match" && firstPlayerBlockingMovementPath({
      pieces: piecesRef.current || pieces,
      movingPieceId: piece.id,
      from: piece,
      to: { x, y },
    })) return { legal: false, reason: "path-blocked", geometry };
    const current = movementStateRef.current[piece.id] || { axis: null, spent: 0, distance: 0, threeTwoUsed: false, movementEnded: false };
    if (current.axis && current.axis !== geometry.axis) return { legal: false, reason: "axis", geometry, current };
    return { legal: true, geometry, moveCost: 0, current, remaining: Infinity };
  }
  function illegalMoveMessage(result) {
    let primary;
    if (result.reason === "speed") primary = <>Movement cost: {result.moveCost ?? result.geometry.cost}<br/>Movement remaining: {result.remaining}</>;
    else if (result.reason === "axis") primary = <>The player cannot change movement axis during the same turn.</>;
    else if (result.reason === "mixed") primary = <>Mixed movement is not allowed.</>;
    else if (result.reason === "no-speed") primary = <>No Speed value is assigned to this player.</>;
    else if (result.reason === "occupied") primary = <>The destination cell is occupied by another player.</>;
    else if (result.reason === "path-blocked") primary = <>Another player blocks the movement path.</>;
    else if (result.reason === "group-move-last-action-only") primary = <>GROUP MOVE is available only when exactly one normal action remains.</>;
    else if (result.reason === "GROUP_MOVE_OUTSIDE_ZONE") primary = <>This player is outside the confirmed Group Move zone.</>;
    else if (result.reason === "GROUP_MOVE_PIECE_ALREADY_MOVED") primary = <>This player has already moved during this turn.</>;
    else if (result.reason === "GROUP_MOVE_PIECE_HAS_BALL") primary = <>The player carrying the ball cannot use Group Move.</>;
    else if (result.reason === "GROUP_MOVE_LIMIT_REACHED") primary = <>The maximum number of Group Move players has been reached.</>;
    else if (result.reason === "GROUP_MOVE_BALL_DESTINATION") primary = <>A Group Move player cannot finish on the ball.</>;
    else if (result.reason === "GROUP_MOVE_DISTANCE") primary = <>This Group Move exceeds the configured maximum distance.</>;
    else if (result.reason === "GROUP_MOVE_DIRECTION") primary = <>All Group Move players must follow the first movement direction.</>;
    else if (result.reason === "movement-ended") primary = <>This player has no legal movement remaining during the current turn.</>;
    else if (result.reason === "match-not-started") primary = <>Start the match in Tracker before moving players.</>;
    else if (result.reason === "move-not-authorized") primary = <>Press MOVE, GROUP MOVE or FREE MOVE before moving this player, or advance to next turn.</>;
    else if (result.reason === "pass-origin-blocked") primary = <>A pass cannot start from a corner shared with an opposing player.</>;
    else if (result.reason === "pass-goalkeeper-blocked") primary = <>A pass route cannot cross a goalkeeper.</>;
    else if (result.reason === "pass-requires-ball") primary = <>Only the player who has the ball can start a pass in Match Mode.</>;
    else if (result.reason === "free-ball-required") primary = <>Press FREE BALL before moving the ball in Match Mode.</>;
    else if (result.reason === "team-exhausted") primary = <>Wait for opponent team or advance to next turn.</>;
    else if (result.reason === "wait-opponent") primary = <>Wait for opponent team.</>;
    else if (result.reason === "wait-active-team") primary = <>Wait for the opponent to finish their turn, or use Free Move.</>;
    else if (result.reason === "actions-complete-end-turn") primary = <>All actions are complete. Press END TURN to finish your turn.</>;
    else if (result.reason === "all-actions-complete") primary = <>All actions are complete. Advance to the next turn.</>;
    else if (result.reason === "exit-free-mode") primary = <>Exit FREE MOVE first.</>;
    else if (result.reason === "advance-turn") primary = <>Advance to next turn.</>;
    else primary = <>This move is not allowed.</>;
    if (!result.threeTwoAlreadyUsed) return primary;
    return <>{primary}<br/><br/><strong>The 3/2 rule has already been used by this player during the current turn.</strong></>;
  }
  async function syncSessionMove(nextPieces, nextMovement) {
    if (!sessionCode || sessionEndingRef.current) return;
    try {
      await updateDoc(sessionRef(sessionCode), {
        board: encodeForFirestore(buildLiveBoardState({ pieces: nextPieces })),
        "sharedTracker.movementStateByPieceId": normalizeMovementState(nextMovement),
        updatedAt: serverTimestamp(),
        updatedBy: clientIdRef.current,
      });
      sessionLastSaveAtRef.current = Date.now();
      setSessionStatus("Online saved");
    } catch (error) {
      console.error("Move sync failed", error);
      setSessionStatus("Move sync error");
      // Keep the pending live-save path active so the board position is retried.
      scheduleSessionLiveSave();
    }
  }
  function completeGameModeChange(next) {
    const leavingMatch = next === "editor";
    const nextState = captureTimelineGameState({
      gameMode: next,
      ...(leavingMatch ? { actionResolution: null, actionContinuation: null } : {}),
    });
    if (leavingMatch) {
      matchContextRef.current = null;
      cancelDelayedResolutionTimer();
      setLiveActionResolution(null);
      setLiveActionContinuation(null);
      setSelectedId(null);
      setHoveredCell(null);
      setPassResultNotice(null);
      setFreeBallActive(false);
    }
    setGameMode(next);
    if (next === "match") {
      matchPlayableStartEstablishedRef.current = false;
      startGameTimeline(nextState, { syncSession: Boolean(sessionCode) });
    }
    else if (gameTimelineRef.current) {
      matchPlayableStartEstablishedRef.current = false;
      const currentTimeline = gameTimelineRef.current;
      const wasExportedAtCurrentRevision =
        currentTimeline.cursor === currentTimeline.entries.length &&
        exportedRecordingRevisionRef.current.get(currentTimeline.recordingId) === currentTimeline.revision;
      const before = timelineStateAt(currentTimeline, currentTimeline.cursor);
      const withExit = commitTimelineEntry(currentTimeline, {
        type: "MATCH_MODE_ENDED",
        label: "Editor Mode",
        actorId: user?.uid || clientIdRef.current,
        before,
        after: nextState,
      });
      const closedTimeline = replaceGameTimeline(closeTimeline(withExit));
      if (wasExportedAtCurrentRevision) {
        exportedRecordingRevisionRef.current.set(closedTimeline.recordingId, closedTimeline.revision);
      }
      const exitEntry = closedTimeline.entries[closedTimeline.cursor - 1] || null;
      void enqueueTimelineSync(currentTimeline, closedTimeline, nextState, exitEntry);
    }
  }

  function toggleGameMode() {
    if (replayModeRef.current) return;
    if (sessionCode && !isSessionHost) return;
    const next = gameMode === "editor" ? "match" : "editor";
    const existingTimeline = gameTimelineRef.current;
    const exportedRevision = existingTimeline
      ? exportedRecordingRevisionRef.current.get(existingTimeline.recordingId)
      : undefined;
    if (
      next === "match" &&
      existingTimeline?.entries?.length > 0 &&
      matchRecordingNeedsExport(existingTimeline, exportedRevision) &&
      !window.confirm("Match Timeline-ul anterior nu a fost salvat. Dacă începi un meci nou, acesta va fi înlocuit. Continui?")
    ) return;
    if (next === "editor" && matchRecordingNeedsExport(existingTimeline, exportedRevision)) {
      setPendingEditorModeExit(true);
      return;
    }
    completeGameModeChange(next);
  }

  function confirmEditorModeExit(saveFirst) {
    if (!pendingEditorModeExit) return;
    if (saveFirst && !exportMatchRecording({ promptForName: false })) return;
    setPendingEditorModeExit(false);
    completeGameModeChange("editor");
  }

  function commitPieceMove(piece, x, y, evaluation, { useThreeTwo = false, authorizationOverride = null, completeBonus = false } = {}) {
    const authorization = authorizationOverride || movementAuthorization(piece);
    if (!sessionCode && gameMode === "match" && !useThreeTwo && !authorizationOverride && authorization.mode === "normal") {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`normal_move_commit_${piece.id}`),
          type: GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED,
          payload: { pieceId: piece.id, x: Number(x), y: Number(y) },
        },
        label: `${piece.team === "A" ? "Blue" : "Red"} ${piece.label} → ${toCoord(x, y)}`,
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      return true;
    }
    pushHistory(piecesRef.current || pieces, movementStateRef.current);
    const isFreePlacement = authorization.mode === "free";
    const isGroupPlacement = authorization.mode === "group";
    const isBonusPlacement = authorization.mode === "bonus";
    const timelineGroupId = useThreeTwo || piece.team === "BALL" || gameMode === "editor"
      ? null
      : isFreePlacement
        ? (matchActionState.freeMode?.timelineGroupId || null)
        : isGroupPlacement
          ? (matchActionState.groupMove?.timelineGroupId || null)
          : isBonusPlacement
            ? (actionContinuationRef.current?.id || null)
            : (matchActionState.byPieceId?.[piece.id]?.moveGroupId || null);
    const currentPieces = piecesRef.current || pieces;
    const carriesBall = piece.team !== "BALL" && currentPieces.some(item =>
      item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y)
    );
    const nextPieces = ensureBenchReserveCount(currentPieces.map(item => {
      if (item.id === piece.id) return { ...item, x, y };
      if (carriesBall && item.team === "BALL") return { ...item, x, y };
      return item;
    }), settingsRef.current);
    let nextMovement = movementStateRef.current;
    if (gameMode === "match" && piece.team !== "BALL" && !isFreePlacement) {
      const current = movementStateRef.current[piece.id] || { axis: null, spent: 0, distance: 0, threeTwoUsed: false, movementEnded: false };
      if (isGroupPlacement) {
        nextMovement = {
          ...movementStateRef.current,
          [piece.id]: {
            ...current,
            axis: current.axis || evaluation.geometry.axis,
            distance: Math.max(0, Number(current.distance) || 0) + evaluation.geometry.distance,
          },
        };
      } else if (useThreeTwo) {
        const hadMoved = (Number(current.spent) || 0) > 0;
        nextMovement = {
          ...movementStateRef.current,
          [piece.id]: {
            axis: hadMoved ? evaluation.geometry.axis : null,
            spent: hadMoved ? evaluation.speed : 0,
            distance: hadMoved ? evaluation.geometry.distance : 0,
            threeTwoUsed: true,
            movementEnded: hadMoved,
          },
        };
      } else {
        nextMovement = {
          ...movementStateRef.current,
          [piece.id]: {
            axis: current.axis || evaluation.geometry.axis,
            spent: current.spent + (evaluation.moveCost ?? evaluation.geometry.cost),
            distance: Math.max(0, Number(current.distance) || 0) + evaluation.geometry.distance,
            threeTwoUsed: Boolean(current.threeTwoUsed),
            movementEnded: Boolean(current.movementEnded),
          },
        };
      }
      movementStateRef.current = nextMovement;
      setMovementStateByPieceId(nextMovement);
    }
    let completedMatchActionState = matchActionState;
    const activeMovement = currentTimelineTrackerSnapshot().matchActionState.activeMovement || {};
    if (!useThreeTwo && !isFreePlacement && !isGroupPlacement && !isBonusPlacement
      && activeMovement.active && activeMovement.kind === "normal-move" && activeMovement.pieceId === piece.id) {
      completedMatchActionState = normalizeMatchActionState({
        ...currentTimelineTrackerSnapshot().matchActionState,
        activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
      });
      setMatchActionState(completedMatchActionState);
    }
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    if (completeBonus) {
      const completedContinuation = completeContinuationAction(actionContinuationRef.current);
      if (completedContinuation) setLiveActionContinuation(completedContinuation);
    }
    if (sessionCode && gameMode !== "match") syncSessionMove(nextPieces, nextMovement);
    logSnapshot(`${piece.team === "A" ? "Blue" : piece.team === "B" ? "Red" : "Ball"} ${piece.label} → ${toCoord(x, y)}${useThreeTwo ? " (3/2)" : ""}`, nextPieces, {
      type: useThreeTwo ? "THREE_TWO_MOVE" : isFreePlacement ? "FREE_MOVE" : isGroupPlacement ? "GROUP_MOVE_PIECE" : piece.team === "BALL" ? "BALL_MOVED" : "PIECE_MOVED",
      team: piece.team === "A" ? "blue" : piece.team === "B" ? "red" : null,
      groupId: timelineGroupId,
      stateOverrides: { movementStateByPieceId: nextMovement, matchActionState: completedMatchActionState },
    });
    // Bonus Move is progressive: keep the player selected until END B.A. so
    // remaining movement points can be spent. Other movement modes preserve
    // the historical one-physical-move selection behavior.
    if (isBonusPlacement || isFreePlacement) setSelectedId(piece.id);
    else setSelectedId(null);
    setHoveredCell(null);
    return true;
  }

  async function requestHostFreeMove(piece, x, y) {
    if (!sessionCode || !isSessionGuest || freeModeIntentPendingRef.current || !piece) return false;
    const requestId = createActionEventId("free_move");
    setFreeModeIntentPending(true);
    freeModeIntentPendingRef.current = true;
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "freeModeIntent"), {
        requestId, operation: "move", pieceId: piece.id, team: pieceTeamKey(piece), x: Number(x), y: Number(y),
        requestedByUid: user?.uid || "", requestedByClient: clientIdRef.current,
        status: "pending", createdAt: serverTimestamp(),
      }, { merge: false });
      return true;
    } catch (error) {
      setFreeModeIntentPending(false); freeModeIntentPendingRef.current = false;
      console.error("Free Move intent failed", error); return false;
    }
  }

  async function requestHostNormalMoveCommit(piece, x, y) {
    if (!sessionCode || !isSessionGuest || normalMoveCommitIntentPendingRef.current || !piece) return false;
    const activeMovement = currentTimelineTrackerSnapshot().matchActionState.activeMovement || {};
    if (!activeMovement.active || activeMovement.kind !== "normal-move" || String(activeMovement.pieceId || "") !== String(piece.id)) return false;
    const requestId = createActionEventId(`normal_move_commit_${piece.id}`);
    setNormalMoveCommitIntentPending(true);
    normalMoveCommitIntentPendingRef.current = true;
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "normalMoveCommitIntent"), {
        requestId,
        status: "pending",
        pieceId: piece.id,
        team: pieceTeamKey(piece),
        x: Number(x),
        y: Number(y),
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        requestedByUid: user?.uid || "",
        requestedByClient: clientIdRef.current,
        requestedAt: serverTimestamp(),
      }, { merge: false });
      return true;
    } catch (error) {
      setNormalMoveCommitIntentPending(false);
      normalMoveCommitIntentPendingRef.current = false;
      console.error("Normal Move commit intent failed", error);
      return false;
    }
  }

  function moveSelectedPieceTo(x, y) {
    const piece = (piecesRef.current || pieces).find(item => item.id === (interactionState.activePieceId || selectedId));
    if (!piece || !canMovePiece(piece)) return false;

    if (!sessionCode && gameMode === "match" && matchActionState.groupMove?.active) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`group_move_${piece.id}`),
          type: GAME_COMMAND_TYPE.GROUP_MOVE_PLAYER_COMMITTED,
          payload: { pieceId: piece.id, x: Number(x), y: Number(y) },
        },
        label: `${piece.team === "A" ? "Blue" : "Red"} Group Move: ${getPieceDisplayLabel(piece)} → ${toCoord(x, y)}`,
      });
      if (!dispatched.result.accepted) {
        if (dispatched.result.reason !== "same") setIllegalMoveNotice({ reason: dispatched.result.reason });
        return false;
      }
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(null);
      return true;
    }

    if (sessionCode && isSessionGuest && interactionState.kind === "normal-move") {
      if (normalMoveCommitIntentPendingRef.current) return false;
      const evaluation = evaluateMove(piece, x, y);
      if (!evaluation.legal) {
        if (evaluation.reason !== "same") setIllegalMoveNotice(evaluation);
        return false;
      }
      void requestHostNormalMoveCommit(piece, x, y);
      return true;
    }

    // 3/2 is an Engine-owned free action in offline Single Player. It must be
    // be offered before Bonus MOVE and normal movement because it does not
    // consume either Bonus Action or Tracker economy.
    if (!sessionCode && gameMode === "match" && piece.team !== "BALL" && !matchActionState.freeMode?.active) {
      const threeTwo = getThreeTwoEligibility(piece, x, y);
      if (threeTwo.eligible) {
        setPendingThreeTwoMove({ pieceId: piece.id, x, y });
        return true;
      }
    }

    const continuation = actionContinuationRef.current;
    if (continuation?.kind === "bonus-card-action") {
      if (!canControlBonusContinuation(continuation)) return false;
      if (!sessionCode && continuation.status === CONTINUATION_STATUS.READY && continuation.team === pieceTeamKey(piece)) {
        return commitDirectBoardBonusMove(piece, x, y);
      }
      if (!sessionCode && continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE && continuation.actionType === "MOVE" && continuation.pieceId === piece.id && continuation.team === pieceTeamKey(piece)) {
        return commitBonusMoveSegment(piece, x, y);
      }
      return false;
    }

    const phaseTeam = piece.team === "BALL" ? null : pieceTeamKey(piece);
    const pieceActionState = piece.team === "BALL" ? {} : (matchActionState.byPieceId[piece.id] || {});
    const freeModeAuthorized = Boolean(matchActionState.freeMode?.active && matchActionState.freeMode?.pieceId === piece.id);
    const groupMoveAuthorized = piece.team !== "BALL" && hasValidGroupMoveAuthorization(phaseTeam);
    if (gameMode === "match" && piece.team !== "BALL" && !freeModeAuthorized && !isTeamPhaseActive(phaseTeam)) {
      setIllegalMoveNotice({ reason: phaseBlockReason() });
      return false;
    }
    if (gameMode === "match" && piece.team !== "BALL" && !freeModeAuthorized && !groupMoveAuthorized && isTeamPhaseActive(phaseTeam) && getTeamActionStatus(phaseTeam).exhausted) {
      setIllegalMoveNotice({ reason: "actions-complete-end-turn" });
      return false;
    }

    // The 3/2 rule is a free action, but only during this team's active phase and before its action tracker is complete.
    const threeTwo = getThreeTwoEligibility(piece, x, y);
    if (!freeModeAuthorized && threeTwo.eligible) {
      setPendingThreeTwoMove({ pieceId: piece.id, x, y, evaluation: threeTwo });
      return true;
    }

    const authorization = movementAuthorization(piece);
    if (!authorization.allowed) {
      if (gameMode === "match" && piece.team !== "BALL" && !authorization.reason) {
        const team = pieceTeamKey(piece);
        const status = getTeamActionStatus(team);
        const pieceState = matchActionState.byPieceId[piece.id] || {};
        if (isTeamPhaseActive(team) && !status.exhausted && !pieceState.moveUsed) {
          const evaluation = evaluateMove(piece, x, y);
          if (!evaluation.legal) {
            if (evaluation.reason !== "same") setIllegalMoveNotice(evaluation);
            return false;
          }
          setPendingAutoMove({ pieceId: piece.id, x, y, evaluation });
          return true;
        }
      }
      if (gameMode === "match" && piece.team !== "BALL") {
        const team = pieceTeamKey(piece);
        const teamExhausted = trackerGameStarted && getTeamActionStatus(team).exhausted;
        const bothExhausted = trackerGameStarted && getTeamActionStatus("red").exhausted && getTeamActionStatus("blue").exhausted;
        setIllegalMoveNotice({ reason: authorization.reason || (isTeamPhaseActive(team) && teamExhausted ? "actions-complete-end-turn" : bothExhausted ? "advance-turn" : teamExhausted ? "team-exhausted" : "move-not-authorized") });
      }
      return false;
    }
    if (authorization.mode === "free" && piece.team !== "BALL") {
      const occupied = (piecesRef.current || pieces).some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === Number(x) && Number(item.y) === Number(y));
      if (occupied) { setIllegalMoveNotice({ reason: "occupied" }); return false; }
      const geometry = getMovementGeometry(piece, { x, y });
      if (geometry.kind === "same") return false;
      if (sessionCode && isSessionGuest) { void requestHostFreeMove(piece, x, y); return true; }
      if (!sessionCode) {
        const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
        const dispatched = dispatchSinglePlayerGameCommand({
          timeline: gameTimelineRef.current,
          state: before,
          context: singlePlayerMatchContext(),
          command: {
            id: createActionEventId(`free_move_${piece.id}`),
            type: GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED,
            payload: { pieceId: piece.id, x: Number(x), y: Number(y) },
          },
          label: `${piece.team === "A" ? "Blue" : "Red"} Free Move: ${getPieceDisplayLabel(piece)} → ${toCoord(x, y)}`,
        });
        if (!dispatched.result.accepted) {
          if (dispatched.result.reason !== "same") setIllegalMoveNotice({ reason: dispatched.result.reason });
          return false;
        }
        replaceGameTimeline(dispatched.timeline);
        applyTimelineGameState(dispatched.state);
        setSelectedId(piece.id);
        return true;
      }
      return commitPieceMove(piece, x, y, { legal: true, geometry, moveCost: 0, remaining: 0 });
    }
    const evaluation = authorization.mode === "group" ? evaluateGroupMove(piece, x, y) : evaluateMove(piece, x, y);
    if (!evaluation.legal) {
      const notice = threeTwo.reason === "used" ? { ...evaluation, threeTwoAlreadyUsed: true } : evaluation;
      if (evaluation.reason !== "same" && gameMode === "match" && piece.team !== "BALL") setIllegalMoveNotice(notice);
      return false;
    }
    return commitPieceMove(piece, x, y, evaluation);
  }

  function confirmThreeTwoMove(useThreeTwo) {
    const pending = pendingThreeTwoMove;
    setPendingThreeTwoMove(null);
    if (!pending) return;
    const piece = (piecesRef.current || pieces).find(item => item.id === pending.pieceId);
    if (!piece || !canMovePiece(piece)) return;
    if (useThreeTwo) {
      if (!sessionCode) {
        const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
        const dispatched = dispatchSinglePlayerGameCommand({
          timeline: gameTimelineRef.current,
          state: before,
          context: singlePlayerMatchContext(),
          command: {
            id: createActionEventId(`three_two_move_${piece.id}`),
            type: GAME_COMMAND_TYPE.THREE_TWO_MOVE_COMMITTED,
            payload: { pieceId: piece.id, x: Number(pending.x), y: Number(pending.y) },
          },
          label: `${piece.team === "A" ? "Blue" : "Red"} ${piece.label} → ${toCoord(pending.x, pending.y)} (3/2)`,
        });
        if (!dispatched.result.accepted) {
          setIllegalMoveNotice({ reason: dispatched.result.reason });
          return;
        }
        replaceGameTimeline(dispatched.timeline);
        applyTimelineGameState(dispatched.state);
        return;
      }
      const refreshed = getThreeTwoEligibility(piece, pending.x, pending.y);
      if (!refreshed.eligible) return;
      commitPieceMove(piece, pending.x, pending.y, refreshed, { useThreeTwo: true });
      return;
    }
    const authorization = movementAuthorization(piece);
    if (!authorization.allowed) {
      const team = pieceTeamKey(piece);
      const teamExhausted = trackerGameStarted && getTeamActionStatus(team).exhausted;
      const bothExhausted = trackerGameStarted && getTeamActionStatus("red").exhausted && getTeamActionStatus("blue").exhausted;
      setIllegalMoveNotice({ reason: bothExhausted ? "advance-turn" : teamExhausted ? "team-exhausted" : "move-not-authorized" });
      return;
    }
    if (authorization.mode === "free") {
      const occupied = (piecesRef.current || pieces).some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === Number(pending.x) && Number(item.y) === Number(pending.y));
      if (occupied) { setIllegalMoveNotice({ reason: "occupied" }); return; }
      const geometry = getMovementGeometry(piece, { x: pending.x, y: pending.y });
      if (geometry.kind === "same") return;
      commitPieceMove(piece, pending.x, pending.y, { legal: true, geometry, moveCost: 0, remaining: 0 });
      return;
    }
    const normal = evaluateMove(piece, pending.x, pending.y);
    if (!normal.legal) {
      if (normal.reason !== "same") setIllegalMoveNotice(normal);
      return;
    }
    commitPieceMove(piece, pending.x, pending.y, normal);
  }

  function onInspectorDragDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const rect = e.currentTarget.closest(".card-inspector").getBoundingClientRect();
    setInspectorDragging({ pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onInspectorResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    setInspectorResizing({ pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startW: inspectorSize.w, startH: inspectorSize.h });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onInspectorPointerMove(e) {
    if (inspectorDragging) {
      setInspectorPosition({
        x: clamp(e.clientX - inspectorDragging.dx, 0, Math.max(0, window.innerWidth - inspectorSize.w)),
        y: clamp(e.clientY - inspectorDragging.dy, 0, Math.max(0, window.innerHeight - 80)),
      });
    }
    if (inspectorResizing) {
      setInspectorSize({
        w: clamp(inspectorResizing.startW + e.clientX - inspectorResizing.startX, 250, Math.max(260, window.innerWidth - 20)),
        h: clamp(inspectorResizing.startH + e.clientY - inspectorResizing.startY, 220, Math.max(260, window.innerHeight - 20)),
      });
    }
  }

  function stopInspectorPointerWork() {
    setInspectorDragging(null);
    setInspectorResizing(null);
  }

  function onPiecePointerDown(pieceId, e) {
    e.preventDefault();
    e.stopPropagation();
    if (editingPiece) return;
    if (measureMode) {
      if (e.pointerType === "touch") return;
      if (sharedRulerReadOnly) return;
      pitchRef.current?.setPointerCapture?.(e.pointerId);
      measureInteractionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originPanX: panOffset.x,
        originPanY: panOffset.y,
        point: getRulerPointFromPointer(e),
        panning: false,
      };
      return;
    }
    const piece = (piecesRef.current || pieces).find(item => item.id === pieceId);
    if (!piece) return;
    if (gameMode === "match" && piece.team === "BALL" && !freeBallActive) {
      if (!sessionCode) {
        const selectedPiece = (piecesRef.current || pieces).find(item => item.id === (interactionState.activePieceId || selectedId));
        if (selectedPiece && selectedPiece.team !== "BALL") moveSelectedPieceTo(piece.x, piece.y);
      }
      return;
    }

    if (actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "targeting" && canControlActiveResolution(actionResolutionRef.current)) {
      choosePassTarget(piece.x, piece.y);
      return;
    }
    // Pass state blocks gameplay actions, not inspection. The non-controlling
    // client may always select any puck while the active player resolves Pass.
    if (actionResolutionRef.current?.kind === "pass") {
      setSelectedId(pieceId);
      setHoveredCell(null);
      return;
    }
    if (freeBallActive) {
      if (piece.team === "BALL") { setSelectedId(piece.id); setHoveredCell(null); return; }
      moveBallFreelyTo(piece.x, piece.y);
      return;
    }

    const continuation = actionContinuationRef.current;
    if (continuation?.kind === "bonus-card-action") {
      // Bonus Action ownership blocks actions, never inspection/selection.
      if (!canControlBonusContinuation(continuation)) {
        setSelectedId(pieceId);
        setHoveredCell(null);
        return;
      }
      if (continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE && continuation.actionType === "MOVE" && piece.id !== continuation.pieceId) {
        setSelectedId(pieceId);
        setHoveredCell(null);
        return;
      }
    }

    if (e.pointerType === "touch") {
      const now = Date.now();
      const last = lastPieceTapRef.current;
      if (last.pieceId === pieceId && now - last.time < 330) {
        lastPieceTapRef.current = { time: 0, pieceId: "" };
        openEdit(piece);
        return;
      }
      lastPieceTapRef.current = { time: now, pieceId };
    }

    const selectedPiece = (piecesRef.current || pieces).find(item => item.id === selectedId);
    const freeMode = matchActionState.freeMode || {};
    if (freeMode.active && piece.team === "BALL") {
      setSelectedId(piece.id);
      setHoveredCell(null);
      return;
    }
    if (freeMode.active && piece.team !== "BALL" && piece.id !== freeMode.pieceId) {
      setIllegalMoveNotice({ reason: "exit-free-mode" });
      return;
    }
    if (freeMode.active && piece.id === freeMode.pieceId && selectedPiece?.team === "BALL") {
      setSelectedId(piece.id);
      setHoveredCell(null);
      return;
    }
    if (selectedPiece?.id === piece.id) {
      if (freeMode.active && piece.id === freeMode.pieceId) return;
      setSelectedId(null);
      setHoveredCell(null);
      return;
    }
    const clickedCompatibleOccupant = selectedPiece && selectedPiece.id !== piece.id && (
      (selectedPiece.team === "BALL" && piece.team !== "BALL") ||
      (selectedPiece.team !== "BALL" && piece.team === "BALL")
    );
    if (clickedCompatibleOccupant && canMovePiece(selectedPiece)) {
      moveSelectedPieceTo(piece.x, piece.y);
      return;
    }

    setSelectedId(pieceId);
  }

  function openEdit(piece) {
    if (piece.team === "BALL" || !canAssignPiece(piece)) return;
    setEditingPiece(piece);
    setEditLabel(piece.label);
  }

  function saveEdit() {
    if (!editingPiece) return;
    const clean = editLabel.trim().slice(0, 5) || "?";
    const beforeTimeline = captureTimelineGameState();
    const nextPieces = ensureBenchReserveCount((piecesRef.current || pieces).map(p => p.id === editingPiece.id ? { ...p, label: clean } : p), settingsRef.current);
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    recordTimelineTransition({
      type: "PIECE_LABEL_CHANGED",
      label: `${pieceTeamKey(editingPiece) === "blue" ? "Blue" : "Red"} piece label: ${clean}`,
      team: pieceTeamKey(editingPiece),
      before: beforeTimeline,
      after: captureTimelineGameState({ pieces: nextPieces }),
    });
    setEditingPiece(null);
    setEditLabel("");
  }

  function deleteEditingPiece() {
    if (!editingPiece || gameMode !== "editor") return;
    const currentPiece = (piecesRef.current || pieces).find(piece => piece.id === editingPiece.id);
    if (!currentPiece || currentPiece.team === "BALL" || isBenchReservePiece(currentPiece) || !canAssignPiece(currentPiece)) return;

    const attachedCard = findCardForPiece(currentPiece);
    const confirmation = attachedCard
      ? `Ștergi acest puc? Cardul „${attachedCard.name || attachedCard.id}” va fi detașat și păstrat în Cards. Ștergerea nu poate fi anulată în Editor Mode.`
      : "Ștergi acest puc? Ștergerea nu poate fi anulată în Editor Mode.";
    if (!window.confirm(confirmation)) return;

    const nextPieces = (piecesRef.current || pieces).filter(piece => piece.id !== currentPiece.id);
    const nextMovement = { ...movementStateRef.current };
    delete nextMovement[currentPiece.id];

    piecesRef.current = nextPieces;
    movementStateRef.current = nextMovement;
    setPieces(nextPieces);
    setMovementStateByPieceId(nextMovement);
    if (selectedId === currentPiece.id) setSelectedId(null);
    setHoveredCell(null);
    setEditingPiece(null);
    setEditLabel("");

    if (user && sessionCode && sessionHydratedRef.current) {
      void saveSessionBoardAndAssignments(nextPieces);
    }
  }

  function togglePieceInactive(pieceId) {
    const currentPiece = (piecesRef.current || pieces).find(piece => piece.id === pieceId);
    if (!currentPiece || !currentPiece.cardId || !canControlPieceStatus(currentPiece)) return;
    pushHistory();
    const nextInactive = !currentPiece.inactive;
    const nextPieces = ensureBenchReserveCount((piecesRef.current || pieces).map(piece =>
      piece.id === pieceId ? { ...piece, inactive: nextInactive } : piece
    ), settingsRef.current);
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    if (!nextInactive && selectedId === pieceId) {
      setInspectorCardZoom(1);
      setInspectorCardPan({ x: 0, y: 0 });
    }
    logSnapshot(`${currentPiece.team === "A" ? "Blue" : "Red"} ${getPieceDisplayLabel(currentPiece)} → ${nextInactive ? "INACTIVE" : "ACTIVE"}`, nextPieces);
  }

  const sessionLibraryCards = useMemo(() => Object.values(normalizeSessionCardsById(sessionLibraryById)), [sessionLibraryById]);
  const activeAssignCards = sessionCode ? sessionLibraryCards : (cardState.cards || []);
  const assignPositionOptions = useMemo(() => Array.from(new Set((activeAssignCards || []).map(card => card.position).filter(Boolean))).sort((a, b) => {
    const rankA = CARD_POSITION_OPTIONS.indexOf(a);
    const rankB = CARD_POSITION_OPTIONS.indexOf(b);
    const safeRankA = rankA >= 0 ? rankA : 999;
    const safeRankB = rankB >= 0 ? rankB : 999;
    if (safeRankA !== safeRankB) return safeRankA - safeRankB;
    return String(a).localeCompare(String(b));
  }), [activeAssignCards]);
  const visibleAssignCards = useMemo(() => {
    const cards = assignPositionFilter === "ALL" ? [...(activeAssignCards || [])] : (activeAssignCards || []).filter(card => card.position === assignPositionFilter);
    if (!assignSortByPosition) return cards;
    const positionRank = new Map(CARD_POSITION_OPTIONS.map((position, index) => [position, index]));
    return cards.map((card, index) => ({ card, index })).sort((a, b) => {
      const rankA = positionRank.has(a.card.position) ? positionRank.get(a.card.position) : 999;
      const rankB = positionRank.has(b.card.position) ? positionRank.get(b.card.position) : 999;
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    }).map(entry => entry.card);
  }, [activeAssignCards, assignPositionFilter, assignSortByPosition]);

  const cardById = useMemo(() => {
    const localCards = Object.fromEntries((cardState.cards || []).map(card => [card.id, card]));
    const libraryCards = Object.fromEntries(sessionLibraryCards.map(card => [card.id, card]));
    if (sessionCode) return { ...localCards, ...libraryCards, ...sessionCardsById };
    return { ...sessionCardsById, ...localCards };
  }, [cardState.cards, sessionCardsById, sessionLibraryCards, sessionCode]);
  const libraryPositionOptions = useMemo(() => Array.from(new Set((cardState.cards || []).map(card => card.position).filter(Boolean))).sort((a, b) => {
    const rankA = CARD_POSITION_OPTIONS.indexOf(a);
    const rankB = CARD_POSITION_OPTIONS.indexOf(b);
    const safeRankA = rankA >= 0 ? rankA : 999;
    const safeRankB = rankB >= 0 ? rankB : 999;
    if (safeRankA !== safeRankB) return safeRankA - safeRankB;
    return String(a).localeCompare(String(b));
  }), [cardState.cards]);

  useEffect(() => {
    if (libraryPositionFilter !== "ALL" && !libraryPositionOptions.includes(libraryPositionFilter)) {
      setLibraryPositionFilter("ALL");
    }
  }, [libraryPositionFilter, libraryPositionOptions]);

  useEffect(() => {
    if (assignPositionFilter !== "ALL" && !assignPositionOptions.includes(assignPositionFilter)) {
      setAssignPositionFilter("ALL");
    }
  }, [assignPositionFilter, assignPositionOptions]);

  useEffect(() => {
    if (!assignTarget) {
      setAssignPreviewCardId(null);
      setAssignPreviewSide("front");
      return;
    }
    const cards = visibleAssignCards || [];
    setAssignPreviewCardId(prev => cards.some(card => card.id === prev) ? prev : (cards[0]?.id || null));
    setAssignPreviewSide("front");
  }, [assignTarget, visibleAssignCards]);

  const visibleLibraryCards = useMemo(() => {
    const cards = cardState.cards || [];
    if (libraryPositionFilter === "ALL") return cards;
    return cards.filter(card => card.position === libraryPositionFilter);
  }, [cardState.cards, libraryPositionFilter]);

  const inspectedPiece = pieces.find(p => p.id === inspectedPieceId);
  const inspectedCardId = inspectedPiece ? inspectedPiece.cardId : null;
  const inspectedCard = inspectedCardId ? cardById[inspectedCardId] : null;

  useEffect(() => {
    setInspectorCardZoom(1);
    setInspectorCardPan({ x: 0, y: 0 });
    const desiredSide = preferredInspectorCardSide === "back" && inspectedCard && canViewCardBack(inspectedPiece, inspectedCard.id)
      ? "back"
      : "front";
    setInspectorCardSide(desiredSide);
    inspectorCardPointersRef.current.clear();
    inspectorCardGestureRef.current = null;
  }, [inspectedCardId, preferredInspectorCardSide, inspectedCard, inspectedPiece]);

  useEffect(() => {
    inspectorCardZoomRef.current = inspectorCardZoom;
  }, [inspectorCardZoom]);

  useEffect(() => {
    inspectorCardPanRef.current = inspectorCardPan;
  }, [inspectorCardPan]);

  useEffect(() => {
    const viewport = inspectorCardViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const updateFit = () => {
      const rect = viewport.getBoundingClientRect();
      const canonicalHeight = INSPECTOR_CARD_CANONICAL_WIDTH * 1.5;
      const availableWidth = Math.max(1, rect.width - 8);
      const availableHeight = Math.max(1, rect.height - 8);
      const nextFit = Math.min(1, availableWidth / INSPECTOR_CARD_CANONICAL_WIDTH, availableHeight / canonicalHeight);
      setInspectorCardFitScale(Number.isFinite(nextFit) && nextFit > 0 ? nextFit : 1);
    };
    updateFit();
    const observer = new ResizeObserver(updateFit);
    observer.observe(viewport);
    window.addEventListener("resize", updateFit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFit);
    };
  }, [inspectorVisible, inspectorMinimized, inspectorSize.w, inspectorSize.h, inspectedCardId, inspectedPiece?.inactive]);

  function clampInspectorCardZoom(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(2.5, Math.max(1, numeric));
  }

  function setInspectorCardZoomClamped(valueOrUpdater) {
    setInspectorCardZoom(prev => {
      const raw = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      const next = clampInspectorCardZoom(raw);
      if (next <= 1) {
        setInspectorCardPan({ x: 0, y: 0 });
        inspectorCardGestureRef.current = null;
      }
      return next;
    });
  }

  function bumpInspectorCardZoom(delta) {
    setInspectorCardZoomClamped(prev => prev + delta);
  }

  function resetInspectorCardView() {
    setInspectorCardZoom(1);
    setInspectorCardPan({ x: 0, y: 0 });
    inspectorCardPointersRef.current.clear();
    inspectorCardGestureRef.current = null;
  }

  function getInspectorPointerPair() {
    const pointers = Array.from(inspectorCardPointersRef.current.values());
    if (pointers.length < 2) return null;
    const [a, b] = pointers;
    return {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      centerX: (a.clientX + b.clientX) / 2,
      centerY: (a.clientY + b.clientY) / 2,
    };
  }

  function startInspectorPinchGesture() {
    const pair = getInspectorPointerPair();
    if (!pair || pair.distance <= 0) return;
    inspectorCardGestureRef.current = {
      mode: "pinch",
      distance: pair.distance,
      centerX: pair.centerX,
      centerY: pair.centerY,
      zoom: inspectorCardZoomRef.current,
      pan: inspectorCardPanRef.current,
    };
  }

  function startInspectorPanGesture(pointer) {
    if (!pointer || inspectorCardZoomRef.current <= 1) {
      inspectorCardGestureRef.current = null;
      return;
    }
    inspectorCardGestureRef.current = {
      mode: "pan",
      pointerId: pointer.pointerId,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pan: inspectorCardPanRef.current,
    };
  }

  function isInspectorCardGestureBlocked(target) {
    return !!(target && target.closest && target.closest("button, input, select, textarea, .card-preview-flip-btn"));
  }

  function onInspectorCardWheel(e) {
    if (!inspectedCard || isInspectorCardGestureBlocked(e.target)) return;
    const direction = e.deltaY < 0 ? 1 : -1;
    if (direction < 0 && inspectorCardZoom <= 1) return;
    e.preventDefault();
    bumpInspectorCardZoom(direction * 0.12);
  }

  function onInspectorCardPointerDown(e) {
    if (!inspectedCard || isInspectorCardGestureBlocked(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const pointer = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      clientX: e.clientX,
      clientY: e.clientY,
    };
    inspectorCardPointersRef.current.set(e.pointerId, pointer);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (inspectorCardPointersRef.current.size >= 2) {
      startInspectorPinchGesture();
      return;
    }
    startInspectorPanGesture(pointer);
  }

  function onInspectorCardPointerMove(e) {
    if (!inspectorCardPointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();

    inspectorCardPointersRef.current.set(e.pointerId, {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (inspectorCardPointersRef.current.size >= 2) {
      let gesture = inspectorCardGestureRef.current;
      if (!gesture || gesture.mode !== "pinch") {
        startInspectorPinchGesture();
        gesture = inspectorCardGestureRef.current;
      }
      const pair = getInspectorPointerPair();
      if (!gesture || !pair || gesture.distance <= 0) return;
      const ratio = pair.distance / gesture.distance;
      const nextZoom = clampInspectorCardZoom(gesture.zoom * ratio);
      const nextPan = {
        x: gesture.pan.x + (pair.centerX - gesture.centerX),
        y: gesture.pan.y + (pair.centerY - gesture.centerY),
      };
      if (nextZoom <= 1) {
        setInspectorCardPan({ x: 0, y: 0 });
      } else {
        setInspectorCardPan(nextPan);
      }
      setInspectorCardZoomClamped(nextZoom);
      return;
    }

    const gesture = inspectorCardGestureRef.current;
    if (!gesture || gesture.mode !== "pan" || gesture.pointerId !== e.pointerId || inspectorCardZoomRef.current <= 1) return;
    setInspectorCardPan({
      x: gesture.pan.x + (e.clientX - gesture.clientX),
      y: gesture.pan.y + (e.clientY - gesture.clientY),
    });
  }

  function onInspectorCardPointerEnd(e) {
    if (!inspectorCardPointersRef.current.has(e.pointerId)) return;
    inspectorCardPointersRef.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (inspectorCardPointersRef.current.size >= 2) {
      startInspectorPinchGesture();
      return;
    }
    if (inspectorCardPointersRef.current.size === 1) {
      const remainingPointer = Array.from(inspectorCardPointersRef.current.values())[0];
      startInspectorPanGesture(remainingPointer);
      return;
    }
    inspectorCardGestureRef.current = null;
  }

  const defensiveAreaOverlays = useMemo(() => {
    if (defAreaMode === 0) return [];
    const sourcePieces = defAreaMode === 1
      ? (inspectedPiece && inspectedPiece.team !== "BALL" && !inspectedPiece.inactive ? [inspectedPiece] : [])
      : pieces.filter(piece => piece.team !== "BALL" && !piece.inactive);
    return sourcePieces.flatMap(piece => {
      const card = cardById[piece.cardId];
      if (!card || !Array.isArray(card.defensiveArea)) return [];
      return card.defensiveArea.map((cell, index) => {
        const dx = Number(cell.dx);
        const dy = Number(cell.dy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
        // Card Defensive Area uses a player-centric view where "up" means attacking direction.
        // On the board, teams attack horizontally: Blue to the right, Red to the left.
        let boardDx = dx;
        let boardDy = dy;
        if (piece.team === "A") {
          boardDx = -dy;
          boardDy = dx;
        } else if (piece.team === "B") {
          boardDx = dy;
          boardDy = -dx;
        }
        const x = piece.x + boardDx;
        const y = piece.y + boardDy;
        if (x < 0 || y < 0 || x >= settings.cols || y >= settings.rows) return null;
        return {
          id: `${piece.id}-${index}-${dx}-${dy}`,
          x,
          y,
          team: piece.team,
        };
      }).filter(Boolean);
    });
  }, [defAreaMode, inspectedPiece, pieces, cardById, settings.cols, settings.rows]);

  const passPreview = useMemo(() => {
    const pending = actionResolution;
    if (pending?.kind !== "pass" || !pending.passerId || !pending.target) return null;
    const passer = pieces.find(piece => piece.id === pending.passerId);
    if (!passer) return null;
    const frozenMatchContext = !sessionCode && gameMode === "match" ? singlePlayerMatchContext() : null;
    const previewRuleSet = frozenMatchContext?.ruleSet || activeRuleSet;
    const previewSettings = frozenMatchContext?.boardSettings || settings;
    const previewCardsById = frozenMatchContext?.gameplayCardsById || cardById;
    const rules = previewRuleSet.actions?.pass || {};
    const cornerIds = rules.pathMode === "center-to-center" ? [null] : PASS_CORNERS.map(corner => corner.id);
    const plans = cornerIds.map(cornerId => buildPassPlan({
      passer,
      passerCard: previewCardsById[passer.cardId],
      pieces,
      cardById: previewCardsById,
      settings: previewSettings,
      target: pending.target,
      cornerId,
      rules: previewRuleSet,
    }));
    const singlePlayerMatch = !sessionCode && gameMode === "match";
    const selectablePlans = plans.filter(plan => !plan.originBlocked && (!singlePlayerMatch || !plan.goalkeeperRouteBlocked));
    // Single Player keeps a goalkeeper-blocked route visible in grey so the
    // player can see why it cannot be chosen. Legacy manual multiplayer keeps
    // its established preview and interaction path unchanged.
    const previewPlans = singlePlayerMatch ? plans.filter(plan => !plan.originBlocked) : selectablePlans;
    const routeStatus = plan => {
      if (singlePlayerMatch && plan.goalkeeperRouteBlocked) return "blocked";
      if (plan.interceptors?.length || (singlePlayerMatch && plan.directHit?.team && plan.directHit.team !== pending.team)) return "risk";
      return "clear";
    };
    const chosen = selectablePlans.find(plan => plan.origin.cornerId === pending.cornerId) || selectablePlans[0] || previewPlans[0] || plans[0];
    const visibleCells = chosen?.interceptors.flatMap(item => item.visibleCells.map(cell => ({ ...cell, id: `${item.defender.id}-${cell.id}` }))) || [];
    const visibleIds = new Set(visibleCells.map(cell => `${cell.x}-${cell.y}`));
    const blockedCells = chosen?.interceptors.flatMap(item => item.cells.filter(cell => !visibleIds.has(`${cell.x}-${cell.y}`)).map(cell => ({ ...cell, id: `${item.defender.id}-${cell.id}` }))) || [];
    return {
      plans,
      selectedPlan: chosen,
      target: pending.target,
      visibleCells,
      blockedCells,
      lines: previewPlans.map(plan => ({
        id: plan.origin.cornerId || "center",
        origin: plan.origin,
        endpoint: plan.endpoint,
        status: routeStatus(plan),
        selected: plan.origin.cornerId === pending.cornerId || (plans.length === 1 && !pending.cornerId),
      })),
      routes: pending.status === "route-selection" ? previewPlans.map(plan => ({
        id: plan.origin.cornerId || "center",
        cornerId: plan.origin.cornerId,
        origin: plan.origin,
        foot: plan.foot?.foot === "Left" ? "LF" : plan.foot?.foot === "Right" ? "RF" : "BF",
        modifier: plan.foot?.dominant ? "0" : "-1",
        isLong: plan.isLong,
        status: routeStatus(plan),
        disabled: singlePlayerMatch && plan.goalkeeperRouteBlocked,
      })) : [],
    };
  }, [actionResolution, pieces, cardById, settings, activeRuleSet, gameMode, sessionCode]);

  const pendingDelayedResolution = useMemo(
    () => isReplayView ? null : delayedResolutionAtCursor(gameTimeline, actionResolution),
    [gameTimeline, actionResolution, isReplayView],
  );

  const passActive = actionResolution?.kind === "pass" && ["targeting", "route-selection", "awaiting-interceptor-choice", "awaiting-interception-roll"].includes(actionResolution.status);
  const passInterceptionRollRequired = actionResolution?.kind === "pass" && actionResolution.status === "awaiting-interception-roll";
  const passTargetDistance = useMemo(() => {
    const pending = actionResolution;
    if (pending?.kind !== "pass" || pending.status !== "targeting" || !hoveredCell) return null;
    if (hoveredCell.x < 0 || hoveredCell.y < 0 || hoveredCell.x >= settings.cols || hoveredCell.y >= settings.rows) return null;
    const passer = pieces.find(piece => piece.id === pending.passerId);
    if (!passer) return null;
    const distance = Math.hypot((hoveredCell.x + .5) - (passer.x + .5), (hoveredCell.y + .5) - (passer.y + .5));
    return {
      x: hoveredCell.x,
      y: hoveredCell.y,
      label: `${distance.toFixed(2)} sq`,
    };
  }, [actionResolution, hoveredCell, pieces, settings.cols, settings.rows]);

  const defAreaButtonLabel = defAreaMode === 0 ? "D.A OFF" : defAreaMode === 1 ? "D.A.1" : "D.A.2";
  useEffect(() => {
    if (!cardState.cards.length) {
      if (exportCardId) setExportCardId("");
      return;
    }
    if (!exportCardId || !cardById[exportCardId]) setExportCardId(cardState.cards[0].id);
  }, [cardState.cards, cardById, exportCardId]);
  const getPieceDisplayLabel = (piece) => {
    if (!piece) return "";
    const assignedCard = cardById[piece.cardId];
    return (assignedCard?.position || piece.label || "SUB").trim();
  };
  const getPieceIdentity = (piece) => {
    if (!piece) return "Unknown player";
    const assignedCard = cardById[piece.cardId];
    const position = getPieceDisplayLabel(piece);
    const name = String(assignedCard?.name || "").trim();
    return name ? `${position} ${name}` : position;
  };
  const rosterSlots = useMemo(() => {
    const orderIndex = (label) => {
      const clean = String(label || "").trim().toUpperCase();
      const index = TEAM_LAYOUT_POSITIONS.indexOf(clean);
      return index === -1 ? 999 : index;
    };
    const build = (teamCode) => {
      const teamPieces = pieces
        .filter(piece => piece.team === teamCode)
        .map((piece, index) => ({
          id: piece.id,
          pieceId: piece.id,
          position: (cardById[piece.cardId]?.position || piece.label || `SUB ${index + 1}`),
          cardId: piece.cardId || null,
          isSub: String(piece.id).includes("-R-"),
          y: piece.y,
          x: piece.x,
        }));

      const sorter = (a, b) =>
        (orderIndex(a.position) - orderIndex(b.position)) ||
        (String(a.position).localeCompare(String(b.position))) ||
        (a.y - b.y) ||
        (a.x - b.x) ||
        String(a.id).localeCompare(String(b.id));

      return {
        starting: teamPieces.filter(slot => !slot.isSub).sort(sorter),
        substitutes: teamPieces.filter(slot => slot.isSub).sort(sorter),
      };
    };
    return { blue: build("A"), red: build("B") };
  }, [pieces, cardById]);

  function updateCardState(updater) {
    setCardState(prev => normalizeCardState(typeof updater === "function" ? updater(prev) : updater));
  }

  function saveCard(card) {
    const nextCard = { ...card, updatedAt: new Date().toISOString() };
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.some(c => c.id === nextCard.id) ? prev.cards.map(c => c.id === nextCard.id ? nextCard : c) : [...prev.cards, nextCard],
    }));
  }

  function createCardFromPosition(position = "ST") {
    const card = createPlayerCard(position);
    saveCard(card);
    setEditingCardId(card.id);
    setCardsPanelOpen(true);
    setCardsView("library");
  }

  function cloneCard(cardId) {
    const source = cardById[cardId];
    if (!source) return;
    const sourceGraphics = source.graphics || {};
    const cloneGraphics = { ...sourceGraphics };
    ["frontExportDataUrl", "backExportDataUrl", "frontLocalDataUrl", "backLocalDataUrl"].forEach(key => {
      if (isInlineImageDataUrl(cloneGraphics[key])) cloneGraphics[key] = "";
    });
    const sourceArtwork = source.artwork || {};
    const cloneArtwork = isInlineImageDataUrl(sourceArtwork.customDataUrl)
      ? { ...sourceArtwork, customDataUrl: "" }
      : sourceArtwork;
    const clone = {
      ...source,
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: `${source.name} Copy`,
      graphics: cloneGraphics,
      artwork: cloneArtwork,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateCardState(prev => ({ ...prev, cards: [...prev.cards, clone] }));
  }

  function deleteCard(cardId) {
    if (!window.confirm("Ștergi cardul? Va fi scos și din echipe/pucuri.")) return;
    const beforeTimeline = captureTimelineGameState();
    const nextCardState = {
      ...cardStateRef.current,
      cards: (cardStateRef.current.cards || []).filter(c => c.id !== cardId),
      teams: createDefaultCardState().teams,
      assignments: {},
    };
    cardStateRef.current = normalizeCardState(nextCardState);
    updateCardState(() => cardStateRef.current);

    const nextPieces = sanitizePiecesCardIds(
      piecesRef.current.map(piece => piece.cardId === cardId ? { ...piece, cardId: null } : piece),
      cardStateRef.current,
      settingsRef.current
    );
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    recordTimelineTransition({
      type: "CARD_DELETED",
      label: "Card deleted and detached",
      before: beforeTimeline,
      after: captureTimelineGameState({ pieces: nextPieces }),
    });
    if (editingCardId === cardId) setEditingCardId(null);
  }

  async function saveSessionCardAssignments(nextPieces) {
    if (!user || !sessionCode || sessionEndingRef.current || !sessionHydratedRef.current) return;
    try {
      await updateDoc(sessionRef(sessionCode.toUpperCase()), {
        cardAssignments: buildSessionCardAssignments(nextPieces),
        cardAssignmentsUpdatedBy: clientIdRef.current,
        cardAssignmentsUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: nextSessionExpiryDate(),
      });
    } catch (error) {
      console.error("Card assignment sync failed", error);
      setSessionStatus("Online error");
    }
  }

  async function saveSessionBoardAndAssignments(nextPieces) {
    if (!user || !sessionCode || sessionEndingRef.current || !sessionHydratedRef.current) return;
    try {
      await updateDoc(sessionRef(sessionCode.toUpperCase()), {
        board: encodeForFirestore(buildLiveBoardState({ pieces: nextPieces })),
        cardAssignments: buildSessionCardAssignments(nextPieces),
        cardAssignmentsUpdatedBy: clientIdRef.current,
        cardAssignmentsUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: nextSessionExpiryDate(),
        updatedBy: clientIdRef.current,
      });
      sessionLastSaveAtRef.current = Date.now();
      setSessionStatus("Online saved");
    } catch (error) {
      console.error("Puck deletion sync failed", error);
      setSessionStatus("Online error");
      scheduleSessionLiveSave();
    }
  }

  function assignCard(cardId) {
    if (!assignTarget) return;
    const targetPieceId = assignTarget.pieceId || null;
    if (!targetPieceId) {
      setAssignTarget(null);
      return;
    }

    const currentPieces = piecesRef.current || pieces;
    const targetPiece = currentPieces.find(piece => piece.id === targetPieceId);
    if (!canAssignPiece(targetPiece)) {
      setAssignTarget(null);
      return;
    }
    const existingPiece = currentPieces.find(piece => piece.cardId === cardId && piece.id !== targetPieceId);
    if (existingPiece) {
      const shouldReassign = window.confirm("This card is already assigned to another puck. Do you want to reassign it?");
      if (!shouldReassign) return;
    }

    const beforeTimeline = captureTimelineGameState();
    const assignmentCardState = sessionCode && Object.keys(sessionLibraryByIdRef.current || {}).length
      ? buildCardStateFromSessionLibrary(sessionLibraryByIdRef.current)
      : cardStateRef.current;
    const nextPieces = sanitizePiecesCardIds(
      currentPieces.map(piece => {
        if (piece.team === "BALL") return { ...piece, cardId: null };
        if (piece.id === targetPieceId) return { ...piece, cardId };
        if (piece.cardId === cardId) return { ...piece, cardId: null };
        return { ...piece, cardId: piece.cardId || null };
      }),
      assignmentCardState,
      settingsRef.current
    );
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    recordTimelineTransition({
      type: "CARD_ASSIGNED",
      label: `Card assigned: ${cardId}`,
      team: pieceTeamKey(targetPiece),
      before: beforeTimeline,
      after: captureTimelineGameState({ pieces: nextPieces }),
    });
    if (gameMode !== "match" && user && sessionCode && sessionHydratedRef.current) {
      void saveSessionCardAssignments(nextPieces);
    }
    setAssignTarget(null);
  }

  function removePieceCard(pieceId) {
    const targetPiece = (piecesRef.current || pieces).find(piece => piece.id === pieceId);
    if (!canAssignPiece(targetPiece)) return;
    const beforeTimeline = captureTimelineGameState();
    const assignmentCardState = sessionCode && Object.keys(sessionLibraryByIdRef.current || {}).length
      ? buildCardStateFromSessionLibrary(sessionLibraryByIdRef.current)
      : cardStateRef.current;
    const nextPieces = sanitizePiecesCardIds(
      (piecesRef.current || pieces).map(piece => piece.id === pieceId ? { ...piece, cardId: null } : { ...piece, cardId: piece.cardId || null }),
      assignmentCardState,
      settingsRef.current,
      {},
      sessionCardsByIdRef.current
    );
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    recordTimelineTransition({
      type: "CARD_DETACHED",
      label: `Card detached: ${getPieceDisplayLabel(targetPiece)}`,
      team: pieceTeamKey(targetPiece),
      before: beforeTimeline,
      after: captureTimelineGameState({ pieces: nextPieces }),
    });
    if (gameMode !== "match" && user && sessionCode && sessionHydratedRef.current) {
      void saveSessionCardAssignments(nextPieces);
    }
  }


  function exportSelectedCard() {
    const selectedCard = cardById[exportCardId] || cardState.cards[0];
    if (!selectedCard) {
      alert("No card selected for export.");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      version: "player-card-single-v1",
      cardState: {
        ...createDefaultCardState(),
        theme: cardState.theme,
        cards: [selectedCard],
      },
    };
    const safeName = String(selectedCard.name || "player-card").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "player-card";
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-${selectedCard.position || "card"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }


  function getSelectedExportCard() {
    return cardById[exportCardId] || cardState.cards[0] || null;
  }

  function safeCardExportName(card) {
    return String(card?.name || "player-card").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "player-card";
  }

  function safeExportPart(value, fallback = "Card") {
    return String(value || fallback).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || fallback;
  }

  function makePngSafeCard(card, exportSide = "front") {
    const graphics = card?.graphics || {};
    // PNG export must prioritize the same Storage URL that CardPreview displays.
    // Legacy local/export copies are only fallbacks.
    const safeFront = graphics.frontDataUrl || graphics.frontExportDataUrl || graphics.frontLocalDataUrl || "";
    const safeBack = graphics.backDataUrl || graphics.backExportDataUrl || graphics.backLocalDataUrl || "";
    const exportFront = isCorsSafeExportImageSrc(safeFront) ? safeFront : "";
    const exportBack = isCorsSafeExportImageSrc(safeBack) ? safeBack : "";

    const artwork = { ...(card?.artwork || {}) };
    if (artwork.customDataUrl && !isInlineImageDataUrl(artwork.customDataUrl)) artwork.customDataUrl = "";

    // Keep the visual card object identical to the editor/inspector path.
    // PNG export may only sanitize image sources that html2canvas cannot read;
    // it must not swap themes or rebuild the card for the back side.
    return {
      ...card,
      graphics: {
        ...graphics,
        frontDataUrl: exportFront,
        backDataUrl: exportBack,
      },
      artwork,
    };
  }

  async function waitForExportImages(node) {
    const images = Array.from(node?.querySelectorAll?.("img") || []);
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
  }

  function stripUnsafeExportImages(node) {
    const images = Array.from(node?.querySelectorAll?.("img") || []);
    for (const img of images) {
      const src = img.getAttribute("src") || img.currentSrc || img.src || "";
      if (!src || isCorsSafeExportImageSrc(src)) continue;
      img.remove();
    }
  }

  function sanitizeHtml2CanvasUnsupportedColors(node) {
    const elements = [node, ...Array.from(node?.querySelectorAll?.("*") || [])].filter(Boolean);
    const colorProps = [
      "color",
      "backgroundColor",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
      "outlineColor",
      "textDecorationColor",
      "columnRuleColor",
      "caretColor",
    ];

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      for (const prop of colorProps) {
        const value = String(style[prop] || "");
        if (value.includes("color(")) {
          if (prop === "backgroundColor") el.style[prop] = "transparent";
          else if (prop === "caretColor") el.style[prop] = "auto";
          else el.style[prop] = prop.toLowerCase().includes("border") || prop === "outlineColor" ? "transparent" : "#ffffff";
        }
      }

      const boxShadow = String(style.boxShadow || "");
      if (boxShadow.includes("color(")) el.style.boxShadow = "none";

      const textShadow = String(style.textShadow || "");
      if (textShadow.includes("color(")) el.style.textShadow = "none";

      const backgroundImage = String(style.backgroundImage || "");
      if (backgroundImage.includes("color(")) el.style.backgroundImage = "none";
    }
  }

  async function exportSelectedCardPng(side) {
    const selectedCard = getSelectedExportCard();
    if (!selectedCard) {
      alert("No card selected for export.");
      return;
    }

    const exportSide = side === "front" ? "front" : "back";
    const host = document.createElement("div");
    host.className = "card-png-export-host";
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      const pngSafeCard = makePngSafeCard(selectedCard, exportSide);
      root.render(
        <div className="card-render-shell card-png-export-shell">
          <CardPreview card={pngSafeCard} team="neutral" side={exportSide} flippable={false} showLayoutZones={false} renderContext={cardPreviewRenderContext} />
        </div>
      );
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const node = host.querySelector(".card-preview");
      if (!node) throw new Error("Card preview was not rendered for export.");

      node.querySelectorAll?.(".card-flip-btn, .card-preview-flip-btn, button, input, select, textarea").forEach(el => el.remove());
      stripUnsafeExportImages(node);
      sanitizeHtml2CanvasUnsupportedColors(node);
      await waitForExportImages(node);
      await (document.fonts?.ready || Promise.resolve());

      const canvas = await html2canvas(node, {
        backgroundColor: null,
        scale: CARD_EXPORT_PIXEL_RATIO,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: CARD_EXPORT_WIDTH,
        height: CARD_EXPORT_HEIGHT,
        windowWidth: CARD_EXPORT_WIDTH,
        windowHeight: CARD_EXPORT_HEIGHT,
      });

      const blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not create PNG blob.")), "image/png");
        } catch (error) {
          reject(error);
        }
      });

      const sideLabel = exportSide === "front" ? "Front" : "Back";
      const filename = `${safeExportPart(selectedCard.position)}-${safeCardExportName(selectedCard)}-${sideLabel}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Card PNG export failed", error);
      alert(`Card PNG export failed: ${error?.message || "unknown error"}`);
    } finally {
      root.unmount();
      host.remove();
    }
  }

  function importCardBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const rawCards = Array.isArray(parsed?.cardState?.cards)
          ? parsed.cardState.cards
          : (Array.isArray(parsed?.cards) ? parsed.cards : (parsed?.id || parsed?.name ? [parsed] : []));
        const incomingCards = rawCards.map(card => normalizeImportedCard(card));
        if (!incomingCards.length) {
          alert("No player cards found in this JSON file.");
          return;
        }

        setCardState(prev => {
          const existingSourceIds = new Set(prev.cards.map(card => String(card.importSourceId || card.id)));
          const now = new Date().toISOString();
          const importedCards = incomingCards
            .filter(card => !existingSourceIds.has(String(card.importSourceId || card.id)))
            .map(card => {
              const sourceId = String(card.importSourceId || card.id);
              return {
                ...card,
                id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                importSourceId: sourceId,
                position: normalizeCardPosition(card.position ?? card.Position),
                createdAt: now,
                updatedAt: now,
              };
            });

          if (!importedCards.length) {
            alert("This player card has already been imported.");
            return prev;
          }

          alert(`Import successful. Added ${importedCards.length} new player card${importedCards.length === 1 ? "" : "s"}.`);
          return normalizeCardState({
            ...prev,
            theme: parsed?.cardState?.theme || parsed?.theme || prev.theme,
            cards: [...prev.cards, ...importedCards],
          });
        });
      } catch (error) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }


  async function uploadCardGraphicDataUrl(cardId, side, dataUrl) {
    if (!isInlineImageDataUrl(dataUrl)) return dataUrl;
    if (!user?.uid) return dataUrl;

    const extension = /^data:image\/png/i.test(dataUrl) ? "png" : "jpg";
    const safeCardId = String(cardId || "card").replace(/[^a-z0-9_-]+/gi, "_");
    const safeSide = String(side || "graphic").replace(/[^a-z0-9_-]+/gi, "_");
    const path = `users/${user.uid}/cardGraphics/${safeCardId}/${safeSide}-${Date.now()}.${extension}`;
    const ref = storageRef(storage, path);
    await uploadString(ref, dataUrl, "data_url");
    return getDownloadURL(ref);
  }

  async function uploadAndApplyGraphic(cardId, side, dataUrl, pairedBackDataUrl = null) {
    try {
      setCloudStatus("Uploading image...");
      const uploadedFront = side === "front" || side === "both"
        ? await uploadCardGraphicDataUrl(cardId, side === "both" ? "front" : side, dataUrl)
        : dataUrl;
      const uploadedBack = side === "both" && pairedBackDataUrl
        ? await uploadCardGraphicDataUrl(cardId, "back", pairedBackDataUrl)
        : pairedBackDataUrl;
      applyGraphicToCard(cardId, side, uploadedFront, uploadedBack, dataUrl, pairedBackDataUrl);
      setCloudStatus("Image uploaded");
      setCloudError("");
    } catch (error) {
      console.error(error);
      setCloudStatus("Image upload error");
      setCloudError(error.message || String(error));
      alert("Image upload failed. Check Firebase Storage is enabled and Storage rules allow your signed-in user to write.");
    }
  }

  function readGraphicFile(file, callback) {
    if (!file) return;
    const okTypes = ["image/png", "image/jpeg", "image/jpg"];
    const nameOk = /\.(png|jpe?g)$/i.test(file.name || "");
    if (!okTypes.includes(file.type) && !nameOk) {
      alert("Please select a PNG, JPG, or JPEG image.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => alert("Could not read the selected image.");
    reader.onload = () => {
      const rawDataUrl = String(reader.result || "");
      const img = new Image();
      img.onerror = () => callback(rawDataUrl);
      img.onload = () => {
        try {
          const maxW = 1000;
          const maxH = 1500;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL("image/jpeg", 0.88);
          callback(compressed || rawDataUrl);
        } catch {
          callback(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function applyGraphicToCard(cardId, side, dataUrl, pairedBackDataUrl = null, localFrontDataUrl = null, localBackDataUrl = null) {
    if (!cardId || !dataUrl) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId) return card;
        const currentGraphics = card.graphics || {};
        const previousTheme = CARD_THEMES.includes(card.theme)
          ? card.theme
          : (CARD_THEMES.includes(currentGraphics.previousTheme) ? currentGraphics.previousTheme : "Style 1");
        const nextGraphics = {
          frontDataUrl: currentGraphics.frontDataUrl || "",
          backDataUrl: currentGraphics.backDataUrl || "",
          frontExportDataUrl: currentGraphics.frontExportDataUrl || "",
          backExportDataUrl: currentGraphics.backExportDataUrl || "",
          previousTheme,
        };
        if (side === "front") {
          nextGraphics.frontDataUrl = dataUrl;
          nextGraphics.frontExportDataUrl = localFrontDataUrl || (isInlineImageDataUrl(dataUrl) ? dataUrl : currentGraphics.frontExportDataUrl || "");
        }
        if (side === "back") {
          nextGraphics.backDataUrl = dataUrl;
          nextGraphics.backExportDataUrl = localBackDataUrl || (isInlineImageDataUrl(dataUrl) ? dataUrl : currentGraphics.backExportDataUrl || "");
        }
        if (side === "both") {
          nextGraphics.frontDataUrl = dataUrl;
          nextGraphics.backDataUrl = pairedBackDataUrl || currentGraphics.backDataUrl || "";
          nextGraphics.frontExportDataUrl = localFrontDataUrl || (isInlineImageDataUrl(dataUrl) ? dataUrl : currentGraphics.frontExportDataUrl || "");
          nextGraphics.backExportDataUrl = localBackDataUrl || (isInlineImageDataUrl(pairedBackDataUrl) ? pairedBackDataUrl : currentGraphics.backExportDataUrl || "");
        }
        return {
          ...card,
          theme: CUSTOM_CARD_THEME,
          graphics: nextGraphics,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }

  function startGraphicImport() {
    const selectedCard = editingCardId ? cardById[editingCardId] : null;
    if (!selectedCard) {
      alert("Select a card first.");
      return;
    }
    setGraphicImportCardId(selectedCard.id);
    pendingGraphicFrontRef.current = null;
    if (graphicImportSide === "back") {
      graphicBackInputRef.current?.click();
      return;
    }
    graphicFrontInputRef.current?.click();
  }

  function handleFrontGraphicFile(file) {
    const targetCardId = graphicImportCardId || editingCardId;
    if (!targetCardId) return;
    readGraphicFile(file, dataUrl => {
      if (graphicImportSide === "both") {
        pendingGraphicFrontRef.current = dataUrl;
        setTimeout(() => graphicBackInputRef.current?.click(), 0);
        return;
      }
      uploadAndApplyGraphic(targetCardId, "front", dataUrl);
      pendingGraphicFrontRef.current = null;
      setGraphicImportCardId("");
    });
  }

  function handleBackGraphicFile(file) {
    const targetCardId = graphicImportCardId || editingCardId;
    if (!targetCardId) return;
    readGraphicFile(file, backDataUrl => {
      if (graphicImportSide === "both") {
        const frontDataUrl = pendingGraphicFrontRef.current;
        if (!frontDataUrl) return;
        uploadAndApplyGraphic(targetCardId, "both", frontDataUrl, backDataUrl);
      } else {
        uploadAndApplyGraphic(targetCardId, "back", backDataUrl);
      }
      pendingGraphicFrontRef.current = null;
      setGraphicImportCardId("");
    });
  }

  function deleteSelectedGraphic() {
    const selectedCard = editingCardId ? cardById[editingCardId] : null;
    if (!selectedCard) {
      alert("Select a card first.");
      return;
    }
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== selectedCard.id) return card;
        const previousTheme = CARD_THEMES.includes(card.graphics?.previousTheme) ? card.graphics.previousTheme : (CARD_THEMES.includes(card.theme) ? card.theme : "Style 1");
        return {
          ...card,
          theme: previousTheme,
          graphics: { frontDataUrl: "", backDataUrl: "", previousTheme },
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }

  function updateCardField(cardId, key, value) {
    updateCardState(prev => ({ ...prev, cards: prev.cards.map(card => card.id === cardId ? { ...card, [key]: value, updatedAt: new Date().toISOString() } : card) }));
  }

  function updateFrontStars(cardId, patch) {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        starsFront: normalizeFrontStars({ ...(card.starsFront || FRONT_STAR_DEFAULTS), ...patch }),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function updateCardList(cardId, section, updater) {
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? { ...card, [section]: updater(card[section] || []), updatedAt: new Date().toISOString() } : card),
    }));
  }

  function AutoFitSpecialText({ children, style, className = "" }) {
    const textRef = useRef(null);
    const styleKey = JSON.stringify(style || {});

    useLayoutEffect(() => {
      const element = textRef.current;
      if (!element) return undefined;

      let frameId = 0;
      let cancelled = false;

      const setFitSize = size => {
        if (size == null) element.style.removeProperty("--special-fit-font-size");
        else element.style.setProperty("--special-fit-font-size", `${size}px`);
      };

      const fitText = () => {
        if (cancelled || !element.isConnected) return;

        setFitSize(null);
        const computed = window.getComputedStyle(element);
        const naturalSize = Number.parseFloat(computed.fontSize) || 3;
        const minimumSize = 3;
        const fits = () => (
          element.scrollHeight <= element.clientHeight + 0.5
          && element.scrollWidth <= element.clientWidth + 0.5
        );

        if (fits()) return;

        let low = minimumSize;
        let high = naturalSize;
        let best = minimumSize;

        for (let index = 0; index < 14; index += 1) {
          const candidate = (low + high) / 2;
          setFitSize(candidate);
          if (fits()) {
            best = candidate;
            low = candidate;
          } else {
            high = candidate;
          }
        }

        setFitSize(Math.max(minimumSize, best - 0.1));
      };

      const scheduleFit = () => {
        cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(fitText);
      };

      const observer = new ResizeObserver(scheduleFit);
      if (element.parentElement) observer.observe(element.parentElement);

      scheduleFit();
      if (document.fonts?.ready) document.fonts.ready.then(scheduleFit).catch(() => {});

      return () => {
        cancelled = true;
        cancelAnimationFrame(frameId);
        observer.disconnect();
      };
    }, [children, styleKey]);

    return <div ref={textRef} className={`card-zone-special ${className}`.trim()} style={style}>{children}</div>;
  }

  function CardVisualCanvas({ card, side, showZones = false, selectedLayout = null, onSelectLayout = null }) {
    const canvasRef = useRef(null);
    const [activeLayoutEdit, setActiveLayoutEdit] = useState(null);
    const layout = normalizeCardVisualLayout(card?.visualLayout || card?.layout);
    const sideLayout = layout[side] || layout.back || {};
    const deletedLayoutSet = new Set(Array.isArray(card?.deletedLayoutZones) ? card.deletedLayoutZones.map(String) : []);
    const isSelectedLayout = (kind, zoneKey) => selectedLayout?.cardId === card?.id && selectedLayout?.side === side && selectedLayout?.kind === kind && selectedLayout?.zoneKey === zoneKey;

    const formatBoxCoordinates = box => `X ${Math.round(box.x * 10) / 10} · Y ${Math.round(box.y * 10) / 10} · W ${Math.round(box.w * 10) / 10} · H ${Math.round(box.h * 10) / 10}`;

    const colors = cardTextColors(card);
    const textStyles = effectiveTextStylesForCard(card);
    const visibleAttributes = (card?.passiveAttributes || []).filter(item => item.showOnCard !== false);
    const visibleBonuses = (card?.bonuses || []).filter(item => item.showOnCard !== false);

    const renderNameZone = colorKey => (
      <div className={`card-zone-text card-zone-name zone-color-bound ${colorKey === "headerFront" ? "card-zone-name-front" : ""}`} style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }} title={card?.name || "Player"}>
        {card?.name || "Player"}
      </div>
    );

    const renderPositionZone = colorKey => (
      <div className="card-zone-text card-zone-position zone-color-bound" style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }}>
        {String(card?.position || "").toUpperCase()}
      </div>
    );

    const renderFrontStars = () => {
      const stars = normalizeFrontStars(card?.starsFront);
      if (!stars.count) return null;
      return (
        <div
          className="card-zone-front-stars"
          style={{
            "--front-star-size": `${stars.size}px`,
            "--front-star-spacing": `${stars.spacing}px`,
            transform: `translate(${stars.x}px, ${stars.y}px)`,
          }}
          aria-label={`${stars.count} stars`}
        >
          {Array.from({ length: stars.count }, (_, index) => {
            const gradientId = `front-star-gold-${card?.id || "card"}-${index}`;
            return (
              <svg
                key={index}
                className="front-star-svg"
                viewBox="0 0 100 100"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <linearGradient id={gradientId} x1="50" y1="4" x2="50" y2="92" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#fff2a8" />
                    <stop offset="0.28" stopColor="#ffd45a" />
                    <stop offset="0.58" stopColor="#c88a12" />
                    <stop offset="1" stopColor="#6f4105" />
                  </linearGradient>
                </defs>
                <polygon className="front-star-gold-base" fill={`url(#${gradientId})`} points="50,5 61,36 94,36 67,56 78,90 50,70 22,90 33,56 6,36 39,36" />
                <g className="front-star-facets">
                  <polygon className="front-star-facet-light" points="50,5 50,50 39,36" />
                  <polygon className="front-star-facet-dark" points="61,36 50,50 50,5" />
                  <polygon className="front-star-facet-light" points="94,36 50,50 61,36" />
                  <polygon className="front-star-facet-dark" points="67,56 50,50 94,36" />
                  <polygon className="front-star-facet-dark" points="78,90 50,50 67,56" />
                  <polygon className="front-star-facet-deep" points="50,70 50,50 78,90" />
                  <polygon className="front-star-facet-deep" points="22,90 50,50 50,70" />
                  <polygon className="front-star-facet-dark" points="33,56 50,50 22,90" />
                  <polygon className="front-star-facet-dark" points="6,36 50,50 33,56" />
                  <polygon className="front-star-facet-light" points="39,36 50,50 6,36" />
                </g>
              </svg>
            );
          })}        </div>
      );
    };

    const renderListZone = (items, colorKey, titleKey, titleColorKey) => {
      const textColor = safeColor(colors[colorKey]);
      const valueKey = `${colorKey}Value`;
      const valueColor = safeColor(colors[valueKey], textColor);
      const titleColor = safeColor(colors[titleColorKey]);
      return (
        <div className="card-zone-text card-zone-list-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": Math.max(2, items.length + 1), color: textColor }}>
          <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, titleColorKey) }}>{cardLayoutTitle(card, titleKey)}</div>
          <div className="card-zone-list" style={{ color: textColor, "--zone-lines": Math.max(2, items.length + 1), ...zoneTextStyleVarsStable(textStyles, colorKey), ...zonePairDistanceVarsStable(textStyles, colorKey, { longestLabelChars: Math.max(0, ...items.map(item => String(item.name || "").length)), maxValueChars: Math.max(1, ...items.map(item => String(normalizeStatValue(item.value)).length)) }) }}>
            {items.length ? items.map(item => (
              <div className="card-zone-list-row" key={item.id} style={{ color: textColor }}>
                <span className="card-zone-label" style={{ color: textColor }}>{item.name}</span>
                <strong className="card-zone-value" style={{ "--zone-number-color": valueColor, color: valueColor, ...zoneNumberStyleVarsStable(textStyles, colorKey, valueKey) }}>{normalizeStatValue(item.value)}</strong>
              </div>
            )) : <em style={{ color: textColor }}>—</em>}
          </div>
        </div>
      );
    };

    const renderSpecialAbilityZone = () => {
      const textColor = safeColor(colors.specialAbility);
      const titleColor = safeColor(colors.specialAbilityTitle);
      return (
        <div className="card-zone-text card-zone-special-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": 3, color: textColor }}>
          <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, "specialAbilityTitle") }}>{cardLayoutTitle(card, "specialAbility")}</div>
          <AutoFitSpecialText style={{ color: textColor, ...zoneTextStyleVarsStable(textStyles, "specialAbility") }}>{card?.specialAbility || ""}</AutoFitSpecialText>
        </div>
      );
    };

    const renderPreferredFootZone = () => {
      const textColor = safeColor(colors.preferredFoot);
      const value = PREFERRED_FOOT_OPTIONS.includes(card?.preferredFoot) ? card.preferredFoot : "Right";
      return (
        <div className="card-zone-text card-zone-preferred-foot zone-color-bound" style={{ "--zone-text-color": textColor, color: textColor, ...zoneTextStyleVarsStable(textStyles, "preferredFoot") }}>
          <span style={{ color: textColor }}>Preferred Foot: {value}</span>
        </div>
      );
    };

    const renderDefensiveAreaZone = () => {
      const textColor = safeColor(colors.defensiveArea);
      const titleColor = safeColor(colors.defensiveAreaTitle);
      return (
        <div className="card-zone-text card-zone-defense-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-text-rgb": colorToRgbTriplet(textColor), "--zone-title-color": titleColor, "--zone-lines": 2, color: textColor, "--card-area-active-color": safeColor(colors.defensiveAreaActive, "#50be78"), "--card-area-active-rgb": colorToRgbTriplet(colors.defensiveAreaActive, "#50be78") }}>
          <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, "defensiveAreaTitle") }}>{cardLayoutTitle(card, "defensiveArea")}</div>
          <div className="card-zone-defense card-zone-defense-row" style={{ color: textColor, ...zoneTextStyleVarsStable(textStyles, "defensiveArea") }}>
            <div className="card-zone-defense-grid-adjust" data-defensive-grid-card-id={card.id} style={defensiveGridAdjustStyle(card)}>
              <div className="card-zone-opponent-goal" data-defensive-goal-label-card-id={card.id} style={opponentGoalStyleVarsStable(textStyles)} aria-hidden="true">OPPONENT GOAL</div>
              <AreaMiniPreview area={card?.defensiveArea || []} />
            </div>
          </div>
        </div>
      );
    };


    const renderCustomZoneContent = () => <div className="card-zone-text card-zone-custom-empty" aria-hidden="true" />;

    const renderZoneContent = zoneKey => {
      if (side === "front") {
        if (zoneKey === "header") return renderNameZone("headerFront");
        if (zoneKey === "position") return renderPositionZone("positionFront");
        if (zoneKey === "attributes") return renderFrontStars();
      }
      if (zoneKey === "header") return renderNameZone("headerBack");
      if (zoneKey === "position") return renderPositionZone("positionBack");
      if (zoneKey === "attributes") return renderListZone(visibleAttributes, "attributes", "attributes", "attributesTitle");
      if (zoneKey === "bonuses") return renderListZone(visibleBonuses, "bonuses", "bonuses", "bonusesTitle");
      if (zoneKey === "specialAbility") return renderSpecialAbilityZone();
      if (zoneKey === "preferredFoot") return renderPreferredFootZone();
      if (zoneKey === "defensiveArea") return renderDefensiveAreaZone();
      return null;
    };

    const showLiveCoordinates = (zoneKey, box) => {
      setActiveLayoutEdit({ zoneKey, box: { ...box } });
    };

    const hideLiveCoordinates = () => {
      setActiveLayoutEdit(null);
    };

    const beginZoneEdit = (event, zoneKey, box, mode = "move", corner = "br") => {
      if (!showZones || !card?.id) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectLayout && onSelectLayout({ cardId: card.id, side, kind: "base", zoneKey });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startBox = { ...box };
      const pointerId = event.pointerId;
      try { event.currentTarget.setPointerCapture?.(pointerId); } catch (_) {}
      showLiveCoordinates(zoneKey, startBox);

      const toPctX = px => (px / Math.max(rect.width, 1)) * 100;
      const toPctY = px => (px / Math.max(rect.height, 1)) * 100;

      const onMove = moveEvent => {
        moveEvent.preventDefault();
        const dx = toPctX(moveEvent.clientX - startX);
        const dy = toPctY(moveEvent.clientY - startY);
        let next = { ...startBox };

        if (mode === "move") {
          next.x = startBox.x + dx;
          next.y = startBox.y + dy;
        } else {
          if (corner.includes("r")) next.w = startBox.w + dx;
          if (corner.includes("l")) {
            next.x = startBox.x + dx;
            next.w = startBox.w - dx;
          }
          if (corner.includes("b")) next.h = startBox.h + dy;
          if (corner.includes("t")) {
            next.y = startBox.y + dy;
            next.h = startBox.h - dy;
          }
        }

        const bounded = {
          x: clamp(Number(next.x), 0, 100),
          y: clamp(Number(next.y), 0, 100),
          w: clamp(Number(next.w), 4, 100),
          h: clamp(Number(next.h), 4, 100),
        };
        bounded.w = Math.min(bounded.w, 100 - bounded.x);
        bounded.h = Math.min(bounded.h, 100 - bounded.y);
        showLiveCoordinates(zoneKey, bounded);
        updateCardVisualLayoutBox(card.id, side, zoneKey, bounded);
      };

      const onUp = () => {
        hideLiveCoordinates();
        try { event.currentTarget.releasePointerCapture?.(pointerId); } catch (_) {}
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    };

    const sideCustomZones = normalizeCustomZones(card).filter(zone => zone.side === side);

    const beginCustomZoneEdit = (event, zone, mode = "move", corner = "br") => {
      if (!showZones || !card?.id) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectLayout && onSelectLayout({ cardId: card.id, side, kind: "custom", zoneKey: zone.id });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startBox = { ...zone.box };
      const pointerId = event.pointerId;
      try { event.currentTarget.setPointerCapture?.(pointerId); } catch (_) {}
      showLiveCoordinates(zone.id, startBox);

      const toPctX = px => (px / Math.max(rect.width, 1)) * 100;
      const toPctY = px => (px / Math.max(rect.height, 1)) * 100;

      const onMove = moveEvent => {
        moveEvent.preventDefault();
        const dx = toPctX(moveEvent.clientX - startX);
        const dy = toPctY(moveEvent.clientY - startY);
        let next = { ...startBox };
        if (mode === "move") {
          next.x = startBox.x + dx;
          next.y = startBox.y + dy;
        } else {
          if (corner.includes("r")) next.w = startBox.w + dx;
          if (corner.includes("l")) { next.x = startBox.x + dx; next.w = startBox.w - dx; }
          if (corner.includes("b")) next.h = startBox.h + dy;
          if (corner.includes("t")) { next.y = startBox.y + dy; next.h = startBox.h - dy; }
        }
        const bounded = {
          x: clamp(Number(next.x), 0, 100),
          y: clamp(Number(next.y), 0, 100),
          w: clamp(Number(next.w), 4, 100),
          h: clamp(Number(next.h), 4, 100),
        };
        bounded.w = Math.min(bounded.w, 100 - bounded.x);
        bounded.h = Math.min(bounded.h, 100 - bounded.y);
        showLiveCoordinates(zone.id, bounded);
        updateCardCustomZoneBox(card.id, zone.id, bounded);
      };

      const onUp = () => {
        hideLiveCoordinates();
        try { event.currentTarget.releasePointerCapture?.(pointerId); } catch (_) {}
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    };

    const baseZoneEntries = Object.entries(sideLayout).filter(([key]) => !deletedLayoutSet.has(`${side}:${key}`));

    return (
      <div className="card-visual-canvas" data-card-side={side} ref={canvasRef} onPointerDown={event => { if (event.target === event.currentTarget) onSelectLayout && onSelectLayout(null); }}>
        {baseZoneEntries.map(([key, box]) => (
          <div
            key={`render_${side}_${key}`}
            className={`card-visual-zone card-visual-zone-${key}`}
            data-zone={key}
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
            }}
          >
            <div className={`card-zone-content card-zone-content-${key}`}>{renderZoneContent(key)}</div>
          </div>
        ))}
        {sideCustomZones.map(zone => (
          <div
            key={`render_${side}_${zone.id}`}
            className="card-visual-zone card-visual-zone-custom"
            data-zone={zone.id}
            style={{
              left: `${zone.box.x}%`,
              top: `${zone.box.y}%`,
              width: `${zone.box.w}%`,
              height: `${zone.box.h}%`,
            }}
          >
            <div className="card-zone-content">{renderCustomZoneContent(zone)}</div>
          </div>
        ))}

        {showZones ? (
          <div className="card-editor-overlay-layer" aria-hidden="true">
            {baseZoneEntries.map(([key, box]) => (
              <div
                key={`edit_${side}_${key}`}
                className={`card-edit-overlay-zone card-edit-overlay-zone-${key} editable-zone ${isSelectedLayout("base", key) ? "selected-layout-zone" : ""}`}
                data-zone={key}
                onPointerDown={event => beginZoneEdit(event, key, box, "move")}
                style={{
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.w}%`,
                  height: `${box.h}%`,
                }}
              >
                {showZones && activeLayoutEdit?.zoneKey === key ? (
                  <b className="zone-live-coordinates is-visible">{formatBoxCoordinates(activeLayoutEdit.box)}</b>
                ) : null}
                <i className="zone-resize-handle zone-resize-tl" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "tl")} />
                <i className="zone-resize-handle zone-resize-tr" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "tr")} />
                <i className="zone-resize-handle zone-resize-bl" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "bl")} />
                <i className="zone-resize-handle zone-resize-br" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "br")} />
              </div>
            ))}
            {sideCustomZones.map(zone => (
              <div
                key={`edit_${side}_${zone.id}`}
                className={`card-edit-overlay-zone card-edit-overlay-zone-custom editable-zone ${isSelectedLayout("custom", zone.id) ? "selected-layout-zone" : ""}`}
                data-zone={zone.id}
                onPointerDown={event => beginCustomZoneEdit(event, zone, "move")}
                style={{
                  left: `${zone.box.x}%`,
                  top: `${zone.box.y}%`,
                  width: `${zone.box.w}%`,
                  height: `${zone.box.h}%`,
                }}
              >
                {showZones && activeLayoutEdit?.zoneKey === zone.id ? <b className="zone-live-coordinates is-visible">{formatBoxCoordinates(activeLayoutEdit.box)}</b> : null}
                <i className="zone-resize-handle zone-resize-tl" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "tl")} />
                <i className="zone-resize-handle zone-resize-tr" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "tr")} />
                <i className="zone-resize-handle zone-resize-bl" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "bl")} />
                <i className="zone-resize-handle zone-resize-br" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "br")} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const cardPreviewRenderContext = {
    appTheme: cardState.theme,
    customCardTheme: CUSTOM_CARD_THEME,
    getCardTheme,
    cardTextColors,
    safeColor,
    colorToRgbTriplet,
    VisualCanvas: CardVisualCanvas,
    selectedLayout,
    onSelectLayout: setSelectedLayout,
  };

  function AreaMiniPreview({ area = [] }) {
    return <div className="area-mini">{Array.from({ length: 121 }, (_, i) => { const dx = (i % 11) - 5; const dy = Math.floor(i / 11) - 5; const center = dx === 0 && dy === 0; return <span key={i} className={`${center ? "player" : ""} ${areaHasCell(area, dx, dy) ? "active" : ""}`}>{center ? "" : ""}</span>; })}</div>;
  }

  function AttributeListEditor({ card, section, title, hideHeader = false, toolbarLeft = null }) {
    const items = card[section] || [];
    const updateGlobalDefinitions = updater => updateCardState(prev => {
      const schema = deriveBackStatsSchema(prev.cards || [], prev.backStatsSchema);
      const nextDefinitions = updater([...(schema[section] || [])]);
      const nextSchema = { ...schema, migrationError: "", [section]: nextDefinitions };
      const now = new Date().toISOString();
      const cards = (prev.cards || []).map(current => materializeCardStats({ ...current, updatedAt: now }, nextSchema));
      return { ...prev, backStatsSchema: nextSchema, cards };
    });
    const moveItem = (index, dir) => updateGlobalDefinitions(list => { const next = [...list]; const to = index + dir; if (to < 0 || to >= next.length) return next; [next[index], next[to]] = [next[to], next[index]]; return next; });
    const changeValue = (itemId, delta) => updateCardList(card.id, section, list => list.map(x => x.id === itemId ? { ...x, value: clamp(normalizeStatValue(x.value) + delta, -99, 99) } : x));
    const addGlobalStat = () => updateGlobalDefinitions(list => [...list, { id: `${section === "bonuses" ? "bonus" : "attribute"}:new-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, name: "New" }]);
    const deleteGlobalStat = item => {
      if (!window.confirm(`Delete “${item.name}” from ALL cards? This permanently removes every value and Show setting for this statistic.`)) return;
      updateGlobalDefinitions(list => list.filter(definition => definition.id !== item.id));
    };
    return (
      <div className="card-edit-section">
        {!hideHeader ? <div className="card-edit-section-title"><strong>{title}</strong>{renderColorPicker(card, section === "bonuses" ? "bonuses" : "attributes", "Color")}<button onClick={addGlobalStat}>+ Add</button></div> : <div className="card-edit-section-title sub-only attribute-toolbar-row"><div className="attribute-toolbar-left">{toolbarLeft}</div><button onClick={addGlobalStat}>+ Add</button></div>}
        {items.map((item, index) => (
          <div className="attribute-row" key={item.id}>
            <input value={item.name} onChange={e => updateGlobalDefinitions(list => list.map(x => x.id === item.id ? { ...x, name: e.target.value } : x))} />
            <div className="value-stepper" title="Edit value">
              <button className="value-step-btn" onClick={() => changeValue(item.id, -1)}>−</button>
              <input className="attr-value" inputMode="text" value={item.value} onChange={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, value: cleanTwoDigitValue(e.target.value) } : x))} onBlur={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, value: normalizeStatValue(e.target.value) } : x))} />
              <button className="value-step-btn" onClick={() => changeValue(item.id, 1)}>+</button>
            </div>
            <label className="show-on-card-toggle" title="Show on card"><input type="checkbox" checked={item.showOnCard !== false} onChange={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, showOnCard: e.target.checked } : x))} /><span>Show</span></label>
            <button className="order-btn" onClick={() => moveItem(index, -1)}>↑</button><button className="order-btn" onClick={() => moveItem(index, 1)}>↓</button>
            <button onClick={() => deleteGlobalStat(item)}>×</button>
          </div>
        ))}
      </div>
    );
  }

  function DefensiveAreaEditor({ card }) {
    const area = card.defensiveArea || [];
    const setArea = nextArea => updateCardField(card.id, "defensiveArea", nextArea);
    const toggle = (dx, dy) => { if (dx === 0 && dy === 0) return; setArea(areaHasCell(area, dx, dy) ? area.filter(c => !(Number(c.dx) === dx && Number(c.dy) === dy)) : [...area, { dx, dy }]); };
    return (
      <div className="def-area-editor">
        <div className="area-actions"><button onClick={() => setArea([])}>Clear Area</button><button onClick={() => setArea(Array.from({ length: 121 }, (_, i) => ({ dx: (i % 11) - 5, dy: Math.floor(i / 11) - 5 })).filter(c => !(c.dx === 0 && c.dy === 0)))}>Fill Area</button><button onClick={() => setArea(area.map(c => ({ dx: -Number(c.dx), dy: Number(c.dy) })))}>Mirror Left/Right</button><button onClick={() => setArea(area.map(c => ({ dx: Number(c.dx), dy: -Number(c.dy) })))}>Mirror Up/Down</button></div>
        <div className="def-area-editor-row">
          <div className="def-grid">{Array.from({ length: 121 }, (_, i) => { const dx = (i % 11) - 5; const dy = Math.floor(i / 11) - 5; const center = dx === 0 && dy === 0; return <button key={i} className={`${center ? "player" : ""} ${areaHasCell(area, dx, dy) ? "active" : ""}`} onClick={() => toggle(dx, dy)}>{center ? "P" : ""}</button>; })}</div>
        </div>
      </div>
    );
  }

  function updateDefensiveGridAdjust(cardId, patch) {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        defensiveGridAdjust: normalizeDefensiveGridAdjust({ ...(card.defensiveGridAdjust || DEFENSIVE_GRID_ADJUST_DEFAULTS), ...patch }),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function previewDefensiveGridAdjust(cardId, nextAdjust) {
    if (!cardId || typeof document === "undefined") return;
    const selector = `[data-defensive-grid-card-id="${String(cardId).replace(/"/g, '\"')}"]`;
    document.querySelectorAll(selector).forEach(node => {
      if (!nextAdjust) {
        node.style.removeProperty("width");
        node.style.removeProperty("height");
        node.style.removeProperty("left");
        node.style.removeProperty("top");
        node.style.removeProperty("transform");
        return;
      }
      const adjust = normalizeDefensiveGridAdjust(nextAdjust);
      node.style.width = `${adjust.width}%`;
      node.style.height = `${adjust.height}%`;
      node.style.left = `${adjust.offsetX * 0.12}px`;
      node.style.top = `${adjust.offsetY * 0.12}px`;
      node.style.transform = "none";
    });
  }

  function DefensiveGridAdjustControl({ card }) {
    if (!card) return null;
    const panelKey = `${card.id}:defensiveGridAdjust`;
    return (
      <StableDefensiveGridAdjustControl
        cardId={card.id}
        current={normalizeDefensiveGridAdjust(card.defensiveGridAdjust)}
        isOpen={openGridAdjustKey === panelKey}
        onToggle={() => setOpenGridAdjustKey(openGridAdjustKey === panelKey ? null : panelKey)}
        onPatch={patch => updateDefensiveGridAdjust(card.id, patch)}
        onPreview={nextAdjust => previewDefensiveGridAdjust(card.id, nextAdjust)}
      />
    );
  }


  function previewOpponentGoalText(cardId, nextStyle) {
    if (!cardId || typeof document === "undefined") return;
    const selector = `[data-defensive-goal-label-card-id="${String(cardId).replace(/"/g, '\"')}"]`;
    document.querySelectorAll(selector).forEach(node => {
      const style = normalizeTextStyles({ defensiveAreaGoal: nextStyle }).defensiveAreaGoal;
      node.style.setProperty("--goal-font-family", style.font);
      node.style.setProperty("--goal-font-weight", style.bold ? "950" : "650");
      node.style.setProperty("--goal-font-scale", String(style.fontSize / 100));
      node.style.setProperty("--goal-x-offset", `${style.horizontalOffset * 0.12}px`);
      node.style.setProperty("--goal-y-offset", `${style.verticalOffset * 0.12}px`);
    });
  }

  function OpponentGoalTextControl({ card }) {
    if (!card) return null;
    const styleKey = "defensiveAreaGoal";
    const current = effectiveTextStylesForCard(card)[styleKey] || CARD_TEXT_STYLE_DEFAULTS[styleKey];
    const panelKey = `${card.id}:${styleKey}`;
    return (
      <StableOpponentGoalTextControl
        cardId={card.id}
        current={current}
        isOpen={openTextPanelKey === panelKey}
        onToggle={() => setOpenTextPanelKey(openTextPanelKey === panelKey ? null : panelKey)}
        onPatch={patch => updateCardTextStyle(card.id, styleKey, patch)}
        onPreview={nextStyle => previewOpponentGoalText(card.id, nextStyle)}
      />
    );
  }

  function defensiveGridAdjustStyle(card) {
    const adjust = normalizeDefensiveGridAdjust(card?.defensiveGridAdjust);
    return {
      width: `${adjust.width}%`,
      height: `${adjust.height}%`,
      left: `${adjust.offsetX * 0.12}px`,
      top: `${adjust.offsetY * 0.12}px`,
      transform: "none",
    };
  }

  function updateCardTextStyle(cardId, key, patch) {
    if (!cardId || !CARD_TEXT_STYLE_DEFAULTS[key]) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId && !GLOBAL_BACK_STYLE_KEYS.has(key)) return card;
        const current = normalizeTextStyles(card.textStyles);
        return {
          ...card,
          textStyles: {
            ...current,
            [key]: { ...current[key], ...patch },
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }

  function effectiveTextStylesForCard(card) {
    const base = cardTextStyles(card);
    if (previewTextStyleDraft?.cardId === card?.id && CARD_TEXT_STYLE_DEFAULTS[previewTextStyleDraft.styleKey]) {
      const key = previewTextStyleDraft.styleKey;
      return {
        ...base,
        [key]: { ...base[key], ...(previewTextStyleDraft.patch || {}) },
      };
    }
    return base;
  }

  function renderTextStyleControls(card, styleKey, stats = false, options = {}) {
    if (!card || !CARD_TEXT_STYLE_DEFAULTS[styleKey]) return null;
    const current = effectiveTextStylesForCard(card)[styleKey] || CARD_TEXT_STYLE_DEFAULTS[styleKey];
    const panelKey = `${card.id}:${styleKey}`;
    return (
      <StableTextStyleControls
        cardId={card.id}
        styleKey={styleKey}
        stats={stats}
        current={current}
        isOpen={openTextPanelKey === panelKey}
        onToggle={() => setOpenTextPanelKey(openTextPanelKey === panelKey ? null : panelKey)}
        onPatch={patch => updateCardTextStyle(card.id, styleKey, patch)}
        onPreview={patch => setPreviewTextStyleDraft({ cardId: card.id, styleKey, patch })}
        onPreviewEnd={() => setPreviewTextStyleDraft(current => current?.cardId === card.id && current?.styleKey === styleKey ? null : current)}
        panelAlign={options.panelAlign || "right"}
        buttonLabel={options.buttonLabel || "Text"}
        titleMode={Boolean(options.titleMode)}
        numbersMode={Boolean(options.numbersMode)}
        inlinePanel={Boolean(options.inlinePanel)}
        hideLine={Boolean(options.hideLine)}
        fontSizeMin={Number.isFinite(Number(options.fontSizeMin)) ? Number(options.fontSizeMin) : 50}
      />
    );
  }


  function updateCardTextColor(cardId, key, value) {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => (card.id === cardId || GLOBAL_BACK_STYLE_KEYS.has(key)) ? {
        ...card,
        textColors: { ...CARD_TEXT_COLOR_DEFAULTS, ...(card.textColors || {}), [key]: safeColor(value) },
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function renderColorPicker(card, colorKey, label) {
    if (!card) return null;
    const current = safeColor((card.textColors || {})[colorKey], CARD_TEXT_COLOR_DEFAULTS[colorKey] || "#ffffff");
    const panelKey = `${card.id}:${colorKey}`;
    return (
      <StableColorPicker
        current={current}
        label={label}
        isOpen={openColorPanelKey === panelKey}
        onToggle={() => setOpenColorPanelKey(openColorPanelKey === panelKey ? null : panelKey)}
        onKeepOpen={() => setOpenColorPanelKey(panelKey)}
        onChange={value => updateCardTextColor(card.id, colorKey, value)}
      />
    );
  }


  function setCardThemeSelection(cardId, value) {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId) return card;
        if (value === CUSTOM_CARD_THEME) {
          return hasCustomGraphics(card) ? { ...card, theme: CUSTOM_CARD_THEME, updatedAt: new Date().toISOString() } : card;
        }
        if (!CARD_THEMES.includes(value)) return card;
        if (hasCustomGraphics(card)) {
          return {
            ...card,
            theme: CUSTOM_CARD_THEME,
            graphics: { ...(card.graphics || {}), previousTheme: value },
            updatedAt: new Date().toISOString(),
          };
        }
        return { ...card, theme: value, updatedAt: new Date().toISOString() };
      }),
    }));
  }


  function addCardCustomZone(cardId, side = "front") {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId) return card;
        const existing = normalizeCustomZones(card);
        const sideCount = existing.filter(zone => zone.side === side).length + 1;
        return { ...card, customZones: [...existing, makeCustomZone(side, sideCount)], updatedAt: new Date().toISOString() };
      }),
    }));
  }

  function updateCardCustomZoneBox(cardId, zoneId, patch) {
    if (!cardId || !zoneId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId) return card;
        const zones = normalizeCustomZones(card).map(zone => {
          if (zone.id !== zoneId) return zone;
          const base = zone.box || {};
          const nextBox = {
            x: clamp(Number(patch.x ?? base.x), 0, 100),
            y: clamp(Number(patch.y ?? base.y), 0, 100),
            w: clamp(Number(patch.w ?? base.w), 4, 100),
            h: clamp(Number(patch.h ?? base.h), 4, 100),
          };
          nextBox.w = Math.min(nextBox.w, 100 - nextBox.x);
          nextBox.h = Math.min(nextBox.h, 100 - nextBox.y);
          return { ...zone, box: nextBox };
        });
        return { ...card, customZones: zones, updatedAt: new Date().toISOString() };
      }),
    }));
  }

  function updateCardCustomZone(cardId, zoneId, patch) {
    if (!cardId || !zoneId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        customZones: normalizeCustomZones(card).map(zone => zone.id === zoneId ? { ...zone, ...patch } : zone),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function deleteCardCustomZone(cardId, zoneId) {
    if (!cardId || !zoneId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        customZones: normalizeCustomZones(card).filter(zone => zone.id !== zoneId),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function deleteSelectedLayoutZone(cardId) {
    if (!cardId || !selectedLayout || selectedLayout.cardId !== cardId) return;
    const sideLabel = selectedLayout.side === "front" ? "front" : "back";
    const layoutLabel = selectedLayout.kind === "custom" ? "custom layout" : (ZONE_LABELS[selectedLayout.zoneKey] || selectedLayout.zoneKey);
    if (!window.confirm(`Delete selected ${sideLabel} layout: ${layoutLabel}?`)) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        const isGlobalBackZone = selectedLayout.kind === "base" && selectedLayout.side === "back" && (selectedLayout.zoneKey === "attributes" || selectedLayout.zoneKey === "bonuses");
        if (card.id !== cardId && !isGlobalBackZone) return card;
        if (selectedLayout.kind === "custom") {
          return {
            ...card,
            customZones: normalizeCustomZones(card).filter(zone => zone.id !== selectedLayout.zoneKey),
            updatedAt: new Date().toISOString(),
          };
        }
        const key = `${selectedLayout.side}:${selectedLayout.zoneKey}`;
        const deleted = new Set(Array.isArray(card.deletedLayoutZones) ? card.deletedLayoutZones.map(String) : []);
        deleted.add(key);
        return { ...card, deletedLayoutZones: Array.from(deleted), updatedAt: new Date().toISOString() };
      }),
    }));
    setSelectedLayout(null);
  }

  function captureSelectedLayoutStyle(cardId) {
    if (!cardId || !selectedLayout || selectedLayout.cardId !== cardId) {
      window.alert("Select a layout on the card first.");
      return;
    }
    const card = cardState.cards.find(item => item.id === cardId);
    if (!card) return;

    if (selectedLayout.kind === "base") {
      const config = BASE_LAYOUT_STYLE_KEYS[selectedLayout.side]?.[selectedLayout.zoneKey];
      if (!config) {
        window.alert("This layout cannot be copied.");
        return;
      }
      const visualLayout = normalizeCardVisualLayout(card.visualLayout || card.layout);
      const styles = cardTextStyles(card);
      const colors = cardTextColors(card);
      const payload = {
        kind: "base",
        side: selectedLayout.side,
        zoneKey: selectedLayout.zoneKey,
        label: ZONE_LABELS[selectedLayout.zoneKey] || selectedLayout.zoneKey,
        box: clonePlain(visualLayout[selectedLayout.side][selectedLayout.zoneKey]),
        textStyles: Object.fromEntries((config.textStyles || []).map(key => [key, clonePlain(styles[key])])),
        textColors: Object.fromEntries((config.textColors || []).map(key => [key, colors[key]])),
      };
      if (config.copyDefensiveGridAdjust) payload.defensiveGridAdjust = clonePlain(card.defensiveGridAdjust || {});
      if (config.copyFrontStarsStyle) {
        const stars = normalizeFrontStars(card.starsFront);
        payload.frontStarsStyle = { size: stars.size, spacing: stars.spacing, x: stars.x, y: stars.y };
      }
      setLayoutStyleClipboard(payload);
      return;
    }

    const zone = normalizeCustomZones(card).find(item => item.id === selectedLayout.zoneKey);
    if (!zone) return;
    setLayoutStyleClipboard({
      kind: "custom",
      side: selectedLayout.side,
      zoneKey: selectedLayout.zoneKey,
      zoneName: zone.name,
      label: zone.name || "Custom layout",
      box: clonePlain(zone.box),
    });
  }

  function applyLayoutStylePayloadToCard(card, payload, targetSelection = payload) {
    if (!card || !payload || !targetSelection) return card;
    const now = new Date().toISOString();

    if (payload.kind === "base" && targetSelection.kind === "base") {
      if (payload.side !== targetSelection.side || payload.zoneKey !== targetSelection.zoneKey) return card;
      const currentLayout = normalizeCardVisualLayout(card.visualLayout || card.layout);
      const currentStyles = cardTextStyles(card);
      const currentColors = cardTextColors(card);
      const next = {
        ...card,
        visualLayout: {
          ...currentLayout,
          [payload.side]: {
            ...currentLayout[payload.side],
            [payload.zoneKey]: clonePlain(payload.box),
          },
        },
        textStyles: { ...currentStyles, ...clonePlain(payload.textStyles || {}) },
        textColors: { ...currentColors, ...(payload.textColors || {}) },
        updatedAt: now,
      };
      if (payload.defensiveGridAdjust) next.defensiveGridAdjust = clonePlain(payload.defensiveGridAdjust);
      if (payload.frontStarsStyle) {
        const currentStars = normalizeFrontStars(card.starsFront);
        next.starsFront = { ...currentStars, ...clonePlain(payload.frontStarsStyle), count: currentStars.count };
      }
      return next;
    }

    if (payload.kind === "custom" && targetSelection.kind === "custom") {
      const zones = normalizeCustomZones(card);
      const targetZone = zones.find(item => item.id === targetSelection.zoneKey);
      if (!targetZone || targetZone.side !== payload.side) return card;
      return {
        ...card,
        customZones: zones.map(zone => zone.id === targetZone.id ? { ...zone, box: clonePlain(payload.box) } : zone),
        updatedAt: now,
      };
    }

    return card;
  }

  function pasteLayoutStyle(cardId) {
    if (!layoutStyleClipboard) {
      window.alert("Copy a layout style first.");
      return;
    }
    if (!selectedLayout || selectedLayout.cardId !== cardId) {
      window.alert("Select the destination layout on this card first.");
      return;
    }
    const compatible = layoutStyleClipboard.kind === selectedLayout.kind &&
      layoutStyleClipboard.side === selectedLayout.side &&
      (layoutStyleClipboard.kind === "custom" || layoutStyleClipboard.zoneKey === selectedLayout.zoneKey);
    if (!compatible) {
      window.alert("Select the equivalent layout on the destination card.");
      return;
    }
    const isGlobalBackZone = layoutStyleClipboard.kind === "base" && layoutStyleClipboard.side === "back" && (layoutStyleClipboard.zoneKey === "attributes" || layoutStyleClipboard.zoneKey === "bonuses");
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => (card.id === cardId || isGlobalBackZone) ? applyLayoutStylePayloadToCard(card, layoutStyleClipboard, selectedLayout) : card),
    }));
  }

  function applyLayoutStyleToAllCards(cardId) {
    if (!layoutStyleClipboard) {
      window.alert("Copy a layout style first.");
      return;
    }
    if (!window.confirm(`Apply ${layoutStyleClipboard.label || "this layout"} position, size and text style to all cards? Card values will not be changed.`)) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (layoutStyleClipboard.kind === "base") {
          return applyLayoutStylePayloadToCard(card, layoutStyleClipboard, layoutStyleClipboard);
        }
        const targetZone = normalizeCustomZones(card).find(zone => zone.side === layoutStyleClipboard.side && (zone.id === layoutStyleClipboard.zoneKey || zone.name === layoutStyleClipboard.zoneName));
        if (!targetZone) return card;
        return applyLayoutStylePayloadToCard(card, layoutStyleClipboard, { kind: "custom", side: targetZone.side, zoneKey: targetZone.id });
      }),
    }));
  }

  function updateCardVisualLayoutBox(cardId, side, zoneKey, patch) {
    if (!cardId || !DEFAULT_CARD_VISUAL_LAYOUT[side]?.[zoneKey]) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId && !(side === "back" && (zoneKey === "attributes" || zoneKey === "bonuses"))) return card;
        const current = normalizeCardVisualLayout(card.visualLayout || card.layout);
        const base = current[side][zoneKey] || DEFAULT_CARD_VISUAL_LAYOUT[side][zoneKey];
        const nextBox = {
          x: clamp(Number(patch.x ?? base.x), 0, 100),
          y: clamp(Number(patch.y ?? base.y), 0, 100),
          w: clamp(Number(patch.w ?? base.w), 4, 100),
          h: clamp(Number(patch.h ?? base.h), 4, 100),
        };
        nextBox.w = Math.min(nextBox.w, 100 - nextBox.x);
        nextBox.h = Math.min(nextBox.h, 100 - nextBox.y);
        return {
          ...card,
          visualLayout: {
            ...current,
            [side]: {
              ...current[side],
              [zoneKey]: nextBox,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }


  function updateCardLayoutTitle(cardId, key, value) {
    if (!cardId || !Object.prototype.hasOwnProperty.call(CARD_LAYOUT_TITLE_DEFAULTS, key)) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => (card.id === cardId || GLOBAL_BACK_TITLE_KEYS.has(key)) ? {
        ...card,
        layoutTitles: { ...CARD_LAYOUT_TITLE_DEFAULTS, ...(card.layoutTitles || {}), [key]: value },
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }


  function SectionTitleEditor({ card, titleKey, colorKey, label }) {
    return (
      <label className="section-title-editor">
        <span className="editor-label-row"><span>{label}</span>{renderColorPicker(card, colorKey, "Color")}{renderTextStyleControls(card, colorKey, false, { panelAlign: "left", buttonLabel: "Text", titleMode: true })}</span>
        <input value={cardLayoutTitle(card, titleKey)} onChange={e => updateCardLayoutTitle(card.id, titleKey, e.target.value)} />
      </label>
    );
  }

  function CardLayoutEditor({ card }) {
    const customZones = normalizeCustomZones(card);
    return (
      <div className="card-edit-section card-layout-editor">
        <div className="card-edit-section-title">
          <strong>Layout Zones</strong>
          <button type="button" className="mini-action-btn layout-action-btn" onClick={() => addCardCustomZone(card.id, "front")}>New layout front</button>
          <button type="button" className="mini-action-btn layout-action-btn" onClick={() => addCardCustomZone(card.id, "back")}>New layout back</button>
          <button type="button" className="mini-action-btn layout-action-btn" disabled={!selectedLayout || selectedLayout.cardId !== card.id} onClick={() => captureSelectedLayoutStyle(card.id)}>Copy Layout Style</button>
          <button type="button" className="mini-action-btn layout-action-btn" disabled={!layoutStyleClipboard || !selectedLayout || selectedLayout.cardId !== card.id} onClick={() => pasteLayoutStyle(card.id)}>Paste Layout Style</button>
          <button type="button" className="mini-action-btn layout-action-btn" disabled={!layoutStyleClipboard} onClick={() => applyLayoutStyleToAllCards(card.id)}>Apply Layout Style To All Cards</button>
          <button type="button" className="mini-action-btn layout-action-btn danger" disabled={!selectedLayout || selectedLayout.cardId !== card.id} onClick={() => deleteSelectedLayoutZone(card.id)}>Delete layout</button>
        </div>
        {customZones.length ? <p className="custom-zone-empty-note">New layouts are empty containers. Select one on the card to move, resize, delete it, or copy its layout style.</p> : null}
      </div>
    );
  }

  function StarMenuEditor({ card }) {
    const stars = normalizeFrontStars(card?.starsFront);
    const [starRangeDraft, setStarRangeDraft] = useState({});
    const controls = [
      { key: "count", label: "Stars", min: 0, max: 10, step: 1 },
      { key: "size", label: "Size", min: 4, max: 80, step: 1 },
      { key: "spacing", label: "Spacing", min: 0, max: 80, step: 1 },
      { key: "x", label: "X", min: -120, max: 120, step: 1 },
      { key: "y", label: "Y", min: -120, max: 120, step: 1 },
    ];
    const clampStarValue = (control, rawValue) => {
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) return Number(stars[control.key] || 0);
      return Math.min(control.max, Math.max(control.min, numericValue));
    };
    const displayStarValue = control => starRangeDraft[control.key] ?? stars[control.key];
    const commitStarValue = (control, rawValue) => {
      const clampedValue = clampStarValue(control, rawValue);
      setStarRangeDraft(prev => ({ ...prev, [control.key]: clampedValue }));
      updateFrontStars(card.id, { [control.key]: clampedValue });
    };
    const draftStarValue = (control, rawValue) => {
      const clampedValue = clampStarValue(control, rawValue);
      setStarRangeDraft(prev => ({ ...prev, [control.key]: clampedValue }));
      updateFrontStars(card.id, { [control.key]: clampedValue });
    };
    const nudgeStarValue = (control, delta) => {
      const currentValue = Number(displayStarValue(control) || 0);
      commitStarValue(control, currentValue + (delta * control.step));
    };
    const stopControlEvent = e => e.stopPropagation();
    return (
      <div className="card-edit-section star-menu-section">
        <div className="card-edit-section-title"><strong>Star Menu</strong></div>
        <div className="star-menu-controls star-menu-controls-compact">
          {controls.map(control => (
            <div key={control.key} className="star-control-compact">
              <span className="star-control-label">{control.label}</span>
              <div className="star-control-inline">
                <button type="button" className="star-control-step" onClick={() => nudgeStarValue(control, -1)} aria-label={`Decrease ${control.label}`}>−</button>
                <input
                  className="star-control-range"
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={displayStarValue(control)}
                  onPointerDown={stopControlEvent}
                  onMouseDown={stopControlEvent}
                  onTouchStart={stopControlEvent}
                  onInput={e => draftStarValue(control, e.currentTarget.value)}
                  onPointerUp={e => commitStarValue(control, e.currentTarget.value)}
                  onPointerCancel={e => commitStarValue(control, e.currentTarget.value)}
                  onMouseUp={e => commitStarValue(control, e.currentTarget.value)}
                  onTouchEnd={e => commitStarValue(control, e.currentTarget.value)}
                  onBlur={e => commitStarValue(control, e.currentTarget.value)}
                  onKeyUp={e => {
                    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter"].includes(e.key)) commitStarValue(control, e.currentTarget.value);
                  }}
                  aria-label={control.label}
                />
                <button type="button" className="star-control-step" onClick={() => nudgeStarValue(control, 1)} aria-label={`Increase ${control.label}`}>+</button>
              </div>
              <input
                className="star-control-number"
                type="number"
                min={control.min}
                max={control.max}
                step={control.step}
                value={displayStarValue(control)}
                onPointerDown={stopControlEvent}
                onMouseDown={stopControlEvent}
                onTouchStart={stopControlEvent}
                onChange={e => commitStarValue(control, e.currentTarget.value)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  function CardEditor({ card }) {
    if (!card) return <div className="empty-panel">Alege sau creează un card.</div>;
    return (
      <div className="card-editor">
        <div className="card-editor-previews">
          <div><div className="card-preview-label">Front</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="front" showLayoutZones={true} renderContext={cardPreviewRenderContext} /></div></div>
          <div><div className="card-preview-label">Back</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="back" showLayoutZones={true} renderContext={cardPreviewRenderContext} /></div></div>
        </div>
        <div className="card-editor-controls">
        {CardLayoutEditor({ card })}
        <label>Name<input value={card.name} onChange={e => updateCardField(card.id, "name", e.target.value)} /></label>
        <div className="card-edit-section compact-color-row"><strong>Header Front</strong>{renderColorPicker(card, "headerFront", "Color")}{renderTextStyleControls(card, "headerFront", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Front</strong>{renderColorPicker(card, "positionFront", "Color")}{renderTextStyleControls(card, "positionFront", false, { panelAlign: "front" })}</div><select value={card.position} onChange={e => updateCardField(card.id, "position", e.target.value)}>{CARD_POSITION_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
        <StarMenuEditor card={card} />
        <div className="card-edit-section compact-color-row"><strong>Header Back</strong>{renderColorPicker(card, "headerBack", "Color")}{renderTextStyleControls(card, "headerBack", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Back</strong>{renderColorPicker(card, "positionBack", "Color")}{renderTextStyleControls(card, "positionBack", false, { panelAlign: "front" })}</div><select value={card.position} onChange={e => updateCardField(card.id, "position", e.target.value)}>{CARD_POSITION_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Attributes</strong></div>{SectionTitleEditor({ card, titleKey: "attributes", colorKey: "attributesTitle", label: "Title" })}{AttributeListEditor({ card, section: "passiveAttributes", title: "Attributes", hideHeader: true, toolbarLeft: <>{renderColorPicker(card, "attributes", "Text Color")}{renderTextStyleControls(card, "attributes", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "attributesValue", "Numbers Color")}{renderTextStyleControls(card, "attributesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</> })}</div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Bonuses</strong></div>{SectionTitleEditor({ card, titleKey: "bonuses", colorKey: "bonusesTitle", label: "Title" })}{AttributeListEditor({ card, section: "bonuses", title: "Bonuses", hideHeader: true, toolbarLeft: <>{renderColorPicker(card, "bonuses", "Text Color")}{renderTextStyleControls(card, "bonuses", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "bonusesValue", "Numbers Color")}{renderTextStyleControls(card, "bonusesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</> })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Preferred Foot</strong>{renderColorPicker(card, "preferredFoot", "Color")}{renderTextStyleControls(card, "preferredFoot", false, { panelAlign: "left", buttonLabel: "Text", hideLine: true, fontSizeMin: 20 })}</div><select value={PREFERRED_FOOT_OPTIONS.includes(card.preferredFoot) ? card.preferredFoot : "Right"} onChange={e => updateCardField(card.id, "preferredFoot", e.target.value)}>{PREFERRED_FOOT_OPTIONS.map(foot => <option key={foot} value={foot}>{foot}</option>)}</select></div>
        <div className="card-edit-section special-ability-editor"><div className="card-edit-section-title"><strong>Special Ability</strong></div>{SectionTitleEditor({ card, titleKey: "specialAbility", colorKey: "specialAbilityTitle", label: "Title" })}<div className="special-text-toolbar">{renderColorPicker(card, "specialAbility", "Text Color")}{renderTextStyleControls(card, "specialAbility", false, { panelAlign: "left", inlinePanel: true })}</div><textarea className="special-ability-textarea" value={card.specialAbility || ""} onChange={e => updateCardField(card.id, "specialAbility", e.target.value)} placeholder="Write special ability text..." /></div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Defensive Area</strong>{renderColorPicker(card, "defensiveArea", "Grid")}{renderColorPicker(card, "defensiveAreaActive", "Selected Area")}<DefensiveGridAdjustControl card={card} /><OpponentGoalTextControl card={card} /></div>{SectionTitleEditor({ card, titleKey: "defensiveArea", colorKey: "defensiveAreaTitle", label: "Title" })}{DefensiveAreaEditor({ card })}</div>
        </div>
      </div>
    );
  }

  function CardsPanel() {
    const editingCard = editingCardId ? cardById[editingCardId] : null;
    const teamKey = cardsView === "red" ? "red" : "blue";
    const themeOptions = editingCard && hasCustomGraphics(editingCard) ? [...CARD_THEMES, CUSTOM_CARD_THEME] : CARD_THEMES;
    const selectedTheme = editingCard ? getCardTheme(editingCard, cardState.theme) : "Style 1";

    const sortCardsByPosition = () => {
      const positionRank = new Map(CARD_POSITION_OPTIONS.map((position, index) => [position, index]));
      updateCardState(prev => ({
        ...prev,
        cards: [...(prev.cards || [])].map((card, index) => ({ card, index })).sort((a, b) => {
          const rankA = positionRank.has(a.card.position) ? positionRank.get(a.card.position) : 999;
          const rankB = positionRank.has(b.card.position) ? positionRank.get(b.card.position) : 999;
          if (rankA !== rankB) return rankA - rankB;
          return a.index - b.index;
        }).map(entry => entry.card),
      }));
    };

    return (
      <div className="cards-panel">
        <div className="cards-panel-head"><strong>Player Cards</strong><div>
          <select value={selectedTheme} onChange={e => setCardThemeSelection(editingCardId, e.target.value)} disabled={!editingCardId}>{themeOptions.map(theme => <option key={theme} value={theme}>{theme}</option>)}</select>
          <select value={graphicImportSide} onChange={e => setGraphicImportSide(e.target.value)} disabled={!editingCardId} title="Choose which side to import"><option value="front">Front</option><option value="back">Back</option><option value="both">Both</option></select>
          <button onClick={startGraphicImport} disabled={!editingCardId}>Import Graphic</button>
          <button onClick={deleteSelectedGraphic} disabled={!editingCardId || !hasCustomGraphics(editingCard)}>Delete Graphic</button>
          <select value={exportCardId} onChange={e => setExportCardId(e.target.value)} disabled={!cardState.cards.length}>{cardState.cards.length === 0 ? <option value="">No cards</option> : cardState.cards.map(card => <option key={card.id} value={card.id}>{card.name} ({card.position})</option>)}</select>
          <button onClick={exportSelectedCard}>Export Selected JSON</button>
          <label className="import-btn">Import JSON<input type="file" accept="application/json" onChange={e => { importCardBackup(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <button onClick={() => exportSelectedCardPng("front")} disabled={!cardState.cards.length}>Export Front PNG</button>
          <button onClick={() => exportSelectedCardPng("back")} disabled={!cardState.cards.length}>Export Back PNG</button>
          <input ref={graphicFrontInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden-file-input" onChange={e => { handleFrontGraphicFile(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={graphicBackInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden-file-input" onChange={e => { handleBackGraphicFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => setCardsPanelOpen(false)}>×</button></div></div>
        <div className="cards-tabs"><button className={cardsView === "library" ? "toggle-on" : ""} onClick={() => setCardsView("library")}>Card Library</button><button className={cardsView === "blue" ? "toggle-on" : ""} onClick={() => setCardsView("blue")}>Blue Team</button><button className={cardsView === "red" ? "toggle-on" : ""} onClick={() => setCardsView("red")}>Red Team</button></div>
        {cardsView === "library" ? (
          <div className="cards-layout">
            <div className="card-library-list"><div className="card-library-actions"><button className="create-card-btn" onClick={() => createCardFromPosition("ST")}>+ Create</button><button className="sort-card-btn" onClick={sortCardsByPosition} disabled={cardState.cards.length < 2}>Sort</button><select className="filter-card-select" value={libraryPositionFilter} onChange={e => setLibraryPositionFilter(e.target.value)} disabled={cardState.cards.length === 0}><option value="ALL">Filter: All</option>{libraryPositionOptions.map(position => <option key={position} value={position}>{position}</option>)}</select></div>{visibleLibraryCards.map(card => <div key={card.id} className={`library-row ${editingCardId === card.id ? "selected" : ""}`} onClick={() => setEditingCardId(card.id)}><span><b>{card.name}</b><small>{card.position}</small></span><div><button onClick={(e) => { e.stopPropagation(); cloneCard(card.id); }}>Clone</button><button onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}>Delete</button></div></div>)}{visibleLibraryCards.length === 0 && <div className="library-empty">No cards for this filter.</div>}</div>
            {CardEditor({ card: editingCard })}
          </div>
        ) : (
          <div className={`team-roster ${teamKey}`}>
            <div className="roster-title">Starting IX</div>
            <div className="team-layout">{rosterSlots[teamKey].starting.map((slot) => <div key={slot.id} className="team-slot"><div><strong>{slot.position}</strong>{slot.cardId && <small>{cardById[slot.cardId]?.name || "Missing card"}</small>}</div><div className="slot-actions"><button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => setAssignTarget({ type: "team", team: teamKey, pieceId: slot.pieceId })}>Assign</button>{slot.cardId && <>{!sessionCode && <button onClick={() => setEditingCardId(slot.cardId) || setCardsView("library")}>Edit</button>}<button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => removePieceCard(slot.pieceId)}>Remove</button></>}</div></div>)}</div>
            <div className="roster-title substitutes-title">Substitutes</div>
            <div className="team-layout substitutes-layout">{rosterSlots[teamKey].substitutes.map((slot) => <div key={slot.id} className="team-slot substitute"><div><strong>{slot.position}</strong>{slot.cardId && <small>{cardById[slot.cardId]?.name || "Missing card"}</small>}</div><div className="slot-actions"><button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => setAssignTarget({ type: "team", team: teamKey, pieceId: slot.pieceId })}>Assign</button>{slot.cardId && <>{!sessionCode && <button onClick={() => setEditingCardId(slot.cardId) || setCardsView("library")}>Edit</button>}<button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => removePieceCard(slot.pieceId)}>Remove</button></>}</div></div>)}</div>
          </div>
        )}
      </div>
    );
  }

  function AssignCardModal() {
    if (!assignTarget) return null;
    const assignCards = visibleAssignCards || [];
    const selectedPreviewCard = assignCards.find(card => card.id === assignPreviewCardId) || assignCards[0] || null;
    const getAssignedTeamForCard = (cardId) => {
      const assignedPiece = (pieces || []).find(piece => piece.cardId === cardId && piece.team !== "BALL");
      if (!assignedPiece) return null;
      if (assignedPiece.team === "A") return "blue";
      if (assignedPiece.team === "B") return "red";
      return "assigned";
    };
    const renderAssignStars = (card) => {
      const count = Math.max(0, Math.min(5, Number(normalizeFrontStars(card?.starsFront).count) || 0));
      return count ? "★".repeat(count) : "—";
    };
    return (
      <div className="modal-backdrop" onPointerDown={() => setAssignTarget(null)}>
        <div className="assign-modal assign-modal-wide" onPointerDown={e => e.stopPropagation()}>
          <div className="modal-title"><strong>Assign Card</strong><button className="icon-btn" onClick={() => setAssignTarget(null)}><X size={18} /></button></div>
          {assignCards.length === 0 ? (
            <p>Nu există carduri încă. Creează unul în Card Library.</p>
          ) : (
            <div className="assign-picker-layout">
              <div className="assign-list-panel">
                <div className="assign-card-actions">
                  <button type="button" className="sort-card-btn" onClick={() => setAssignSortByPosition(true)} disabled={(activeAssignCards || []).length < 2}>Sort</button>
                  <select className="filter-card-select" value={assignPositionFilter} onChange={e => setAssignPositionFilter(e.target.value)} disabled={(activeAssignCards || []).length === 0}>
                    <option value="ALL">Filter: All</option>
                    {assignPositionOptions.map(position => <option key={position} value={position}>{position}</option>)}
                  </select>
                </div>
                <div className="assign-list">
                {assignCards.map(card => {
                  const assignedTeam = getAssignedTeamForCard(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`assign-card-row ${assignPreviewCardId === card.id ? "selected" : ""}`}
                      onClick={() => { setAssignPreviewCardId(card.id); setAssignPreviewSide("front"); }}
                    >
                      <span className={`assign-status-dot ${assignedTeam || "free"}`} aria-hidden="true" />
                      <span className="assign-card-row-main"><b>{card.name}</b><small>{card.position}</small></span>
                      <span className="assign-card-stars" aria-label={`${renderAssignStars(card)} stars`}>{renderAssignStars(card)}</span>
                    </button>
                  );
                })}
                  {assignCards.length === 0 && <div className="library-empty">No cards for this filter.</div>}
                </div>
              </div>
              <div className="assign-preview-panel">
                {selectedPreviewCard ? (
                  <>
                    <div className="assign-preview-card-shell">
                      <CardPreview card={selectedPreviewCard} team="neutral" side={assignPreviewSide} renderContext={cardPreviewRenderContext} />
                    </div>
                    <div className="assign-preview-actions">
                      <button type="button" onClick={() => setAssignPreviewSide(side => side === "front" ? "back" : "front")}>Flip</button>
                      <button type="button" className="assign-confirm-btn" onClick={() => assignCard(selectedPreviewCard.id)}>Assign</button>
                    </div>
                  </>
                ) : (
                  <div className="assign-empty-preview">Alege un card din listă.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }


  function movementAxisSymbol(axis) {
    if (axis === "horizontal") return "↔";
    if (axis === "vertical") return "↕";
    if (axis === "diagonal-nw-se" || axis === "diagonal-positive") return "⤡";
    if (axis === "diagonal-ne-sw" || axis === "diagonal-negative") return "⤢";
    return "";
  }

  const interactionState = deriveInteractionState({
    pieces,
    actionResolution,
    actionContinuation,
    matchActionState,
    canControlResolution: canControlActiveResolution(actionResolution),
    canControlContinuation: canControlBonusContinuation(actionContinuation),
    canControlNormalMove: !sessionCode || myTeam === matchActionState.activeMovement?.team || isSessionHost,
  });
  const activeInteractionPieceId = interactionState.activePieceId;
  const inspectorAnchorPieceId = activeInteractionPieceId || selectedId || pendingInteractionPieceId;
  useEffect(() => {
    if (activeInteractionPieceId && pendingInteractionPieceId === activeInteractionPieceId) {
      setPendingInteractionPieceId(null);
    }
  }, [activeInteractionPieceId, pendingInteractionPieceId]);
  useEffect(() => {
    if (inspectorAnchorPieceId) {
      setInspectedPieceId(inspectorAnchorPieceId);
      return;
    }
    setHoveredCell(null);
    setInspectedPieceId(null);
  }, [inspectorAnchorPieceId]);
  const selectedPiece = pieces.find(p => p.id === (activeInteractionPieceId || selectedId));
  const movementPreview = useMemo(() => {
    if (!selectedPiece || !hoveredCell || selectedPiece.team === "BALL" || !canPreviewMovementForPiece(selectedPiece)) return null;
    const groupMove = !sessionCode && gameMode === "match" ? matchActionState.groupMove : null;
    if (groupMove?.active) {
      const state = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const result = evaluateGroupMovePlayer(state, singlePlayerMatchContext(), {
        payload: { pieceId: selectedPiece.id, x: hoveredCell.x, y: hoveredCell.y },
      });
      if (!result.accepted) return { ...result, legal: false, label: "🚫" };
      const axisIcon = movementAxisSymbol(result.geometry.axis);
      return {
        ...result,
        legal: true,
        label: `${axisIcon ? `${axisIcon} ` : ""}GM ${result.geometry.distance} / ${groupMove.maxDistance}`,
      };
    }
    const threeTwo = getThreeTwoEligibility(selectedPiece, hoveredCell.x, hoveredCell.y);
    if (threeTwo.eligible) return { ...threeTwo, legal: true, label: "3/2" };
    const result = evaluateMove(selectedPiece, hoveredCell.x, hoveredCell.y);
    const axisIcon = movementAxisSymbol(result.geometry.axis);
    if (gameMode === "editor") {
      return {
        ...result,
        label: result.geometry.kind === "mixed" ? "—" : `${axisIcon ? `${axisIcon} ` : ""}${result.geometry.cost ?? "—"}`,
      };
    }
    if (!result.legal) {
      return {
        ...result,
        label: result.reason === "speed"
          ? `⚠ ${result.moveCost ?? result.geometry.cost} / ${result.remaining}`
          : "🚫",
      };
    }
    return { ...result, label: `${axisIcon ? `${axisIcon} ` : ""}${result.moveCost ?? result.geometry.cost} / ${result.remaining}` };
  }, [selectedPiece, hoveredCell, gameMode, movementStateByPieceId, matchActionState, trackerUsedActions, cardState, sessionCardsById, sessionLibraryById, pieces, sessionCode, myTeam, cardVisibilityMode, cardRevealPermissions, user?.uid]);

  const groupMovePieceStatusById = useMemo(() => {
    const groupMove = !sessionCode && gameMode === "match" ? matchActionState.groupMove : null;
    if (!groupMove?.active) return {};
    const state = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const statuses = {};
    for (const piece of pieces) {
      if (piece.team === "BALL" || teamKeyForPiece(piece) !== groupMove.team) continue;
      if (Number(piece.x) < groupMove.zoneStartX || Number(piece.x) >= groupMove.zoneStartX + groupMove.zoneLength) continue;
      const eligibility = evaluateGroupMovePieceEligibility(state, { payload: { pieceId: piece.id } });
      statuses[piece.id] = eligibility.accepted ? "eligible" : "ineligible";
    }
    return statuses;
  }, [gameMode, matchActionState, pieces, sessionCode, movementStateByPieceId, trackerUsedActions]);

  const selectedMovementState = selectedPiece ? movementStateByPieceId[selectedPiece.id] : null;
  const selectedMovementAxis = selectedPiece && selectedPiece.team !== "BALL" && canPreviewMovementForPiece(selectedPiece) && !selectedMovementState?.movementEnded
    ? selectedMovementState?.axis || null
    : null;

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
    const dxSigned = measureEnd.x - measureStart.x;
    const dySigned = measureEnd.y - measureStart.y;
    const dx = Math.abs(dxSigned);
    const dy = Math.abs(dySigned);
    const rawCells = Math.sqrt(dx * dx + dy * dy);
    const cells = Math.max(0, rawCells - 1);
    return {
      mode: measureType,
      dx,
      dy,
      rawCells,
      cells,
      cellsLabel: cells.toFixed(2),
    };
  }, [measureStart, measureEnd, measureType]);

  const rulerMarkers = useMemo(() => {
    if (!measureStart || !measureEnd || !measureInfo || measureInfo.rawCells <= 0) return [];
    const dx = measureEnd.x - measureStart.x;
    const dy = measureEnd.y - measureStart.y;
    const rawLength = measureInfo.rawCells;
    const measuredLength = measureInfo.cells;
    const ux = dx / rawLength;
    const uy = dy / rawLength;
    const tick = 0.45;
    const raw = [
      { type: "pass", label: String(passMark), value: Number(passMark) },
      { type: "shot", label: String(shotMark), value: Number(shotMark) },
    ];

    return raw
      .filter(mark => Number.isFinite(mark.value) && mark.value > 0 && mark.value <= measuredLength)
      .map((mark, index) => {
        const visualDistance = mark.value + 1;
        const x = measureStart.x + ux * visualDistance;
        const y = measureStart.y + uy * visualDistance;
        return {
          ...mark,
          key: `${mark.type}-${mark.value}-${index}`,
          x,
          y,
          x1: x - uy * tick,
          y1: y + ux * tick,
          x2: x + uy * tick,
          y2: y - ux * tick,
          labelX: x + uy * (tick + 0.22),
          labelY: y - ux * (tick + 0.22),
        };
      });
  }, [measureStart, measureEnd, measureInfo, passMark, shotMark]);

  function getRulerPointFromClient(clientX, clientY) {
    const pitch = pitchRef.current;
    const rect = pitch.getBoundingClientRect();
    const localX = (clientX - rect.left) / zoom;
    const localY = (clientY - rect.top) / zoom;
    const rawX = localX / settings.cellSize;
    const rawY = localY / settings.cellSize;

    const isFirstPoint = !measureStart || measureEnd;
    const snapCorner = measureType === "corner" || (measureType === "cornerCenter" && isFirstPoint);

    if (snapCorner) {
      return {
        x: clampBoardXForY(Math.round(rawX), Math.round(rawY), settings),
        y: clampBoardY(Math.round(rawY), settings),
      };
    }

    const y = clampBoardY(Math.floor(rawY), settings);
    const x = clampBoardXForY(Math.floor(rawX), y, settings);
    return {
      x: x + 0.5,
      y: y + 0.5,
    };
  }

  function getRulerPointFromPointer(e) {
    return getRulerPointFromClient(e.clientX, e.clientY);
  }

  function startGroupMoveZoneDrag(event) {
    const draft = groupMoveZoneDraft;
    const point = draft ? gridPointFromClient(event.clientX, event.clientY) : null;
    if (!draft || !point) return;
    groupMoveZoneDragRef.current = {
      pointerId: event.pointerId,
      originStartX: draft.zoneStartX,
      pointerStartX: point.x,
    };
  }

  function moveGroupMoveZoneDrag(event) {
    const drag = groupMoveZoneDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = gridPointFromClient(event.clientX, event.clientY);
    if (!point) return;
    setGroupMoveZoneDraft(current => {
      if (!current) return current;
      const maxStart = Math.max(0, settings.cols - current.zoneLength);
      return {
        ...current,
        zoneStartX: clamp(drag.originStartX + point.x - drag.pointerStartX, 0, maxStart),
      };
    });
  }

  function endGroupMoveZoneDrag(event) {
    if (groupMoveZoneDragRef.current?.pointerId !== event.pointerId) return;
    groupMoveZoneDragRef.current = null;
  }

  function confirmGroupMoveZone() {
    const draft = groupMoveZoneDraft;
    if (!draft || sessionCode) return false;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      command: {
        id: createActionEventId(`group_move_zone_${draft.team}`),
        type: GAME_COMMAND_TYPE.GROUP_MOVE_ZONE_CONFIRMED,
        payload: { team: draft.team, zoneStartX: draft.zoneStartX },
      },
      label: `${draft.team === "blue" ? "Blue" : "Red"} Group Move: zone confirmed`,
    });
    if (!dispatched.result.accepted) {
      setIllegalMoveNotice({ reason: dispatched.result.reason });
      return false;
    }
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    setGroupMoveZoneDraft(null);
    return true;
  }

  function buildSharedRulerState(overrides = {}) {
    return {
      active: true,
      ownerUid: user?.uid || sharedRulerOwnerUid || "",
      ownerClientId: clientIdRef.current,
      ownerTeam: myTeam === "blue" || myTeam === "red" ? myTeam : sharedRulerOwnerTeam || "",
      measureType,
      passMark,
      shotMark,
      start: measureStart,
      end: measureEnd,
      ...overrides,
      updatedAt: serverTimestamp(),
    };
  }

  async function activateSharedRuler() {
    if (!sessionCode) {
      setMeasureMode(true);
      setMeasureStart(null);
      setMeasureEnd(null);
      return;
    }
    if (!user?.uid || !canUseSharedRuler) return;
    const ref = sessionRef(sessionCode.toUpperCase());
    try {
      await runTransaction(db, async transaction => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Session missing");
        const data = snap.data();
        const current = data.sharedRuler || {};
        const currentOwner = current.ownerUid || "";
        const ownerLastSeen = timestampToMillis(data.participants?.[currentOwner]?.lastSeen);
        const ownerIsActive = !!currentOwner && Date.now() - ownerLastSeen < 40000;
        if (current.active && currentOwner !== user.uid && ownerIsActive) {
          throw new Error("Ruler in use");
        }
        transaction.set(ref, {
          sharedRuler: buildSharedRulerState({ start: null, end: null }),
        }, { merge: true });
      });
      setMeasureMode(true);
      setSharedRulerOwnerUid(user.uid);
      setSharedRulerOwnerTeam(myTeam);
      setMeasureStart(null);
      setMeasureEnd(null);
    } catch (error) {
      console.error(error);
      setSessionStatus(error.message === "Ruler in use" ? "Ruler in use" : "Ruler error");
    }
  }

  async function deactivateSharedRuler() {
    if (sessionEndingRef.current) return;
    if (!sessionCode) {
      setMeasureMode(false);
      setMeasureStart(null);
      setMeasureEnd(null);
      return;
    }
    if (!isSharedRulerOwner || !user?.uid) return;
    try {
      await updateDoc(sessionRef(sessionCode.toUpperCase()), {
        sharedRuler: {
          active: false,
          ownerUid: "",
          ownerClientId: "",
          ownerTeam: "",
          measureType,
          passMark,
          shotMark,
          start: null,
          end: null,
          updatedAt: serverTimestamp(),
        },
      });
      setMeasureMode(false);
      setSharedRulerOwnerUid("");
      setSharedRulerOwnerTeam("");
      setMeasureStart(null);
      setMeasureEnd(null);
    } catch (error) {
      console.error("Could not close shared ruler", error);
      setSessionStatus("Could not close ruler");
    }
  }

  function syncSharedRuler(overrides = {}) {
    if (!sessionCode || sessionEndingRef.current || !isSharedRulerOwner) return;
    updateDoc(sessionRef(sessionCode.toUpperCase()), {
      sharedRuler: buildSharedRulerState(overrides),
    }).catch(error => {
      if (!sessionEndingRef.current && error?.code !== "not-found") console.error("Shared ruler sync failed", error);
    });
  }

  function setSharedRulerType(nextType) {
    if (sharedRulerReadOnly) return;
    setMeasureType(nextType);
    setMeasureStart(null);
    setMeasureEnd(null);
    syncSharedRuler({ measureType: nextType, start: null, end: null });
  }

  function applyRulerPoint(point) {
    if (sharedRulerReadOnly) return;
    if (!measureStart || (measureStart && measureEnd)) {
      setMeasureStart(point);
      setMeasureEnd(null);
      syncSharedRuler({ start: point, end: null });
    } else {
      setMeasureEnd(point);
      syncSharedRuler({ start: measureStart, end: point });
    }
  }

  function onPitchPointerDown(e) {
    if (groupMoveZoneDraft) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (measureMode) {
      if (e.pointerType === "touch") return;
      e.preventDefault();
      e.stopPropagation();
      pitchRef.current?.setPointerCapture?.(e.pointerId);
      measureInteractionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originPanX: panOffset.x,
        originPanY: panOffset.y,
        point: getRulerPointFromPointer(e),
        panning: false,
      };
    }
  }

  function onPitchPointerMove(e) {
    const interaction = measureInteractionRef.current;
    if (!interaction || interaction.pointerId !== e.pointerId) return;
    const dx = e.clientX - interaction.startX;
    const dy = e.clientY - interaction.startY;
    if (!interaction.panning && Math.sqrt(dx * dx + dy * dy) > 5) interaction.panning = true;
    if (interaction.panning) {
      e.preventDefault();
      e.stopPropagation();
      setPanOffset({ x: interaction.originPanX + dx, y: interaction.originPanY + dy });
    }
  }

  function onPitchPointerUp(e) {
    if (!measureMode) return;
    const interaction = measureInteractionRef.current;
    if (!interaction || interaction.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (!interaction.panning) applyRulerPoint(interaction.point);
    measureInteractionRef.current = null;
    pitchRef.current?.releasePointerCapture?.(e.pointerId);
  }

  function onPitchPointerCancel(e) {
    if (measureInteractionRef.current?.pointerId === e.pointerId) measureInteractionRef.current = null;
  }

  function canStartBoardPan(e) {
    if (editingPiece) return false;
    if (e.pointerType === "touch") return false;
    const target = e.target;
    if (!target) return false;
    if (target.closest && target.closest(".piece")) return false;
    return target === boardWrapRef.current || target === pitchRef.current || (target.closest && target.closest(".pitch-shell"));
  }

  function startBoardPan(e) {
    if (!canStartBoardPan(e)) return;
    boardWrapRef.current?.setPointerCapture?.(e.pointerId);
    boardPanRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
      panning: false,
    };
  }

  function moveBoardPan(e) {
    const pass = actionResolutionRef.current;
    if (pass?.kind === "pass" && pass.status !== "targeting") {
      setHoveredCell(null);
    } else if ((selectedId || activeInteractionPieceId) && e.pointerType !== "touch") {
      setHoveredCell(gridPointFromClient(e.clientX, e.clientY, { clampToBoard: false }));
    }

    const pan = boardPanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.panning && Math.sqrt(dx * dx + dy * dy) > 5) pan.panning = true;
    if (!pan.panning) return;
    setHoveredCell(null);
    e.preventDefault();
    setPanOffset({ x: pan.originX + dx, y: pan.originY + dy });
  }

  function endBoardPan(e) {
    const pan = boardPanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;

    const wasPanning = pan.panning;
    boardPanRef.current = null;
    if (wasPanning) setHoveredCell(null);
    boardWrapRef.current?.releasePointerCapture?.(e.pointerId);

    if (measureMode || wasPanning) return;
    if (e.pointerType === "touch" && Date.now() < multiTouchUntilRef.current) return;
    if (e.target?.closest?.(".piece")) return;

    // Route badges are the only allowed board click after a pass target is set.
    // This prevents the underlying square from being treated as a player move.
    if (actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "route-selection") return;

    const point = gridPointFromClient(e.clientX, e.clientY);
    if (!point) return;
    if (groupMoveZoneDraft) return;
    if (actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "targeting") {
      if (!canControlActiveResolution(actionResolutionRef.current)) return;
      choosePassTarget(point.x, point.y);
      return;
    }
    if (freeBallActive) {
      moveBallFreelyTo(point.x, point.y);
      return;
    }
    if (selectedId || activeInteractionPieceId) moveSelectedPieceTo(point.x, point.y);
  }

  function onHistoryPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    historyDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: historyPosition.x,
      originY: historyPosition.y,
    };
  }

  function onHistoryPointerMove(e) {
    const drag = historyDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const nextX = drag.originX + (e.clientX - drag.startX);
    const nextY = drag.originY + (e.clientY - drag.startY);
    setHistoryPosition({
      x: clamp(nextX, 0, window.innerWidth - 80),
      y: clamp(nextY, 0, window.innerHeight - 50),
    });
  }

  function onHistoryResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    historyResizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originW: historySize.w,
      originH: historySize.h,
    };
  }

  function onHistoryResizeMove(e) {
    const resize = historyResizeRef.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    setHistorySize({
      w: clamp(resize.originW + (e.clientX - resize.startX), 220, 700),
      h: clamp(resize.originH + (e.clientY - resize.startY), 160, 700),
    });
  }

  function onDicePanelPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const drag = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dicePanelPosition.x,
      originY: dicePanelPosition.y,
    };
    dicePanelDragRef.current = drag;
    setDicePanelDragging(drag);
  }

  function onDicePanelPointerMove(e) {
    const drag = dicePanelDragRef.current;
    if (!drag) return;
    const nextX = drag.originX + (e.clientX - drag.startX);
    const nextY = drag.originY + (e.clientY - drag.startY);
    setDicePanelPosition({
      x: clamp(nextX, 0, window.innerWidth - 80),
      y: clamp(nextY, 0, window.innerHeight - 50),
    });
  }

  function onDicePanelResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const resize = {
      startX: e.clientX,
      startY: e.clientY,
      originW: dicePanelSize.w,
      originH: dicePanelSize.h,
    };
    dicePanelResizeRef.current = resize;
    setDicePanelResizing(resize);
  }

  function onDicePanelResizeMove(e) {
    const resize = dicePanelResizeRef.current;
    if (!resize) return;
    setDicePanelSize({
      w: clamp(resize.originW + (e.clientX - resize.startX), 220, 520),
      h: clamp(resize.originH + (e.clientY - resize.startY), 120, 420),
    });
  }

  useEffect(() => {
    if (replayModeRef.current) return;
    localStorage.setItem("football-board-tracker-settings-v1", JSON.stringify(trackerSettings));
  }, [trackerSettings]);
  useEffect(() => {
    localStorage.setItem("football-board-tracker-position-v1", JSON.stringify(trackerPosition));
  }, [trackerPosition]);
  useEffect(() => {
    localStorage.setItem("football-board-tracker-size-v1", JSON.stringify(trackerSize));
  }, [trackerSize]);

  function onTrackerPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const drag = { startX: e.clientX, startY: e.clientY, originX: trackerPosition.x, originY: trackerPosition.y };
    trackerDragRef.current = drag;
    setTrackerDragging(drag);
  }
  function onTrackerPointerMove(e) {
    const drag = trackerDragRef.current;
    if (!drag) return;
    setTrackerPosition({
      x: clamp(drag.originX + e.clientX - drag.startX, 0, window.innerWidth - 80),
      y: clamp(drag.originY + e.clientY - drag.startY, 0, window.innerHeight - 50),
    });
  }
  function onTrackerResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const resize = { startX: e.clientX, startY: e.clientY, originW: trackerSize.w, originH: trackerSize.h };
    trackerResizeRef.current = resize;
    setTrackerResizing(resize);
  }
  function onTrackerResizeMove(e) {
    const resize = trackerResizeRef.current;
    if (!resize) return;
    const maximumWidth = Math.max(300, window.innerWidth - trackerPosition.x - 8);
    const maximumHeight = Math.max(140, window.innerHeight - trackerPosition.y - 8);
    setTrackerSize({
      w: clamp(resize.originW + e.clientX - resize.startX, 300, maximumWidth),
      h: clamp(resize.originH + e.clientY - resize.startY, 140, maximumHeight),
    });
  }
  function onTrackerPointerUp() {
    trackerDragRef.current = null;
    trackerResizeRef.current = null;
    setTrackerDragging(null);
    setTrackerResizing(null);
  }
  function buildTrackerSnapshot(overrides = {}) {
    return {
      ...normalizeTrackerSnapshot({
        enabled: overrides.enabled ?? trackerSharedEnabled,
        gameStarted: overrides.gameStarted ?? trackerGameStarted,
        startingTeam: overrides.startingTeam ?? trackerStartingTeam,
        currentTurn: overrides.currentTurn ?? trackerCurrentTurn,
        usedActions: overrides.usedActions ?? trackerUsedActions,
        actionLog: overrides.actionLog ?? trackerActionLog,
        matchActionState: overrides.matchActionState ?? matchActionState,
        turnPhase: overrides.turnPhase ?? turnPhase,
        settings: overrides.settings ?? trackerSettings,
      }),
      gameMode: normalizeGameMode(overrides.gameMode ?? gameMode),
      movementStateByPieceId: normalizeMovementState(overrides.movementStateByPieceId ?? movementStateRef.current),
      updatedBy: user?.uid || "",
    };
  }

  async function syncSharedTracker(overrides = {}) {
    if (!sessionCode || sessionEndingRef.current || !isSessionHost) return;
    try {
      await updateDoc(sessionRef(sessionCode), {
        sharedTracker: buildTrackerSnapshot(overrides),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Tracker sync failed", error);
      setSessionStatus("Tracker sync error");
    }
  }

  function setTrackerEnabledForSession(nextEnabled) {
    setTrackerVisible(nextEnabled);
    if (nextEnabled) setTrackerMinimized(false);
  }

  function getTeamActionStatus(team, usedOverride = trackerUsedActions) {
    return trackerActionStatusForTeam(trackerRulesSnapshot({ usedActions: usedOverride }), team, usedOverride);
  }
  function trackerRulesSnapshot(overrides = {}) {
    return {
      gameStarted: overrides.gameStarted ?? trackerGameStarted,
      startingTeam: overrides.startingTeam ?? trackerStartingTeam,
      currentTurn: overrides.currentTurn ?? trackerCurrentTurn,
      usedActions: overrides.usedActions ?? trackerUsedActions,
      actionLog: overrides.actionLog ?? trackerActionLog,
      matchActionState: overrides.matchActionState ?? matchActionState,
      turnPhase: overrides.turnPhase ?? turnPhase,
      settings: overrides.settings ?? trackerSettings,
    };
  }
  function currentTimelineTrackerSnapshot() {
    const timelineState = currentTimelineGameStateSnapshot();
    if (timelineState) return normalizeTrackerSnapshot(timelineState.tracker);
    return normalizeTrackerSnapshot({
      gameStarted: trackerGameStarted,
      startingTeam: trackerStartingTeam,
      currentTurn: trackerCurrentTurn,
      usedActions: trackerUsedActions,
      actionLog: trackerActionLog,
      matchActionState,
      turnPhase,
      settings: trackerSettings,
    });
  }
  function currentTimelineGameStateSnapshot() {
    const timeline = gameTimelineRef.current;
    if (!timeline) return null;
    const state = timelineStateAt(timeline, timeline.cursor);
    return state?.gameMode === "match" ? state : null;
  }
  function isTeamPhaseActive(team) {
    return isTeamActiveForTrackerPhase(trackerRulesSnapshot(), team);
  }
  function phaseBlockReason() {
    return trackerPhaseBlockReason(turnPhase);
  }
  function canUseActionForPiece(piece) {
    return canUseTrackerActionForPiece({
      replay: replayModeRef.current,
      piece,
      gameMode,
      gameStarted: trackerGameStarted,
      sessionActive: Boolean(sessionCode),
      myTeam,
      pieceTeam: pieceTeamKey(piece),
    });
  }
  function canUseFreeModeForPiece(piece) {
    return canUseTrackerFreeModeForPiece({
      replay: replayModeRef.current,
      piece,
      gameMode,
      gameStarted: trackerGameStarted,
      sessionActive: Boolean(sessionCode),
      myTeam,
    });
  }
  async function applyActionStateUpdate(nextLog, nextState, nextUsed) {
    setTrackerActionLog(nextLog); setMatchActionState(nextState); setTrackerUsedActions(nextUsed);
  }

  function setLiveActionResolution(nextResolution) {
    actionResolutionRef.current = nextResolution || null;
    setActionResolution(nextResolution || null);
  }

  function setLiveActionContinuation(nextContinuation) {
    const normalized = normalizeActionContinuation(nextContinuation);
    actionContinuationRef.current = normalized;
    setActionContinuation(normalized);
  }

  function currentBonusContinuationForTeam(team) {
    const continuation = actionContinuationRef.current;
    return continuation?.kind === "bonus-card-action" && continuation.team === team ? continuation : null;
  }

  function canControlBonusContinuation(continuation = actionContinuationRef.current) {
    return canControlBonusAction({ sessionActive: Boolean(sessionCode), myTeam, continuation });
  }

  function canControlActiveResolution(resolution = actionResolutionRef.current) {
    return canControlResolution({ sessionActive: Boolean(sessionCode), myTeam, resolution });
  }

  function isPassPreviewCancellable(pending = actionResolutionRef.current) {
    return pending?.kind === "pass" && ["targeting", "route-selection"].includes(pending.status);
  }

  async function requestHostActionStart({ mode, actionType = null, piece, continuationId = null }) {
    if (!sessionCode || !isSessionGuest || actionStartIntentPendingRef.current || !piece) return false;
    const requestId = createActionEventId(`action_start_${mode}_${piece.id}`);
    setActionStartIntentPending(true);
    actionStartIntentPendingRef.current = true;
    if (["normal-move", "normal-pass"].includes(mode)) setPendingInteractionPieceId(piece.id);
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "actionStartIntent"), {
        requestId,
        status: "pending",
        mode,
        actionType,
        pieceId: piece.id,
        team: pieceTeamKey(piece),
        continuationId,
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        requestedByUid: user?.uid || "",
        requestedByClient: clientIdRef.current,
        requestedAt: serverTimestamp(),
      });
      multiplayerTracerRef.current.multiplayer("ACTION_START_INTENT_SENT", { requestId, mode, actionType, pieceId: piece.id, continuationId });
      return true;
    } catch (error) {
      setActionStartIntentPending(false);
      actionStartIntentPendingRef.current = false;
      setPendingInteractionPieceId(null);
      console.error("Action start intent failed", error);
      return false;
    }
  }

  function buildPassTargetingResolution(piece, { continuationId = null } = {}) {
    const team = pieceTeamKey(piece);
    const continuationTransaction = continuationId && actionContinuationRef.current?.id === continuationId
      ? transactionForActionState(actionContinuationRef.current)
      : null;
    const id = `pass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id, kind: "pass", status: "targeting", passerId: piece.id, team, target: null, cornerId: null,
      naturalOnePenalty: 0, interceptorIndex: 0, pendingDecision: null, pendingRoll: null,
      consumedEventIds: [], lastRollEvent: null, continuationId,
      transaction: continuationTransaction || createActionTransaction({
        id, actionType: "PASS", team, source: "pass", undoMode: ACTION_TRANSACTION_UNDO_MODE.STEP,
      }),
    };
  }

  function beginBonusCardAction(type, piece, { fromHostIntent = false, startPassAtomically = false } = {}) {
    const team = pieceTeamKey(piece);
    const current = currentBonusContinuationForTeam(team);
    if (sessionCode && isSessionGuest && !fromHostIntent) {
      void requestHostActionStart({ mode: "bonus-action", actionType: type, piece, continuationId: current?.id || null });
      return null;
    }
    const next = beginContinuationAction(current, { type, pieceId: piece.id });
    if (!next || type === "GROUP_MOVE" || type === "FREE") return null;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const pending = startPassAtomically ? buildPassTargetingResolution(piece, { continuationId: next.id }) : null;
    setLiveActionContinuation(next);
    if (pending) {
      setLiveActionResolution(pending);
      setSelectedId(piece.id);
      setHoveredCell(null);
    }
    recordTimelineTransition({
      type: pending ? "BONUS_PASS_TARGETING_STARTED" : "BONUS_CARD_ACTION_STARTED",
      label: pending
        ? `${team === "blue" ? "Blue" : "Red"} bonus PASS: choose target for ${getPieceDisplayLabel(piece)}`
        : `${team === "blue" ? "Blue" : "Red"} bonus ${type.replace("_", " ")}: ${getPieceDisplayLabel(piece)}`,
      team, groupId: current.id, before,
      after: mergeTimelineGameState(before, { actionContinuation: next, ...(pending ? { actionResolution: pending } : {}) }),
      allowNoop: true,
    });
    return next;
  }

  function startBonusMove(piece) {
    if (sessionCode) return beginBonusCardAction("MOVE", piece);
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      command: { id: createActionEventId(`bonus_move_start_${piece.id}`), type: GAME_COMMAND_TYPE.BONUS_MOVE_STARTED, payload: { pieceId: piece.id } },
      label: `${pieceTeamKey(piece) === "blue" ? "Blue" : "Red"} bonus MOVE: ${getPieceDisplayLabel(piece)}`,
    });
    if (!dispatched.result.accepted) return false;
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    setSelectedId(piece.id);
    setHoveredCell(null);
    return true;
  }

  function cancelBonusMove(piece) {
    if (sessionCode) return false;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      command: { id: createActionEventId(`bonus_move_cancel_${piece.id}`), type: GAME_COMMAND_TYPE.BONUS_MOVE_CANCELLED, payload: { pieceId: piece.id } },
      label: `${pieceTeamKey(piece) === "blue" ? "Blue" : "Red"} bonus MOVE cancelled: ${getPieceDisplayLabel(piece)}`,
    });
    if (!dispatched.result.accepted) return false;
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    setSelectedId(null);
    setHoveredCell(null);
    return true;
  }

  function commitBonusMoveSegment(piece, x, y) {
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      command: { id: createActionEventId(`bonus_move_commit_${piece.id}`), type: GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED, payload: { pieceId: piece.id, x: Number(x), y: Number(y) } },
      label: `${pieceTeamKey(piece) === "blue" ? "Blue" : "Red"} bonus MOVE: ${getPieceDisplayLabel(piece)} → ${toCoord(x, y)}`,
    });
    if (!dispatched.result.accepted) {
      if (dispatched.result.reason !== "same") setIllegalMoveNotice({ reason: dispatched.result.reason });
      return false;
    }
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    return true;
  }

  function commitDirectBoardBonusMove(piece, x, y) {
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const team = pieceTeamKey(piece);
    const startId = createActionEventId(`bonus_move_start_${piece.id}`);
    const dispatched = dispatchSinglePlayerGameCommandSequence({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      commands: [
        {
          command: { id: startId, type: GAME_COMMAND_TYPE.BONUS_MOVE_STARTED, payload: { pieceId: piece.id } },
          label: `${team === "blue" ? "Blue" : "Red"} bonus MOVE: ${getPieceDisplayLabel(piece)}`,
        },
        {
          command: { id: createActionEventId(`bonus_move_commit_${piece.id}`), type: GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED, payload: { pieceId: piece.id, x: Number(x), y: Number(y) } },
          label: `${team === "blue" ? "Blue" : "Red"} bonus MOVE: ${getPieceDisplayLabel(piece)} → ${toCoord(x, y)}`,
        },
      ],
    });
    if (!dispatched.accepted) {
      if (dispatched.result.reason !== "same") setIllegalMoveNotice({ reason: dispatched.result.reason });
      return false;
    }
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    return true;
  }

  function completeBonusCardAction({ actionType, pieceId } = {}) {
    const current = actionContinuationRef.current;
    const next = completeContinuationAction(current);
    if (!next) return false;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    setLiveActionContinuation(next);
    setSelectedId(null);
    setHoveredCell(null);
    recordTimelineTransition({
      type: "BONUS_CARD_ACTION_COMPLETED",
      label: `${next.team === "blue" ? "Blue" : "Red"} bonus ${(actionType || next.actionType || "card action").replace("_", " ")} complete — END B.A. to continue`,
      team: next.team, groupId: next.id, before,
      after: mergeTimelineGameState(before, { actionContinuation: next }), allowNoop: true,
    });
    return true;
  }

  function passTimelineGroupId(pending) {
    const continuationId = pending?.bonusContinuationId || pending?.continuationId;
    const continuation = continuationId && actionContinuationRef.current?.id === continuationId ? actionContinuationRef.current : null;
    return continuation?.id || pending?.entryId || null;
  }

  function passPendingDecision(pending, interceptorIndex = pending?.interceptorIndex || 0) {
    const candidates = interceptorChoiceCandidates(pending?.plan?.interceptors, interceptorIndex);
    if (candidates.length < 2) return null;
    const team = teamKeyForPiece(candidates[0]?.defender);
    return createPendingDecision({
      id: createActionEventId(`decision_${pending.id}_${interceptorIndex}`), type: "CHOOSE_INTERCEPTOR", team,
      options: candidates.map(item => ({ id: String(item?.defender?.id || ""), defenderId: String(item?.defender?.id || "") })),
      context: { actionId: pending.id, interceptorIndex },
    });
  }

  function passPendingRoll(pending, interceptorIndex = pending?.interceptorIndex || 0) {
    const interceptor = pending?.plan?.interceptors?.[interceptorIndex];
    const team = teamKeyForPiece(interceptor?.defender);
    if (!interceptor || !team) return null;
    return createPendingRoll({
      requestId: createActionEventId(`roll_request_${pending.id}_${interceptorIndex}`), actionId: pending.id, team, dieType: 20,
      subjectId: interceptor?.defender?.id, reactionIndex: interceptorIndex, context: { actionType: "PASS", reactionType: "INTERCEPTION" },
    });
  }

  function passWithNextInput(pending, interceptorIndex = pending?.interceptorIndex || 0) {
    const decision = passPendingDecision(pending, interceptorIndex);
    return decision ? withPendingDecision({ ...pending, interceptorIndex }, decision) : withPendingRoll({ ...pending, interceptorIndex }, passPendingRoll(pending, interceptorIndex));
  }

  function beginPassTargeting(piece, { continuationId = null, fromHostIntent = false } = {}) {
    if (sessionCode && isSessionGuest && !fromHostIntent) {
      void requestHostActionStart({ mode: "normal-pass", actionType: "PASS", piece, continuationId: null });
      return null;
    }
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const team = pieceTeamKey(piece);
      const passId = createActionEventId(`pass_start_${piece.id}`);
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`pass_start_command_${piece.id}`),
          type: GAME_COMMAND_TYPE.PASS_STARTED,
          payload: { pieceId: piece.id, passId },
        },
        label: `${team === "blue" ? "Blue" : "Red"}${continuationId ? " bonus" : ""} PASS: choose target for ${getPieceDisplayLabel(piece)}`,
      });
      if (!dispatched.result.accepted) return null;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(piece.id);
      setHoveredCell(null);
      return dispatched.state.actionResolution;
    }
    const pending = buildPassTargetingResolution(piece, { continuationId });
    const team = pieceTeamKey(piece);
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    setLiveActionResolution(pending);
    setSelectedId(piece.id);
    setHoveredCell(null);
    recordTimelineTransition({
      type: "PASS_TARGETING_STARTED",
      label: `${team === "blue" ? "Blue" : "Red"} PASS: choose target for ${getPieceDisplayLabel(piece)}`,
      team, groupId: passTimelineGroupId(pending), before,
      after: mergeTimelineGameState(before, { actionResolution: pending }), allowNoop: true,
    });
    return pending;
  }

  function commitPassCancellation(pending = actionResolutionRef.current) {
    if (!isPassPreviewCancellable(pending)) return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`pass_cancel_${pending.id}`),
          type: GAME_COMMAND_TYPE.PASS_CANCELLED,
          payload: { passId: pending.id },
        },
        label: "Pass cancelled before route confirmation",
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(null);
      setHoveredCell(null);
      return true;
    }
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const currentContinuation = actionContinuationRef.current;
    const nextContinuation = pending.continuationId && currentContinuation?.id === pending.continuationId
      ? { ...currentContinuation, status: CONTINUATION_STATUS.READY, actionType: null, pieceId: null }
      : currentContinuation;
    setLiveActionResolution(null);
    setLiveActionContinuation(nextContinuation);
    setSelectedId(null);
    setHoveredCell(null);
    recordTimelineTransition({
      type: "PASS_CANCELLED",
      label: "Pass cancelled before route confirmation",
      team: pending.team,
      groupId: passTimelineGroupId(pending),
      before,
      after: mergeTimelineGameState(before, { actionResolution: null, actionContinuation: nextContinuation }),
      allowNoop: true,
    });
    return true;
  }

  async function requestHostPassCancellation(pending) {
    if (!sessionCode || !isSessionGuest || passCancelIntentPendingRef.current) return false;
    const requestId = createActionEventId(`pass_cancel_${pending.id}`);
    setPassCancelIntentPending(true);
    passCancelIntentPendingRef.current = true;
    setHoveredCell(null);
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "passCancelIntent"), {
        requestId,
        actionId: pending.id,
        team: pending.team,
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        requestedBy: user?.uid || clientIdRef.current,
        requestedByClient: clientIdRef.current,
        status: "pending",
        createdAt: serverTimestamp(),
      }, { merge: false });
      multiplayerTracerRef.current.multiplayer("PASS_CANCEL_INTENT_SENT", { requestId, actionId: pending.id, baseRevision: gameTimelineRef.current?.revision ?? null });
      return true;
    } catch (error) {
      setPassCancelIntentPending(false);
      passCancelIntentPendingRef.current = false;
      multiplayerTracerRef.current.error("PASS_CANCEL_INTENT_FAILED", error, { requestId, actionId: pending.id });
      setSessionStatus("Pass cancel sync error");
      return false;
    }
  }

  function cancelPassTargeting() {
    const pending = actionResolutionRef.current;
    if (!isPassPreviewCancellable(pending) || !canControlActiveResolution(pending)) return false;
    if (sessionCode && isSessionGuest) {
      void requestHostPassCancellation(pending);
      return true;
    }
    return commitPassCancellation(pending);
  }

  function commitPassTargetSelection(x, y, pending = actionResolutionRef.current) {
    if (pending?.kind !== "pass" || pending.status !== "targeting") return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`pass_target_${pending.id}`),
          type: GAME_COMMAND_TYPE.PASS_TARGET_SELECTED,
          payload: { passId: pending.id, x: Number(x), y: Number(y) },
        },
        label: `Pass target selected: ${toCoord(x, y)}`,
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setHoveredCell(null);
      if (singlePlayerMatchContext().ruleSet.actions?.pass?.pathMode === "center-to-center") {
        confirmPassRoute(null);
      }
      return true;
    }
    const next = { ...pending, target: { x: Number(x), y: Number(y) }, status: "route-selection" };
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    setLiveActionResolution(next);
    setHoveredCell(null);
    recordTimelineTransition({
      type: "PASS_TARGET_SELECTED",
      label: `Pass target selected: ${toCoord(x, y)}`,
      team: pending.team,
      groupId: passTimelineGroupId(pending),
      before,
      after: mergeTimelineGameState(before, { actionResolution: next }),
      allowNoop: true,
    });
    if (activeRuleSetRef.current.actions?.pass?.pathMode === "center-to-center") {
      confirmPassRoute(null);
    }
    return true;
  }

  async function requestHostPassTargetSelection(x, y, pending) {
    if (!sessionCode || !isSessionGuest || passTargetIntentPendingRef.current) return false;
    const requestId = createActionEventId(`pass_target_${pending.id}`);
    setPassTargetIntentPending(true);
    passTargetIntentPendingRef.current = true;
    setHoveredCell(null);
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "passTargetIntent"), {
        requestId,
        actionId: pending.id,
        team: pending.team,
        x: Number(x),
        y: Number(y),
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        requestedBy: user?.uid || clientIdRef.current,
        requestedByClient: clientIdRef.current,
        status: "pending",
        createdAt: serverTimestamp(),
      }, { merge: false });
      multiplayerTracerRef.current.multiplayer("PASS_TARGET_INTENT_SENT", { requestId, actionId: pending.id, baseRevision: gameTimelineRef.current?.revision ?? null });
      return true;
    } catch (error) {
      setPassTargetIntentPending(false);
      passTargetIntentPendingRef.current = false;
      multiplayerTracerRef.current.error("PASS_TARGET_INTENT_FAILED", error, { requestId, actionId: pending.id });
      setSessionStatus("Pass target sync error");
      return false;
    }
  }

  function choosePassTarget(x, y) {
    const pending = actionResolutionRef.current;
    if (pending?.kind !== "pass" || pending.status !== "targeting" || !canControlActiveResolution(pending)) return false;
    if (sessionCode && isSessionGuest) {
      void requestHostPassTargetSelection(x, y, pending);
      return true;
    }
    return commitPassTargetSelection(x, y, pending);
  }

  function activatePassRoute(cornerId) {
    const pending = actionResolutionRef.current;
    if (pending?.kind !== "pass" || pending.status !== "route-selection" || !pending.target) return null;
    const passer = (piecesRef.current || pieces).find(piece => piece.id === pending.passerId);
    if (!passer) return null;
    const frozenMatchContext = !sessionCode ? singlePlayerMatchContext() : null;
    const passRuleSet = frozenMatchContext?.ruleSet || activeRuleSetRef.current;
    const passBoardSettings = frozenMatchContext?.boardSettings || settingsRef.current;
    const passCardsById = frozenMatchContext?.gameplayCardsById || cardById;
    const plan = buildPassPlan({
      passer,
      passerCard: passCardsById[passer.cardId],
      pieces: piecesRef.current || pieces,
      cardById: passCardsById,
      settings: passBoardSettings,
      target: pending.target,
      cornerId,
      rules: passRuleSet,
    });
    if (plan.originBlocked) {
      setIllegalMoveNotice({ reason: "pass-origin-blocked" });
      return null;
    }
    const continuation = pending.continuationId && actionContinuationRef.current?.id === pending.continuationId
      ? actionContinuationRef.current
      : null;
    const currentTracker = currentTimelineTrackerSnapshot();
    const activation = continuation
      ? {
          allowed: true,
          entry: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: "PASS", pieceId: passer.id, bonus: true },
          actionLog: currentTracker.actionLog,
          usedActions: currentTracker.usedActions,
          matchActionState: currentTracker.matchActionState,
        }
      : activateTrackerAction(currentTracker, {
          type: "PASS",
          pieceId: passer.id,
          team: pending.team,
          entryId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        });
    if (!activation.allowed) {
      setIllegalMoveNotice({ reason: activation.reason || "move-not-authorized" });
      return null;
    }
    const baseNext = {
      ...pending,
      status: "completing",
      cornerId: plan.origin.cornerId,
      plan,
      entryId: activation.entry.id,
      actionLog: activation.actionLog,
      usedActions: activation.usedActions,
      matchActionState: activation.matchActionState,
      bonusContinuationId: continuation?.id || null,
      pendingDecision: null,
      pendingRoll: null,
    };
    const next = passRequiresInterceptionSequence(plan, pending.team)
      ? passWithNextInput(baseNext, 0)
      : baseNext;
    return { next, activation, plan };
  }

  function choosePassInterceptor(pieceId) {
    const pending = actionResolutionRef.current;
    if (pending?.kind !== "pass" || pending.status !== "awaiting-interceptor-choice") return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`pass_interceptor_${pending.id}`),
          type: GAME_COMMAND_TYPE.PASS_INTERCEPTOR_SELECTED,
          payload: { passId: pending.id, decisionId: pending.pendingDecision?.id, pieceId },
        },
        label: "Pass interceptor selected",
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      return true;
    }
    const candidates = interceptorChoiceCandidates(pending.plan?.interceptors, pending.interceptorIndex);
    const selected = candidates.find(item => String(item?.defender?.id) === String(pieceId));
    const defenseTeam = teamKeyForPiece(selected?.defender);
    if (!selected || !defenseTeam) return false;
    if (sessionCode && myTeam !== defenseTeam) return false;
    const applied = applyInterceptorChoice(
      pending.plan.interceptors,
      pending.interceptorIndex,
      pieceId,
      activeRuleSetRef.current.actions?.interception?.useProgressiveBonus === false
        ? 0
        : (activeRuleSetRef.current.actions?.interception?.modifierCap ?? 4),
    );
    if (!applied) return false;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const nextPlan = {
      ...pending.plan,
      interceptors: applied.interceptors,
      interceptorPriority: {
        ...(pending.plan.interceptorPriority || {}),
        selections: [
          ...(pending.plan.interceptorPriority?.selections || []),
          applied.selection,
        ],
      },
    };
    const next = withPendingRoll({
      ...pending,
      plan: nextPlan,
      pendingDecision: null,
    }, passPendingRoll({ ...pending, plan: nextPlan }, pending.interceptorIndex));
    setLiveActionResolution(next);
    recordTimelineTransition({
      type: "PASS_INTERCEPTOR_SELECTED",
      label: `${defenseTeam === "blue" ? "Blue" : "Red"} chooses ${getPieceIdentity(selected.defender)} to attempt the next interception`,
      team: defenseTeam,
      groupId: passTimelineGroupId(pending),
      metadata: {
        interceptorChoice: applied.selection,
      },
      before,
      after: mergeTimelineGameState(before, { actionResolution: next }),
      allowNoop: true,
    });
    return true;
  }

  function confirmPassRoute(cornerId) {
    const pending = actionResolutionRef.current;
    if (!canControlActiveResolution(pending)) return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`pass_route_${pending?.id || ""}`),
          type: GAME_COMMAND_TYPE.PASS_ROUTE_CONFIRMED,
          payload: { passId: pending?.id, cornerId },
        },
        label: "Pass route confirmed",
      });
      if (!dispatched.result.accepted) {
        if (dispatched.result.reason === "PASS_ROUTE_ORIGIN_BLOCKED") setIllegalMoveNotice({ reason: "pass-origin-blocked" });
        if (dispatched.result.reason === "PASS_ROUTE_GOALKEEPER_BLOCKED") setIllegalMoveNotice({ reason: "pass-goalkeeper-blocked" });
        return false;
      }
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(null);
      setHoveredCell(null);
      if (dispatched.state.actionResolution?.status === "completing") resolvePendingPass(dispatched.state.actionResolution.id);
      return true;
    }
    const activated = activatePassRoute(cornerId);
    if (!pending || !activated) return;
    const { next, activation, plan } = activated;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    if (!next.bonusContinuationId) {
      setTrackerActionLog(activation.actionLog);
      setTrackerUsedActions(activation.usedActions);
      setMatchActionState(activation.matchActionState);
    }
    setLiveActionResolution(next);
    setSelectedId(null);
    setHoveredCell(null);
    recordTimelineTransition({
      id: activation.entry.id,
      type: "PASS_CONFIRMED",
      label: `${pending.team === "blue" ? "Blue" : "Red"} PASS: ${getPieceDisplayLabel((piecesRef.current || pieces).find(piece => piece.id === pending.passerId))} → ${toCoord(plan.target.x, plan.target.y)}${plan.isLong ? " (Long)" : ""}`,
      team: pending.team,
      groupId: next.bonusContinuationId ? passTimelineGroupId(next) : activation.entry.id,
      before,
      after: mergeTimelineGameState(before, {
        actionResolution: next,
        ...(next.bonusContinuationId ? {} : {
          trackerActionLog: activation.actionLog,
          trackerUsedActions: activation.usedActions,
          matchActionState: activation.matchActionState,
        }),
      }),
      allowNoop: true,
    });
    if (next.status === "completing") resolvePendingPass(next.id);
  }

  function moveBallTo(x, y) {
    return (piecesRef.current || pieces).map(piece => piece.team === "BALL" ? { ...piece, x: Number(x), y: Number(y) } : piece);
  }

  function showPassResultNotice(notice) {
    if (!notice) return;
    setPassResultNotice({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...notice });
  }

  function interceptionOrderLabel(orderModifier) {
    const value = Number(orderModifier) || 0;
    if (value === 0) return "first interceptor";
    if (value === 1) return "second interceptor";
    if (value === 2) return "third interceptor";
    if (value === 3) return "fourth interceptor";
    return `${value + 1}th interceptor`;
  }

  function buildInterceptionRollDetails({ pending, defender, interceptor, natural }) {
    const plan = pending.plan;
    const interceptionRules = plan.interceptionRules || activeRuleSetRef.current.actions?.interception || {};
    const defenderRollStatId = interceptionRules.defenderRollStatId || "stat:interception";
    const interception = cardStat(cardById[defender.cardId], defenderRollStatId);
    const orderModifier = interceptionRules.useProgressiveBonus === false ? 0 : (Number(interceptor?.orderModifier) || 0);
    const nonDominantPenalty = interceptionRules.useStandardModifiers === false || plan.foot?.dominant ? 0 : 1;
    const previousNaturalOnePenalty = interceptionRules.useStandardModifiers === false ? 0 : (Number(pending.naturalOnePenalty) || 0);
    const modifierCap = interceptionRules.modifierCap ?? 4;
    const attackerTargetValue = plan.attackerTargetValue ?? plan.passerPass;
    const roll = resolveInterception({
      natural: Number(natural),
      defenderStatValue: interception,
      attackerTargetValue,
      progressiveBonus: orderModifier,
      standardModifier: nonDominantPenalty,
      previousNaturalOnePenalty,
      modifierCap,
      equalRollOutcome: interceptionRules.equalRollOutcome || "pass-succeeds",
    });
    const sources = [
      { label: "Interception", value: interception, source: "card" },
      { label: "Advantage", value: orderModifier, source: "interceptor-order", detail: interceptionOrderLabel(orderModifier) },
      ...(nonDominantPenalty ? [{ label: "Advantage", value: nonDominantPenalty, source: "non-preferred-foot", detail: "non-preferred foot" }] : []),
      ...(previousNaturalOnePenalty ? [{ label: "Disadvantage", value: previousNaturalOnePenalty, source: "previous-natural-1", detail: "previous Natural 1" }] : []),
    ];
    // The math is still clamped only after every modifier is summed. For the
    // player-facing dialog, however, a capped result shows only the sources
    // that actually fill the visible ±cap; the complete raw list remains in
    // modifierSources for Timeline and AI analysis.
    const appliedModifierSources = !roll.capped
      ? sources
      : (() => {
          const direction = Number(roll.modifier) >= 0 ? 1 : -1;
          let remaining = Math.abs(Number(roll.modifier) || 0);
          return sources.reduce((applied, source) => {
            const value = Number(source.value) || 0;
            if (remaining <= 0 || value * direction <= 0) return applied;
            const visibleValue = direction * Math.min(Math.abs(value), remaining);
            remaining -= Math.abs(visibleValue);
            return [...applied, { ...source, value: visibleValue }];
          }, []);
        })();
    return {
      ...roll,
      passerPass: attackerTargetValue,
      attackerTargetValue,
      attackerTargetStatId: plan.attackerTargetStatId || "stat:passing",
      defenderRollStatId,
      interception,
      orderModifier,
      nonDominantPenalty,
      previousNaturalOnePenalty,
      modifierSources: sources,
      appliedModifierSources,
    };
  }

  function formatModifierSource(source) {
    const value = Number(source?.value) || 0;
    const sign = value >= 0 ? "+" : "";
    return `${source?.label || "Modifier"} ${sign}${value}${source?.detail ? ` (${source.detail})` : ""}`;
  }

  function formatTotalModifier(roll) {
    const modifier = Number(roll?.modifier) || 0;
    const sign = modifier >= 0 ? "+" : "";
    const label = modifier > 0 ? "Total Bonus" : modifier < 0 ? "Total Penalty" : "Total Modifier";
    const capNote = roll?.capped ? ` — ${modifier >= 0 ? "maximum advantage" : "maximum disadvantage"}` : "";
    return `${label} ${sign}${modifier}${capNote}`;
  }

  function passTargetLabel(plan) {
    const statId = String(plan?.attackerTargetStatId || "stat:passing");
    const schemaStats = [
      ...(cardStateRef.current?.backStatsSchema?.passiveAttributes || []),
      ...(cardStateRef.current?.backStatsSchema?.bonuses || []),
    ];
    const statName = schemaStats.find(stat => String(stat?.id) === statId)?.name
      || (statId === "stat:passing" ? "Passing" : statId.replace(/^stat:/, "").replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase()));
    return `Target ${Number(plan?.attackerTargetValue ?? plan?.passerPass) || 0} — ${statName}`;
  }

  function formatInterceptionModifiers(roll) {
    const sources = Array.isArray(roll?.appliedModifierSources) ? roll.appliedModifierSources : (Array.isArray(roll?.modifierSources) ? roll.modifierSources : []);
    const expression = sources.map(formatModifierSource).join(" + ");
    return `${expression || "No modifier"}. ${formatTotalModifier(roll)}.`;
  }

  function interceptionResultNotice({ defender, roll, pending, continuation }) {
    const plan = pending.plan;
    const team = teamKeyForPiece(defender);
    const isNaturalOne = roll.natural === 1;
    const isNaturalTwenty = roll.natural === 20;
    const title = isNaturalTwenty ? "Natural 20 — Interception" : isNaturalOne ? "Natural 1 — Pass continues" : roll.outcome === "interception" ? "Interception" : "Interception failed";
    return {
      title,
      team,
      lines: [
        `${getPieceIdentity(defender)} (${team === "blue" ? "Blue" : "Red"}) rolled ${roll.natural} on D20.`,
        isNaturalOne || isNaturalTwenty ? "Natural result: no normal comparison is needed." : formatInterceptionModifiers(roll),
        isNaturalOne || isNaturalTwenty ? `Pass target: ${plan.attackerTargetValue ?? plan.passerPass}.` : `Total ${roll.total} vs Pass ${plan.attackerTargetValue ?? plan.passerPass}.`,
        continuation,
      ],
    };
  }

  function passResultNoticeForEntry(entry) {
    if (!entry || !["PASS_INTERCEPTION_MISSED", "PASS_COMPLETED", "PASS_INTERCEPTED", "PASS_NATURAL_20"].includes(entry.type)) return null;
    const pending = entry.before?.actionResolution;
    const interceptor = pending?.plan?.interceptors?.[pending?.interceptorIndex];
    const defender = (entry.before?.pieces || []).find(piece => piece.id === interceptor?.defender?.id);
    const recordedResolution = entry.metadata?.interceptionResolution || null;
    const natural = Number(recordedResolution?.natural ?? pending?.lastRoll?.value);
    if (!pending || !defender || !Number.isFinite(natural)) return null;
    const details = recordedResolution || pending.lastResolution || buildInterceptionRollDetails({ pending, defender, interceptor, natural });
    const nextTeam = entry.team === "blue" ? "Blue" : "Red";
    const continuation = entry.type === "PASS_NATURAL_20"
      ? `${nextTeam} wins the ball and now has one bonus card action before the turn changes.`
      : entry.type === "PASS_INTERCEPTED"
        ? `${nextTeam} wins the ball. Possession changes and play continues at Turn ${entry.after?.tracker?.currentTurn || 1}.`
        : entry.type === "PASS_COMPLETED"
          ? "No further interception reactions apply. The pass is completed."
        : entry.after?.actionResolution?.status === "awaiting-interceptor-choice"
          ? `The pass continues. ${nextTeam} must choose which equally ranked defender attempts the next interception.`
          : `The pass continues. The next eligible defender must roll D20${natural === 1 ? " with an additional -1 modifier" : ""}.`;
    return interceptionResultNotice({ defender, roll: details, pending, continuation });
  }

  function presentPassResultEntry(entry) {
    if (!entry?.id || shownPassResultEntryIdsRef.current.has(entry.id)) return;
    const notice = passResultNoticeForEntry(entry);
    if (!notice) return;
    shownPassResultEntryIdsRef.current.add(entry.id);
    showPassResultNotice(notice);
  }

  function passInterceptionTimelineMetadata(pending) {
    if (!pending) return null;
    return {
      ...(pending.lastResolution ? { interceptionResolution: pending.lastResolution } : {}),
      ...(pending.resolutionTransaction ? { undoTransaction: pending.resolutionTransaction } : {}),
    };
  }

  function finishPassWithPossession(pending, interceptor, naturalTwenty = false, resultNotice = null) {
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const nextPieces = moveBallTo(interceptor.x, interceptor.y);
    if (naturalTwenty) {
      const bonusTeam = teamKeyForPiece(interceptor);
      const nextTurn = Math.max(1, normalizeTrackerSnapshot(before.tracker).currentTurn + 1);
      const previousContinuation = before.actionContinuation?.kind === "bonus-card-action" ? before.actionContinuation : null;
      const continuation = createBonusCardActionContinuation({
        team: bonusTeam,
        nextTurn,
        sourceEntryId: pending.entryId,
        origin: {
          actionType: "PASS",
          outcome: "INTERCEPTION",
          reason: "NATURAL_20",
          sourceEntryId: pending.entryId,
          parentContinuationId: previousContinuation?.id || null,
        },
      });
      piecesRef.current = nextPieces; setPieces(nextPieces); cancelFreeBall(); setLiveActionResolution(null); setLiveActionContinuation(continuation);
      const timeline = recordTimelineTransition({ type: "PASS_NATURAL_20", label: `Natural 20 interception: ${getPieceDisplayLabel(interceptor)} earns one bonus action`, team: bonusTeam, groupId: passTimelineGroupId(pending), metadata: { ...passInterceptionTimelineMetadata(pending), bonusAction: { origin: continuation.origin, supersededContinuationId: previousContinuation?.id || null } }, before, after: mergeTimelineGameState(before, { pieces: nextPieces, actionResolution: null, actionContinuation: continuation }), allowNoop: true });
      presentPassResultEntry(timeline?.entries?.[timeline.cursor - 1]);
      return;
    }
    const nextTeam = teamKeyForPiece(interceptor);
    const emptyTurn = createEmptyTrackerTurnState();
    const nextTurn = Math.min(trackerSettings.turns, Math.max(1, normalizeTrackerSnapshot(before.tracker).currentTurn + 1));
    piecesRef.current = nextPieces; setPieces(nextPieces);
    setTrackerStartingTeam(nextTeam); setTrackerCurrentTurn(nextTurn); setTurnPhase("attack");
    setTrackerUsedActions(emptyTurn.usedActions); setTrackerActionLog(emptyTurn.actionLog); setMatchActionState(emptyTurn.matchActionState);
    setMovementStateByPieceId({}); movementStateRef.current = {};
    setLiveActionResolution(null);
    setLiveActionContinuation(null);
    const timeline = recordTimelineTransition({ type: "PASS_INTERCEPTED", label: `${nextTeam === "blue" ? "Blue" : "Red"} intercepts — Turn ${nextTurn}`, team: nextTeam, groupId: passTimelineGroupId(pending), metadata: passInterceptionTimelineMetadata(pending), before, after: mergeTimelineGameState(before, { pieces: nextPieces, actionResolution: null, actionContinuation: null, trackerStartingTeam: nextTeam, trackerCurrentTurn: nextTurn, trackerUsedActions: emptyTurn.usedActions, trackerActionLog: emptyTurn.actionLog, matchActionState: emptyTurn.matchActionState, turnPhase: "attack", movementStateByPieceId: {} }), allowNoop: true });
    presentPassResultEntry(timeline?.entries?.[timeline.cursor - 1]);
    if (resultNotice && !pending?.lastResolution) showPassResultNotice(resultNotice);
  }

  function finishPassSuccess(pending, resultNotice = null) {
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const nextPieces = moveBallTo(pending.plan.target.x, pending.plan.target.y);
    const continuation = pending.bonusContinuationId && actionContinuationRef.current?.id === pending.bonusContinuationId
      ? completeContinuationAction(actionContinuationRef.current)
      : actionContinuationRef.current;
    piecesRef.current = nextPieces; setPieces(nextPieces); setLiveActionResolution(null); setLiveActionContinuation(continuation);
    const timeline = recordTimelineTransition({ type: "PASS_COMPLETED", label: `Pass completed to ${toCoord(pending.plan.target.x, pending.plan.target.y)}${pending.plan.isLong ? " (Long)" : ""}`, team: pending.team, groupId: passTimelineGroupId(pending), metadata: passInterceptionTimelineMetadata(pending), before, after: mergeTimelineGameState(before, { pieces: nextPieces, actionResolution: null, actionContinuation: continuation }), allowNoop: true });
    presentPassResultEntry(timeline?.entries?.[timeline.cursor - 1]);
    if (resultNotice && !pending?.lastResolution) showPassResultNotice(resultNotice);
  }

  function resolvePendingPass(id) {
    const pending = actionResolutionRef.current;
    if (pending?.kind !== "pass" || pending.id !== id || pending.status !== "completing") return;
    const plan = pending.plan;
    if (plan.directHit) {
      const hitPiece = (piecesRef.current || pieces).find(piece => piece.id === plan.directHit.pieceId);
      if (hitPiece && teamKeyForPiece(hitPiece) !== pending.team) {
        const nextTeam = teamKeyForPiece(hitPiece);
        const canonicalBefore = currentTimelineGameStateSnapshot() || captureTimelineGameState();
        const nextTurn = Math.min(trackerSettings.turns, Math.max(1, normalizeTrackerSnapshot(canonicalBefore.tracker).currentTurn + 1));
        finishPassWithPossession(pending, hitPiece, false, {
          title: "Pass intercepted",
          team: nextTeam,
          lines: [
            `${getPieceIdentity(hitPiece)} (${nextTeam === "blue" ? "Blue" : "Red"}) receives the ball directly.`,
            `Possession changes. Turn ${nextTurn} begins.`,
          ],
        });
      }
      else finishPassSuccess(pending);
      return;
    }
    finishPassSuccess(pending);
  }

  function resolveRecordedPassInterception(pending) {
    const plan = pending.plan;
    const interceptor = plan.interceptors?.[pending.interceptorIndex];
    if (!interceptor) { finishPassSuccess(pending); return; }
    const result = pending.lastRoll;
    const defender = (piecesRef.current || pieces).find(piece => piece.id === interceptor.defender.id);
    if (!defender || !result) { finishPassSuccess(pending); return; }
    const rollDetails = pending.lastResolution || buildInterceptionRollDetails({ pending, defender, interceptor, natural: result.value });
    const roll = rollDetails;
    if (roll.outcome === "natural-20-interception") {
      finishPassWithPossession(pending, defender, true);
      return;
    }
    if (roll.outcome === "interception") {
      const nextTeam = teamKeyForPiece(defender);
      finishPassWithPossession(pending, defender, false);
      return;
    }
    const nextIndex = pending.interceptorIndex + 1;
    if (nextIndex >= plan.interceptors.length) {
      finishPassSuccess(pending, interceptionResultNotice({ defender, roll: rollDetails, pending, continuation: "No further interception reactions apply. The pass is completed." }));
      return;
    }
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const advanced = {
      ...pending,
      interceptorIndex: nextIndex,
      naturalOnePenalty: (pending.naturalOnePenalty || 0) + (result.value === 1 ? -1 : 0),
      lastRoll: null,
      lastResolution: null,
      lastRollEvent: null,
      resolutionTransaction: null,
      pendingDecision: null,
      pendingRoll: null,
    };
    const next = passWithNextInput(advanced, nextIndex);
    setLiveActionResolution(next);
    const timeline = recordTimelineTransition({ type: "PASS_INTERCEPTION_MISSED", label: `${getPieceDisplayLabel(defender)} cannot intercept — next reaction required`, team: teamKeyForPiece(defender), groupId: passTimelineGroupId(pending), metadata: passInterceptionTimelineMetadata(pending), before, after: mergeTimelineGameState(before, { actionResolution: next }), allowNoop: true });
    presentPassResultEntry(timeline?.entries?.[timeline.cursor - 1]);
  }

  function preparePassInterceptionRoll(team, value) {
    const pending = actionResolutionRef.current;
    const interceptor = pending?.plan?.interceptors?.[pending.interceptorIndex];
    if (
      pending?.kind !== "pass"
      || pending.status !== "awaiting-interception-roll"
      || pending.pendingRoll?.team !== team
      || String(pending.pendingRoll?.subjectId || "") !== String(interceptor?.defender?.id || "")
      || Number(pending.pendingRoll?.reactionIndex) !== Number(pending.interceptorIndex)
    ) return null;
    const defender = (piecesRef.current || pieces).find(piece => piece.id === interceptor?.defender?.id);
    if (!defender) return null;
    return {
      actionId: pending.id,
      requestId: pending.pendingRoll.requestId,
      defenderId: defender.id,
      interceptorIndex: pending.interceptorIndex,
      interceptionResolution: buildInterceptionRollDetails({ pending, defender, interceptor, natural: value }),
    };
  }

  function applyDelayedActionResolution(request, canonicalActionResolution = null) {
    const traceId = String(request?.payload?.traceId || request?.payload?.rollEvent?.traceId || request?.traceId || actionTraceIdsRef.current.get(request?.actionId) || "");
    if (request?.kind !== "pass-interception") {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "unsupported delayed-resolution kind", { traceId, kind: request?.kind || null });
      return;
    }
    const pending = canonicalActionResolution || actionResolutionRef.current;
    const interceptor = pending?.plan?.interceptors?.[pending.interceptorIndex];
    if (
      pending?.kind !== "pass"
      || pending.status !== "awaiting-interception-roll"
      || pending.id !== request.actionId
      || Number(pending.interceptorIndex) !== Number(request.payload?.interceptorIndex)
      || String(interceptor?.defender?.id || "") !== String(request.payload?.defenderId || "")
      || teamKeyForPiece(interceptor?.defender) !== request.team
    ) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "canonical action does not match roll request", {
        traceId,
        actionId: request.actionId,
        pendingActionId: pending?.id || null,
        pendingStatus: pending?.status || null,
      });
      return;
    }
    const defender = (piecesRef.current || pieces).find(piece => piece.id === interceptor?.defender?.id);
    const rollEvent = request.payload?.rollEvent;
    if (!defender || !Number.isFinite(Number(request.value)) || !rollEvent) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "missing defender, roll value, or roll event", { traceId, hasDefender: Boolean(defender), value: request.value, hasRollEvent: Boolean(rollEvent) });
      return;
    }
    const consumed = consumeActionEvent(pending, rollEvent);
    if (!consumed) {
      multiplayerTracerRef.current.guard("RESOLUTION_ABORTED", "roll event does not match pending roll or was already consumed", { traceId, requestId: rollEvent.requestId, eventId: rollEvent.id });
      return;
    }
    // Validation succeeded. Clear the cosmetic wait only now; an invalid or
    // stale local ref must not permanently suppress a canonical retry.
    cancelDelayedResolutionTimer();
    // Multiplayer resolution is host-authoritative. Recompute from the
    // canonical action plan and its frozen Interception rules instead of
    // trusting a client-precomputed result carried in the dice event.
    const recordedResolution = buildInterceptionRollDetails({ pending, defender, interceptor, natural: request.value });
    multiplayerTracerRef.current.multiplayer("ROLL_RECEIVED", { traceId, actionId: request.actionId, requestId: rollEvent.requestId, eventId: rollEvent.id, value: request.value });
    resolveRecordedPassInterception({
      ...consumed,
      lastRoll: { team: request.team, value: Number(request.value), eventId: rollEvent.id, requestId: rollEvent.requestId },
      lastResolution: recordedResolution,
      resolutionTransaction: request.payload?.undoTransaction || null,
    });
  }

  async function requestHostFreeMode(piece, operation) {
    if (!sessionCode || !isSessionGuest || freeModeIntentPendingRef.current || !piece) return false;
    const requestId = createActionEventId(`free_mode_${operation}`);
    setFreeModeIntentPending(true);
    freeModeIntentPendingRef.current = true;
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "freeModeIntent"), {
        requestId, operation, pieceId: piece.id, team: pieceTeamKey(piece),
        requestedByUid: user?.uid || "", requestedByClient: clientIdRef.current,
        status: "pending", createdAt: serverTimestamp(),
      }, { merge: false });
      return true;
    } catch (error) {
      setFreeModeIntentPending(false);
      freeModeIntentPendingRef.current = false;
      console.error("Free mode intent failed", error);
      return false;
    }
  }

  function commitFreeModeToggle(piece, { fromHostIntent = false, requestedOperation = "toggle" } = {}) {
    if (!piece || piece.team === "BALL") return false;
    if (sessionCode && isSessionGuest && !fromHostIntent) return false;
    if (!sessionCode) {
      if (actionContinuationRef.current?.kind === "bonus-card-action") return false;
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      if (before.tracker.matchActionState?.activeMovement?.active) return false;
      const currentFreeMode = before.tracker.matchActionState?.freeMode || {};
      const isSameFreePiece = Boolean(currentFreeMode.active && currentFreeMode.pieceId === piece.id);
      if (requestedOperation === "end" && !isSameFreePiece) return false;
      if (requestedOperation === "start" && currentFreeMode.active) return false;
      const ending = requestedOperation === "end" || (requestedOperation === "toggle" && isSameFreePiece);
      const team = pieceTeamKey(piece);
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`free_move_${ending ? "end" : "start"}_${piece.id}`),
          type: ending ? GAME_COMMAND_TYPE.FREE_MOVE_ENDED : GAME_COMMAND_TYPE.FREE_MOVE_STARTED,
          payload: { pieceId: piece.id },
        },
        label: `${team === "blue" ? "Blue" : "Red"} Free Move ${ending ? "OFF" : "ON"}: ${getPieceDisplayLabel(piece)}`,
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(ending ? null : piece.id);
      return true;
    }
    const team = pieceTeamKey(piece);
    const currentTracker = currentTimelineTrackerSnapshot();
    const currentActionState = currentTracker.matchActionState;
    const freeModeActive = Boolean(currentActionState.freeMode?.active);
    const isSameFreePiece = freeModeActive && currentActionState.freeMode?.pieceId === piece.id;
    if (requestedOperation === "end" && !isSameFreePiece) return false;
    if (requestedOperation === "start" && freeModeActive) return false;
    const beforeTimeline = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const timelineGroupId = isSameFreePiece
      ? (currentActionState.freeMode?.timelineGroupId || `free_${piece.id}_${trackerCurrentTurn}`)
      : `free_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const freeTransition = toggleFreeModeState(currentActionState, { pieceId: piece.id, team, timelineGroupId });
    const nextState = freeTransition.state;
    setMatchActionState(nextState);
    setSelectedId(isSameFreePiece ? null : piece.id);
    const afterTimeline = createGameState({ ...beforeTimeline, tracker: { ...beforeTimeline.tracker, matchActionState: nextState } });
    recordTimelineTransition({
      type: isSameFreePiece ? "FREE_MODE_ENDED" : "FREE_MODE_STARTED",
      label: `${team === "blue" ? "Blue" : "Red"} Free Move ${isSameFreePiece ? "OFF" : "ON"}: ${getPieceDisplayLabel(piece)}`,
      team, groupId: timelineGroupId, before: beforeTimeline, after: afterTimeline,
    });
    return true;
  }

  function commitNormalMoveStart(piece, { fromHostIntent = false } = {}) {
    if (!piece || piece.team === "BALL" || (!fromHostIntent && !canUseActionForPiece(piece))) return false;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const team = pieceTeamKey(piece);
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: { id: createActionEventId(`normal_move_start_${piece.id}`), type: GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, payload: { pieceId: piece.id } },
        label: `${team === "blue" ? "Blue" : "Red"} MOVE: ${getPieceDisplayLabel(piece)}`,
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setSelectedId(piece.id);
      setHoveredCell(null);
      return true;
    }
    const team = pieceTeamKey(piece);
    const currentTracker = currentTimelineTrackerSnapshot();
    const activation = activateTrackerAction(currentTracker, {
      type: "MOVE",
      pieceId: piece.id,
      team,
      entryId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    if (!activation.allowed) {
      if (!fromHostIntent && ["wait-active-team", "all-actions-complete", "actions-complete-end-turn"].includes(activation.reason)) {
        setIllegalMoveNotice({ reason: activation.reason });
      }
      return false;
    }
    const { entry, actionLog: nextLog, usedActions: nextUsed, matchActionState: nextState } = activation;
    const beforeTimeline = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    void applyActionStateUpdate(nextLog, nextState, nextUsed);
    const afterTimeline = createGameState({
      ...beforeTimeline,
      tracker: {
        ...beforeTimeline.tracker,
        actionLog: nextLog,
        usedActions: nextUsed,
        matchActionState: nextState,
      },
    });
    recordTimelineTransition({
      id: entry.id,
      type: "MOVE_ACTIVATED",
      label: `${team === "blue" ? "Blue" : "Red"} MOVE: ${getPieceDisplayLabel(piece)}`,
      team,
      groupId: entry.id,
      before: beforeTimeline,
      after: afterTimeline,
      allowNoop: true,
    });
    setSelectedId(piece.id);
    setHoveredCell(null);
    return true;
  }

  function commitNormalMoveCancellation(piece, { fromHostIntent = false } = {}) {
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const team = pieceTeamKey(piece);
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: { id: createActionEventId(`normal_move_cancel_${piece.id}`), type: GAME_COMMAND_TYPE.NORMAL_MOVE_CANCELLED, payload: { pieceId: piece.id } },
        label: `${team === "blue" ? "Blue" : "Red"} MOVE cancelled: ${getPieceDisplayLabel(piece)}`,
      });
      if (!dispatched.result.accepted) return false;
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      setHoveredCell(null);
      return true;
    }
    const currentTracker = currentTimelineTrackerSnapshot();
    const active = currentTracker.matchActionState.activeMovement || {};
    const team = pieceTeamKey(piece);
    const log = Array.isArray(currentTracker.actionLog?.[team]) ? currentTracker.actionLog[team] : [];
    const last = log[log.length - 1];
    const valid = Boolean(
      piece
      && active.active
      && active.kind === "normal-move"
      && String(active.pieceId || "") === String(piece.id)
      && active.team === team
      && last?.type === "MOVE"
      && String(last.pieceId || "") === String(piece.id)
      && String(last.id || "") === String(active.timelineGroupId || "")
    );
    if (!valid) return false;
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const nextLog = { ...currentTracker.actionLog, [team]: log.slice(0, -1) };
    const nextUsed = { ...currentTracker.usedActions, [team]: nextLog[team].length };
    const nextByPieceId = { ...currentTracker.matchActionState.byPieceId };
    delete nextByPieceId[piece.id];
    const nextState = normalizeMatchActionState({
      ...currentTracker.matchActionState,
      byPieceId: nextByPieceId,
      activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
    });
    void applyActionStateUpdate(nextLog, nextState, nextUsed);
    setHoveredCell(null);
    recordTimelineTransition({
      type: "MOVE_CANCELLED",
      label: `${team === "blue" ? "Blue" : "Red"} MOVE cancelled: ${getPieceDisplayLabel(piece)}`,
      team,
      groupId: active.timelineGroupId || null,
      before,
      after: createGameState({
        ...before,
        tracker: { ...before.tracker, actionLog: nextLog, usedActions: nextUsed, matchActionState: nextState },
      }),
      allowNoop: true,
    });
    return true;
  }

  async function consumeInspectorAction(type, piece) {
    if (groupMoveZoneDraft && type !== "GROUP_MOVE") return;
    if (!sessionCode && currentTimelineTrackerSnapshot().matchActionState.groupMove?.active) return;
    const singlePlayerFreeMode = !sessionCode && currentTimelineTrackerSnapshot().matchActionState.freeMode?.active;
    if (singlePlayerFreeMode) {
      const activeFreePieceId = currentTimelineTrackerSnapshot().matchActionState.freeMode?.pieceId;
      if (type === "FREE" && String(piece?.id || "") === String(activeFreePieceId || "")) {
        commitFreeModeToggle(piece, { requestedOperation: "end" });
      }
      return;
    }
    if (type === "PASS" && gameMode === "match" && !playerHasBall(piece)) {
      setIllegalMoveNotice({ reason: "pass-requires-ball" });
      return;
    }
    const pendingPass = actionResolutionRef.current;
    if (pendingPass?.kind === "pass") {
      if (type === "PASS" && pendingPass.passerId === piece.id && isPassPreviewCancellable(pendingPass)) cancelPassTargeting();
      return;
    }
    const activeNormalMove = currentTimelineTrackerSnapshot().matchActionState.activeMovement || {};
    if (type === "MOVE"
      && activeNormalMove.active
      && activeNormalMove.kind === "normal-move"
      && String(activeNormalMove.pieceId || "") === String(piece.id)) {
      if (sessionCode && isSessionGuest) {
        void requestHostActionStart({ mode: "cancel-normal-move", actionType: "MOVE", piece });
        return;
      }
      commitNormalMoveCancellation(piece);
      return;
    }
    if (!sessionCode && activeNormalMove.active && activeNormalMove.kind === "normal-move") return;
    if (type === "MOVE" && currentTimelineTrackerSnapshot().matchActionState.byPieceId?.[piece.id]?.moveAuthorized) {
      setSelectedId(piece.id);
      setHoveredCell(null);
      return;
    }
    const offlineBonusContinuation = !sessionCode && actionContinuationRef.current?.kind === "bonus-card-action"
      ? actionContinuationRef.current
      : null;
    if (offlineBonusContinuation && offlineBonusContinuation.team !== pieceTeamKey(piece)) return;
    const continuation = currentBonusContinuationForTeam(pieceTeamKey(piece));
    if (continuation) {
      if (!canControlBonusContinuation(continuation)) return;
      if (!sessionCode && type === "MOVE" && continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE && continuation.actionType === "MOVE" && continuation.pieceId === piece.id && !continuation.movementStarted) {
        cancelBonusMove(piece);
        return;
      }
      if (continuation.status !== CONTINUATION_STATUS.READY || type === "GROUP_MOVE" || type === "FREE" || !canControlPieceStatus(piece)) return;
      if (!sessionCode && type === "PASS") {
        cancelFreeBall();
        beginPassTargeting(piece, { continuationId: continuation.id });
        return;
      }
      const started = type === "MOVE" && !sessionCode
        ? startBonusMove(piece)
        : beginBonusCardAction(type, piece, { startPassAtomically: type === "PASS" });
      if (!started) return;
      if (type === "PASS") {
        // Bonus PASS start and targeting are one canonical host commit.
      } else if (type === "MOVE") {
        setSelectedId(piece.id);
        setHoveredCell(null);
      } else {
        // These actions do not yet have their own automation flow. They still
        // count as the one allowed bonus card action, but never touch Tracker.
        completeBonusCardAction({ actionType: type, pieceId: piece.id });
      }
      return;
    }
    if (offlineBonusContinuation) return;
    if (actionResolutionRef.current && type !== "FREE") return;
    if (type === "FREE") {
      if (!canUseFreeModeForPiece(piece)) return;
    } else if (!canUseActionForPiece(piece)) return;
    const team = pieceTeamKey(piece);
    // PASS is intentionally not consumed until a destination and a physical
    // route are confirmed. Cancelling the preview leaves Tracker untouched.
    if (type === "PASS") {
      if (gameMode === "match") {
        if (!playerHasBall(piece)) {
          setIllegalMoveNotice({ reason: "pass-requires-ball" });
          return;
        }
        if (!isTeamPhaseActive(team)) {
          setIllegalMoveNotice({ reason: phaseBlockReason() });
          return;
        }
        if (getTeamActionStatus(team).exhausted) {
          setIllegalMoveNotice({ reason: "actions-complete-end-turn" });
          return;
        }
      }
      cancelFreeBall();
      beginPassTargeting(piece);
      return;
    }
    if (type === "MOVE" && sessionCode && isSessionGuest) {
      void requestHostActionStart({ mode: "normal-move", actionType: "MOVE", piece });
      return;
    }
    if (type === "MOVE") {
      commitNormalMoveStart(piece);
      return;
    }
    if (type === "GROUP_MOVE" && !sessionCode) {
      if (groupMoveZoneDraft) {
        setGroupMoveZoneDraft(null);
        return;
      }
      const team = pieceTeamKey(piece);
      const tracker = currentTimelineTrackerSnapshot();
      if (!canUseActionForPiece(piece) || !isTeamPhaseActive(team) || tracker.matchActionState.groupMove?.active) return;
      if (getTeamActionStatus(team).remaining !== 1) {
        setIllegalMoveNotice({ reason: "group-move-last-action-only" });
        return;
      }
      const configuredLength = Math.max(1, Math.min(settings.cols, Number(activeRuleSet.actions?.groupMove?.zoneLength) || 10));
      setGroupMoveZoneDraft({
        team,
        zoneStartX: Math.max(0, Math.floor((settings.cols - configuredLength) / 2)),
        zoneLength: configuredLength,
      });
      cancelFreeBall();
      setSelectedId(null);
      setHoveredCell(null);
      return;
    }
    const currentTracker = currentTimelineTrackerSnapshot();
    const currentActionState = currentTracker.matchActionState;
    if (type === "FREE") {
      cancelFreeBall();
      const freeModeActive = Boolean(currentActionState.freeMode?.active);
      const isSameFreePiece = freeModeActive && currentActionState.freeMode?.pieceId === piece.id;
      if (sessionCode && isSessionGuest) {
        void requestHostFreeMode(piece, isSameFreePiece ? "end" : "start");
        return;
      }
      commitFreeModeToggle(piece, { requestedOperation: isSameFreePiece ? "end" : "start" });
      return;
    }
    const activation = activateTrackerAction(currentTracker, {
      type,
      pieceId: piece.id,
      team,
      entryId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    if (!activation.allowed) {
      if (["wait-active-team", "all-actions-complete", "actions-complete-end-turn"].includes(activation.reason)) {
        setIllegalMoveNotice({ reason: activation.reason });
      }
      return;
    }
    const { entry, actionLog: nextLog, usedActions: nextUsed, matchActionState: nextState } = activation;
    const beforeTimeline = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    await applyActionStateUpdate(nextLog, nextState, nextUsed);
    const afterTimeline = createGameState({
      ...beforeTimeline,
      tracker: {
        ...beforeTimeline.tracker,
        actionLog: nextLog,
        usedActions: nextUsed,
        matchActionState: nextState,
      },
    });
    recordTimelineTransition({
      id: entry.id,
      type: `${type}_ACTIVATED`,
      label: `${team === "blue" ? "Blue" : "Red"} ${type.replace("GROUP_MOVE", "GROUP MOVE")}: ${getPieceDisplayLabel(piece)}`,
      team,
      groupId: entry.id,
      before: beforeTimeline,
      after: afterTimeline,
      allowNoop: true,
    });
    if (type === "MOVE" || type === "GROUP_MOVE") {
      setSelectedId(piece.id);
    } else {
      setSelectedId(null);
      setHoveredCell(null);
    }
  }
  async function removeLastTrackerAction(team) {
    if (!trackerGameStarted || !trackerActionLog[team]?.length) return;
    if (sessionCode && myTeam !== team && !isSessionHost) return;
    if (!window.confirm("Remove the latest action from this tracker?")) return;
    const removed = trackerActionLog[team][trackerActionLog[team].length - 1];
    const timeline = gameTimelineRef.current;
    if (timeline) {
      const appliedEntries = timeline.entries.slice(0, timeline.cursor);
      const matchingIndexes = appliedEntries
        .map((entry, index) => entry.groupId === removed.id ? index : -1)
        .filter(index => index >= 0);
      if (matchingIndexes.length) {
        const firstIndex = matchingIndexes[0];
        const lastIndex = matchingIndexes[matchingIndexes.length - 1];
        const contiguous = matchingIndexes.every((index, position) => index === firstIndex + position);
        if (!contiguous || lastIndex !== appliedEntries.length - 1) {
          window.alert("This action is not the latest action in the shared timeline. Undo the later actions first.");
          return;
        }
        restoreTimelineCursor(firstIndex);
        return;
      }
    }
    window.alert("This action predates the active unified timeline and cannot be removed safely. Start a new Match Mode recording first.");
  }
  function hasValidGroupMoveAuthorization(team) {
    return hasGroupMoveAuthorization(trackerRulesSnapshot(), team);
  }
  function movementAuthorization(piece) {
    return movementAuthorizationForPiece({
      piece,
      team: pieceTeamKey(piece),
      gameMode,
      tracker: trackerRulesSnapshot(),
    });
  }

  async function confirmAutoMove(shouldMove) {
    const pending = pendingAutoMove;
    setPendingAutoMove(null);
    if (!pending || !shouldMove) return;
    const piece = (piecesRef.current || pieces).find(item => item.id === pending.pieceId);
    if (!piece || !canMovePiece(piece) || !canUseActionForPiece(piece)) return;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const team = pieceTeamKey(piece);
      const startId = createActionEventId(`normal_move_start_${piece.id}`);
      const dispatched = dispatchSinglePlayerGameCommandSequence({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        commands: [
          {
            command: { id: startId, type: GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, payload: { pieceId: piece.id } },
            label: `${team === "blue" ? "Blue" : "Red"} MOVE: ${getPieceDisplayLabel(piece)}`,
          },
          {
            command: { id: createActionEventId(`normal_move_commit_${piece.id}`), type: GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, payload: { pieceId: piece.id, x: Number(pending.x), y: Number(pending.y) } },
            label: `${piece.team === "A" ? "Blue" : "Red"} ${piece.label} → ${toCoord(pending.x, pending.y)}`,
          },
        ],
      });
      if (!dispatched.accepted) {
        if (dispatched.result.reason && dispatched.result.reason !== "same") setIllegalMoveNotice({ reason: dispatched.result.reason });
        return;
      }
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      return;
    }
    const team = pieceTeamKey(piece);
    const currentTracker = currentTimelineTrackerSnapshot();
    const currentLog = currentTracker.actionLog;
    const currentUsed = currentTracker.usedActions;
    const currentActionState = currentTracker.matchActionState;
    const status = getTeamActionStatus(team, currentUsed);
    const currentPieceState = currentActionState.byPieceId[piece.id] || {};
    if (!isTeamPhaseActive(team)) { setIllegalMoveNotice({ reason: phaseBlockReason() }); return; }
    if (status.exhausted || currentPieceState.moveUsed) {
      setIllegalMoveNotice({ reason: status.exhausted ? "team-exhausted" : "move-not-authorized" });
      return;
    }
    const refreshedEvaluation = evaluateMove(piece, pending.x, pending.y);
    if (!refreshedEvaluation.legal) {
      if (refreshedEvaluation.reason !== "same") setIllegalMoveNotice(refreshedEvaluation);
      return;
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "MOVE",
      pieceId: piece.id,
    };
    const nextLog = { ...currentLog, [team]: [...currentLog[team], entry] };
    const nextUsed = { ...currentUsed, [team]: nextLog[team].length };
    const nextState = normalizeMatchActionState({
      ...currentActionState,
      byPieceId: {
        ...currentActionState.byPieceId,
        [piece.id]: { ...currentPieceState, moveUsed: true, moveAuthorized: true, moveGroupId: entry.id },
      },
    });
    const beforeTimeline = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    await applyActionStateUpdate(nextLog, nextState, nextUsed);
    const afterTimeline = createGameState({
      ...beforeTimeline,
      tracker: {
        ...beforeTimeline.tracker,
        actionLog: nextLog,
        usedActions: nextUsed,
        matchActionState: nextState,
      },
    });
    recordTimelineTransition({
      id: entry.id,
      type: "MOVE_ACTIVATED",
      label: `${team === "blue" ? "Blue" : "Red"} MOVE: ${getPieceDisplayLabel(piece)}`,
      team,
      groupId: entry.id,
      before: beforeTimeline,
      after: afterTimeline,
      allowNoop: true,
    });
    commitPieceMove(piece, pending.x, pending.y, refreshedEvaluation, { authorizationOverride: { allowed: true, mode: "normal" } });
  }

  function requestEndTurn(piece) {
    const team = pieceTeamKey(piece);
    if (actionContinuationRef.current?.kind === "bonus-card-action") return;
    if (!canUseActionForPiece(piece) || matchActionState.freeMode?.active || matchActionState.activeMovement?.active || actionResolutionRef.current) return;
    if (!isTeamPhaseActive(team)) {
      setIllegalMoveNotice({ reason: phaseBlockReason() });
      return;
    }
    setPendingEndTurn({ team });
  }
  function confirmEndTurn() {
    if (!pendingEndTurn) return;
    const endingTeam = pendingEndTurn.team;
    if (sessionCode) {
      const beforeTimeline = captureTimelineGameState();
      const nextPhase = nextTrackerPhase(turnPhase);
      const nextMatchActionState = clearGroupMoveState(beforeTimeline.tracker.matchActionState);
      const afterTimeline = createGameState({
        ...beforeTimeline,
        tracker: {
          ...beforeTimeline.tracker,
          matchActionState: nextMatchActionState,
          turnPhase: nextPhase,
        },
      });
      setPendingEndTurn(null);
      setGroupMoveZoneDraft(null);
      groupMoveZoneDragRef.current = null;
      setMatchActionState(nextMatchActionState);
      setTurnPhase(nextPhase);
      setSelectedId(null);
      setHoveredCell(null);
      recordTimelineTransition({
        type: "PHASE_ENDED",
        label: `${endingTeam === "blue" ? "Blue" : "Red"} END TURN → ${nextPhase.toUpperCase()}`,
        team: endingTeam,
        before: beforeTimeline,
        after: afterTimeline,
      });
      return;
    }
    const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
    const tracker = normalizeTrackerSnapshot(before.tracker);
    const advancesTurn = tracker.turnPhase === "defense" && tracker.currentTurn < tracker.settings.turns;
    const nextTurn = advancesTurn ? tracker.currentTurn + 1 : null;
    const dispatched = dispatchSinglePlayerGameCommand({
      timeline: gameTimelineRef.current,
      state: before,
      context: singlePlayerMatchContext(),
      command: { id: createActionEventId(`tracker_phase_end_${endingTeam}`), type: GAME_COMMAND_TYPE.TRACKER_PHASE_ENDED, payload: { team: endingTeam } },
      label: advancesTurn
        ? `${endingTeam === "blue" ? "Blue" : "Red"} END TURN → TURN ${nextTurn}`
        : `${endingTeam === "blue" ? "Blue" : "Red"} END TURN → ${tracker.turnPhase === "attack" ? "DEFENSE" : "COMPLETE"}`,
    });
    if (!dispatched.result.accepted) {
      if (dispatched.result.reason) setIllegalMoveNotice({ reason: dispatched.result.reason });
      setPendingEndTurn(null);
      return;
    }
    setPendingEndTurn(null);
    setGroupMoveZoneDraft(null);
    groupMoveZoneDragRef.current = null;
    replaceGameTimeline(dispatched.timeline);
    applyTimelineGameState(dispatched.state);
    const startedTurn = dispatched.result.events?.[0]?.metadata?.startedTurn;
    if (Number.isInteger(startedTurn)) setStartedTurnNotice(startedTurn);
    if (dispatched.state.tracker?.turnPhase === "complete") setMatchOverNotice(true);
  }

  function commitEndBonusAction(continuation) {
    const team = continuation?.team;
    const completion = endContinuationAction(continuation);
    if (!completion || actionResolutionRef.current) return;
    const beforeTimeline = captureTimelineGameState();
    const policy = completion.resumePolicy;
    const declined = Boolean(completion.declined);
    let overrides = { actionContinuation: null };
    let label = declined
      ? `${team === "blue" ? "Blue" : "Red"} declines the bonus action`
      : `${team === "blue" ? "Blue" : "Red"} bonus action ended`;

    if (policy.type === CONTINUATION_RESUME_TYPE.ADVANCE_TURN) {
      const emptyTurn = createEmptyTrackerTurnState();
      const nextTeam = policy.team || team;
      const nextTurn = Math.min(trackerSettings.turns, Math.max(1, policy.nextTurn));
      setTrackerStartingTeam(nextTeam);
      setTrackerCurrentTurn(nextTurn);
      setTurnPhase(policy.phase || "attack");
      setTrackerUsedActions(emptyTurn.usedActions);
      setTrackerActionLog(emptyTurn.actionLog);
      setMatchActionState(emptyTurn.matchActionState);
      setMovementStateByPieceId({});
      movementStateRef.current = {};
      overrides = {
        ...overrides,
        trackerStartingTeam: nextTeam,
        trackerCurrentTurn: nextTurn,
        trackerUsedActions: emptyTurn.usedActions,
        trackerActionLog: emptyTurn.actionLog,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: policy.phase || "attack",
        movementStateByPieceId: {},
      };
      label += ` — Turn ${nextTurn}`;
    }

    setLiveActionContinuation(null);
    setSelectedId(null);
    setHoveredCell(null);
    recordTimelineTransition({
      type: declined ? "BONUS_ACTION_DECLINED" : "BONUS_ACTION_ENDED",
      label,
      team,
      metadata: {
        continuationId: continuation.id,
        resumePolicy: policy,
        bonusAction: {
          used: !declined,
          declined,
          actionType: continuation.actionType || null,
          pieceId: continuation.pieceId || null,
        },
      },
      before: beforeTimeline,
      after: mergeTimelineGameState(beforeTimeline, overrides),
    });
  }

  async function requestBonusActionEnd(continuation) {
    if (!sessionCode || !continuation || bonusActionEndIntentPendingRef.current) return false;
    bonusActionEndIntentPendingRef.current = true;
    setBonusActionEndIntentPending(true);
    const requestId = `bonus_action_end_${continuation.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(sessionRuntimeRef(sessionCode.toUpperCase(), "bonusActionEndIntent"), {
        requestId, continuationId: continuation.id, team: continuation.team,
        requestedByUid: user?.uid || "", requestedByClient: clientIdRef.current,
        baseRevision: Math.max(0, Number(gameTimelineRef.current?.revision) || 0),
        status: "pending", requestedAt: serverTimestamp(),
      });
      multiplayerTracerRef.current.multiplayer("BONUS_ACTION_END_INTENT_SENT", { requestId, continuationId: continuation.id, team: continuation.team });
      return true;
    } catch (error) {
      bonusActionEndIntentPendingRef.current = false;
      setBonusActionEndIntentPending(false);
      console.error("Bonus action end intent failed", error);
      return false;
    }
  }

  function endBonusAction() {
    const continuation = actionContinuationRef.current;
    if (!continuation || !canControlBonusContinuation(continuation) || actionResolutionRef.current) return;
    if (!sessionCode) {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const declined = continuation.status === CONTINUATION_STATUS.READY;
      const dispatched = dispatchSinglePlayerGameCommand({
        timeline: gameTimelineRef.current,
        state: before,
        context: singlePlayerMatchContext(),
        command: {
          id: createActionEventId(`bonus_action_end_${continuation.id}`),
          type: GAME_COMMAND_TYPE.BONUS_ACTION_ENDED,
          payload: { continuationId: continuation.id },
        },
        label: declined
          ? `${continuation.team === "blue" ? "Blue" : "Red"} declines the bonus action`
          : `${continuation.team === "blue" ? "Blue" : "Red"} bonus action ended`,
      });
      if (!dispatched.result.accepted) {
        if (dispatched.result.reason) setIllegalMoveNotice({ reason: dispatched.result.reason });
        return;
      }
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      const startedTurn = dispatched.result.events?.[0]?.metadata?.startedTurn;
      if (Number.isInteger(startedTurn)) setStartedTurnNotice(startedTurn);
      if (dispatched.state.tracker?.turnPhase === "complete") setMatchOverNotice(true);
      return;
    }
    if (sessionCode && !sessionAuthorityRef.current.isHost) {
      requestBonusActionEnd(continuation);
      return;
    }
    commitEndBonusAction(continuation);
  }

  function startTrackedGame(team) {
    if (trackerReadOnly) return;
    if (!sessionCode && gameMode === "match") {
      const before = currentTimelineGameStateSnapshot() || captureTimelineGameState();
      const restarting = normalizeTrackerSnapshot(before.tracker).gameStarted;
      const context = createMatchContext({
        id: gameTimelineRef.current?.recordingId || `single-player-${Date.now()}`,
        ruleSet: before.ruleSet,
        boardSettings: before.settings,
        gameplayCards: captureAvailableMatchCards(),
      });
      const command = {
        id: createActionEventId(`${restarting ? "match_restart" : "match_start"}_${team}`),
        type: restarting ? GAME_COMMAND_TYPE.MATCH_RESTARTED : GAME_COMMAND_TYPE.MATCH_STARTED,
        payload: { team },
      };
      const dispatched = restarting
        ? dispatchSinglePlayerGameCommand({
            timeline: gameTimelineRef.current,
            state: before,
            context,
            command,
            label: `Match restarted: ${team === "blue" ? "Blue" : "Red"} attacks`,
          })
        : dispatchSinglePlayerMatchStart({
            state: before,
            context,
            command,
            label: `Match started: ${team === "blue" ? "Blue" : "Red"} attacks`,
          });
      if (!dispatched.result.accepted) {
        if (dispatched.result.reason) setIllegalMoveNotice({ reason: dispatched.result.reason });
        return;
      }
      matchContextRef.current = context;
      matchPlayableStartEstablishedRef.current = true;
      setTrackerStartChoiceOpen(false);
      replaceGameTimeline(dispatched.timeline);
      applyTimelineGameState(dispatched.state);
      return;
    }
    const beforeTimeline = captureTimelineGameState();
    const emptyTurn = createEmptyTrackerTurnState();
    const { usedActions, actionLog: emptyLog, matchActionState: emptyMatchState } = emptyTurn;
    setTrackerStartingTeam(team);
    setTrackerCurrentTurn(1);
    setTrackerUsedActions(usedActions); setTrackerActionLog(emptyLog); setMatchActionState(emptyMatchState);
    setTrackerGameStarted(true);
    setTurnPhase("attack");
    setMovementStateByPieceId({}); movementStateRef.current = {};
    setLiveActionResolution(null);
    setLiveActionContinuation(null);
    setTrackerStartChoiceOpen(false);
    const playableStart = mergeTimelineGameState(beforeTimeline, {
      trackerGameStarted: true,
      trackerStartingTeam: team,
      trackerCurrentTurn: 1,
      trackerUsedActions: usedActions,
      trackerActionLog: emptyLog,
      matchActionState: emptyMatchState,
      turnPhase: "attack",
      movementStateByPieceId: {},
      actionResolution: null,
      actionContinuation: null,
    });
    const shouldCreatePlayableBaseline = !matchPlayableStartEstablishedRef.current;
    if (shouldCreatePlayableBaseline) {
      matchPlayableStartEstablishedRef.current = true;
      startGameTimeline(playableStart, { syncSession: Boolean(sessionCode) });
    }
    if (!sessionCode) {
      matchContextRef.current = createMatchContext({
        id: gameTimelineRef.current?.recordingId || `single-player-${Date.now()}`,
        ruleSet: playableStart.ruleSet,
        boardSettings: playableStart.settings,
        gameplayCards: captureAvailableMatchCards(),
      });
    }
    recordTimelineTransition({
      type: "MATCH_STARTED",
      label: `Match started: ${team === "blue" ? "Blue" : "Red"} attacks`,
      team,
      before: shouldCreatePlayableBaseline ? playableStart : beforeTimeline,
      after: playableStart,
      allowNoop: true,
    });
  }
  function applyTrackerTurn(turn) {
    const beforeTimeline = captureTimelineGameState();
    const emptyTurn = createEmptyTrackerTurnState();
    const { usedActions, actionLog: emptyLog, matchActionState: emptyMatchState } = emptyTurn;
    setTrackerCurrentTurn(turn);
    setTurnPhase("attack");
    setTrackerUsedActions(usedActions); setTrackerActionLog(emptyLog); setMatchActionState(emptyMatchState);
    setMovementStateByPieceId({}); movementStateRef.current = {};
    recordTimelineTransition({
      type: "TURN_CHANGED",
      label: `Turn ${turn}`,
      before: beforeTimeline,
      after: captureTimelineGameState({ trackerCurrentTurn: turn, trackerUsedActions: usedActions, trackerActionLog: emptyLog, matchActionState: emptyMatchState, turnPhase: "attack", movementStateByPieceId: {} }),
    });
  }
  function selectTrackerTurn(turn) {
    const decision = trackerTurnChangeDecision({
      readOnly: trackerReadOnly,
      gameStarted: trackerGameStarted,
      gameMode,
      currentTurn: trackerCurrentTurn,
      targetTurn: turn,
      turnPhase,
    });
    if (!decision.allowed) {
      if (decision.reason === "both-teams-must-end") setTurnAdvanceNotice(true);
      return;
    }
    setPendingTurnChange({ turn, direction: decision.direction });
  }
  function confirmTrackerTurnChange() {
    if (!pendingTurnChange) return;
    applyTrackerTurn(pendingTurnChange.turn);
    setPendingTurnChange(null);
  }
  function resetTrackerActions() {
    if (trackerReadOnly) return;
    const beforeTimeline = captureTimelineGameState();
    const emptyTurn = createEmptyTrackerTurnState();
    const { usedActions, actionLog: emptyLog, matchActionState: emptyMatchState } = emptyTurn;
    setTrackerUsedActions(usedActions); setTrackerActionLog(emptyLog); setMatchActionState(emptyMatchState);
    setMovementStateByPieceId({}); movementStateRef.current = {};
    recordTimelineTransition({
      type: "TRACKER_RESET",
      label: "Tracker actions reset",
      before: beforeTimeline,
      after: captureTimelineGameState({ trackerUsedActions: usedActions, trackerActionLog: emptyLog, matchActionState: emptyMatchState, movementStateByPieceId: {} }),
    });
  }
  function changeTrackerPossession() {
    if (trackerReadOnly || !trackerGameStarted) return;
    const beforeTimeline = captureTimelineGameState();
    const nextAttackingTeam = opposingTeam(trackerStartingTeam);
    const emptyTurn = createEmptyTrackerTurnState();
    const { usedActions, actionLog: emptyLog, matchActionState: emptyMatchState } = emptyTurn;
    setTrackerStartingTeam(nextAttackingTeam);
    setTurnPhase("attack");
    setTrackerUsedActions(usedActions); setTrackerActionLog(emptyLog); setMatchActionState(emptyMatchState);
    setMovementStateByPieceId({}); movementStateRef.current = {};
    recordTimelineTransition({
      type: "POSSESSION_CHANGED",
      label: `Possession changed: ${nextAttackingTeam === "blue" ? "Blue" : "Red"} attacks`,
      team: nextAttackingTeam,
      before: beforeTimeline,
      after: captureTimelineGameState({ trackerStartingTeam: nextAttackingTeam, trackerUsedActions: usedActions, trackerActionLog: emptyLog, matchActionState: emptyMatchState, turnPhase: "attack", movementStateByPieceId: {} }),
    });
  }
  function trackerRoleFor(team) {
    return trackerRoleForTeam({
      gameStarted: trackerGameStarted,
      startingTeam: trackerStartingTeam,
      currentTurn: trackerCurrentTurn,
      settings: trackerSettings,
    }, team);
  }
  function trackerActionCountFor(team) {
    return trackerActionLimitForTeam({
      gameStarted: trackerGameStarted,
      startingTeam: trackerStartingTeam,
      currentTurn: trackerCurrentTurn,
      settings: trackerSettings,
    }, team);
  }
  function toggleTrackerAction(team, index) {
    if (trackerReadOnly || !trackerGameStarted) return;
    const usedActions = toggleTrackerActionMarker(trackerUsedActions, team, index);
    setTrackerUsedActions(usedActions);
    syncSharedTracker({ usedActions });
  }

  function onRulerPanelPointerDown(e) {
    e.preventDefault();
    setRulerPanelDragging({
      startX: e.clientX,
      startY: e.clientY,
      originX: rulerPanelPosition.x,
      originY: rulerPanelPosition.y,
    });
  }

  function onRulerPanelPointerMove(e) {
    if (!rulerPanelDragging) return;
    const nextX = rulerPanelDragging.originX + (e.clientX - rulerPanelDragging.startX);
    const nextY = rulerPanelDragging.originY + (e.clientY - rulerPanelDragging.startY);
    setRulerPanelPosition({
      x: clamp(nextX, 0, window.innerWidth - 80),
      y: clamp(nextY, 0, window.innerHeight - 50),
    });
  }

  function onRulerPanelResizeDown(e) {
    e.preventDefault();
    e.stopPropagation();
    setRulerPanelResizing({
      startX: e.clientX,
      startY: e.clientY,
      originW: rulerPanelSize.w,
      originH: rulerPanelSize.h,
    });
  }

  function onRulerPanelResizeMove(e) {
    if (!rulerPanelResizing) return;
    setRulerPanelSize({
      w: clamp(rulerPanelResizing.originW + (e.clientX - rulerPanelResizing.startX), 220, 560),
      h: clamp(rulerPanelResizing.originH + (e.clientY - rulerPanelResizing.startY), 170, 520),
    });
  }

  function onRulerPanelPointerUp() {
    setRulerPanelDragging(null);
    setRulerPanelResizing(null);
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

  function isPitchTouchTarget(target) {
    if (!target || !pitchRef.current) return false;
    if (target.closest && target.closest(".piece")) return false;
    return target === pitchRef.current || pitchRef.current.contains(target);
  }

  function onBoardTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      multiTouchUntilRef.current = Date.now() + 400;
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

    if (e.touches.length === 1 && isPitchTouchTarget(e.target)) {
      const touch = e.touches[0];
      touchGestureRef.current = {
        mode: "one-finger",
        startX: touch.clientX,
        startY: touch.clientY,
        point: measureMode ? getRulerPointFromClient(touch.clientX, touch.clientY) : null,
        moved: false,
      };
    }
  }

  function onBoardTouchMove(e) {
    const gesture = touchGestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "two-finger" && e.touches.length === 2) {
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
      return;
    }

    if (gesture.mode === "one-finger" && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      if (!gesture.moved && Math.sqrt(dx * dx + dy * dy) > 6) {
        gesture.moved = true;
      }
      // Pe touch, un singur deget NU mută tabla.
      // Un deget rămâne doar pentru tap pe riglă / pucuri; tabla se mută doar cu două degete.
      if (gesture.moved) {
        e.preventDefault();
      }
    }
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
    const gesture = touchGestureRef.current;
    if (gesture?.mode === "one-finger" && e.touches.length === 0) {
      if (!gesture.moved && Date.now() >= multiTouchUntilRef.current) {
        if (measureMode && gesture.point) {
          applyRulerPoint(gesture.point);
        } else if (actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "targeting") {
          if (!canControlActiveResolution(actionResolutionRef.current)) return;
          const point = gridPointFromClient(gesture.startX, gesture.startY);
          if (point) choosePassTarget(point.x, point.y);
        } else if (actionResolutionRef.current?.kind === "pass") {
          // After target selection, touch input is reserved for a route badge
          // or for two-finger panning; it cannot become a board movement.
          return;
        } else if (freeBallActive) {
          const point = gridPointFromClient(gesture.startX, gesture.startY);
          if (point) moveBallFreelyTo(point.x, point.y);
        } else if (groupMoveZoneDraft) {
          // The Group Move band is positioned only by dragging the band itself.
          return;
        } else if (selectedId) {
          const point = gridPointFromClient(gesture.startX, gesture.startY);
          if (point) moveSelectedPieceTo(point.x, point.y);
        }
      }
      touchGestureRef.current = null;
      return;
    }

    if (e.touches.length < 2) {
      touchGestureRef.current = null;
    }
  }

  function onHistoryPointerUp(e) {
    if (!e || historyDragRef.current?.pointerId === e.pointerId) historyDragRef.current = null;
    if (!e || historyResizeRef.current?.pointerId === e.pointerId) historyResizeRef.current = null;
  }

  function onDicePanelPointerUp() {
    dicePanelDragRef.current = null;
    dicePanelResizeRef.current = null;
    setDicePanelDragging(null);
    setDicePanelResizing(null);
  }

  function renderTeamRollControl(team, { label = "ROLL", className = "" } = {}) {
    const isRolling = team === "blue" ? blueDieRolling : redDieRolling;
    const otherTeamRolling = team === "blue" ? redDieRolling : blueDieRolling;
    const disabled = !canRollTeamDie(team) || isRolling || otherTeamRolling || diceCooldownUntil > Date.now();
    const currentDieType = actionResolutionRef.current?.kind === "pass" && actionResolutionRef.current.status === "awaiting-interception-roll"
      ? 20
      : dieType;
    if (chooseRollEnabled && chooseRollForTeam === team) {
      return (
        <select
          className={`choose-roll-select ${className}`.trim()}
          value=""
          autoFocus
          aria-label={`Choose ${team} die result`}
          onChange={e => {
            const result = Number(e.target.value);
            if (!Number.isInteger(result)) return;
            setChooseRollForTeam(null);
            void rollTeamDie(team, result);
          }}
        >
          <option value="" disabled>Choose…</option>
          {Array.from({ length: Math.max(2, Number(currentDieType) || 20) }, (_, index) => index + 1).map(result => (
            <option key={result} value={result}>{result}</option>
          ))}
        </select>
      );
    }
    return <button className={className} disabled={disabled} onClick={() => requestTeamDieRoll(team)}>{label}</button>;
  }

  return (
    <div className={`app ${touchMode ? "touch-mode" : ""} ${lockUI ? "locked-ui" : ""} ${isReplayView ? "replay-mode" : ""}`}>
      <div className="topbar">
        <strong>Sandbox <span>{APP_VERSION}</span></strong>
        {isReplayView ? (
          <>
            <span className="replay-pill">REPLAY VIEW</span>
            <span className="replay-name" title={replayRecording?.name || ""}>{replayRecording?.name || "Imported match"}</span>
            <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
            <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
            <button onClick={undo} disabled={!gameTimeline || gameTimeline.cursor <= 0}><Undo2 size={16} /> Undo</button>
            <button onClick={redo} disabled={!gameTimeline || gameTimeline.cursor >= gameTimeline.entries.length}><Redo2 size={16} /> Redo</button>
            <button className={historyVisible ? "toggle-on" : ""} onClick={() => setHistoryVisible(v => !v)}>History</button>
            <button className={trackerVisible ? "toggle-on" : ""} onClick={() => setTrackerEnabledForSession(!trackerVisible)}>Tracker</button>
            <button className={dicePanelVisible ? "toggle-on" : ""} onClick={() => setDicePanelVisible(v => !v)}>Dice</button>
            <button className={inspectorVisible ? "toggle-on" : ""} onClick={() => { setInspectorVisible(v => !v); if (!inspectorVisible) setInspectorMinimized(false); }}>Insp</button>
            <label className="import-btn">Import Match<input type="file" accept="application/json" onChange={e => { importMatchRecording(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button className="exit-replay-btn" onClick={exitReplayView}>Exit Replay</button>
          </>
        ) : (
        <>
        <div className="authbox">
          {!authReady ? (
            <span>Auth...</span>
          ) : user ? (
            user.isAnonymous ? (
              <>
                <span className="user-email">Guest</span>
                <span className="cloud-pill">No cloud save</span>
                <button onClick={logout}>Leave Guest</button>
              </>
            ) : (
              <>
                <span className="user-email">{user.email}</span>
                <span className={`cloud-pill ${cloudError ? "cloud-error" : ""}`}>{cloudStatus}</span>
                {!isSessionGuest && (
                  <>
                    <button onClick={() => saveCloudState({}, "Cloud saved")}>Cloud Save</button>
                    <button onClick={exportFullBackup}>Export Cards & Board</button>
                    <label className="import-btn">Import Cards & Board<input type="file" accept="application/json" onChange={e => { restoreFullBackup(e.target.files?.[0]); e.target.value = ""; }} /></label>
                  </>
                )}
                <button onClick={logout}>Logout</button>
              </>
            )
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
              <span className="session-players">Connected: {sessionPlayers}</span>
              <span className="session-role">{myTeam === "blue" ? "Blue" : myTeam === "red" ? "Red" : "Spectator"}</span>
              <span className="session-status">{sessionStatus}</span>
              {user?.uid === sessionOwnerUid && teamOwners.blue && teamOwners.red && (
                <span className="session-card-mode">
                  <button className={cardVisibilityMode === "open" ? "active" : ""} onClick={() => setSessionCardMode("open")}>Open Cards</button>
                  <button className={cardVisibilityMode === "private" ? "active" : ""} onClick={() => setSessionCardMode("private")}>Private Cards</button>
                </span>
              )}
              {user?.uid !== sessionOwnerUid && cardVisibilityMode && <span className="session-mode-label">{cardVisibilityMode === "open" ? "Open Cards" : "Private Cards"}</span>}
              <button onClick={() => leaveSession()}>Leave</button>
              {user?.uid === sessionOwnerUid && <button onClick={endSession}>End Session</button>}
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

        {canAccessPrimaryToolbarControls && (
        <>
        <SettingNumber label="Teren L" name="cols" min={12} max={100} />
        <SettingNumber label="Teren l impar" name="rows" min={8} max={70} step={2} />
        <SettingNumber label="Pătrățel" name="cellSize" min={16} max={70} />

        <SettingNumber label="Poartă X" name="goalDepth" min={1} max={12} />
        <SettingNumber label="Poartă Y impar" name="goalWidth" min={2} max={30} step={2} />

        <SettingNumber label="Careu mare X" name="boxDepth" min={2} max={36} />
        <SettingNumber label="Careu mare Y" name="boxWidth" min={4} max={60} />

        <SettingNumber label="Careu mic X" name="smallDepth" min={1} max={24} />
        <SettingNumber label="Careu mic Y" name="smallWidth" min={2} max={40} />

        <SettingNumber label="11m dist" name="penaltyDistance" min={1} max={Math.floor(settings.cols/2)} />
        <SettingNumber label="11m Y" name="penaltyY" min={0} max={settings.rows} />

        <SettingNumber label="Cerc centru" name="centerCircleRadius" min={1} max={20} />
        <SettingNumber label="Semicerc" name="arcRadius" min={1} max={20} />
        <SettingNumber label="Arc colț" name="cornerArcRadius" min={1} max={5} />

        <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
        <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
        <button onClick={undo} disabled={gameMode !== "match" || !gameTimeline || gameTimeline.cursor <= 0 || (!!sessionCode && !isSessionHost)}><Undo2 size={16} /> Undo</button>
        <button onClick={redo} disabled={gameMode !== "match" || !gameTimeline || gameTimeline.cursor >= gameTimeline.entries.length || (!!sessionCode && !isSessionHost)}><Redo2 size={16} /> Redo</button>
        <button onClick={resetPiecePositions}><RotateCcw size={16} /> Reset Position</button>
        <button onClick={resetPieceCards}><RotateCcw size={16} /> Reset Cards</button>
        <button className={touchMode ? "toggle-on" : ""} onClick={() => setTouchMode(v => !v)}>
          Touch {touchMode ? "ON" : "OFF"}
        </button>
        <button className={lockUI ? "toggle-on" : ""} onClick={() => { beforeLockViewRef.current = { zoom, panOffset }; setPanOffset({x:0,y:0}); setZoom(z=>Math.min(3, Number((z+0.2).toFixed(2)))); setLockUI(true); }}>
          Lock UI
        </button>
        <button className={showCoordinates ? "toggle-on" : ""} onClick={() => setShowCoordinates(v => !v)}>
          Coordonate
        </button>
        <button
          disabled={!!sessionCode && !isSessionHost}
          title={!!sessionCode && !isSessionHost ? "Only the host can change tracker settings" : ""}
          onClick={() => { setTrackerSettingsDraft(trackerSettings); setTrackerSettingsOpen(true); }}
        >
          Tracker Settings
        </button>
        <button className={`game-mode-btn ${gameMode}`} disabled={!!sessionCode && !isSessionHost} title={!!sessionCode && !isSessionHost ? "Only the host can change game mode." : ""} onClick={toggleGameMode}>
          {gameMode === "editor" ? "Editor Mode" : "Match Mode"}
        </button>
        <button
          onClick={saveMatchRecording}
          disabled={!gameTimeline || (!!sessionCode && !isSessionHost)}
          title={sessionCode && !isSessionHost ? "Doar hostul poate salva meciul multiplayer." : !gameTimeline ? "Intră în Match Mode pentru a începe înregistrarea." : "Salvează Match Timeline-ul curent."}
        >
          Save Match
        </button>
        <button
          onClick={exportAiAnalysis}
          disabled={!gameTimeline || (!!sessionCode && !isSessionHost)}
          title={sessionCode && !isSessionHost ? "Doar hostul poate exporta analiza AI a meciului multiplayer." : !gameTimeline ? "Intră în Match Mode pentru a începe înregistrarea." : "Exportă un rezumat compact pentru analiza AI. Nu schimbă Full Replay-ul."}
        >
          Export AI Analysis
        </button>
        <label className={`import-btn ${sessionCode ? "disabled" : ""}`} title={sessionCode ? "Ieși din sesiunea multiplayer înainte de import." : "Importă un Match Recording pentru vizionare."}>
          Import Match
          <input type="file" accept="application/json" disabled={Boolean(sessionCode)} onChange={e => { importMatchRecording(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button
          className={ruleSetEditingLocked ? "rules-locked" : ""}
          onClick={() => {
            setRuleSetSelectionId(activeRuleSet.id);
            setRuleSetDraft(activeRuleSet);
            setRulesPanelOpen(true);
          }}
          title={ruleSetEditingLocked ? "Rule Sets are locked while a Match is active." : "Manage the active Rule Set."}
        >
          Rules
        </button>
        <button
          className={`choose-roll-toggle ${chooseRollEnabled ? "is-active" : "is-inactive"}`}
          onClick={() => setChooseRollMode(!chooseRollEnabled)}
          title="When enabled, Roll lets each team choose the die result for testing."
        >
          Choose Roll
        </button>
        </>
        )}
        </>
        )}
      </div>
      {!isReplayView && (
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

        {!isSessionGuest && (
          <div className="situation-control">
            <span>Scenario</span>
            <select value={activeSituationId} onChange={e => selectScenarioSlot(Number(e.target.value))}>
              {gameSituations.map(s => (
                <option key={s.id} value={s.id}>{s.id}. {s.name}{s.snapshot ? "" : " (empty)"}</option>
              ))}
            </select>
            <input
              className="situation-name"
              value={activeSituationName}
              onChange={e => setActiveSituationName(e.target.value)}
              onFocus={e => e.target.select()}
            />
            <button onClick={saveActiveGameSituation}>Save</button>
            <button onClick={loadActiveScenario}>Load</button>
          </div>
        )}

        <button className={historyVisible ? "toggle-on" : ""} onClick={() => setHistoryVisible(v => !v)}>
          History {historyVisible ? "ON" : "OFF"}
        </button>
        <button
          className={measureMode ? "toggle-on" : ""}
          disabled={!!sessionCode && (!canUseSharedRuler || (measureMode && !isSharedRulerOwner))}
          title={sharedRulerReadOnly ? `Ruler in use by ${sharedRulerOwnerTeam || "another player"}` : ""}
          onClick={() => {
            if (measureMode) deactivateSharedRuler();
            else activateSharedRuler();
          }}
        >
          {sharedRulerReadOnly
            ? `Ruler ${sharedRulerOwnerTeam ? sharedRulerOwnerTeam.toUpperCase() : "IN USE"}`
            : `Ruler ${measureMode ? "ON" : "OFF"}`}
        </button>
        <button className={dicePanelVisible ? "toggle-on" : ""} onClick={() => setDicePanelVisible(v => !v)}>
          Dice {dicePanelVisible ? "ON" : "OFF"}
        </button>
        <button className={cardsPanelOpen ? "toggle-on" : ""} onClick={() => setCardsPanelOpen(v => !v)}>
          Cards
        </button>
        <button className={inspectorVisible ? "toggle-on" : ""} onClick={() => { setInspectorVisible(v => !v); if (!inspectorVisible) setInspectorMinimized(false); }}>
          Insp
        </button>
        <button className={defAreaMode ? "toggle-on" : ""} onClick={() => setDefAreaMode(v => (v + 1) % 3)}>
          {defAreaButtonLabel}
        </button>
        <button
          className={trackerVisible ? "toggle-on" : ""}
          onClick={() => setTrackerEnabledForSession(!trackerVisible)}
        >
          Tracker
        </button>
      </div>
      )}

      {cardsPanelOpen && !lockUI && CardsPanel()}

      <div className="board-and-inspector">
      <BoardCanvas
        boardWrapRef={boardWrapRef}
        pitchRef={pitchRef}
        selectedId={selectedId}
        activeInteractionPieceId={activeInteractionPieceId}
        setHoveredCell={setHoveredCell}
        startBoardPan={startBoardPan}
        moveBoardPan={moveBoardPan}
        endBoardPan={endBoardPan}
        onBoardWheel={onBoardWheel}
        onBoardTouchStart={onBoardTouchStart}
        onBoardTouchMove={onBoardTouchMove}
        onBoardTouchEnd={onBoardTouchEnd}
        pitchShellStyle={pitchShellStyle}
        pitchStyle={pitchStyle}
        settings={settings}
        onPitchPointerDown={onPitchPointerDown}
        onPitchPointerMove={onPitchPointerMove}
        onPitchPointerUp={onPitchPointerUp}
        onPitchPointerCancel={onPitchPointerCancel}
        selectedPiece={selectedPiece}
        selectedMovementAxis={selectedMovementAxis}
        movementAxisSymbol={movementAxisSymbol}
        movementPreview={movementPreview}
        hoveredCell={hoveredCell}
        coordinateCells={coordinateCells}
        measureMode={measureMode}
        measureStart={measureStart}
        measureEnd={measureEnd}
        measureType={measureType}
        rulerMarkers={rulerMarkers}
        defensiveAreaOverlays={defensiveAreaOverlays}
        passPreview={passPreview}
        passTargeting={actionResolution?.kind === "pass" && actionResolution.status === "targeting" && canControlActiveResolution(actionResolution)}
        passActive={passActive && canControlActiveResolution(actionResolution)}
        passTargetDistance={passTargetDistance}
        passRouteInteractive={actionResolution?.kind === "pass" && actionResolution.status === "route-selection" && canControlActiveResolution(actionResolution)}
        onSelectPassRoute={confirmPassRoute}
        groupMoveZone={groupMoveZoneDraft
          ? { ...groupMoveZoneDraft, confirmable: true }
          : null}
        onConfirmGroupMoveZone={confirmGroupMoveZone}
        onGroupMoveZoneDragStart={startGroupMoveZoneDrag}
        onGroupMoveZoneDragMove={moveGroupMoveZoneDrag}
        onGroupMoveZoneDragEnd={endGroupMoveZoneDrag}
        groupMovePieceStatusById={groupMovePieceStatusById}
        pieces={pieces}
        getPieceDisplayLabel={getPieceDisplayLabel}
        onPiecePointerDown={onPiecePointerDown}
        openEdit={openEdit}
      />

      {inspectorVisible && !lockUI && (
      <aside
        className={`card-inspector ${inspectorMinimized ? "minimized" : ""}`}
        style={{ "--inspector-x": `${inspectorPosition.x}px`, "--inspector-y": `${inspectorPosition.y}px`, "--inspector-w": `${inspectorSize.w}px`, "--inspector-h": `${inspectorSize.h}px` }}
        onPointerMove={onInspectorPointerMove}
        onPointerUp={stopInspectorPointerWork}
        onPointerCancel={stopInspectorPointerWork}
      >
        <div className="inspector-head inspector-drag-handle" onPointerDown={onInspectorDragDown}>
          <strong>Inspector</strong>
          <div className="inspector-head-right">
            {inspectedPiece && <span>{inspectedPiece.team === "A" ? "Blue" : inspectedPiece.team === "B" ? "Red" : "Match Ball"}{inspectedPiece.team === "BALL" ? "" : ` · ${getPieceDisplayLabel(inspectedPiece)}`}</span>}
            <button className="inspector-window-btn" title="Minimize" onPointerDown={e => e.stopPropagation()} onClick={() => setInspectorMinimized(v => !v)}>{inspectorMinimized ? "□" : "—"}</button>
            <button className="inspector-window-btn" title="Close" onPointerDown={e => e.stopPropagation()} onClick={() => setInspectorVisible(false)}>×</button>
          </div>
        </div>
        {!inspectorMinimized && (
          <div className="inspector-body">
            {!inspectedPiece ? (
              <p className="muted">No selection.</p>
            ) : inspectedPiece.team === "BALL" ? (
              <div className="inspector-ball-state" role="status">
                <MatchBallIcon className="inspector-ball-icon" />
                <strong>Match Ball</strong>
              </div>
            ) : (
              <>
                <div className="inspector-piece-line">
                  <span><b>Post puc:</b> {inspectedPiece.label || "—"}</span>
                  <div className="inspector-piece-primary-actions">
                    {inspectedCard && canControlPieceStatus(inspectedPiece) && (
                      <button
                        type="button"
                        className={`inspector-flip-request-btn piece-status-btn ${inspectedPiece.inactive ? "activate" : "deactivate"}`}
                        onClick={() => togglePieceInactive(inspectedPiece.id)}
                      >
                        {inspectedPiece.inactive ? "ACTIVE" : "INACTIVE"}
                      </button>
                    )}
                  </div>
                  {inspectedCard && !inspectedPiece.inactive && !isOwnCardPiece(inspectedPiece) && (
                    <button
                      type="button"
                      className="inspector-flip-request-btn"
                      onClick={() => requestCardFlip(inspectedCard.id)}
                      disabled={
                        cardVisibilityMode !== "private" ||
                        canViewCardBack(inspectedPiece, inspectedCard.id) ||
                        !!cardRevealRequests?.[inspectedCard.id]?.[user?.uid]
                      }
                    >
                      {canViewCardBack(inspectedPiece, inspectedCard.id)
                        ? "Flip Allowed"
                        : cardRevealRequests?.[inspectedCard.id]?.[user?.uid]
                          ? "Flip Requested"
                          : "Request Flip"}
                    </button>
                  )}
                  {inspectedCard && !inspectedPiece.inactive && isOwnCardPiece(inspectedPiece) && Object.keys(cardRevealPermissions?.[inspectedCard.id] || {}).length > 0 && (
                    <button
                      type="button"
                      className="inspector-flip-request-btn"
                      disabled
                    >
                      Flip Allowed
                    </button>
                  )}
                  {inspectedCard && !inspectedPiece.inactive && isOwnCardPiece(inspectedPiece) && cardVisibilityMode === "private" && Object.keys(cardRevealRequests?.[inspectedCard.id] || {})
                    .filter(viewerUid => !cardRevealPermissions?.[inspectedCard.id]?.[viewerUid])
                    .map(viewerUid => (
                    <button
                      type="button"
                      className="inspector-flip-request-btn"
                      key={viewerUid}
                      onClick={() => allowCardFlip(inspectedCard.id, viewerUid)}
                    >
                      Allow Flip
                    </button>
                  ))}
                  <div className="inspector-turn-actions">
                    {actionContinuation?.kind === "bonus-card-action" && (
                      <button
                        type="button"
                        className={`inspector-flip-request-btn team-action-btn ${pieceTeamKey(inspectedPiece)}`}
                        disabled={
                          pieceTeamKey(inspectedPiece) !== actionContinuation.team
                          || !interactionState.canEndBonusAction
                          || bonusActionEndIntentPending
                        }
                        onClick={endBonusAction}
                      >
                        END B.A.
                      </button>
                    )}
                    <button
                      type="button"
                      className={`inspector-flip-request-btn team-action-btn ${pieceTeamKey(inspectedPiece)}`}
                      disabled={(() => {
                        if (actionContinuation?.kind === "bonus-card-action") return true;
                        return !canUseActionForPiece(inspectedPiece) || !isTeamPhaseActive(pieceTeamKey(inspectedPiece)) || matchActionState.freeMode?.active || matchActionState.activeMovement?.active || Boolean(actionResolution);
                      })()}
                      onClick={() => requestEndTurn(inspectedPiece)}
                    >
                      END TURN
                    </button>
                    {gameMode === "match" && (
                      <button
                        type="button"
                        className={`inspector-flip-request-btn free-action-btn team-action-btn ${pieceTeamKey(inspectedPiece)} ${freeBallActive ? "is-active" : ""}`}
                      disabled={replayModeRef.current || (!sessionCode && (matchActionState.freeMode?.active || matchActionState.groupMove?.active || matchActionState.activeMovement?.active || actionContinuation?.kind === "bonus-card-action")) || (Boolean(sessionCode) && pieceTeamKey(inspectedPiece) !== myTeam)}
                        aria-pressed={freeBallActive}
                        onClick={() => toggleFreeBall(inspectedPiece)}
                      >
                        {freeBallActive ? "FREE BALL: ON" : "FREE BALL"}
                      </button>
                    )}
                    {gameMode === "match" && (
                      <button
                        type="button"
                        className={`inspector-flip-request-btn free-action-btn team-action-btn ${pieceTeamKey(inspectedPiece)} ${matchActionState.freeMode?.active && matchActionState.freeMode?.pieceId === inspectedPiece.id ? "is-active" : ""}`}
                      disabled={Boolean(!sessionCode && (actionContinuation?.kind === "bonus-card-action" || matchActionState.activeMovement?.active)) || !canUseFreeModeForPiece(inspectedPiece) || (matchActionState.freeMode?.active && matchActionState.freeMode?.pieceId !== inspectedPiece.id)}
                        aria-pressed={Boolean(matchActionState.freeMode?.active && matchActionState.freeMode?.pieceId === inspectedPiece.id)}
                        onClick={() => consumeInspectorAction("FREE", inspectedPiece)}
                      >
                        {matchActionState.freeMode?.active && matchActionState.freeMode?.pieceId === inspectedPiece.id ? "FREE MOVE: ON" : "FREE MOVE"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="match-action-row" aria-label="Match actions">
                  {["MOVE", "GROUP_MOVE", "PASS", "SHOT", "CROSS", "DRIBBLE", "TACKLING"].map(type => {
                    const team = pieceTeamKey(inspectedPiece);
                    const status = getTeamActionStatus(team);
                    const pieceState = matchActionState.byPieceId[inspectedPiece.id] || {};
                    const trackerComplete = status.exhausted;
                    const groupMoveActive = hasValidGroupMoveAuthorization(team);
                    const continuation = currentBonusContinuationForTeam(team);
                    const foreignContinuationActive = actionContinuation?.kind === "bonus-card-action" && actionContinuation.team !== team;
                    const inactiveSinglePlayerPhase = !sessionCode && gameMode === "match" && !isTeamPhaseActive(team);
                    const pendingPass = actionResolution?.kind === "pass" ? actionResolution : null;
                    const isPassCancel = type === "PASS"
                      && pendingPass?.passerId === inspectedPiece.id
                      && interactionState.canCancelPass;
                    const activeNormalMove = matchActionState.activeMovement || {};
                    const normalMoveInteractionActive = activeNormalMove.active && activeNormalMove.kind === "normal-move";
                    const isMoveCancel = type === "MOVE"
                      && activeNormalMove.active
                      && activeNormalMove.kind === "normal-move"
                      && String(activeNormalMove.pieceId || "") === String(inspectedPiece.id);
                    const isBonusMoveCancel = type === "MOVE"
                      && continuation?.status === CONTINUATION_STATUS.ACTION_ACTIVE
                      && continuation.actionType === "MOVE"
                      && String(continuation.pieceId || "") === String(inspectedPiece.id)
                      && !continuation.movementStarted;
                    const currentMovement = movementStateByPieceId[inspectedPiece.id] || {};
                    const currentSpeed = getPieceSpeed(inspectedPiece);
                    const hasRemainingNormalMove = Boolean(
                      pieceState.moveAuthorized
                      && !currentMovement.movementEnded
                      && currentSpeed !== null
                      && Number(currentMovement.spent) < currentSpeed
                    );
                    const passLocksActions = Boolean(pendingPass) && !isPassCancel;
                    const bonusActionAvailable = continuation?.status === CONTINUATION_STATUS.READY;
                    const disabled = isBonusMoveCancel
                      ? false
                      : isPassCancel
                        ? passCancelIntentPending
                      : isMoveCancel
                        ? actionStartIntentPending
                        : normalMoveInteractionActive
                          ? true
                        : passLocksActions
                        ? true
                        : foreignContinuationActive
                          ? true
                        : bonusActionAvailable
                          ? type === "GROUP_MOVE"
                          : Boolean(continuation)
                            || inactiveSinglePlayerPhase
                            || !canUseActionForPiece(inspectedPiece)
                            || matchActionState.freeMode?.active
                            || (type === "PASS" && gameMode === "match" && !playerHasBall(inspectedPiece))
                            || groupMoveActive
                            || (type === "MOVE" && pieceState.moveUsed && !hasRemainingNormalMove)
                            || (type === "GROUP_MOVE" && status.remaining !== 1 && !trackerComplete);
                    const label = isPassCancel ? "CANCEL PASS" : (isMoveCancel || isBonusMoveCancel) ? "CANCEL MOVE" : type.replace("GROUP_MOVE", "GROUP MOVE");
                    const actionLocked = trackerComplete && !isPassCancel && !isMoveCancel;
                    return <button className={`team-action-btn ${team} ${type === "GROUP_MOVE" ? "group-move-btn" : ""} ${actionLocked ? "action-locked" : ""}`} key={type} type="button" disabled={disabled} aria-disabled={actionLocked || disabled} onClick={() => consumeInspectorAction(type, inspectedPiece)}>{label}</button>;
                  })}
                </div>
                {inspectedPiece.inactive ? (
                  <div className="inspector-inactive-state" role="status">INACTIVE</div>
                ) : inspectedCard ? (
                  <div className="inspector-card-zoom-block">
                    <div className="inspector-card-zoom-tools">
                      <span>Zoom {Math.round(inspectorCardZoom * 100)}%</span>
                      <button type="button" onClick={resetInspectorCardView} disabled={inspectorCardZoom <= 1 && inspectorCardPan.x === 0 && inspectorCardPan.y === 0}>Reset</button>
                    </div>
                    <div
                      ref={inspectorCardViewportRef}
                      className="inspector-card-zoom-viewport"
                      onWheel={onInspectorCardWheel}
                      onPointerDown={onInspectorCardPointerDown}
                      onPointerMove={onInspectorCardPointerMove}
                      onPointerUp={onInspectorCardPointerEnd}
                      onPointerCancel={onInspectorCardPointerEnd}
                    >
                      <div
                        className="inspector-card-zoom-inner card-render-shell"
                        style={{
                          width: `${INSPECTOR_CARD_CANONICAL_WIDTH}px`,
                          transform: `translate(${inspectorCardPan.x}px, ${inspectorCardPan.y}px) scale(${inspectorCardFitScale * inspectorCardZoom})`,
                        }}
                      >
                        <CardPreview
                          card={inspectedCard}
                          team={inspectedPiece.team === "A" ? "blue" : "red"}
                          side="front"
                          flippable
                          controlledSide={inspectorCardSide}
                          onSideChange={handleInspectorSideChange}
                          renderContext={cardPreviewRenderContext}
                        />
                      </div>
                    </div>
                  </div>
                ) : <div className="card-preview empty">Niciun card atașat</div>}
                <div className="inspector-actions">
                  {canAssignPiece(inspectedPiece) && <button onClick={() => setAssignTarget({ type: "piece", pieceId: inspectedPiece.id })}>Assign Card</button>}
                  {inspectedCard && canAssignPiece(inspectedPiece) && !sessionCode && <button onClick={() => { setCardsPanelOpen(true); setCardsView("library"); setEditingCardId(inspectedCard.id); }}>Edit Card</button>}
                  {inspectedCard && canAssignPiece(inspectedPiece) && <button onClick={() => removePieceCard(inspectedPiece.id)}>Remove Card</button>}
                </div>
              </>
            )}
          </div>
        )}
        <div className="inspector-resize" onPointerDown={onInspectorResizeDown} />
      </aside>
      )}
      </div>

      <div className="status">
        {isReplayView
          ? `Replay read-only · pas ${gameTimeline?.cursor || 0}/${gameTimeline?.entries?.length || 0} · Zoom ${Math.round(zoom * 100)}%`
          : `Zoom ${Math.round(zoom * 100)}% · ${settings.cols} x ${settings.rows} · Dublu click pe jucător ca să schimbi textul`}
      </div>


      {lockUI && (
        <div className="locked-controls">
          <button onClick={() => setZoom(z => clamp(Number((z - 0.1).toFixed(2)), 0.2, 3))}><Minus size={16} /></button>
          <button onClick={() => setZoom(z => clamp(Number((z + 0.1).toFixed(2)), 0.2, 3))}><Plus size={16} /></button>
          <div className="dice-box compact-team-dice">
            <Dices size={16} />
            <select value={passInterceptionRollRequired ? 20 : dieType} disabled={passInterceptionRollRequired} onChange={e => setDieType(Number(e.target.value))}>
              <option value={20}>D20</option><option value={12}>D12</option><option value={10}>D10</option><option value={8}>D8</option><option value={6}>D6</option><option value={4}>D4</option>
            </select>
            {renderTeamRollControl("blue", { label: "Blue", className: "blue-die-button" })}
            <span className={`die-result blue-die-result ${!blueDieRolling && blueDieResult === 1 ? "die-min" : !blueDieRolling && blueDieResult === blueLastDieType ? "die-max" : ""}`}>{blueDieRolling ? (blueDiceAnimationValue ?? "—") : (blueDieResult ?? "—")}</span>
            {renderTeamRollControl("red", { label: "Red", className: "red-die-button" })}
            <span className={`die-result red-die-result ${!redDieRolling && redDieResult === 1 ? "die-min" : !redDieRolling && redDieResult === redLastDieType ? "die-max" : ""}`}>{redDieRolling ? (redDiceAnimationValue ?? "—") : (redDieResult ?? "—")}</span>
          </div>
          <button onClick={() => { const saved = beforeLockViewRef.current; setLockUI(false); if (saved) { setZoom(saved.zoom); setPanOffset(saved.panOffset); } else { setZoom(0.8); setPanOffset({x:0,y:0}); } }}>Unlock</button>
        </div>
      )}

      {measureMode && measureInfo && (
        <div className={`measure-panel ${measureType === "corner" ? "corner" : "center"}`}>
          Ruler {measureType === "corner" ? "Corner-to-Corner" : measureType === "cornerCenter" ? "Corner-to-Center" : "Center-to-Center"}: {measureInfo.cellsLabel} căsuțe
        </div>
      )}

      {measureMode && !lockUI && (
        <div
          className="ruler-panel"
          style={{ left: rulerPanelPosition.x, top: rulerPanelPosition.y, width: rulerPanelSize.w, height: rulerPanelSize.h }}
          onPointerMove={(e) => {
            onRulerPanelPointerMove(e);
            onRulerPanelResizeMove(e);
          }}
          onPointerUp={onRulerPanelPointerUp}
          onPointerCancel={onRulerPanelPointerUp}
        >
          <div className="ruler-panel-title" onPointerDown={onRulerPanelPointerDown}>
            <strong>Ruler{sharedRulerReadOnly ? ` — ${sharedRulerOwnerTeam ? sharedRulerOwnerTeam.toUpperCase() : "read only"}` : ""}</strong>
            <div className="ruler-actions">
              <button disabled={sharedRulerReadOnly} onPointerDown={(e) => e.stopPropagation()} onClick={deactivateSharedRuler}>_</button>
            </div>
          </div>
          <div className="ruler-panel-body">
            <div className="ruler-floating-row mode-row">
              <button disabled={sharedRulerReadOnly} className={measureType === "center" ? "toggle-on ruler-center" : ""} onClick={() => setSharedRulerType("center")}>Center</button>
              <button disabled={sharedRulerReadOnly} className={measureType === "corner" ? "toggle-on ruler-corner" : ""} onClick={() => setSharedRulerType("corner")}>Corner</button>
              <button disabled={sharedRulerReadOnly} className={measureType === "cornerCenter" ? "toggle-on ruler-corner-center" : ""} onClick={() => setSharedRulerType("cornerCenter")}>Corner→Center</button>
            </div>
            <div className="ruler-floating-grid">
              <label className="ruler-mark-input pass">P
                <input type="number" min="1" step="1" value={passMark} disabled={sharedRulerReadOnly} onChange={e => setPassMark(Number(e.target.value) || 1)} onBlur={() => syncSharedRuler({ passMark })} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </label>
              <label className="ruler-mark-input shot">Șut
                <input type="number" min="1" step="1" value={shotMark} disabled={sharedRulerReadOnly} onChange={e => setShotMark(Number(e.target.value) || 1)} onBlur={() => syncSharedRuler({ shotMark })} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </label>
            </div>
          </div>
          <div className="ruler-resize" onPointerDown={onRulerPanelResizeDown} />
        </div>
      )}

      <HistoryPanel
        visible={historyVisible}
        lockUI={lockUI}
        position={historyPosition}
        size={historySize}
        onHistoryPointerMove={onHistoryPointerMove}
        onHistoryResizeMove={onHistoryResizeMove}
        onPointerUp={onHistoryPointerUp}
        onTitlePointerDown={onHistoryPointerDown}
        onHistoryResizeDown={onHistoryResizeDown}
        onClose={() => setHistoryVisible(false)}
        historyListRef={historyListRef}
        isReplayView={isReplayView}
        gameTimeline={gameTimeline}
        clearHistory={clearHistory}
        gameMode={gameMode}
        sessionCode={sessionCode}
        isSessionHost={isSessionHost}
        restoreTimelineCursor={restoreTimelineCursor}
      />

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
            <strong>Dice</strong>
            <div className="dice-actions">
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setDicePanelVisible(false)}>_</button>
            </div>
          </div>
          <div className="dice-panel-body">
            <div className="dice-toolbar">
              <Dices size={18} />
              <select value={passInterceptionRollRequired ? 20 : dieType} disabled={isReplayView || passInterceptionRollRequired} onChange={e => setDieType(Number(e.target.value))}>
                <option value={20}>D20</option><option value={12}>D12</option><option value={10}>D10</option><option value={8}>D8</option><option value={6}>D6</option><option value={4}>D4</option>
              </select>
            </div>
            <div className="team-dice-grid">
              <div className="team-die-card blue-team-die">
                <strong>BLUE DIE <small>D{blueLastDieType}</small></strong>
                <span className={`team-die-value ${!blueDieRolling && blueDieResult === 1 ? "die-min" : !blueDieRolling && blueDieResult === blueLastDieType ? "die-twenty" : ""}`}>{blueDieRolling ? (blueDiceAnimationValue ?? "—") : (blueDieResult ?? "—")}</span>
                {renderTeamRollControl("blue")}
              </div>
              <div className="team-die-card red-team-die">
                <strong>RED DIE <small>D{redLastDieType}</small></strong>
                <span className={`team-die-value ${!redDieRolling && redDieResult === 1 ? "die-min" : !redDieRolling && redDieResult === redLastDieType ? "die-twenty" : ""}`}>{redDieRolling ? (redDiceAnimationValue ?? "—") : (redDieResult ?? "—")}</span>
                {renderTeamRollControl("red")}
              </div>
            </div>
          </div>
          <div className="dice-resize" onPointerDown={onDicePanelResizeDown} />
        </div>
      )}

      <TrackerPanel
        visible={trackerVisible}
        lockUI={lockUI}
        minimized={trackerMinimized}
        readOnly={trackerReadOnly}
        position={trackerPosition}
        size={trackerSize}
        onPointerMove={e => { onTrackerPointerMove(e); onTrackerResizeMove(e); }}
        onPointerUp={onTrackerPointerUp}
        onTitlePointerDown={onTrackerPointerDown}
        onMinimize={() => setTrackerMinimized(v => !v)}
        onClose={() => setTrackerEnabledForSession(false)}
        gameStarted={trackerGameStarted}
        onStartOrRestart={() => setTrackerStartChoiceOpen(true)}
        onChangePossession={changeTrackerPossession}
        onReset={resetTrackerActions}
        trackerSettings={trackerSettings}
        trackerRoleFor={trackerRoleFor}
        trackerActionCountFor={trackerActionCountFor}
        usedActions={trackerUsedActions}
        gameMode={gameMode}
        actionLog={trackerActionLog}
        onToggleAction={toggleTrackerAction}
        onRemoveLastAction={removeLastTrackerAction}
        currentTurn={trackerCurrentTurn}
        turnsReadOnly={!sessionCode && gameMode === "match"}
        onSelectTurn={selectTrackerTurn}
        onResizeDown={onTrackerResizeDown}
      />

      {diceNotice && (
        <div className={`dice-notice ${diceNotice.team} ${diceNotice.result === 1 ? "critical-one" : diceNotice.result === diceNotice.dieType ? "critical-max" : ""}`}>
          {diceNotice.team === "blue" ? "BLUE" : "RED"} rolled {diceNotice.result} <span className="dice-notice-die">(D{diceNotice.dieType})</span>
        </div>
      )}

      {AssignCardModal()}

      {pendingEditorModeExit && (
        <div className="modal-backdrop match-exit-backdrop">
          <div className="modal match-exit-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Unsaved Match</strong></div>
            <div className="turn-confirm-message">
              This match has unsaved changes. Would you like to save it before switching to Editor Mode?
            </div>
            <div className="modal-actions match-exit-actions">
              <button className="save-switch" onClick={() => confirmEditorModeExit(true)}>Save &amp; Switch</button>
              <button onClick={() => confirmEditorModeExit(false)}>Switch Without Saving</button>
            </div>
          </div>
        </div>
      )}

      {joinSetup && (
        <div className="modal-backdrop" onPointerDown={() => setJoinSetup(null)}>
          <div className="assign-modal join-setup-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Join Session</strong><button className="icon-btn" onClick={() => setJoinSetup(null)}><X size={18} /></button></div>
            <div className="join-setup-section">
              <b>Choose your team</b>
              <div className="join-choice-row">
                <button type="button" className={joinSetup.team === "blue" ? "active blue-choice" : "blue-choice"} onClick={() => setJoinSetup(current => ({ ...current, team: "blue" }))}>Blue</button>
                <button type="button" className={joinSetup.team === "red" ? "active red-choice" : "red-choice"} onClick={() => setJoinSetup(current => ({ ...current, team: "red" }))}>Red</button>
              </div>
            </div>
            <div className="join-setup-section">
              <b>Card visibility</b>
              <div className="join-choice-row">
                <button type="button" className={joinSetup.cardMode === "open" ? "active" : ""} onClick={() => setJoinSetup(current => ({ ...current, cardMode: "open" }))}>Open Cards</button>
                <button type="button" className={joinSetup.cardMode === "private" ? "active" : ""} onClick={() => setJoinSetup(current => ({ ...current, cardMode: "private" }))}>Private Cards</button>
              </div>
            </div>
            <button
              type="button"
              className="join-session-confirm"
              disabled={!joinSetup.team || !joinSetup.cardMode}
              onClick={() => completeJoinSession(joinSetup.code, joinSetup.sessionUser, joinSetup.team, joinSetup.cardMode)}
            >
              Join Session
            </button>
          </div>
        </div>
      )}

      {pendingAutoMove && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPendingAutoMove(null); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Move player?</strong></div>
            <div className="turn-confirm-message">Do you want to move this player?</div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={() => confirmAutoMove(true)}>Yes</button>
              <button onClick={() => confirmAutoMove(false)}>No</button>
            </div>
          </div>
        </div>
      )}

      {actionResolution?.kind === "pass" && actionResolution.status === "awaiting-interceptor-choice" && (() => {
        const candidates = interceptorChoiceCandidates(actionResolution.plan?.interceptors, actionResolution.interceptorIndex);
        const defenseTeam = teamKeyForPiece(candidates[0]?.defender);
        const canChoose = !sessionCode || myTeam === defenseTeam;
        const teamName = defenseTeam === "blue" ? "Blue" : "Red";
        return <div className="modal-backdrop interceptor-choice-backdrop">
          <div className={`modal interceptor-choice-modal ${defenseTeam || ""}`} role="dialog" aria-modal="true">
            <div className="modal-title">
              <strong>Choose interceptor</strong>
              {(!sessionCode || isSessionHost) && <div className="pending-decision-history-controls">
                <button type="button" onClick={undo} disabled={!gameTimeline?.cursor} title="Undo"><Undo2 size={15} /></button>
                <button type="button" onClick={redo} disabled={(gameTimeline?.cursor || 0) >= (gameTimeline?.entries?.length || 0)} title="Redo"><Redo2 size={15} /></button>
              </div>}
            </div>
            <div className="interceptor-choice-message">
              {canChoose
                ? `${teamName} has equally ranked eligible defenders. Choose who attempts the next interception.`
                : `Waiting for ${teamName} to choose the next interceptor.`}
            </div>
            {canChoose && <div className="interceptor-choice-options">
              {candidates.map(item => {
                const defender = pieces.find(piece => piece.id === item.defender?.id) || item.defender;
                const interception = cardStat(cardById[defender?.cardId], "stat:interception");
                const sign = interception >= 0 ? "+" : "";
                return <button key={defender?.id} type="button" onClick={() => choosePassInterceptor(defender?.id)}>
                  {getPieceIdentity(defender)} ({teamName}) — Interception {sign}{interception}
                </button>;
              })}
            </div>}
          </div>
        </div>;
      })()}

      {actionResolution?.kind === "pass" && actionResolution.status === "awaiting-interception-roll" && !pendingDelayedResolution && (() => {
        const interceptor = actionResolution.plan?.interceptors?.[actionResolution.interceptorIndex];
        const defender = pieces.find(piece => piece.id === interceptor?.defender?.id);
        const defenseTeam = teamKeyForPiece(defender);
        const preview = defender ? buildInterceptionRollDetails({ pending: actionResolution, defender, interceptor, natural: 2 }) : null;
        return <DraggableActionPrompt promptKey="interception-roll" className="warning">
          <strong>Interception roll required</strong>
          <span>{getPieceIdentity(defender)} ({defenseTeam === "blue" ? "Blue" : "Red"}) rolls D20. Roll {defenseTeam?.toUpperCase()}.</span>
          {preview && <span>{preview.modifierSources.map(formatModifierSource).join(" + ")}</span>}
          {preview && <span><strong>{formatTotalModifier(preview)}</strong></span>}
          {preview && <span><strong>{passTargetLabel(actionResolution.plan)}</strong></span>}
        </DraggableActionPrompt>;
      })()}

      {actionResolution?.kind === "pass" && actionResolution.status === "targeting" && passTargetIntentPending && (
        <DraggableActionPrompt promptKey="pass-target-pending" className="waiting"><strong>Sending pass target…</strong><span>Waiting for host confirmation.</span></DraggableActionPrompt>
      )}

      {actionResolution?.kind === "pass" && ["targeting", "route-selection"].includes(actionResolution.status) && passCancelIntentPending && (
        <DraggableActionPrompt promptKey="pass-cancel-pending" className="waiting"><strong>Cancelling pass…</strong><span>Waiting for host confirmation.</span></DraggableActionPrompt>
      )}

      {pendingDelayedResolution?.kind === "pass-interception" && liveDelayedResolutionEntryId === pendingDelayedResolution.entryId && (
        <DraggableActionPrompt promptKey="interception-resolving" className="waiting"><strong>Resolving interception…</strong><span>Please wait.</span></DraggableActionPrompt>
      )}

      {bonusActionEndIntentPending && (
        <DraggableActionPrompt promptKey="bonus-end-pending"><strong>Ending Bonus Action…</strong><span>Waiting for host confirmation.</span></DraggableActionPrompt>
      )}
      {actionContinuation?.kind === "bonus-card-action" && (
        <DraggableActionPrompt promptKey="natural-20-bonus" className="bonus"><strong>Natural 20 interception</strong><span>{actionContinuation.status === CONTINUATION_STATUS.READY
          ? `Select a ${actionContinuation.team === "blue" ? "Blue" : "Red"} player and choose one card action, or press END B.A. to decline it.`
          : actionContinuation.status === CONTINUATION_STATUS.ACTION_ACTIVE
            ? `${actionContinuation.team === "blue" ? "Blue" : "Red"} is taking the bonus ${String(actionContinuation.actionType || "card").replace("_", " ")} action.`
            : `${actionContinuation.team === "blue" ? "Blue" : "Red"} completed the bonus action. Press END B.A. to continue.`}</span>
        </DraggableActionPrompt>
      )}

      {passResultNotice && (
        <div className="modal-backdrop pass-result-backdrop">
          <div className={`modal pass-result-modal ${passResultNotice.team || ""}`} role="dialog" aria-modal="true">
            <div className="modal-title"><strong>{passResultNotice.title}</strong></div>
            <div className="pass-result-lines">{passResultNotice.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
            <div className="modal-actions"><button className="save-label" onClick={() => setPassResultNotice(null)}>OK</button></div>
          </div>
        </div>
      )}

      {pendingThreeTwoMove && (
        <div className="modal-backdrop three-two-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPendingThreeTwoMove(null); }}>
          <div className="modal three-two-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Use 3/2 rule?</strong></div>
            <div className="three-two-message">
              Move into the ball cell without spending the distance travelled?
            </div>
            <div className="modal-actions three-two-actions">
              <button onClick={() => confirmThreeTwoMove(true)}>Yes</button>
              <button onClick={() => confirmThreeTwoMove(false)}>No</button>
            </div>
          </div>
        </div>
      )}

      {illegalMoveNotice && (
        <div className="modal-backdrop illegal-move-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setIllegalMoveNotice(null); }}>
          <div className="modal illegal-move-modal">
            <div className="modal-title"><strong>Illegal move</strong></div>
            <div className="illegal-move-message">{illegalMoveMessage(illegalMoveNotice)}</div>
            <div className="modal-actions"><button onClick={() => setIllegalMoveNotice(null)}>OK</button></div>
          </div>
        </div>
      )}

      {pendingTurnChange && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPendingTurnChange(null); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>{pendingTurnChange.direction === "advance" ? "Advance Turn?" : "Reverse Turn?"}</strong></div>
            <div className="turn-confirm-message">
              {pendingTurnChange.direction === "advance"
                ? `Advance to turn ${pendingTurnChange.turn}?`
                : `Return to turn ${pendingTurnChange.turn}?`}
            </div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={confirmTrackerTurnChange}>Yes</button>
              <button onClick={() => setPendingTurnChange(null)}>No</button>
            </div>
          </div>
        </div>
      )}

      {turnAdvanceNotice && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setTurnAdvanceNotice(false); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Turn not completed</strong></div>
            <div className="turn-confirm-message">Both teams must end their phase before advancing to the next turn.</div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={() => setTurnAdvanceNotice(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {startedTurnNotice !== null && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setStartedTurnNotice(null); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>TURN {startedTurnNotice}</strong></div>
            <div className="turn-confirm-message">Turn {startedTurnNotice} begins.</div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={() => setStartedTurnNotice(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {matchOverNotice && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setMatchOverNotice(false); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>MATCH OVER</strong></div>
            <div className="turn-confirm-message">The match is complete.</div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={() => setMatchOverNotice(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {pendingEndTurn && (
        <div className="modal-backdrop turn-confirm-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setPendingEndTurn(null); }}>
          <div className="modal turn-confirm-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>End your turn?</strong></div>
            <div className="turn-confirm-message">End your turn?</div>
            <div className="modal-actions turn-confirm-actions">
              <button onClick={confirmEndTurn}>Yes</button>
              <button onClick={() => setPendingEndTurn(null)}>No</button>
            </div>
          </div>
        </div>
      )}

      {rulesPanelOpen && (
        <div className="modal-backdrop" onPointerDown={() => setRulesPanelOpen(false)}>
          <div className="modal rules-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Rule Sets</strong><button className="icon-btn" onClick={() => setRulesPanelOpen(false)}>×</button></div>
            {ruleSetEditingLocked ? (
              <p className="rules-lock-note">This Rule Set is locked while a Match or Replay is active. Its snapshot stays fixed for History, replay, multiplayer, and AI export.</p>
            ) : (
              <p className="rules-lock-note">Rule Sets can be edited only in Editor Mode. Saving keeps the active configuration ready for the next Match.</p>
            )}
            <label>Saved Rule Set
              <select value={ruleSetSelectionId} onChange={e => setRuleSetSelectionId(e.target.value)}>
                {ruleSets.map(ruleSet => <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>)}
              </select>
            </label>
            <label>Name
              <input disabled={ruleSetEditingLocked} value={ruleSetDraft.name} maxLength="80" onChange={e => setRuleSetDraft(draft => ({ ...draft, name: e.target.value }))} />
            </label>
            <label className="rules-notes-label">Notes
              <textarea disabled={ruleSetEditingLocked} value={ruleSetDraft.notes} maxLength="4000" placeholder="Optional design notes for this Rule Set" onChange={e => setRuleSetDraft(draft => ({ ...draft, notes: e.target.value }))} />
            </label>
            <section className="rule-action-card">
              <div><strong>Pass</strong><span>Configured automation — manual dice only</span></div>
              <p>Choose the geometry and limits used by the pass engine. These values are locked into each Match Timeline at Match Mode start.</p>
              <label>Path geometry
                <select disabled={ruleSetEditingLocked} value={ruleSetDraft.actions?.pass?.pathMode || "corner-to-center"} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, pass: { ...draft.actions?.pass, pathMode: e.target.value } } }))}>
                  <option value="corner-to-center">Corner → Center</option>
                  <option value="center-to-center">Center → Center</option>
                </select>
              </label>
              <label>Long pass threshold (squares; strictly greater than)
                <input disabled={ruleSetEditingLocked} type="number" min="0.01" step="0.01" value={ruleSetDraft.actions?.pass?.longPassThreshold ?? 15} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, pass: { ...draft.actions?.pass, longPassThreshold: Math.max(0.01, Number(e.target.value) || 15) } } }))} />
              </label>
              <label>Resolution delay (ms)
                <input disabled={ruleSetEditingLocked} type="number" min="0" max="5000" step="100" value={ruleSetDraft.actions?.pass?.resolutionDelayMs ?? 1500} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, pass: { ...draft.actions?.pass, resolutionDelayMs: clamp(Math.floor(Number(e.target.value) || 0), 0, 5000) } } }))} />
              </label>
              <span className="rule-manual-pill">Dice: manual roll only</span>
            </section>
            <section className="rule-action-card">
              <div><strong>Interception</strong><span>Shared resolution engine — manual dice only</span></div>
              <p>Configure how every eligible interception roll is resolved. Pass geometry only decides who is eligible; this section owns the defensive statistic and modifier rules.</p>
              <label>Defender roll statistic
                <select disabled={ruleSetEditingLocked} value={ruleSetDraft.actions?.interception?.defenderRollStatId || "stat:interception"} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, interception: { ...draft.actions?.interception, defenderRollStatId: e.target.value } } }))}>
                  {[...(cardState?.backStatsSchema?.passiveAttributes || []), ...(cardState?.backStatsSchema?.bonuses || [])].map(stat => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                </select>
              </label>
              <label className="rule-checkbox-label">
                <input disabled={ruleSetEditingLocked} type="checkbox" checked={ruleSetDraft.actions?.interception?.useStandardModifiers !== false} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, interception: { ...draft.actions?.interception, useStandardModifiers: e.target.checked } } }))} />
                Use standard modifiers
              </label>
              <label className="rule-checkbox-label">
                <input disabled={ruleSetEditingLocked} type="checkbox" checked={ruleSetDraft.actions?.interception?.useProgressiveBonus !== false} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, interception: { ...draft.actions?.interception, useProgressiveBonus: e.target.checked } } }))} />
                Use progressive interceptor bonus
              </label>
              <label>Maximum total modifier
                <span className="rule-signed-number">
                  <span aria-hidden="true">±</span>
                  <input aria-label="Maximum total modifier" disabled={ruleSetEditingLocked} type="number" min="0" max="20" step="1" value={ruleSetDraft.actions?.interception?.modifierCap ?? 4} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, interception: { ...draft.actions?.interception, modifierCap: clamp(Math.floor(Number(e.target.value) || 0), 0, 20) } } }))} />
                </span>
              </label>
              <label>Equal total outcome
                <select disabled={ruleSetEditingLocked} value={ruleSetDraft.actions?.interception?.equalRollOutcome || "pass-succeeds"} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, interception: { ...draft.actions?.interception, equalRollOutcome: e.target.value } } }))}>
                  <option value="pass-succeeds">Pass continues</option>
                  <option value="interception">Interception succeeds</option>
                </select>
              </label>
              <span className="rule-manual-pill">Dice: manual roll only</span>
            </section>
            <section className="rule-action-card">
              <div><strong>Group Move</strong><span>Last normal action only</span></div>
              <p>These values are frozen when a Match starts. Group Move may cross players, but never finish on a player or the ball.</p>
              <label>Maximum players
                <input disabled={ruleSetEditingLocked} type="number" min="1" max="11" step="1" value={ruleSetDraft.actions?.groupMove?.maxPlayers ?? 4} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, groupMove: { ...draft.actions?.groupMove, maxPlayers: clamp(Math.floor(Number(e.target.value) || 1), 1, 11) } } }))} />
              </label>
              <label>Zone length (squares)
                <input disabled={ruleSetEditingLocked} type="number" min="1" max="100" step="1" value={ruleSetDraft.actions?.groupMove?.zoneLength ?? 10} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, groupMove: { ...draft.actions?.groupMove, zoneLength: clamp(Math.floor(Number(e.target.value) || 1), 1, 100) } } }))} />
              </label>
              <label>Maximum distance/player
                <input disabled={ruleSetEditingLocked} type="number" min="1" max="100" step="1" value={ruleSetDraft.actions?.groupMove?.maxDistance ?? 6} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, groupMove: { ...draft.actions?.groupMove, maxDistance: clamp(Math.floor(Number(e.target.value) || 1), 1, 100) } } }))} />
              </label>
              <label className="rule-checkbox-label">
                <input disabled={ruleSetEditingLocked} type="checkbox" checked={ruleSetDraft.actions?.groupMove?.sameDirectionOnly !== false} onChange={e => setRuleSetDraft(draft => ({ ...draft, actions: { ...draft.actions, groupMove: { ...draft.actions?.groupMove, sameDirectionOnly: e.target.checked } } }))} />
                Same direction as first move
              </label>
            </section>
            <div className="rules-actions">
              <button disabled={ruleSetEditingLocked} onClick={createNewRuleSet}>New</button>
              <button disabled={ruleSetEditingLocked} onClick={duplicateActiveRuleSet}>Duplicate</button>
              <button disabled={ruleSetEditingLocked} onClick={loadSelectedRuleSet}>Load</button>
              <button className="save-label" disabled={ruleSetEditingLocked} onClick={saveRuleSetDraft}>Save Rule Set</button>
            </div>
          </div>
        </div>
      )}

      {trackerSettingsOpen && (
        <div className="modal-backdrop" onPointerDown={() => setTrackerSettingsOpen(false)}>
          <div className="modal tracker-settings-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Tracker Settings</strong><button className="icon-btn" onClick={() => setTrackerSettingsOpen(false)}>×</button></div>
            <label>Attack Actions<input type="number" min="1" max="30" value={trackerSettingsDraft.attackActions} onChange={e => setTrackerSettingsDraft(v => ({ ...v, attackActions: clamp(Number(e.target.value) || 1, 1, 30) }))} /></label>
            <label>Defense Actions<input type="number" min="1" max="30" value={trackerSettingsDraft.defenseActions} onChange={e => setTrackerSettingsDraft(v => ({ ...v, defenseActions: clamp(Number(e.target.value) || 1, 1, 30) }))} /></label>
            <label>Turns<input type="number" min="1" max="100" value={trackerSettingsDraft.turns} onChange={e => setTrackerSettingsDraft(v => ({ ...v, turns: clamp(Number(e.target.value) || 1, 1, 100) }))} /></label>
            <button className="save-label" onClick={() => {
              if (trackerReadOnly) return;
              const beforeTimeline = captureTimelineGameState();
              const nextTurn = Math.min(trackerCurrentTurn, trackerSettingsDraft.turns);
              const usedActions = { red: 0, blue: 0 };
              setTrackerSettings(trackerSettingsDraft);
              setTrackerCurrentTurn(nextTurn);
              setTrackerUsedActions(usedActions);
              setTrackerSettingsOpen(false);
              recordTimelineTransition({
                type: "TRACKER_SETTINGS_CHANGED",
                label: "Tracker settings changed",
                before: beforeTimeline,
                after: captureTimelineGameState({ trackerSettings: trackerSettingsDraft, trackerCurrentTurn: nextTurn, trackerUsedActions: usedActions }),
              });
            }}>Save</button>
          </div>
        </div>
      )}

      {trackerStartChoiceOpen && (
        <div className="modal-backdrop" onPointerDown={() => setTrackerStartChoiceOpen(false)}>
          <div className="modal tracker-start-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="modal-title"><strong>Who starts?</strong><button className="icon-btn" onClick={() => setTrackerStartChoiceOpen(false)}>×</button></div>
            <p>Choose the team that attacks first.</p>
            <div className="tracker-start-choices">
              <button className="blue-choice" onClick={() => startTrackedGame("blue")}>Blue Team</button>
              <button className="red-choice" onClick={() => startTrackedGame("red")}>Red Team</button>
            </div>
          </div>
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
            {gameMode === "editor" && !isBenchReservePiece(editingPiece) && (
              <button className="delete-piece-btn" onClick={deleteEditingPiece}>Șterge pucul</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
