import React from "react";

export function HistoryPanel({
  visible,
  lockUI,
  position,
  size,
  onHistoryPointerMove,
  onHistoryResizeMove,
  onPointerUp,
  onTitlePointerDown,
  onHistoryResizeDown,
  onClose,
  historyListRef,
  isReplayView,
  gameTimeline,
  clearHistory,
  gameMode,
  sessionCode,
  isSessionHost,
  restoreTimelineCursor,
}) {
  if (!visible || lockUI) return null;
  const entries = gameTimeline?.entries || [];
  return (
    <div
      className="history-panel"
      style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      onPointerMove={event => {
        onHistoryPointerMove(event);
        onHistoryResizeMove(event);
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="history-title" onPointerDown={onTitlePointerDown} onLostPointerCapture={onPointerUp}>
        <strong>{isReplayView ? "Replay" : "History"} {gameTimeline ? `${gameTimeline.cursor}/${gameTimeline.entries.length}` : "0/0"}</strong>
        <div className="history-actions">
          <button onPointerDown={event => event.stopPropagation()} onClick={clearHistory} disabled={isReplayView || gameMode !== "match" || (Boolean(sessionCode) && !isSessionHost)}>Clear</button>
          <button onPointerDown={event => event.stopPropagation()} onClick={onClose}>_</button>
        </div>
      </div>
      <div className="history-list" ref={historyListRef}>
        {(!gameTimeline || entries.length === 0) && <div className="history-empty">Nu există pași încă.</div>}
        {isReplayView && gameTimeline && <button className={`history-item replay-start ${gameTimeline.cursor === 0 ? "applied current" : "future"}`} data-history-cursor="0" onClick={() => restoreTimelineCursor(0)}><span>0. Start</span><small>{new Date(gameTimeline.startedAt).toLocaleTimeString()}</small></button>}
        {entries.map((entry, index) => <button key={entry.id} className={`history-item ${index < gameTimeline.cursor ? "applied" : "future"} ${index + 1 === gameTimeline.cursor ? "current" : ""}`} data-history-cursor={index + 1} onClick={() => restoreTimelineCursor(index + 1)} disabled={!isReplayView && (gameMode !== "match" || (Boolean(sessionCode) && !isSessionHost))}><span>{index + 1}. {entry.label}</span><small>{new Date(entry.createdAt).toLocaleTimeString()}</small></button>)}
      </div>
      <div className="history-resize" onPointerDown={onHistoryResizeDown} onLostPointerCapture={onPointerUp} />
    </div>
  );
}
