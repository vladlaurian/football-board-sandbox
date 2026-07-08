import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
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
const storage = getStorage(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const CARD_EXPORT_WIDTH = 360;
const CARD_EXPORT_HEIGHT = 540;
const CARD_EXPORT_PIXEL_RATIO = 4;

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
  "GK", "LWB", "LB", "CB", "RB", "RWB",
  "LW", "LM", "CDM", "CAM", "CM", "RM", "RW", "ST"
];

const CARD_POSITION_OPTIONS = [
  "GK", "LWB", "LB", "CB", "RB", "RWB", "LW", "LM", "CDM", "CAM", "CM", "RM", "RW", "ST"
];

const TEAM_LAYOUT_POSITIONS = ["GK", "LWB", "LB", "CB", "RB", "RWB", "LM", "CDM", "CM", "CAM", "RM", "LW", "ST", "RW"];
const TEAM_SLOT_POSITIONS = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
const CARD_THEMES = ["Style 1", "Style 2", "Style 3", "Style 4", "Style 5", "Style 6", "Style 7"];
const CUSTOM_CARD_THEME = "Custom";

const DEFAULT_CARD_VISUAL_LAYOUT = {
  front: {
    header: { x: 12, y: 5, w: 62, h: 10 },
    position: { x: 76, y: 5, w: 12, h: 10 },
    attributes: { x: 12, y: 72, w: 34, h: 20 },
    bonuses: { x: 54, y: 72, w: 34, h: 20 },
  },
  back: {
    header: { x: 12, y: 5, w: 62, h: 10 },
    position: { x: 76, y: 5, w: 12, h: 10 },
    attributes: { x: 12, y: 18, w: 34, h: 34 },
    bonuses: { x: 54, y: 18, w: 34, h: 34 },
    defensiveArea: { x: 12, y: 62, w: 38, h: 30 },
    specialAbility: { x: 54, y: 66, w: 34, h: 26 },
  },
};

const ZONE_LABELS = {
  header: "Header",
  position: "Position",
  attributes: "Attributes",
  bonuses: "Bonuses",
  defensiveArea: "Defensive Area",
  specialAbility: "Special Ability",
};

