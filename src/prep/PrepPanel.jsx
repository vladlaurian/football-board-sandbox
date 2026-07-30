import React, { useRef } from "react";

function SelectionStatus({ summary }) {
  const rules = summary?.rules;
  const starLimitIssues = summary?.issues?.some(item => item.code === "individual-stars-cap" || item.code === "maximum-stars-player-count");
  return (
    <section className="prep-selection-status">
      <strong className="prep-selection-status-title">{summary.teamName} Selection</strong>
      {rules.freeMode ? (
        <div className="selection-free-enabled">Free Selection enabled</div>
      ) : (
        <>
          {rules.totalStarsCap.enabled && <div className={summary.issues.some(item => item.code === "total-stars-cap") ? "selection-problem" : ""}><strong>Total Stars Cap:</strong> {summary.totalStars}/{rules.totalStarsCap.value}</div>}
          {rules.maximumPlayersAtStars.enabled && <div className={starLimitIssues ? "selection-problem" : ""}><strong>Maximum {rules.maximumPlayersAtStars.maxPlayers} at {rules.maximumPlayersAtStars.stars} stars:</strong> current {summary.atMaximumStars} · no card above {rules.maximumPlayersAtStars.stars}</div>}
        </>
      )}
      <div><strong>Total Stars:</strong> {summary.totalStars}</div>
      <div><strong>Assigned cards:</strong> {summary.assignedCount}/18</div>
      <div className={summary.valid ? "selection-current-valid" : "selection-problem"}>{summary.valid ? "Current selection is legal." : "Selection needs correction."}</div>
      {summary.issues.length > 0 && <ul className="selection-issues">{summary.issues.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul>}
    </section>
  );
}

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
  onReady,
  readyValid,
  selectionSummaries,
}) {
  const selectionSummaryRef = useRef(null);
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
            <button onClick={() => selectionSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>Selection</button>
            <button disabled title="Adjust will be implemented in v20.56.14.">Adjust</button>
            <button disabled title="Substitution waits for the canonical interruption/restart lifecycle.">Substitution</button>
            <button className={`prep-ready-button ${readyValid ? "is-valid" : ""}`} onClick={onReady}>Ready</button>
          </div>
          <div className="prep-selection-statuses" ref={selectionSummaryRef}>
            <SelectionStatus summary={selectionSummaries.blue} />
            <SelectionStatus summary={selectionSummaries.red} />
          </div>
        </div>
      )}
      {!minimized && <div className="prep-resize" onPointerDown={onResizeDown} />}
    </div>
  );
}
