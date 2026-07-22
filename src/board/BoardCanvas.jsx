import React from "react";

import {
  invisiblePaddingForSettings,
  rowLetter,
  withBoardPosition,
} from "./boardGeometry.mjs";
import { MatchBallIcon } from "./MatchBallIcon.jsx";

function GoalGrid({ side, settings }) {
  const mouthX = side === "left" ? settings.goalDepth : 0;
  const backPostX = side === "left" ? 0 : settings.goalDepth;
  const internalVerticalLines = Array.from({ length: Math.max(0, settings.goalDepth - 1) }, (_, index) => index + 1);
  const internalHorizontalLines = Array.from({ length: Math.max(0, settings.goalWidth - 1) }, (_, index) => index + 1);
  return (
    <svg className="goal-grid" viewBox={`0 0 ${settings.goalDepth} ${settings.goalWidth}`} preserveAspectRatio="none" aria-hidden="true">
      {internalVerticalLines.map(index => <line className="goal-grid-line" key={`v-${index}`} x1={index} y1={0} x2={index} y2={settings.goalWidth} />)}
      {internalHorizontalLines.map(index => <line className="goal-grid-line" key={`h-${index}`} x1={0} y1={index} x2={settings.goalDepth} y2={index} />)}
      <line className="goal-frame-line" x1={backPostX} y1={0} x2={backPostX} y2={settings.goalWidth} />
      <line className="goal-frame-line" x1={backPostX} y1={0} x2={mouthX} y2={0} />
      <line className="goal-frame-line" x1={backPostX} y1={settings.goalWidth} x2={mouthX} y2={settings.goalWidth} />
    </svg>
  );
}

function arcMask(side, settings, penaltyY) {
  const radius = settings.arcRadius;
  const centerX = side === "left" ? settings.penaltyDistance : settings.cols - settings.penaltyDistance;
  const centerY = penaltyY + 0.5;
  const boxEdgeX = side === "left" ? settings.boxDepth : settings.cols - settings.boxDepth;
  const left = centerX - radius;
  const top = centerY - radius;
  const diameter = radius * 2;

  if (side === "left") {
    const maskLeft = boxEdgeX;
    const maskWidth = Math.max(0, left + diameter - boxEdgeX);
    return {
      mask: { left: `calc(${maskLeft} * var(--cell))`, top: `calc(${top} * var(--cell))`, width: `calc(${maskWidth} * var(--cell))`, height: `calc(${diameter} * var(--cell))` },
      circle: { left: `calc(${left - maskLeft} * var(--cell))`, top: "0px", width: `calc(${diameter} * var(--cell))`, height: `calc(${diameter} * var(--cell))` },
    };
  }

  const maskLeft = left;
  const maskWidth = Math.max(0, boxEdgeX - left);
  return {
    mask: { left: `calc(${maskLeft} * var(--cell))`, top: `calc(${top} * var(--cell))`, width: `calc(${maskWidth} * var(--cell))`, height: `calc(${diameter} * var(--cell))` },
    circle: { left: "0px", top: "0px", width: `calc(${diameter} * var(--cell))`, height: `calc(${diameter} * var(--cell))` },
  };
}

