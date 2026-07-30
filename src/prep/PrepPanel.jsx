import React from "react";

// Prep is a future-Match Workspace surface. It deliberately owns only its
// presentation; card assignment and formation application remain in App.
export function PrepPanel({
  visible,
  lockUI,
  minimized,
  position,
  size,
  onPointerMove,
  onPointerUp,
  onTitlePointerDown,
  onResizeDown,
  onMinimize,
  onClose,
  selectedTeam,
  onSelectedTeam,
  formations,
  formationId,
  onFormationChange,
  onOpenSelection,
  onReady,
  readyValid,
}) {
  if (!visible || lockUI) return null;
  const teamName = selectedTeam === "A" ? "Blue" : "Red";

  return (
    <div
      className={`prep-panel ${minimized ? "minimized" : ""} ${readyValid ? "ready-valid" : ""}`}
      style={{ left: position.x, top: position.y, width: size.w, height: minimized ? 34 : size.h }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="prep-panel-title" onPointerDown={onTitlePointerDown}>
        <strong>PREP</strong>
        <div className="prep-panel-actions">
          <button onPointerDown={event => event.stopPropagation()} onClick={onMinimize}>{minimized ? "□" : "—"}</button>
          <button onPointerDown={event => event.stopPropagation()} onClick={onClose}>×</button>
        </div>
      </div>
      {!minimized && (
        <div className="prep-panel-body">
          <section className="prep-section">
            <strong>Team</strong>
            <div className="prep-team-actions">
              <button className={selectedTeam === "A" ? "blue active" : "blue"} onClick={() => onSelectedTeam("A")}>Blue</button>
              <button className={selectedTeam === "B" ? "red active" : "red"} onClick={() => onSelectedTeam("B")}>Red</button>
            </div>
          </section>
          <section className="prep-section">
            <strong>Formation</strong>
            <select aria-label={`${teamName} formation`} value={formationId} onChange={event => onFormationChange(Number(event.target.value))}>
              {(formations || []).map(formation => <option key={formation.id} value={formation.id}>{formation.id}. {formation.name}</option>)}
            </select>
          </section>
          <div className="prep-action-grid">
            <button onClick={onOpenSelection}>Selection</button>
            <button disabled title="Adjust will be implemented in v20.56.13.">Adjust</button>
            <button disabled title="Substitution waits for the canonical interruption/restart lifecycle.">Substitution</button>
            <button className={`prep-ready-button ${readyValid ? "is-valid" : ""}`} onClick={onReady}>Ready</button>
          </div>
          <div className="prep-disabled-notes">
            <span>Adjust: v20.56.13</span>
            <span>Substitution: waits for interruptions/restarts</span>
          </div>
        </div>
      )}
      {!minimized && <div className="prep-resize" onPointerDown={onResizeDown} />}
    </div>
  );
}
