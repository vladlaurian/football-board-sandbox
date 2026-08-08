import React, { useRef } from "react";
import { FormationPreview } from "./FormationPreview.jsx";

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
  previewFormation,
  boardSettings,
  onSelectFormation,
  isKickoffMoment,
  pendingFormationId,
  adjustActive,
  onAdjust,
  onResetAdjust,
  onReady,
  readyValid,
  teamReady,
  selectionSummaries,
  adjustDisabled,
}) {
  const selectionSummaryRef = useRef(null);
  if (!visible || lockUI) return null;
  const teamName = selectedTeam === "A" ? "Blue" : "Red";
  const pendingFormationName = pendingFormationId ? (formations || []).find(f => f.id === pendingFormationId)?.name : null;

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
          <FormationPreview team={selectedTeam} formation={previewFormation} boardSettings={boardSettings} />
          {!isKickoffMoment && (
            <div className="prep-tactic-status">
              {pendingFormationName
                ? `Queued: ${pendingFormationName} — applies at the next kick-off.`
                : "Not a kick-off moment. Select Formation will queue this tactic for the next kick-off instead of applying it now."}
            </div>
          )}
          {isKickoffMoment && pendingFormationName && (
            <div className="prep-tactic-status">Queued tactic {pendingFormationName} will apply now on Select Formation.</div>
          )}
          <div className="prep-action-grid">
            <button onClick={onSelectFormation}>Select Formation</button>
            <button
              disabled={adjustDisabled || !isKickoffMoment}
              className={adjustActive ? "active" : ""}
              onClick={onAdjust}
              title={
                !isKickoffMoment
                  ? "Adjust is only available at a kick-off moment (before the Match starts, or during a pending post-goal restart)."
                  : adjustDisabled
                    ? "Correct the selected formation's starter roles before Adjust."
                    : "Select a starter to adjust it inside its local formation area."
              }
            >
              Adjust
            </button>
            <button disabled title="Substitution waits for the canonical interruption/restart lifecycle.">Substitution</button>
            <button className={`prep-ready-button ${readyValid ? "is-valid" : ""} ${teamReady ? "is-confirmed" : ""}`} onClick={onReady}>{teamReady ? "Ready ✓" : "Ready"}</button>
          </div>
          {adjustActive && isKickoffMoment && <button className="prep-reset-adjust" onClick={onResetAdjust}>Reset {teamName} default layout</button>}
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
