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
      <div className={summary.formation?.exact ? "selection-current-valid" : "selection-problem"}>
        <strong>{summary.formation?.formation?.name || "Formation"}:</strong> {summary.formation?.exact ? "starter roles match." : "starter roles need correction."}
      </div>
      {!summary.formation?.exact && <>
        {summary.formation?.missing?.length > 0 && <div className="selection-problem"><strong>Missing:</strong> {summary.formation.missing.join(" · ")}</div>}
        {summary.formation?.excess?.length > 0 && <div className="selection-problem"><strong>Excess:</strong> {summary.formation.excess.join(" · ")}</div>}
        {summary.formation?.slotProblems?.length > 0 && <ul className="selection-issues">{summary.formation.slotProblems.map(problem => <li key={`${problem.index}-${problem.cardId}`}>Slot {problem.index + 1}: expected {problem.expectedRole} · assigned {problem.actualRole} — {problem.cardName}</li>)}</ul>}
        {summary.suggestedFormationNames?.length > 0 && <div><strong>Compatible formations:</strong> {summary.suggestedFormationNames.join(" · ")}</div>}
      </>}
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
  adjustActive,
  onAdjust,
  onResetAdjust,
  onReady,
  readyValid,
  selectionSummaries,
  adjustDisabled,
  selectedTeamSummary,
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
          {selectedTeamSummary && <div className={selectedTeamSummary.formation?.exact ? "prep-selected-formation-status valid" : "prep-selected-formation-status invalid"}>
            <strong>{teamName} formation:</strong> {selectedTeamSummary.formation?.exact ? "roles match." : `needs correction${selectedTeamSummary.formation?.missing?.length ? ` · missing ${selectedTeamSummary.formation.missing.join(", ")}` : ""}${selectedTeamSummary.formation?.excess?.length ? ` · excess ${selectedTeamSummary.formation.excess.join(", ")}` : ""}`}
          </div>}
          <div className="prep-action-grid">
            <button onClick={() => selectionSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>Selection</button>
            <button disabled={adjustDisabled} className={adjustActive ? "active" : ""} onClick={onAdjust} title={adjustDisabled ? "Correct the selected formation's starter roles before Adjust." : "Highlight role zones and adjust starter positions."}>Adjust</button>
            <button disabled title="Substitution waits for the canonical interruption/restart lifecycle.">Substitution</button>
            <button className={`prep-ready-button ${readyValid ? "is-valid" : ""}`} onClick={onReady}>Ready</button>
          </div>
          {adjustActive && <button className="prep-reset-adjust" onClick={onResetAdjust}>Reset {teamName} formation layout</button>}
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