export function BoardCanvas({
  boardWrapRef,
  pitchRef,
  selectedId,
  activeInteractionPieceId = null,
  setHoveredCell,
  startBoardPan,
  moveBoardPan,
  endBoardPan,
  onBoardWheel,
  onBoardTouchStart,
  onBoardTouchMove,
  onBoardTouchEnd,
  pitchShellStyle,
  pitchStyle,
  settings,
  onPitchPointerDown,
  onPitchPointerMove,
  onPitchPointerUp,
  onPitchPointerCancel,
  selectedPiece,
  selectedMovementAxis,
  movementAxisSymbol,
  movementPreview,
  hoveredCell,
  coordinateCells,
  measureMode,
  measureStart,
  measureEnd,
  measureType,
  rulerMarkers,
  defensiveAreaOverlays,
  passPreview,
  passTargeting,
  passActive,
  passTargetDistance,
  passRouteInteractive = true,
  onSelectPassRoute,
  groupMoveZone = null,
  onConfirmGroupMoveZone,
  onGroupMoveZoneDragStart,
  onGroupMoveZoneDragMove,
  onGroupMoveZoneDragEnd,
  groupMovePieceStatusById = {},
  pieces,
  getPieceDisplayLabel,
  onPiecePointerDown,
  openEdit,
}) {
  const boxTop = Math.floor((settings.rows - settings.boxWidth) / 2);
  const smallTop = Math.floor((settings.rows - settings.smallWidth) / 2);
  const goalTop = Math.floor((settings.rows - settings.goalWidth) / 2);
  const centerX = settings.cols / 2;
  const centerY = settings.rows / 2;
  const centerDotY = Math.floor(settings.rows / 2);
  const leftPenaltyX = settings.penaltyDistance;
  const rightPenaltyX = settings.cols - settings.penaltyDistance;
  const penaltyY = settings.penaltyY;
  const leftArc = arcMask("left", settings, penaltyY);
  const rightArc = arcMask("right", settings, penaltyY);
  const line = (style, extraClass = "") => <div className={`pitch-line ${extraClass}`} style={style} />;

  return (
    <div
      className={`board-wrap ${(selectedId || activeInteractionPieceId) ? "piece-selected" : ""} ${passActive ? "pass-active" : ""}`}
      ref={boardWrapRef}
      onPointerDown={startBoardPan}
      onPointerMove={moveBoardPan}
      onPointerUp={endBoardPan}
      onPointerCancel={endBoardPan}
      onPointerLeave={() => setHoveredCell(null)}
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
          <div className="center-circle" style={{ width: `calc(${settings.centerCircleRadius * 2} * var(--cell))`, height: `calc(${settings.centerCircleRadius * 2} * var(--cell))`, left: `calc((${centerX} - ${settings.centerCircleRadius}) * var(--cell))`, top: `calc((${centerY} - ${settings.centerCircleRadius}) * var(--cell))` }} />
          <div className="center-dot" style={{ left: `calc(${centerX} * var(--cell) - var(--cell) * .08 + 1px)`, top: `calc((${centerDotY} + .5) * var(--cell) - var(--cell) * .08)` }} />

          {selectedPiece && <>
            <div className="selected-cell" style={{ left: `calc(${Math.floor(selectedPiece.x)} * var(--cell))`, top: `calc(${Math.floor(selectedPiece.y)} * var(--cell))` }} />
            {selectedMovementAxis && <div className="selected-axis-badge" style={{ left: `calc((${selectedPiece.x} + .82) * var(--cell))`, top: `calc((${selectedPiece.y} + .08) * var(--cell))` }}>{movementAxisSymbol(selectedMovementAxis)}</div>}
          </>}

          {groupMoveZone && <>
            <div
              className={`group-move-zone ${groupMoveZone.confirmable ? "is-draft" : "is-locked"}`}
              style={{ left: `calc(${groupMoveZone.zoneStartX} * var(--cell))`, width: `calc(${groupMoveZone.zoneLength} * var(--cell))` }}
              aria-label="Group Move zone"
              onPointerDown={event => {
                if (!groupMoveZone.confirmable) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                onGroupMoveZoneDragStart?.(event);
              }}
              onPointerMove={event => {
                if (!groupMoveZone.confirmable) return;
                event.preventDefault();
                event.stopPropagation();
                onGroupMoveZoneDragMove?.(event);
              }}
              onPointerUp={event => {
                if (!groupMoveZone.confirmable) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.releasePointerCapture?.(event.pointerId);
                onGroupMoveZoneDragEnd?.(event);
              }}
              onPointerCancel={event => {
                if (!groupMoveZone.confirmable) return;
                event.preventDefault();
                event.stopPropagation();
                onGroupMoveZoneDragEnd?.(event);
              }}
            />
            {groupMoveZone.confirmable && <button type="button" className="group-move-zone-confirm" style={{ left: `calc((${groupMoveZone.zoneStartX} + ${groupMoveZone.zoneLength / 2}) * var(--cell))` }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => { event.preventDefault(); event.stopPropagation(); onConfirmGroupMoveZone?.(); }}>CONFIRM GROUP ZONE</button>}
          </>}

          {!passActive && movementPreview && hoveredCell && <div className={`destination-cell-highlight ${!movementPreview.legal ? "illegal" : "legal"}`} style={{ left: `calc(${hoveredCell.x} * var(--cell))`, top: `calc(${hoveredCell.y} * var(--cell))` }} />}
          {!passActive && movementPreview && hoveredCell && <div className={`movement-cost-badge ${movementPreview.legal ? "" : "illegal"}`} style={{ left: `calc((${hoveredCell.x} + .5) * var(--cell))`, top: `calc(${hoveredCell.y} * var(--cell) - 4px)` }}>{movementPreview.label}</div>}
          {passTargeting && passTargetDistance && <div className="pass-target-distance" style={{ left: `calc((${passTargetDistance.x} + .5) * var(--cell))`, top: `calc((${passTargetDistance.y} + .5) * var(--cell))` }}>
            <strong>{passTargetDistance.label}</strong>
          </div>}

          {coordinateCells.map(cell => <div key={`${cell.x}-${cell.y}`} className="coord-label" style={{ left: `calc(${cell.x} * var(--cell))`, top: `calc(${cell.y} * var(--cell))` }}>{rowLetter(cell.y)}{cell.x + 1}</div>)}

          {measureMode && measureStart && <div className={`measure-point start ${(measureType === "corner" || measureType === "cornerCenter") ? "corner" : "center"}`} style={{ left: `calc(${measureStart.x} * var(--cell) - var(--cell) * .13)`, top: `calc(${measureStart.y} * var(--cell) - var(--cell) * .13)` }} />}
          {measureMode && measureEnd && <div className={`measure-point end ${measureType === "corner" ? "corner" : "center"}`} style={{ left: `calc(${measureEnd.x} * var(--cell) - var(--cell) * .13)`, top: `calc(${measureEnd.y} * var(--cell) - var(--cell) * .13)` }} />}
          {measureMode && measureStart && measureEnd && <svg className={`measure-svg ${measureType === "corner" ? "corner" : measureType === "cornerCenter" ? "mixed" : "center"}`} viewBox={`0 0 ${settings.cols} ${settings.rows}`} preserveAspectRatio="none">
            <line className="ruler-shadow-line" x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} />
            <line className="ruler-main-line" x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} />
            {rulerMarkers.map(mark => <g key={mark.key} className={`ruler-marker ${mark.type}`}><line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} /><text x={mark.labelX} y={mark.labelY}>{mark.label}</text></g>)}
          </svg>}

          {line({ left: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` }, "left-box")}
          {line({ right: 0, top: `calc(${boxTop} * var(--cell))`, width: `calc(${settings.boxDepth} * var(--cell))`, height: `calc(${settings.boxWidth} * var(--cell))` }, "right-box")}
          {line({ left: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` }, "left-box")}
          {line({ right: 0, top: `calc(${smallTop} * var(--cell))`, width: `calc(${settings.smallDepth} * var(--cell))`, height: `calc(${settings.smallWidth} * var(--cell))` }, "right-box")}

          <div className="goal left-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }}><GoalGrid side="left" settings={settings} /></div>
          <div className="goal right-goal" style={{ top: `calc(${goalTop} * var(--cell))`, width: `calc(${settings.goalDepth} * var(--cell))`, height: `calc(${settings.goalWidth} * var(--cell))` }}><GoalGrid side="right" settings={settings} /></div>
          <div className="penalty-dot penalty-dot-line" style={{ left: `calc(${leftPenaltyX} * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />
          <div className="penalty-dot penalty-dot-line" style={{ left: `calc(${rightPenaltyX} * var(--cell) - var(--cell) * .08)`, top: `calc((${penaltyY} + .5) * var(--cell) - var(--cell) * .08)` }} />
          <div className="arc-mask" style={leftArc.mask}><div className="arc-circle" style={leftArc.circle} /></div>
          <div className="arc-mask" style={rightArc.mask}><div className="arc-circle" style={rightArc.circle} /></div>

          {["tl", "tr", "bl", "br"].map(corner => {
            const horizontal = corner.endsWith("l") ? "left" : "right";
            const vertical = corner.startsWith("t") ? "top" : "bottom";
            return <div key={corner} className={`corner-mask corner-${corner}`} style={{ width: `calc(${settings.cornerArcRadius} * var(--cell))`, height: `calc(${settings.cornerArcRadius} * var(--cell))` }}><div className="corner-circle" style={{ [horizontal]: `calc(-${settings.cornerArcRadius} * var(--cell))`, [vertical]: `calc(-${settings.cornerArcRadius} * var(--cell))`, width: `calc(${settings.cornerArcRadius * 2} * var(--cell))`, height: `calc(${settings.cornerArcRadius * 2} * var(--cell))` }} /></div>;
          })}

          {defensiveAreaOverlays.map(cell => <div key={cell.id} className={`def-area-board-cell ${cell.team === "A" ? "blue" : "red"}`} style={{ left: `calc(${cell.x} * var(--cell))`, top: `calc(${cell.y} * var(--cell))` }} />)}

          {passPreview?.lines?.length > 0 && <svg className="pass-preview-svg" viewBox={`0 0 ${settings.cols} ${settings.rows}`} preserveAspectRatio="none">
            {passPreview.lines.map(line => <g key={line.id} className={`pass-preview-line ${line.status || (line.risk ? "risk" : "clear")} ${line.selected ? "route-selected" : ""}`}>
              <line x1={line.origin.x} y1={line.origin.y} x2={line.endpoint.x} y2={line.endpoint.y} />
              <circle cx={line.origin.x} cy={line.origin.y} r=".13" />
              <circle cx={line.endpoint.x} cy={line.endpoint.y} r=".13" />
            </g>)}
          </svg>}
          {passPreview?.target && <div className="piece-hitbox ball-hitbox pass-target-ball" style={{ left: `calc(${passPreview.target.x} * var(--cell) + var(--cell) * .25)`, top: `calc(${passPreview.target.y} * var(--cell) + var(--cell) * .25)` }} aria-hidden="true">
            <div className="piece ball pass-target-ghost"><MatchBallIcon className="board-ball-icon" /></div>
          </div>}
          {passPreview?.routes?.map(route => <button
            key={`pass-route-${route.id}`}
            type="button"
            className={`pass-route-badge ${route.cornerId || "center"} ${route.status || (route.risk ? "risk" : "clear")}`}
            style={{ left: `calc(${route.origin.x} * var(--cell))`, top: `calc(${route.origin.y} * var(--cell))` }}
            onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
            onPointerUp={event => { event.preventDefault(); event.stopPropagation(); }}
            onTouchStart={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
            disabled={!passRouteInteractive || route.disabled}
            aria-disabled={!passRouteInteractive || route.disabled}
            onClick={event => { event.preventDefault(); event.stopPropagation(); if (passRouteInteractive && !route.disabled) onSelectPassRoute?.(route.cornerId); }}
            title={`${route.foot} ${route.modifier} · ${route.isLong ? "Long Pass" : "Short Pass"}`}
          >
            <span>{route.foot} {route.modifier}</span><small>{route.isLong ? "LONG" : "SHORT"}</small>
          </button>)}

          {pieces.map(piece => {
            const isBall = piece.team === "BALL";
            const normalizedPiece = withBoardPosition(piece, settings);
            const groupMoveStatus = groupMovePieceStatusById[piece.id] || "";
            return <div key={piece.id} data-coord={normalizedPiece.coord} title={`${getPieceDisplayLabel(piece)} ${normalizedPiece.coord}${piece.cardId ? " · Card attached" : ""}${piece.inactive ? " · INACTIVE" : ""}`} className={`piece-hitbox ${isBall ? "ball-hitbox" : "player-hitbox"}`} style={{ left: `calc(${piece.x} * var(--cell) + var(--cell) * ${isBall ? 0.25 : 0})`, top: `calc(${piece.y} * var(--cell) + var(--cell) * ${isBall ? 0.25 : 0})` }} onPointerDown={event => onPiecePointerDown(piece.id, event)} onDoubleClick={() => openEdit(piece)}>
              <div className={`piece ${piece.team === "A" ? "team-a" : piece.team === "B" ? "team-b" : "ball"} ${selectedId === piece.id ? "selected" : ""} ${activeInteractionPieceId === piece.id && selectedId !== piece.id ? "interaction-active" : ""} ${piece.cardId ? "has-card" : ""} ${piece.inactive ? "inactive" : ""} ${groupMoveStatus ? `group-move-${groupMoveStatus}` : ""}`}>{isBall ? <MatchBallIcon className="board-ball-icon" /> : <><span className="piece-label">{getPieceDisplayLabel(piece)}</span>{groupMoveStatus === "ineligible" && <span className="group-move-lock" aria-label="Not eligible for Group Move">🔒</span>}</>}</div>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