function normalizeCardVisualLayout(layout) {
  const source = layout && typeof layout === "object" ? layout : {};
  const normalizeSide = (side) => {
    const defaults = DEFAULT_CARD_VISUAL_LAYOUT[side] || {};
    const current = source[side] && typeof source[side] === "object" ? source[side] : {};
    return Object.fromEntries(Object.entries(defaults).map(([key, box]) => {
      const raw = current[key] && typeof current[key] === "object" ? current[key] : {};
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
  frontFields: "#ffffff",
  attributesFront: "#ffffff",
  bonusesFront: "#ffffff",
  attributesFrontValue: "#ffffff",
  bonusesFrontValue: "#ffffff",
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
  attributesFront: { align: "left", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  attributesFrontValue: { align: "right", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  bonusesFront: { align: "left", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
  bonusesFrontValue: { align: "right", bold: true, font: "Inter", fontSize: 100, lineHeight: 100, verticalOffset: 0, statGap: 100 },
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


function StableTextStyleControls({ cardId, styleKey, stats = false, current, isOpen, onToggle, onPatch, onPreview, onPreviewEnd, panelAlign = "right", buttonLabel = "Text", titleMode = false, numbersMode = false, inlinePanel = false }) {
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
          {renderRange("Size", "fontSize", 50, 260, "%")}
          {!titleMode && !numbersMode ? renderRange("Line", "lineHeight", 70, 180, "%") : null}
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
    contentBlockId: source.contentBlockId ? String(source.contentBlockId) : "",
    box,
  };
}

function normalizeCustomZones(card) {
  return Array.isArray(card?.customZones) ? card.customZones.map((zone, index) => normalizeCustomZone(zone, index)) : [];
}


const DUPLICABLE_BLOCK_TYPES = {
  attributesFront: { label: "Attributes Front", side: "front", kind: "frontPair", sourceSection: "passiveAttributes", colorKey: "attributesFront" },
  bonusesFront: { label: "Bonuses Front", side: "front", kind: "frontPair", sourceSection: "bonuses", colorKey: "bonusesFront" },
  attributesBack: { label: "Attributes Back", side: "back", kind: "list", sourceSection: "passiveAttributes", colorKey: "attributes" },
  bonusesBack: { label: "Bonuses Back", side: "back", kind: "list", sourceSection: "bonuses", colorKey: "bonuses" },
  specialAbility: { label: "Special Ability", side: "back", kind: "special", colorKey: "specialAbility" },
};

function baseDuplicateStyle(style = {}) {
  const s = style && typeof style === "object" ? style : {};
  return {
    align: ["left", "center", "right"].includes(s.align) ? s.align : "left",
    bold: typeof s.bold === "boolean" ? s.bold : true,
    font: CARD_FONT_OPTIONS.includes(s.font) ? s.font : "Inter",
    fontSize: clamp(Number(s.fontSize ?? 100), 50, 260),
    lineHeight: clamp(Number(s.lineHeight ?? 100), 70, 180),
    verticalOffset: clamp(Number(s.verticalOffset ?? 0), -100, 100),
    statGap: clamp(Number(s.statGap ?? 300), 0, 300),
  };
}

function baseDuplicateTitleStyle(style = {}) {
  const s = baseDuplicateStyle(style);
  return { ...s, align: ["left", "center", "right"].includes(style?.align) ? style.align : "center", lineHeight: 100, verticalOffset: 0 };
}

function duplicateStyleVars(style = {}) {
  const s = baseDuplicateStyle(style);
  return {
    "--zone-align": s.align,
    "--zone-justify": s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center",
    "--zone-grid-justify": s.align === "left" ? "start" : s.align === "right" ? "end" : "center",
    "--zone-font-family": s.font,
    "--zone-font-weight": s.bold ? 950 : 650,
    "--zone-font-scale": s.fontSize / 100,
    "--zone-line-height": s.lineHeight / 100,
    "--zone-y-offset": `${s.verticalOffset * 0.4}cqh`,
  };
}

function duplicateNumberStyleVars(textStyle = {}, numberStyle = {}) {
  const base = baseDuplicateStyle(textStyle);
  const num = baseDuplicateStyle(numberStyle);
  const font = num.font || base.font;
  const fontScale = (base.fontSize / 100) * (num.fontSize / 100);
  return {
    "--zone-font-family": font,
    "--zone-font-weight": num.bold ? 950 : 650,
    "--zone-font-scale": fontScale,
    "--zone-number-font-scale": fontScale,
    "--zone-line-height": base.lineHeight / 100,
    "--zone-y-offset": `${base.verticalOffset * 0.4}cqh`,
  };
}

function duplicateDistanceVars(style = {}, items = []) {
  const s = baseDuplicateStyle(style);
  const normalizedDistance = clamp(Number(s.statGap ?? 300), 0, 300);
  const shiftPercent = Math.max(0, Math.min(1, (300 - normalizedDistance) / 300));
  return {
    "--zone-stat-gap": "0px",
    "--zone-stat-gap-wide": "0px",
    "--zone-distance-shift-raw": `${(shiftPercent * 28).toFixed(2)}cqw`,
    "--zone-longest-label-ch": Math.max(0, ...items.map(item => String(item?.name || item?.label || "").length)),
    "--zone-number-ch": Math.max(1, ...items.map(item => String(normalizeStatValue(item?.value ?? 0)).length)),
  };
}

function cloneStatItemsForDuplicate(items = []) {
  return normalizeStatItems(items).map((item, index) => ({
    ...item,
    id: `dup_item_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
  }));
}

function makeDuplicateBlockFromCard(card, type) {
  const meta = DUPLICABLE_BLOCK_TYPES[type] || DUPLICABLE_BLOCK_TYPES.attributesBack;
  const styles = cardTextStyles(card);
  const colors = normalizeTextColors(card?.textColors);
  const id = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (meta.kind === "frontPair") {
    const storageKey = type === "attributesFront" ? "frontAttributeFields" : "frontBonusFields";
    const fallback = storageKey === "frontAttributeFields" ? (card.frontAttributeFields || card.frontFields || card.frontSummary) : card[storageKey];
    const field = normalizeFrontFields(fallback)[0] || makeFrontField(type === "attributesFront" ? "Attributes" : "Bonuses", 0);
    return {
      id, type, kind: meta.kind, side: meta.side, name: `${meta.label} Copy`,
      title: field.label || meta.label.replace(/ Front$/, ""),
      value: computeFrontFieldValue(card, field),
      textColor: safeColor(colors[meta.colorKey]),
      numberColor: safeColor(colors[`${meta.colorKey}Value`], colors[meta.colorKey]),
      textStyle: baseDuplicateStyle(styles[meta.colorKey]),
      numberStyle: baseDuplicateStyle(styles[`${meta.colorKey}Value`]),
    };
  }
  if (meta.kind === "special") {
    return {
      id, type, kind: meta.kind, side: meta.side, name: `${meta.label} Copy`,
      title: cardLayoutTitle(card, "specialAbility"),
      text: String(card?.specialAbility || ""),
      titleColor: safeColor(colors.specialAbilityTitle),
      textColor: safeColor(colors.specialAbility),
      titleStyle: baseDuplicateTitleStyle(styles.specialAbilityTitle),
      textStyle: baseDuplicateStyle(styles.specialAbility),
    };
  }
  const sourceItems = meta.sourceSection === "bonuses" ? (card.bonuses || []) : (card.passiveAttributes || []);
  return {
    id, type, kind: meta.kind, side: meta.side, name: `${meta.label} Copy`,
    title: cardLayoutTitle(card, meta.sourceSection === "bonuses" ? "bonuses" : "attributes"),
    items: cloneStatItemsForDuplicate(sourceItems),
    titleColor: safeColor(colors[`${meta.colorKey}Title`]),
    textColor: safeColor(colors[meta.colorKey]),
    numberColor: safeColor(colors[`${meta.colorKey}Value`], colors[meta.colorKey]),
    titleStyle: baseDuplicateTitleStyle(styles[`${meta.colorKey}Title`]),
    textStyle: baseDuplicateStyle(styles[meta.colorKey]),
    numberStyle: baseDuplicateStyle(styles[`${meta.colorKey}Value`]),
  };
}

function normalizeDuplicateBlock(raw, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const type = Object.prototype.hasOwnProperty.call(DUPLICABLE_BLOCK_TYPES, source.type) ? source.type : "attributesBack";
  const meta = DUPLICABLE_BLOCK_TYPES[type];
  const id = String(source.id || `dup_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`);
  const common = {
    id,
    type,
    kind: meta.kind,
    side: source.side === "front" || source.side === "back" ? source.side : meta.side,
    name: String(source.name || `${meta.label} Copy`),
    title: String(source.title || meta.label.replace(/ (Front|Back)$/, "")),
    textColor: safeColor(source.textColor || "#ffffff"),
    numberColor: safeColor(source.numberColor || source.textColor || "#ffffff"),
    titleColor: safeColor(source.titleColor || "#ffffff"),
    textStyle: baseDuplicateStyle(source.textStyle),
    numberStyle: baseDuplicateStyle(source.numberStyle),
    titleStyle: baseDuplicateTitleStyle(source.titleStyle),
  };
  if (meta.kind === "frontPair") return { ...common, value: cleanTwoDigitValue(source.value ?? 0) };
  if (meta.kind === "special") return { ...common, text: String(source.text || "") };
  return { ...common, items: normalizeStatItems(source.items || []) };
}

function normalizeDuplicateBlocks(card) {
  return Array.isArray(card?.duplicateBlocks) ? card.duplicateBlocks.map((block, index) => normalizeDuplicateBlock(block, index)) : [];
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
  return names.map((name, index) => ({ id: `${section}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`, name, value: 0, showOnCard: true }));
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

function makeFrontField(label, index = 0, extra = {}) {
  return {
    id: extra.id || `front_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    label: String(extra.label ?? label ?? "New").slice(0, 12),
    sources: Array.isArray(extra.sources) ? extra.sources.filter(src => src && src.section && src.id) : [],
    manualValue: cleanTwoDigitValue(extra.manualValue ?? extra.value ?? 0),
  };
}

function defaultFrontFields() {
  return CARD_FRONT_FIELDS.map((label, index) => makeFrontField(label, index));
}

function normalizeFrontFields(raw) {
  if (Array.isArray(raw)) {
    const fields = raw.map((field, index) => makeFrontField(field?.label ?? field?.name ?? CARD_FRONT_FIELDS[index] ?? "New", index, field));
    return fields.length ? fields : defaultFrontFields();
  }
  const source = raw && typeof raw === "object" ? raw : {};
  const fields = CARD_FRONT_FIELDS.map((key, index) => makeFrontField(key, index, { manualValue: source[key] ?? source[key.toLowerCase()] ?? 0 }));
  return fields;
}

function computeFrontFieldValue(card, field) {
  const attrs = Array.isArray(card?.passiveAttributes) ? card.passiveAttributes : [];
  const bonuses = Array.isArray(card?.bonuses) ? card.bonuses : [];
  const values = (field?.sources || []).map(src => {
    const list = src.section === "bonuses" ? bonuses : attrs;
    const item = list.find(x => x.id === src.id);
    return item ? Number(item.value) || 0 : null;
  }).filter(value => value !== null);
  if (!values.length) return cleanTwoDigitValue(field?.manualValue ?? field?.value ?? 0);
  return cleanTwoDigitValue(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
}


function hasCustomGraphics(card) {
  return Boolean(card?.graphics?.frontDataUrl || card?.graphics?.backDataUrl);
}


function isInlineImageDataUrl(value) {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function stripInlineGraphicsFromCardState(state) {
  if (!state || !Array.isArray(state.cards)) return state;
  let changed = false;
  const cards = state.cards.map(card => {
    const graphics = card?.graphics || {};
    const frontInline = isInlineImageDataUrl(graphics.frontDataUrl);
    const backInline = isInlineImageDataUrl(graphics.backDataUrl);
    if (!frontInline && !backInline) return card;
    changed = true;
    return {
      ...card,
      graphics: {
        ...graphics,
        frontDataUrl: frontInline ? "" : (graphics.frontDataUrl || ""),
        backDataUrl: backInline ? "" : (graphics.backDataUrl || ""),
      },
    };
  });
  return changed ? { ...state, cards } : state;
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


function createPlayerCard(position = "ST") {
  const safePosition = CARD_POSITION_OPTIONS.includes(position) ? position : "ST";
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: "New Player",
    position: safePosition,
    passiveAttributes: defaultAttributesForPosition(safePosition, "passive"),
    bonuses: defaultAttributesForPosition(safePosition, "bonus"),
    frontFields: defaultFrontFields(),
    starsFront: { ...FRONT_STAR_DEFAULTS },
    theme: "Style 1",
    defensiveArea: emptyDefensiveArea(),
    defensiveGridAdjust: { ...DEFENSIVE_GRID_ADJUST_DEFAULTS },
    artwork: { mode: "default", customDataUrl: "" },
    graphics: { frontDataUrl: "", backDataUrl: "", previousTheme: "Style 1" },
    specialAbility: "",
    customZones: [],
    duplicateBlocks: [],
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
    frontFields: normalizeFrontFields(card?.frontFields || card?.frontSummary || card?.summary || card?.front || card?.ratings),
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
    duplicateBlocks: normalizeDuplicateBlocks(card),
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
    theme: "Style 1",
  };
}

function normalizeCardState(raw) {
  const base = createDefaultCardState();
  if (!raw || typeof raw !== "object") return base;
  const cards = Array.isArray(raw.cards) ? raw.cards.map(card => normalizeImportedCard(card)) : [];

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

function sanitizePiecesCardIds(rawPieces, cardStateLike, settingsLike = DEFAULT_SETTINGS, legacyAssignments = {}) {
  const normalizedCardState = normalizeCardState(cardStateLike);
  const validCardIds = new Set((normalizedCardState.cards || []).map(card => String(card.id)));
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
  const [inspectedPieceId, setInspectedPieceId] = useState(null);
  const [cardState, setCardState] = useState(() => {
    try {
      const raw = localStorage.getItem("football-board-player-cards-v1");
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
  const [editingCardId, setEditingCardId] = useState(null);
  const [openTextPanelKey, setOpenTextPanelKey] = useState(null);
  const [openColorPanelKey, setOpenColorPanelKey] = useState(null);
  const [openGridAdjustKey, setOpenGridAdjustKey] = useState(null);
  const [previewTextStyleDraft, setPreviewTextStyleDraft] = useState(null);
  const [selectedLayout, setSelectedLayout] = useState(null);
  const [exportCardId, setExportCardId] = useState("");
  const graphicFrontInputRef = useRef(null);
  const graphicBackInputRef = useRef(null);
  const pendingGraphicFrontRef = useRef(null);
  const [graphicImportCardId, setGraphicImportCardId] = useState("");
  const [graphicImportSide, setGraphicImportSide] = useState("front");
  const [assignTarget, setAssignTarget] = useState(null);
  const [inspectorPosition, setInspectorPosition] = useState({ x: Math.max(12, window.innerWidth - 450), y: 150 });
  const [inspectorSize, setInspectorSize] = useState({ w: 420, h: 650 });
  const [inspectorDragging, setInspectorDragging] = useState(null);
  const [inspectorResizing, setInspectorResizing] = useState(null);
  const INSPECTOR_CARD_CANONICAL_WIDTH = 360;
  const [inspectorCardZoom, setInspectorCardZoom] = useState(1);
  const [inspectorCardPan, setInspectorCardPan] = useState({ x: 0, y: 0 });
  const [inspectorCardSide, setInspectorCardSide] = useState("front");
  const [inspectorCardFitScale, setInspectorCardFitScale] = useState(1);
  const inspectorCardViewportRef = useRef(null);
  const inspectorCardPointersRef = useRef(new Map());
  const inspectorCardGestureRef = useRef(null);
  const inspectorCardZoomRef = useRef(1);
  const inspectorCardPanRef = useRef({ x: 0, y: 0 });
  const [editingPiece, setEditingPiece] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [zoom, setZoom] = useState(0.8);
  const [history, setHistory] = useState([]);
  const [dieType, setDieType] = useState(20);
  const [dieResult, setDieResult] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureType, setMeasureType] = useState("center");
  const [passMark, setPassMark] = useState(8);
  const [shotMark, setShotMark] = useState(12);
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
  const [rulerPanelPosition, setRulerPanelPosition] = useState({ x: 20, y: 150 });
  const [rulerPanelSize, setRulerPanelSize] = useState({ w: 280, h: 230 });
  const [rulerPanelDragging, setRulerPanelDragging] = useState(null);
  const [rulerPanelResizing, setRulerPanelResizing] = useState(null);
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
  const measureInteractionRef = useRef(null);
  const beforeLockViewRef = useRef(null);
  const clientIdRef = useRef(`client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const sessionSaveTimerRef = useRef(null);
  const isApplyingSessionRef = useRef(false);
  const piecesRef = useRef(pieces);
  const settingsRef = useRef(settings);
  const cardStateRef = useRef(cardState);

  useEffect(() => { piecesRef.current = pieces; }, [pieces]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { cardStateRef.current = cardState; }, [cardState]);

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

  useEffect(() => {
    try {
      localStorage.setItem("football-board-player-cards-v1", JSON.stringify(buildCardLibraryState(cardState)));
    } catch (error) {
      console.warn("Player cards could not be saved locally. The imported graphics may be too large.", error);
    }
  }, [cardState]);


  useEffect(() => {
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

  function buildCloudState(overrides = {}) {
    const effectiveSettings = overrides.settings ? normalizeSettingsForApp(overrides.settings) : settingsRef.current;
    const effectiveCardState = overrides.cardState ? normalizeCardState(overrides.cardState) : cardStateRef.current;
    const effectivePieces = overrides.pieces || piecesRef.current;
    const { pieces: _overridePieces, cardState: _overrideCardState, settings: _overrideSettings, ...restOverrides } = overrides;
    return {
      version: "pitch-44-goal-5x2",
      formations,
      gameSituations,
      activeSituationId,
      activeSituationName,
      blueFormationId,
      redFormationId,
      dieType,
      dieResult,
      touchMode,
      snapToGrid,
      showCoordinates,
      ...restOverrides,
      settings: effectiveSettings,
      pieces: sanitizePiecesCardIds(effectivePieces, effectiveCardState, effectiveSettings),
      cardState: buildCardLibraryState(effectiveCardState),
    };
  }

  function applyCloudState(data) {
    if (!data) return;
    const nextSettings = data.settings ? normalizeSettingsForApp(data.settings) : settings;
    const nextCardState = data.cardState ? normalizeCardState(data.cardState) : cardState;
    const legacyAssignments = getLegacyAssignments(data.cardState);
    const nextPieces = data.pieces
      ? ensureBenchReserveCount(sanitizePiecesCardIds(data.pieces, nextCardState, nextSettings, legacyAssignments), nextSettings)
      : sanitizePiecesCardIds(pieces, nextCardState, nextSettings);

    if (data.settings) setSettings(nextSettings);
    if (data.formations) setFormations(data.formations);
    if (data.gameSituations) setGameSituations(data.gameSituations);
    if (typeof data.activeSituationId === "number") setActiveSituationId(data.activeSituationId);
    if (data.activeSituationName) setActiveSituationName(data.activeSituationName);
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
    if (data.pieces) {
      piecesRef.current = nextPieces;
      setPieces(nextPieces);
    }
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) setDieResult(data.dieResult);
    if (typeof data.touchMode === "boolean") setTouchMode(data.touchMode);
    if (typeof data.snapToGrid === "boolean") setSnapToGrid(data.snapToGrid);
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
    if (data.cardState) setCardState(nextCardState);
  }

  function buildLiveBoardState(overrides = {}) {
    const effectiveSettings = overrides.settings ? normalizeSettingsForApp(overrides.settings) : settingsRef.current;
    const effectiveCardState = overrides.cardState ? normalizeCardState(overrides.cardState) : cardStateRef.current;
    const effectivePieces = overrides.pieces || piecesRef.current;
    const { pieces: _overridePieces, cardState: _overrideCardState, settings: _overrideSettings, ...restOverrides } = overrides;
    return {
      version: "pitch-44-goal-5x2",
      dieType,
      dieResult,
      snapToGrid,
      showCoordinates,
      blueFormationId,
      redFormationId,
      actionLog,
      ...restOverrides,
      settings: effectiveSettings,
      pieces: sanitizePiecesCardIds(effectivePieces, effectiveCardState, effectiveSettings),
      cardState: buildCardLibraryState(effectiveCardState),
    };
  }

  function applyLiveBoardState(data) {
    if (!data) return;
    const nextSettings = data.settings ? normalizeSettingsForApp(data.settings) : settings;
    const nextCardState = data.cardState ? normalizeCardState(data.cardState) : cardState;
    const legacyAssignments = getLegacyAssignments(data.cardState);
    const nextPieces = data.pieces
      ? ensureBenchReserveCount(sanitizePiecesCardIds(data.pieces, nextCardState, nextSettings, legacyAssignments), nextSettings)
      : sanitizePiecesCardIds(pieces, nextCardState, nextSettings);

    if (data.settings) setSettings(nextSettings);
    if (data.pieces) {
      piecesRef.current = nextPieces;
      setPieces(nextPieces);
    }
    if (typeof data.dieType === "number") setDieType(data.dieType);
    if (data.dieResult !== undefined) setDieResult(data.dieResult);
    if (typeof data.snapToGrid === "boolean") setSnapToGrid(data.snapToGrid);
    if (typeof data.showCoordinates === "boolean") setShowCoordinates(data.showCoordinates);
    if (typeof data.blueFormationId === "number") setBlueFormationId(data.blueFormationId);
    if (typeof data.redFormationId === "number") setRedFormationId(data.redFormationId);
    if (data.actionLog) setActionLog(data.actionLog);
    if (data.cardState) setCardState(nextCardState);
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
    cardState,
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
    cardState,
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
    setPieces(prev => ensureBenchReserveCount(prev.map(p => ({
      ...p,
      y: clamp(p.y, 0, next.rows - 1),
      x: clampBoardXForY(p.x, clamp(p.y, 0, next.rows - 1), next),
    })), next));
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
      pieces: sanitizePiecesCardIds(pieces, cardState, settings),
      zoom,
      blueFormationId,
      redFormationId,
      dieType,
      dieResult,
      cardState: buildCardLibraryState(cardState),
    };
  }

  function applyGameSituation(id) {
    const situation = gameSituations.find(s => s.id === Number(id));
    if (!situation) return;

    setActiveSituationId(Number(id));
    setActiveSituationName(situation.name);

    if (!situation.snapshot) return;

    pushHistory();
    const snapshotSettings = normalizeSettingsForApp(situation.snapshot.settings || settings);
    const snapshotCardState = situation.snapshot.cardState ? normalizeCardState(situation.snapshot.cardState) : cardState;
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
    setDieResult(situation.snapshot.dieResult ?? null);
    if (situation.snapshot.cardState) setCardState(snapshotCardState);
    logSnapshot(`Load situație: ${situation.name}`, snapshotPieces);
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
    const fresh = sanitizePiecesCardIds(createInitialPieces(settings.cols, settings.rows, getFormationById(blueFormationId), getFormationById(redFormationId)), cardStateRef.current, settingsRef.current);
    piecesRef.current = fresh;
    setPieces(fresh);
    logSnapshot("Reset poziții", fresh);
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
    setPieces(ensureBenchReserveCount(JSON.parse(entry.pieces), restoredSettings));
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

    setPieces(prev => ensureBenchReserveCount(prev.map(p => p.id === pieceId ? { ...p, x, y } : p), settings));
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

  function onPointerDown(pieceId, e) {
    e.preventDefault();
    e.stopPropagation();
    if (editingPiece) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(pieceId);
    setInspectedPieceId(pieceId);
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
    setPieces(prev => ensureBenchReserveCount(prev.map(p => p.id === editingPiece.id ? { ...p, label: clean } : p), settings));
    setEditingPiece(null);
    setEditLabel("");
  }

  const cardById = useMemo(() => Object.fromEntries(cardState.cards.map(card => [card.id, card])), [cardState.cards]);
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
    setInspectorCardSide("front");
    inspectorCardPointersRef.current.clear();
    inspectorCardGestureRef.current = null;
  }, [inspectedCardId]);

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
  }, [inspectorVisible, inspectorMinimized, inspectorSize.w, inspectorSize.h, inspectedCardId]);

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
      ? (inspectedPiece && inspectedPiece.team !== "BALL" ? [inspectedPiece] : [])
      : pieces.filter(piece => piece.team !== "BALL");
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
    const clone = { ...source, id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, name: `${source.name} Copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    updateCardState(prev => ({ ...prev, cards: [...prev.cards, clone] }));
  }

  function deleteCard(cardId) {
    if (!window.confirm("Ștergi cardul? Va fi scos și din echipe/pucuri.")) return;
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
    if (editingCardId === cardId) setEditingCardId(null);
  }

  function assignCard(cardId) {
    if (!assignTarget) return;
    const targetPieceId = assignTarget.pieceId || null;
    if (!targetPieceId) {
      setAssignTarget(null);
      return;
    }

    const currentPieces = piecesRef.current || pieces;
    const existingPiece = currentPieces.find(piece => piece.cardId === cardId && piece.id !== targetPieceId);
    if (existingPiece) {
      const shouldReassign = window.confirm("This card is already assigned to another puck. Do you want to reassign it?");
      if (!shouldReassign) return;
    }

    const nextPieces = sanitizePiecesCardIds(
      currentPieces.map(piece => {
        if (piece.team === "BALL") return { ...piece, cardId: null };
        if (piece.id === targetPieceId) return { ...piece, cardId };
        if (piece.cardId === cardId) return { ...piece, cardId: null };
        return { ...piece, cardId: piece.cardId || null };
      }),
      cardStateRef.current,
      settingsRef.current
    );
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
    setAssignTarget(null);
  }

  function removePieceCard(pieceId) {
    const nextPieces = sanitizePiecesCardIds(
      (piecesRef.current || pieces).map(piece => piece.id === pieceId ? { ...piece, cardId: null } : { ...piece, cardId: piece.cardId || null }),
      cardStateRef.current,
      settingsRef.current
    );
    piecesRef.current = nextPieces;
    setPieces(nextPieces);
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
    const safeFront = graphics.frontExportDataUrl || graphics.frontLocalDataUrl || graphics.frontDataUrl || "";
    const safeBack = graphics.backExportDataUrl || graphics.backLocalDataUrl || graphics.backDataUrl || "";
    const inlineFront = isInlineImageDataUrl(safeFront) ? safeFront : "";
    const inlineBack = isInlineImageDataUrl(safeBack) ? safeBack : "";

    const artwork = { ...(card?.artwork || {}) };
    if (artwork.customDataUrl && !isInlineImageDataUrl(artwork.customDataUrl)) artwork.customDataUrl = "";

    // Keep the visual card object identical to the editor/inspector path.
    // PNG export may only sanitize image sources that html2canvas cannot read;
    // it must not swap themes or rebuild the card for the back side.
    return {
      ...card,
      graphics: {
        ...graphics,
        frontDataUrl: inlineFront,
        backDataUrl: inlineBack,
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
      if (!src || isInlineImageDataUrl(src)) continue;
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
          <CardPreview card={pngSafeCard} team="neutral" side={exportSide} flippable={false} showLayoutZones={false} />
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
      const filename = `${safeCardExportName(selectedCard)}-${safeExportPart(selectedCard.position)}-${sideLabel}.png`;
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

  function CardPreview({ card, compact = false, team = "neutral", side = "back", flippable = false, controlledSide = null, onSideChange = null, showLayoutZones = false }) {
    const [currentSide, setCurrentSide] = useState(side);
    useEffect(() => {
      if (controlledSide == null) setCurrentSide(side);
    }, [side, card?.id, controlledSide]);
    if (!card) return <div className="card-preview empty">No card</div>;
    const activeTheme = getCardTheme(card, cardState.theme);
    const themeClass = activeTheme === CUSTOM_CARD_THEME ? "theme-custom" : `theme-${activeTheme.toLowerCase().replace(/\s+/g, "-")}`;
    const shownSide = flippable ? (controlledSide || currentSide) : side;
    const graphicUrl = shownSide === "front" ? card?.graphics?.frontDataUrl : card?.graphics?.backDataUrl;
    const colors = cardTextColors(card);
    const previewStyle = {
      "--card-header-color": safeColor(colors.header),
      "--card-header-front-color": safeColor(colors.headerFront),
      "--card-header-back-color": safeColor(colors.headerBack),
      "--card-position-front-color": safeColor(colors.positionFront),
      "--card-position-back-color": safeColor(colors.positionBack),
      "--card-front-color": safeColor(colors.frontFields),
      "--card-attributes-front-color": safeColor(colors.attributesFront),
      "--card-bonuses-front-color": safeColor(colors.bonusesFront),
      "--card-attributes-color": safeColor(colors.attributes),
      "--card-bonuses-color": safeColor(colors.bonuses),
      "--card-attributes-title-color": safeColor(colors.attributesTitle),
      "--card-bonuses-title-color": safeColor(colors.bonusesTitle),
      "--card-area-color": safeColor(colors.defensiveArea),
      "--card-area-rgb": colorToRgbTriplet(colors.defensiveArea),
      "--card-area-title-color": safeColor(colors.defensiveAreaTitle),
      "--card-area-active-color": safeColor(colors.defensiveAreaActive, "#50be78"),
      "--card-area-active-rgb": colorToRgbTriplet(colors.defensiveAreaActive, "#50be78"),
      "--card-special-color": safeColor(colors.specialAbility),
      "--card-special-title-color": safeColor(colors.specialAbilityTitle),
    };
    return (
      <div className={`card-preview ${shownSide === "front" ? "card-front" : "card-back"} ${themeClass} ${team}`} style={previewStyle}>
        <div className="card-preview-art-layer" aria-hidden="true">
          {graphicUrl ? <img className="card-custom-graphic" src={graphicUrl} alt="" /> : null}
        </div>
        <div className={`card-preview-content-layer ${showLayoutZones ? "layout-editing" : ""}`}>
          <CardVisualCanvas card={card} side={shownSide} showZones={showLayoutZones} selectedLayout={selectedLayout} onSelectLayout={setSelectedLayout} />
        </div>
        {flippable && (
          <button
            type="button"
            className="card-flip-btn card-preview-flip-btn"
            title={shownSide === "front" ? "Show card back" : "Show card front"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const nextSide = shownSide === "front" ? "back" : "front";
              if (onSideChange) onSideChange(nextSide);
              else setCurrentSide(nextSide);
            }}
          >
            {shownSide === "front" ? "↻" : "↺"}
          </button>
        )}
      </div>
    );
  }

  function cardTopNameFontSize(name = "") {
    const len = String(name || "").trim().length;
    // Auto-fit pentru header-ul comun front/back. Zona de nume este mai generoasă,
    // iar fontul pornește mai mare pentru nume scurte și scade gradual pentru nume lungi.
    if (len <= 6) return 17.2;
    if (len <= 9) return 15.8;
    if (len <= 12) return 14.2;
    if (len <= 16) return 12.4;
    if (len <= 20) return 10.6;
    if (len <= 25) return 8.9;
    if (len <= 31) return 7.5;
    if (len <= 38) return 6.2;
    if (len <= 48) return 5.1;
    if (len <= 60) return 4.2;
    return 3.5;
  }

  function CardIdentityStrip({ card }) {
    const safeName = String(card?.name || "Player");
    const safePosition = String(card?.position || "").toUpperCase();
    return (
      <div className="card-artwork card-top-strip" style={{ "--top-name-font-size": `${cardTopNameFontSize(safeName)}px` }}>
        {card?.artwork?.customDataUrl ? <img src={card.artwork.customDataUrl} alt="" /> : null}
        <strong className="card-top-name" title={safeName}>{safeName}</strong>
        <span className="card-top-position">{safePosition}</span>
      </div>
    );
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
    const frontAttributeFields = normalizeFrontFields(card?.frontAttributeFields || card?.frontFields || card?.frontSummary);
    const frontBonusFields = normalizeFrontFields(card?.frontBonusFields);
    const firstFrontAttribute = frontAttributeFields[0] || makeFrontField("Attributes", 0);
    const firstFrontBonus = frontBonusFields[0] || makeFrontField("DEF", 0);

    const renderNameZone = colorKey => (
      <div className="card-zone-text card-zone-name zone-color-bound" style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }} title={card?.name || "Player"}>
        {card?.name || "Player"}
      </div>
    );

    const renderPositionZone = colorKey => (
      <div className="card-zone-text card-zone-position zone-color-bound" style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }}>
        {String(card?.position || "").toUpperCase()}
      </div>
    );

    const renderFrontFormulaZone = (field, colorKey) => {
      const textColor = safeColor(colors[colorKey]);
      const valueKey = `${colorKey}Value`;
      const valueColor = safeColor(colors[valueKey], textColor);
      return (
        <div className="card-zone-text card-zone-formula zone-color-bound" style={{ "--zone-text-color": textColor, color: textColor, ...zonePairDistanceVars(textStyles, colorKey, { longestLabelChars: String(field.label || "").length, maxValueChars: String(computeFrontFieldValue(card, field)).length }) }}>
          <span className="card-zone-label" style={{ color: textColor, ...zoneTextStyleVars(textStyles, colorKey) }}>{field.label}</span>
          <strong className="card-zone-value" style={{ "--zone-number-color": valueColor, color: valueColor, ...zoneNumberStyleVars(textStyles, colorKey, valueKey) }}>{computeFrontFieldValue(card, field)}</strong>
        </div>
      );
    };

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
                  <polygon className="front-star-facet-mid" points="61,36 50,50 50,5" />
                  <polygon className="front-star-facet-light" points="94,36 50,50 61,36" />
                  <polygon className="front-star-facet-mid" points="67,56 50,50 94,36" />
                  <polygon className="front-star-facet-mid" points="78,90 50,50 67,56" />
                  <polygon className="front-star-facet-dark" points="50,70 50,50 78,90" />
                  <polygon className="front-star-facet-mid" points="22,90 50,50 50,70" />
                  <polygon className="front-star-facet-light" points="33,56 50,50 22,90" />
                  <polygon className="front-star-facet-dark" points="6,36 50,50 33,56" />
                  <polygon className="front-star-facet-mid" points="39,36 50,50 6,36" />
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
          <div className="card-zone-special" style={{ color: textColor, ...zoneTextStyleVarsStable(textStyles, "specialAbility") }}>{card?.specialAbility || ""}</div>
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

    const duplicateBlocks = normalizeDuplicateBlocks(card);
    const duplicateBlockById = Object.fromEntries(duplicateBlocks.map(block => [block.id, block]));

    const renderDuplicateListBlock = block => {
      const items = (block.items || []).filter(item => item.showOnCard !== false);
      const textColor = safeColor(block.textColor);
      const numberColor = safeColor(block.numberColor, textColor);
      const titleColor = safeColor(block.titleColor, textColor);
      return (
        <div className="card-zone-text card-zone-list-with-title zone-color-bound duplicate-content-zone" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": Math.max(2, items.length + 1), color: textColor }}>
          <div className="card-zone-section-title" style={{ color: titleColor, ...duplicateStyleVars(block.titleStyle) }}>{block.title}</div>
          <div className="card-zone-list" style={{ color: textColor, "--zone-lines": Math.max(2, items.length + 1), ...duplicateStyleVars(block.textStyle), ...duplicateDistanceVars(block.textStyle, items) }}>
            {items.length ? items.map(item => (
              <div className="card-zone-list-row" key={item.id} style={{ color: textColor }}>
                <span className="card-zone-label" style={{ color: textColor }}>{item.name}</span>
                <strong className="card-zone-value" style={{ "--zone-number-color": numberColor, color: numberColor, ...duplicateNumberStyleVars(block.textStyle, block.numberStyle) }}>{normalizeStatValue(item.value)}</strong>
              </div>
            )) : <em style={{ color: textColor }}>—</em>}
          </div>
        </div>
      );
    };

    const renderDuplicateFrontPairBlock = block => {
      const textColor = safeColor(block.textColor);
      const numberColor = safeColor(block.numberColor, textColor);
      const item = { name: block.title, value: block.value };
      return (
        <div className="card-zone-text card-zone-formula zone-color-bound duplicate-content-zone" style={{ "--zone-text-color": textColor, color: textColor, ...duplicateDistanceVars(block.textStyle, [item]) }}>
          <span className="card-zone-label" style={{ color: textColor, ...duplicateStyleVars(block.textStyle) }}>{block.title}</span>
          <strong className="card-zone-value" style={{ "--zone-number-color": numberColor, color: numberColor, ...duplicateNumberStyleVars(block.textStyle, block.numberStyle) }}>{normalizeStatValue(block.value)}</strong>
        </div>
      );
    };

    const renderDuplicateSpecialBlock = block => {
      const textColor = safeColor(block.textColor);
      const titleColor = safeColor(block.titleColor, textColor);
      return (
        <div className="card-zone-text card-zone-special-with-title zone-color-bound duplicate-content-zone" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": 3, color: textColor }}>
          <div className="card-zone-section-title" style={{ color: titleColor, ...duplicateStyleVars(block.titleStyle) }}>{block.title}</div>
          <div className="card-zone-special" style={{ color: textColor, ...duplicateStyleVars(block.textStyle) }}>{block.text || ""}</div>
        </div>
      );
    };

    const renderCustomZoneContent = zone => {
      const block = duplicateBlockById[zone.contentBlockId];
      if (!block) return <div className="card-zone-text card-zone-custom-empty" aria-hidden="true" />;
      if (block.kind === "frontPair") return renderDuplicateFrontPairBlock(block);
      if (block.kind === "special") return renderDuplicateSpecialBlock(block);
      return renderDuplicateListBlock(block);
    };

    const renderZoneContent = zoneKey => {
      if (side === "front") {
        if (zoneKey === "header") return renderNameZone("headerFront");
        if (zoneKey === "position") return renderPositionZone("positionFront");
        if (zoneKey === "attributes") return renderFrontStars();
        if (zoneKey === "bonuses") return null;
      }
      if (zoneKey === "header") return renderNameZone("headerBack");
      if (zoneKey === "position") return renderPositionZone("positionBack");
      if (zoneKey === "attributes") return renderListZone(visibleAttributes, "attributes", "attributes", "attributesTitle");
      if (zoneKey === "bonuses") return renderListZone(visibleBonuses, "bonuses", "bonuses", "bonusesTitle");
      if (zoneKey === "specialAbility") return renderSpecialAbilityZone();
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

  function CardBack({ card, compact = false }) {
    const visibleAttributes = (card.passiveAttributes || []).filter(a => a.showOnCard !== false);
    const visibleBonuses = (card.bonuses || []).filter(a => a.showOnCard !== false);
    const visibleCount = visibleAttributes.length + visibleBonuses.length;
    const density = visibleCount > 22 ? "dense-3" : visibleCount > 17 ? "dense-2" : visibleCount > 12 ? "dense-1" : "normal";
    return (
      <>
        <CardIdentityStrip card={card} />
        {!compact && (
          <>
            <div className={`card-stats-grid ${density}`}>
              <div className="card-section"><b>Attributes</b><div className="card-section-list">{visibleAttributes.map(a => <small key={a.id}><span>{a.name}</span><em>{normalizeStatValue(a.value)}</em></small>)}</div></div>
              <div className="card-section"><b>Bonuses</b><div className="card-section-list">{visibleBonuses.map(a => <small key={a.id}><span>{a.name}</span><em>{normalizeStatValue(a.value)}</em></small>)}</div></div>
            </div>
            <div className="card-bottom-third">
              <div className="card-area-block">
                <div className="area-mini-title">Defensive Area</div>
                <div className="area-mini-row">
                  {AreaMiniPreview({ area: card.defensiveArea })}
                </div>
              </div>
              <div className={`card-special-block ${String(card.specialAbility || "").length > 280 ? "special-dense-4" : String(card.specialAbility || "").length > 200 ? "special-dense-3" : String(card.specialAbility || "").length > 130 ? "special-dense-2" : String(card.specialAbility || "").length > 70 ? "special-dense-1" : ""}`}>
                <b>Special Ability</b>
                <p>{String(card.specialAbility || "").trim() || "—"}</p>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  function CardFront({ card }) {
    const fields = normalizeFrontFields(card.frontFields || card.frontSummary);
    return (
      <div className="card-front-inner">
        <CardIdentityStrip card={card} />
        <div className={`front-summary-fields ${fields.length > 4 ? "front-dense-3" : fields.length > 2 ? "front-dense-2" : "front-normal"}`}>
          {fields.map(field => (
            <div className="front-summary-row" key={field.id}>
              <span>{field.label}</span>
              <em>{computeFrontFieldValue(card, field)}</em>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function AreaMiniPreview({ area = [] }) {
    return <div className="area-mini">{Array.from({ length: 121 }, (_, i) => { const dx = (i % 11) - 5; const dy = Math.floor(i / 11) - 5; const center = dx === 0 && dy === 0; return <span key={i} className={`${center ? "player" : ""} ${areaHasCell(area, dx, dy) ? "active" : ""}`}>{center ? "" : ""}</span>; })}</div>;
  }

  function AttributeListEditor({ card, section, title, hideHeader = false, toolbarLeft = null }) {
    const items = card[section] || [];
    const moveItem = (index, dir) => updateCardList(card.id, section, list => { const next = [...list]; const to = index + dir; if (to < 0 || to >= next.length) return next; [next[index], next[to]] = [next[to], next[index]]; return next; });
    const changeValue = (itemId, delta) => updateCardList(card.id, section, list => list.map(x => x.id === itemId ? { ...x, value: clamp(normalizeStatValue(x.value) + delta, -99, 99) } : x));
    return (
      <div className="card-edit-section">
        {!hideHeader ? <div className="card-edit-section-title"><strong>{title}</strong>{renderColorPicker(card, section === "bonuses" ? "bonuses" : "attributes", "Color")}<button onClick={() => updateCardList(card.id, section, list => [...list, { id: `${section}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, name: "New", value: 0, showOnCard: true }])}>+ Add</button></div> : <div className="card-edit-section-title sub-only attribute-toolbar-row"><div className="attribute-toolbar-left">{toolbarLeft}</div><button onClick={() => updateCardList(card.id, section, list => [...list, { id: `${section}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, name: "New", value: 0, showOnCard: true }])}>+ Add</button></div>}
        {items.map((item, index) => (
          <div className="attribute-row" key={item.id}>
            <input value={item.name} onChange={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, name: e.target.value } : x))} />
            <div className="value-stepper" title="Edit value">
              <button className="value-step-btn" onClick={() => changeValue(item.id, -1)}>−</button>
              <input className="attr-value" inputMode="text" value={item.value} onChange={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, value: cleanTwoDigitValue(e.target.value) } : x))} onBlur={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, value: normalizeStatValue(e.target.value) } : x))} />
              <button className="value-step-btn" onClick={() => changeValue(item.id, 1)}>+</button>
            </div>
            <label className="show-on-card-toggle" title="Show on card"><input type="checkbox" checked={item.showOnCard !== false} onChange={e => updateCardList(card.id, section, list => list.map(x => x.id === item.id ? { ...x, showOnCard: e.target.checked } : x))} /><span>Show</span></label>
            <button className="order-btn" onClick={() => moveItem(index, -1)}>↑</button><button className="order-btn" onClick={() => moveItem(index, 1)}>↓</button>
            <button onClick={() => updateCardList(card.id, section, list => list.filter(x => x.id !== item.id))}>×</button>
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

  function FrontZoneFieldsEditor({ card, storageKey, title, colorKey, sourceSection }) {
    const fallback = storageKey === "frontAttributeFields" ? (card.frontAttributeFields || card.frontFields || card.frontSummary) : card[storageKey];
    const defaultLabel = storageKey === "frontAttributeFields" ? "Attributes" : "DEF";
    const allFields = normalizeFrontFields(fallback);
    const firstField = allFields[0] ? { ...allFields[0], label: allFields[0].label || defaultLabel } : makeFrontField(defaultLabel, 0);
    const fields = [firstField];
    const sourceItems = (sourceSection === "bonuses" ? (card.bonuses || []) : (card.passiveAttributes || []))
      .map(item => ({ ...item, section: sourceSection === "bonuses" ? "bonuses" : "passiveAttributes", group: sourceSection === "bonuses" ? "Bonuses" : "Attributes" }));
    const updateSingleField = updater => updateCardField(card.id, storageKey, [updater(firstField)]);
    const toggleSource = (section, sourceId) => updateSingleField(field => {
      const exists = (field.sources || []).some(src => src.section === section && src.id === sourceId);
      return { ...field, sources: exists ? field.sources.filter(src => !(src.section === section && src.id === sourceId)) : [...(field.sources || []), { section, id: sourceId }] };
    });
    return (
      <div className="card-edit-section front-summary-editor">
        <div className="card-edit-section-title front-pair-toolbar"><strong>{title}</strong><button type="button" className="mini-action-btn layout-action-btn" onClick={() => addDuplicateBlock(card.id, storageKey === "frontAttributeFields" ? "attributesFront" : "bonusesFront")}>Duplicate</button>{renderColorPicker(card, colorKey, "Color")}{renderTextStyleControls(card, colorKey, false, { buttonLabel: "Text", panelAlign: "front" })}{renderColorPicker(card, `${colorKey}Value`, "Numbers Color")}{renderTextStyleControls(card, `${colorKey}Value`, false, { buttonLabel: "Numbers", panelAlign: "front", numbersMode: true })}</div>
        <div className="front-formula-list">
          {fields.map(field => (
            <div className="front-formula-row" key={field.id}>
              <div className="front-formula-top">
                <input value={field.label} onChange={e => updateSingleField(current => ({ ...current, label: e.target.value.slice(0, 12) }))} />
                <strong>{computeFrontFieldValue(card, field)}</strong>
              </div>
              <div className="front-source-picker">
                {sourceItems.map(item => {
                  const checked = (field.sources || []).some(src => src.section === item.section && src.id === item.id);
                  return <label key={`${field.id}_${item.section}_${item.id}`} className={checked ? "source-on" : ""}><input type="checkbox" checked={checked} onChange={() => toggleSource(item.section, item.id)} /><span>{item.name}</span><em>{item.group}</em></label>;
                })}
              </div>
            </div>
          ))}
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
        if (card.id !== cardId) return card;
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
      />
    );
  }


  function updateCardTextColor(cardId, key, value) {
    if (!cardId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
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

  function renderDuplicateColorPicker(card, block, field, label) {
    if (!card || !block) return null;
    const current = safeColor(block[field]);
    const panelKey = `${card.id}:duplicate:${block.id}:${field}`;
    return (
      <StableColorPicker
        current={current}
        label={label}
        isOpen={openColorPanelKey === panelKey}
        onToggle={() => setOpenColorPanelKey(openColorPanelKey === panelKey ? null : panelKey)}
        onKeepOpen={() => setOpenColorPanelKey(panelKey)}
        onChange={value => updateDuplicateBlock(card.id, block.id, { [field]: value })}
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
        if (card.id !== cardId) return card;
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

  function updateCardVisualLayoutBox(cardId, side, zoneKey, patch) {
    if (!cardId || !DEFAULT_CARD_VISUAL_LAYOUT[side]?.[zoneKey]) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => {
        if (card.id !== cardId) return card;
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
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        layoutTitles: { ...CARD_LAYOUT_TITLE_DEFAULTS, ...(card.layoutTitles || {}), [key]: value },
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }


  function addDuplicateBlock(cardId, type) {
    if (!cardId || !DUPLICABLE_BLOCK_TYPES[type]) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: [...normalizeDuplicateBlocks(card), makeDuplicateBlockFromCard(card, type)],
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function updateDuplicateBlock(cardId, blockId, patch) {
    if (!cardId || !blockId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: normalizeDuplicateBlocks(card).map(block => block.id === blockId ? normalizeDuplicateBlock({ ...block, ...patch }) : block),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function updateDuplicateBlockStyle(cardId, blockId, styleKey, patch) {
    if (!cardId || !blockId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: normalizeDuplicateBlocks(card).map(block => block.id === blockId ? normalizeDuplicateBlock({ ...block, [styleKey]: { ...(block[styleKey] || {}), ...patch } }) : block),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function updateDuplicateItem(cardId, blockId, itemId, patch) {
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: normalizeDuplicateBlocks(card).map(block => block.id === blockId ? normalizeDuplicateBlock({
          ...block,
          items: (block.items || []).map(item => item.id === itemId ? { ...item, ...patch } : item),
        }) : block),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function addDuplicateItem(cardId, blockId) {
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: normalizeDuplicateBlocks(card).map(block => block.id === blockId ? normalizeDuplicateBlock({
          ...block,
          items: [...(block.items || []), { id: `dup_item_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, name: "New", value: 0, showOnCard: true }],
        }) : block),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function deleteDuplicateBlock(cardId, blockId) {
    if (!cardId || !blockId) return;
    updateCardState(prev => ({
      ...prev,
      cards: prev.cards.map(card => card.id === cardId ? {
        ...card,
        duplicateBlocks: normalizeDuplicateBlocks(card).filter(block => block.id !== blockId),
        customZones: normalizeCustomZones(card).map(zone => zone.contentBlockId === blockId ? { ...zone, contentBlockId: "" } : zone),
        updatedAt: new Date().toISOString(),
      } : card),
    }));
  }

  function assignContentToCustomZone(cardId, zoneId, blockId) {
    updateCardCustomZone(cardId, zoneId, { contentBlockId: blockId || "" });
  }

  function DuplicateStyleMiniControls({ card, block, styleKey, titleMode = false, numbersMode = false }) {
    const style = titleMode ? baseDuplicateTitleStyle(block[styleKey]) : baseDuplicateStyle(block[styleKey]);
    const patch = next => updateDuplicateBlockStyle(card.id, block.id, styleKey, next);
    return (
      <div className="duplicate-style-mini">
        {!numbersMode ? <button type="button" className={style.align === "left" ? "selected" : ""} onClick={() => patch({ align: "left" })}>L</button> : null}
        {!numbersMode ? <button type="button" className={style.align === "center" ? "selected" : ""} onClick={() => patch({ align: "center" })}>C</button> : null}
        {!numbersMode ? <button type="button" className={style.align === "right" ? "selected" : ""} onClick={() => patch({ align: "right" })}>R</button> : null}
        <button type="button" className={style.bold ? "selected" : ""} onClick={() => patch({ bold: !style.bold })}>B</button>
        {!titleMode ? <select value={style.font} onChange={e => patch({ font: e.target.value })}>{CARD_FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}</select> : null}
        <label>Size<input type="range" min="50" max="260" value={style.fontSize} onChange={e => patch({ fontSize: Number(e.currentTarget.value) })} /></label>
        {!titleMode && !numbersMode ? <label>Line<input type="range" min="70" max="180" value={style.lineHeight} onChange={e => patch({ lineHeight: Number(e.currentTarget.value) })} /></label> : null}
        {!titleMode && !numbersMode ? <label>Y<input type="range" min="-100" max="100" value={style.verticalOffset} onChange={e => patch({ verticalOffset: Number(e.currentTarget.value) })} /></label> : null}
      </div>
    );
  }

  function DuplicateBlocksEditor({ card }) {
    const blocks = normalizeDuplicateBlocks(card);
    return (
      <div className="card-edit-section duplicate-blocks-editor">
        <div className="card-edit-section-title"><strong>Duplicated content</strong></div>
        <div className="duplicate-source-actions">
          {Object.entries(DUPLICABLE_BLOCK_TYPES).map(([type, meta]) => <button key={type} type="button" onClick={() => addDuplicateBlock(card.id, type)}>Duplicate {meta.label}</button>)}
        </div>
        {!blocks.length ? <p className="custom-zone-empty-note">No duplicated content yet. Duplicate one of the supported blocks, then select an empty layout and add it.</p> : null}
        {blocks.map(block => <DuplicateBlockEditor key={block.id} card={card} block={block} />)}
      </div>
    );
  }

  function DuplicateBlockEditor({ card, block }) {
    const meta = DUPLICABLE_BLOCK_TYPES[block.type] || {};
    return (
      <div className="duplicate-block-editor">
        <div className="duplicate-block-title"><strong>{block.name}</strong><button type="button" onClick={() => deleteDuplicateBlock(card.id, block.id)}>Delete copy</button></div>
        <label>Name<input value={block.name} onChange={e => updateDuplicateBlock(card.id, block.id, { name: e.target.value })} /></label>
        <label>Title<input value={block.title} onChange={e => updateDuplicateBlock(card.id, block.id, { title: e.target.value })} /></label>
        {block.kind !== "frontPair" ? renderDuplicateColorPicker(card, block, "titleColor", "Title Color") : null}
        {block.kind !== "frontPair" ? <DuplicateStyleMiniControls card={card} block={block} styleKey="titleStyle" titleMode /> : null}
        {block.kind === "special" ? (
          <>
            {renderDuplicateColorPicker(card, block, "textColor", "Text Color")}
            <DuplicateStyleMiniControls card={card} block={block} styleKey="textStyle" />
            <textarea className="special-ability-textarea" value={block.text} onChange={e => updateDuplicateBlock(card.id, block.id, { text: e.target.value })} />
          </>
        ) : block.kind === "frontPair" ? (
          <>
            <div className="duplicate-inline-tools">{renderDuplicateColorPicker(card, block, "textColor", "Text Color")}{renderDuplicateColorPicker(card, block, "numberColor", "Numbers Color")}</div>
            <DuplicateStyleMiniControls card={card} block={block} styleKey="textStyle" />
            <DuplicateStyleMiniControls card={card} block={block} styleKey="numberStyle" numbersMode />
            <label>Value<input className="attr-value" value={block.value} onChange={e => updateDuplicateBlock(card.id, block.id, { value: cleanTwoDigitValue(e.target.value) })} /></label>
          </>
        ) : (
          <>
            <div className="duplicate-inline-tools">{renderDuplicateColorPicker(card, block, "textColor", "Text Color")}{renderDuplicateColorPicker(card, block, "numberColor", "Numbers Color")}</div>
            <DuplicateStyleMiniControls card={card} block={block} styleKey="textStyle" />
            <DuplicateStyleMiniControls card={card} block={block} styleKey="numberStyle" numbersMode />
            <button type="button" onClick={() => addDuplicateItem(card.id, block.id)}>+ Add row</button>
            {(block.items || []).map(item => <div className="attribute-row" key={item.id}><input value={item.name} onChange={e => updateDuplicateItem(card.id, block.id, item.id, { name: e.target.value })} /><input className="attr-value" value={item.value} onChange={e => updateDuplicateItem(card.id, block.id, item.id, { value: cleanTwoDigitValue(e.target.value) })} /><label className="show-on-card-toggle"><input type="checkbox" checked={item.showOnCard !== false} onChange={e => updateDuplicateItem(card.id, block.id, item.id, { showOnCard: e.target.checked })} /><span>Show</span></label><button type="button" onClick={() => updateDuplicateBlock(card.id, block.id, { items: (block.items || []).filter(x => x.id !== item.id) })}>×</button></div>)}
          </>
        )}
      </div>
    );
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
          <button type="button" className="mini-action-btn layout-action-btn danger" disabled={!selectedLayout || selectedLayout.cardId !== card.id} onClick={() => deleteSelectedLayoutZone(card.id)}>Delete layout</button>
        </div>
        {customZones.length ? <p className="custom-zone-empty-note">New layouts are empty containers. Select one on the card to move, resize, delete it, or attach duplicated content.</p> : null}
        {selectedLayout?.cardId === card.id && selectedLayout.kind === "custom" ? (
          <div className="custom-zone-content-picker">
            <strong>Selected layout content</strong>
            <select value={(customZones.find(zone => zone.id === selectedLayout.zoneKey)?.contentBlockId) || ""} onChange={e => assignContentToCustomZone(card.id, selectedLayout.zoneKey, e.target.value)}>
              <option value="">+ Add content</option>
              {normalizeDuplicateBlocks(card).map(block => <option key={block.id} value={block.id}>{block.name}</option>)}
            </select>
          </div>
        ) : null}
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
          <div><div className="card-preview-label">Front</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="front" showLayoutZones={true} /></div></div>
          <div><div className="card-preview-label">Back</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="back" showLayoutZones={true} /></div></div>
        </div>
        <div className="card-editor-controls">
        {CardLayoutEditor({ card })}
        {DuplicateBlocksEditor({ card })}
        <label>Name<input value={card.name} onChange={e => updateCardField(card.id, "name", e.target.value)} /></label>
        <div className="card-edit-section compact-color-row"><strong>Header Front</strong>{renderColorPicker(card, "headerFront", "Color")}{renderTextStyleControls(card, "headerFront", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Front</strong>{renderColorPicker(card, "positionFront", "Color")}{renderTextStyleControls(card, "positionFront", false, { panelAlign: "front" })}</div><select value={card.position} onChange={e => updateCardField(card.id, "position", e.target.value)}>{CARD_POSITION_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
        <StarMenuEditor card={card} />
        <div className="card-edit-section compact-color-row"><strong>Header Back</strong>{renderColorPicker(card, "headerBack", "Color")}{renderTextStyleControls(card, "headerBack", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Back</strong>{renderColorPicker(card, "positionBack", "Color")}{renderTextStyleControls(card, "positionBack", false, { panelAlign: "front" })}</div><select value={card.position} onChange={e => updateCardField(card.id, "position", e.target.value)}>{CARD_POSITION_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
        {FrontZoneFieldsEditor({ card, storageKey: "frontAttributeFields", title: "Attributes Front", colorKey: "attributesFront", sourceSection: "passiveAttributes" })}
        {FrontZoneFieldsEditor({ card, storageKey: "frontBonusFields", title: "Bonuses Front", colorKey: "bonusesFront", sourceSection: "bonuses" })}
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Attributes</strong><button type="button" className="mini-action-btn layout-action-btn" onClick={() => addDuplicateBlock(card.id, "attributesBack")}>Duplicate</button></div>{SectionTitleEditor({ card, titleKey: "attributes", colorKey: "attributesTitle", label: "Title" })}{AttributeListEditor({ card, section: "passiveAttributes", title: "Attributes", hideHeader: true, toolbarLeft: <>{renderColorPicker(card, "attributes", "Text Color")}{renderTextStyleControls(card, "attributes", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "attributesValue", "Numbers Color")}{renderTextStyleControls(card, "attributesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</> })}</div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Bonuses</strong><button type="button" className="mini-action-btn layout-action-btn" onClick={() => addDuplicateBlock(card.id, "bonusesBack")}>Duplicate</button></div>{SectionTitleEditor({ card, titleKey: "bonuses", colorKey: "bonusesTitle", label: "Title" })}{AttributeListEditor({ card, section: "bonuses", title: "Bonuses", hideHeader: true, toolbarLeft: <>{renderColorPicker(card, "bonuses", "Text Color")}{renderTextStyleControls(card, "bonuses", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "bonusesValue", "Numbers Color")}{renderTextStyleControls(card, "bonusesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</> })}</div>
        <div className="card-edit-section special-ability-editor"><div className="card-edit-section-title"><strong>Special Ability</strong><button type="button" className="mini-action-btn layout-action-btn" onClick={() => addDuplicateBlock(card.id, "specialAbility")}>Duplicate</button></div>{SectionTitleEditor({ card, titleKey: "specialAbility", colorKey: "specialAbilityTitle", label: "Title" })}<div className="special-text-toolbar">{renderColorPicker(card, "specialAbility", "Text Color")}{renderTextStyleControls(card, "specialAbility", false, { panelAlign: "left", inlinePanel: true })}</div><textarea className="special-ability-textarea" value={card.specialAbility || ""} onChange={e => updateCardField(card.id, "specialAbility", e.target.value)} placeholder="Write special ability text..." /></div>
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
            <div className="team-layout">{rosterSlots[teamKey].starting.map((slot) => <div key={slot.id} className="team-slot"><div><strong>{slot.position}</strong>{slot.cardId && <small>{cardById[slot.cardId]?.name || "Missing card"}</small>}</div><div className="slot-actions"><button onClick={() => setAssignTarget({ type: "team", team: teamKey, pieceId: slot.pieceId })}>Assign</button>{slot.cardId && <><button onClick={() => setEditingCardId(slot.cardId) || setCardsView("library")}>Edit</button><button onClick={() => removePieceCard(slot.pieceId)}>Remove</button></>}</div></div>)}</div>
            <div className="roster-title substitutes-title">Substitutes</div>
            <div className="team-layout substitutes-layout">{rosterSlots[teamKey].substitutes.map((slot) => <div key={slot.id} className="team-slot substitute"><div><strong>{slot.position}</strong>{slot.cardId && <small>{cardById[slot.cardId]?.name || "Missing card"}</small>}</div><div className="slot-actions"><button onClick={() => setAssignTarget({ type: "team", team: teamKey, pieceId: slot.pieceId })}>Assign</button>{slot.cardId && <><button onClick={() => setEditingCardId(slot.cardId) || setCardsView("library")}>Edit</button><button onClick={() => removePieceCard(slot.pieceId)}>Remove</button></>}</div></div>)}</div>
          </div>
        )}
      </div>
    );
  }

  function AssignCardModal() {
    if (!assignTarget) return null;
    return (
      <div className="modal-backdrop" onPointerDown={() => setAssignTarget(null)}>
        <div className="assign-modal" onPointerDown={e => e.stopPropagation()}>
          <div className="modal-title"><strong>Assign Card</strong><button className="icon-btn" onClick={() => setAssignTarget(null)}><X size={18} /></button></div>
          <div className="assign-list">{cardState.cards.map(card => <button key={card.id} onClick={() => assignCard(card.id)}><b>{card.name}</b><span>{card.position}</span></button>)}</div>
          {cardState.cards.length === 0 && <p>Nu există carduri încă. Creează unul în Card Library.</p>}
        </div>
      </div>
    );
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
    const mouthX = side === "left" ? settings.goalDepth : 0;
    const backPostX = side === "left" ? 0 : settings.goalDepth;
    const internalVerticalLines = Array.from({ length: Math.max(0, settings.goalDepth - 1) }, (_, i) => i + 1);
    const internalHorizontalLines = Array.from({ length: Math.max(0, settings.goalWidth - 1) }, (_, i) => i + 1);

    return (
      <svg className="goal-grid" viewBox={`0 0 ${settings.goalDepth} ${settings.goalWidth}`} preserveAspectRatio="none" aria-hidden="true">
        {internalVerticalLines.map(i => (
          <line className="goal-grid-line" key={`v-${i}`} x1={i} y1={0} x2={i} y2={settings.goalWidth} />
        ))}
        {internalHorizontalLines.map(i => (
          <line className="goal-grid-line" key={`h-${i}`} x1={0} y1={i} x2={settings.goalDepth} y2={i} />
        ))}
        <line className="goal-frame-line" x1={backPostX} y1={0} x2={backPostX} y2={settings.goalWidth} />
        <line className="goal-frame-line" x1={backPostX} y1={0} x2={mouthX} y2={0} />
        <line className="goal-frame-line" x1={backPostX} y1={settings.goalWidth} x2={mouthX} y2={settings.goalWidth} />
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

  function applyRulerPoint(point) {
    if (!measureStart || (measureStart && measureEnd)) {
      setMeasureStart(point);
      setMeasureEnd(null);
    } else {
      setMeasureEnd(point);
    }
  }

  function onPitchPointerDown(e) {
    if (!measureMode) return;

    // Pe touch nu schimbăm rigla la începutul unui gest de zoom/pan.
    // Tap-ul real este tratat în onBoardTouchEnd; drag/zoom lasă rigla fixată.
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

  function onPitchPointerMove(e) {
    const interaction = measureInteractionRef.current;
    if (!interaction || interaction.pointerId !== e.pointerId) return;

    const dx = e.clientX - interaction.startX;
    const dy = e.clientY - interaction.startY;
    if (!interaction.panning && Math.sqrt(dx * dx + dy * dy) > 4) {
      interaction.panning = true;
    }

    if (interaction.panning) {
      e.preventDefault();
      e.stopPropagation();
      setPanOffset({
        x: interaction.originPanX + dx,
        y: interaction.originPanY + dy,
      });
    }
  }

  function onPitchPointerUp(e) {
    const interaction = measureInteractionRef.current;
    if (!interaction || interaction.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();
    if (!interaction.panning) {
      applyRulerPoint(interaction.point);
    }
    measureInteractionRef.current = null;
    pitchRef.current?.releasePointerCapture?.(e.pointerId);
  }

  function onPitchPointerCancel(e) {
    if (measureInteractionRef.current?.pointerId === e.pointerId) {
      measureInteractionRef.current = null;
    }
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
      const now = Date.now();
      const last = lastTapRef.current;
      const dx = touch.clientX - last.x;
      const dy = touch.clientY - last.y;
      const closeEnough = Math.sqrt(dx * dx + dy * dy) < 32;
      if (now - last.time < 320 && closeEnough) {
        e.preventDefault();
        resetView();
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        touchGestureRef.current = null;
      } else {
        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
        touchGestureRef.current = {
          mode: "one-finger",
          startX: touch.clientX,
          startY: touch.clientY,
          originPanX: panOffset.x,
          originPanY: panOffset.y,
          point: measureMode ? getRulerPointFromClient(touch.clientX, touch.clientY) : null,
          moved: false,
        };
      }
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
      if (measureMode && !gesture.moved && gesture.point) {
        applyRulerPoint(gesture.point);
      }
      touchGestureRef.current = null;
      return;
    }

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
        <strong>Sandbox</strong>
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

        <button className={measureMode ? "toggle-on" : ""} onClick={() => {
          setMeasureMode(v => !v);
          setMeasureStart(null);
          setMeasureEnd(null);
        }}>
          Riglă {measureMode ? "ON" : "OFF"}
        </button>
        <button className={historyVisible ? "toggle-on" : ""} onClick={() => setHistoryVisible(v => !v)}>
          History {historyVisible ? "ON" : "OFF"}
        </button>
        <button className={dicePanelVisible ? "toggle-on" : ""} onClick={() => setDicePanelVisible(v => !v)}>
          Zaruri {dicePanelVisible ? "ON" : "OFF"}
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
      </div>

      {cardsPanelOpen && !lockUI && CardsPanel()}

      <div className="board-and-inspector">
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
          <div
            className="pitch"
            ref={pitchRef}
            style={pitchStyle}
            onPointerDown={onPitchPointerDown}
            onPointerMove={onPitchPointerMove}
            onPointerUp={onPitchPointerUp}
            onPointerCancel={onPitchPointerCancel}
          >
            <div className="extended-hit-area" style={{
              left: `calc(${-invisiblePaddingForSettings(settings)} * var(--cell))`,
              top: `calc(${-invisiblePaddingForSettings(settings)} * var(--cell))`,
              width: `calc((${settings.cols} + ${invisiblePaddingForSettings(settings) * 2}) * var(--cell))`,
              height: `calc((${settings.rows} + ${invisiblePaddingForSettings(settings) * 2}) * var(--cell))`,
            }} />
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

            {measureMode && measureStart && (
              <div className={`measure-point start ${(measureType === "corner" || measureType === "cornerCenter") ? "corner" : "center"}`} style={{
                left: `calc(${measureStart.x} * var(--cell) - var(--cell) * .13)`,
                top: `calc(${measureStart.y} * var(--cell) - var(--cell) * .13)`,
              }} />
            )}
            {measureMode && measureEnd && (
              <div className={`measure-point end ${measureType === "corner" ? "corner" : "center"}`} style={{
                left: `calc(${measureEnd.x} * var(--cell) - var(--cell) * .13)`,
                top: `calc(${measureEnd.y} * var(--cell) - var(--cell) * .13)`,
              }} />
            )}
            {measureMode && measureStart && measureEnd && (
              <svg className={`measure-svg ${measureType === "corner" ? "corner" : measureType === "cornerCenter" ? "mixed" : "center"}`} viewBox={`0 0 ${settings.cols} ${settings.rows}`} preserveAspectRatio="none">
                <line
                  className="ruler-shadow-line"
                  x1={measureStart.x}
                  y1={measureStart.y}
                  x2={measureEnd.x}
                  y2={measureEnd.y}
                />
                <line
                  className="ruler-main-line"
                  x1={measureStart.x}
                  y1={measureStart.y}
                  x2={measureEnd.x}
                  y2={measureEnd.y}
                />
                {rulerMarkers.map(mark => (
                  <g key={mark.key} className={`ruler-marker ${mark.type}`}>
                    <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} />
                    <text x={mark.labelX} y={mark.labelY}>{mark.label}</text>
                  </g>
                ))}
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


            {defensiveAreaOverlays.map(cell => (
              <div
                key={cell.id}
                className={`def-area-board-cell ${cell.team === "A" ? "blue" : "red"}`}
                style={{
                  left: `calc(${cell.x} * var(--cell))`,
                  top: `calc(${cell.y} * var(--cell))`,
                }}
              />
            ))}

            {pieces.map(p => (
              <div
                key={p.id}
                data-coord={withBoardPosition(p, settings).coord}
                title={`${getPieceDisplayLabel(p)} ${withBoardPosition(p, settings).coord}${p.cardId ? " · Card attached" : ""}`}
                className={`piece ${p.team === "A" ? "team-a" : p.team === "B" ? "team-b" : "ball"} ${selectedId === p.id ? "selected" : ""} ${p.cardId ? "has-card" : ""}`}
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
                <span className="piece-label">{p.team === "BALL" ? p.label : getPieceDisplayLabel(p)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
            {inspectedPiece && <span>{inspectedPiece.team === "A" ? "Blue" : inspectedPiece.team === "B" ? "Red" : "Ball"} · {inspectedPiece.team === "BALL" ? inspectedPiece.label : getPieceDisplayLabel(inspectedPiece)}</span>}
            <button className="inspector-window-btn" title="Minimize" onPointerDown={e => e.stopPropagation()} onClick={() => setInspectorMinimized(v => !v)}>{inspectorMinimized ? "□" : "—"}</button>
            <button className="inspector-window-btn" title="Close" onPointerDown={e => e.stopPropagation()} onClick={() => setInspectorVisible(false)}>×</button>
          </div>
        </div>
        {!inspectorMinimized && (
          <div className="inspector-body">
            {!inspectedPiece || inspectedPiece.team === "BALL" ? (
              <p className="muted">Click/tap pe un puc ca să vezi cardul atașat.</p>
            ) : (
              <>
                <div className="inspector-piece-line"><b>Post puc:</b> {inspectedPiece.label || "—"}</div>
                {inspectedCard ? (
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
                          onSideChange={setInspectorCardSide}
                        />
                      </div>
                    </div>
                  </div>
                ) : <div className="card-preview empty">Niciun card atașat</div>}
                <div className="inspector-actions">
                  <button onClick={() => setAssignTarget({ type: "piece", pieceId: inspectedPiece.id })}>Assign Card</button>
                  {inspectedCard && <button onClick={() => { setCardsPanelOpen(true); setCardsView("library"); setEditingCardId(inspectedCard.id); }}>Edit Card</button>}
                  {inspectedCard && <button onClick={() => removePieceCard(inspectedPiece.id)}>Remove Card</button>}
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

      {measureMode && measureInfo && (
        <div className={`measure-panel ${measureType === "corner" ? "corner" : "center"}`}>
          Riglă {measureType === "corner" ? "Corner-to-Corner" : measureType === "cornerCenter" ? "Corner-to-Center" : "Center-to-Center"}: {measureInfo.cellsLabel} căsuțe
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
            <strong>Riglă</strong>
            <div className="ruler-actions">
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { setMeasureMode(false); setMeasureStart(null); setMeasureEnd(null); }}>_</button>
            </div>
          </div>
          <div className="ruler-panel-body">
            <div className="ruler-floating-row mode-row">
              <button className={measureType === "center" ? "toggle-on ruler-center" : ""} onClick={() => { setMeasureType("center"); setMeasureStart(null); setMeasureEnd(null); }}>Center</button>
              <button className={measureType === "corner" ? "toggle-on ruler-corner" : ""} onClick={() => { setMeasureType("corner"); setMeasureStart(null); setMeasureEnd(null); }}>Corner</button>
              <button className={measureType === "cornerCenter" ? "toggle-on ruler-corner-center" : ""} onClick={() => { setMeasureType("cornerCenter"); setMeasureStart(null); setMeasureEnd(null); }}>Corner→Center</button>
            </div>
            <div className="ruler-floating-grid">
              <label className="ruler-mark-input pass">P
                <input type="number" min="1" step="1" value={passMark} onChange={e => setPassMark(Number(e.target.value) || 1)} />
              </label>
              <label className="ruler-mark-input shot">Șut
                <input type="number" min="1" step="1" value={shotMark} onChange={e => setShotMark(Number(e.target.value) || 1)} />
              </label>
            </div>
          </div>
          <div className="ruler-resize" onPointerDown={onRulerPanelResizeDown} />
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

      {AssignCardModal()}

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
