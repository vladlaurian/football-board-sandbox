import React from "react";

// Visual-only Tracker surface. The App shell deliberately owns all state,
// Timeline/Firebase writes, permissions, and pointer-state transitions.
export function TrackerPanel({
  visible,
  lockUI,
  minimized,
  readOnly,
  position,
  size,
  onPointerMove,
  onPointerUp,
  onTitlePointerDown,
  onMinimize,
  onClose,
  gameStarted,
  allowUnstartedContinue = false,
  onStartNewGame,
  onContinueGame,
  onChangePossession,
  onReset,
  trackerSettings,
  trackerRoleFor,
  trackerActionCountFor,
  usedActions,
  gameMode,
  actionLog,
  onToggleAction,
  onRemoveLastAction,
  currentTurn,
  score = { blue: 0, red: 0 },
  turnsReadOnly = false,
  onSelectTurn,
  onResizeDown,
  teamModifierTokens = {},
  teamModifierCapacity = 3,
  showTeamModifiers = false,
}) {
  if (!visible || lockUI) return null;

  return (
    <div
      className={`tracker-panel ${minimized ? "minimized" : ""} ${readOnly ? "read-only" : ""}`}
      style={{ left: position.x, top: position.y, width: size.w, height: minimized ? 34 : size.h }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="tracker-panel-title" onPointerDown={onTitlePointerDown}>
        <strong>TRACKER{readOnly ? " — VIEW ONLY" : ""}</strong>
        <div className="tracker-panel-actions">
          <button onPointerDown={e => e.stopPropagation()} onClick={onMinimize}>{minimized ? "□" : "—"}</button>
          <button onPointerDown={e => e.stopPropagation()} onClick={onClose}>×</button>
        </div>
      </div>
      {!minimized && (
        <div className="tracker-panel-body">
          <div className="tracker-main-actions">
            <button className="tracker-primary-button tracker-start-button" onClick={onStartNewGame} disabled={readOnly}>Start New Game</button>
            <button className="tracker-primary-button tracker-continue-button" onClick={onContinueGame} disabled={readOnly || (!gameStarted && !allowUnstartedContinue)}>Continue Game</button>
            <button className="tracker-change-possession-button" onClick={onChangePossession} disabled={readOnly || !gameStarted}>Change Possession</button>
            <button className="tracker-reset-button" onClick={onReset} disabled={readOnly || !gameStarted}>Reset Trackers</button>
          </div>
          <div className="tracker-team-grid">
            {["blue", "red"].map(team => {
              const role = trackerRoleFor(team);
              const count = role === "waiting"
                ? (team === "red" ? trackerSettings.attackActions : trackerSettings.defenseActions)
                : trackerActionCountFor(team);
              const used = usedActions[team];
              return (
                <section key={team} className={`tracker-team ${team}`}>
                  <div className="tracker-team-title"><strong>{team.toUpperCase()}</strong><span>{role === "attack" ? "ATTACK" : role === "defense" ? "DEFENSE" : "WAITING"}</span></div>
                  <div className="tracker-action-dots">
                    {Array.from({ length: count }, (_, index) => {
                      const editorMode = gameMode === "editor";
                      const isUsed = index < used;
                      const canEditDot = !readOnly && gameStarted && (editorMode || index === used - 1);
                      return (
                        <button
                          key={index}
                          aria-label={`${team} action ${index + 1}`}
                          className={isUsed ? "used" : ""}
                          onClick={() => editorMode ? onToggleAction(team, index) : (index === used - 1 && onRemoveLastAction(team))}
                          disabled={!canEditDot}
                          aria-disabled={!canEditDot}
                        >{isUsed && !editorMode ? (actionLog[team]?.[index]?.trackerMarker || "?") : ""}</button>
                      );
                    })}
                  </div>
                  {!showTeamModifiers && <div className="tracker-roll-bonus-badges" />}
                </section>
              );
            })}
          </div>
          {showTeamModifiers && <div className="tracker-modifier-grid">
            {["blue", "red"].map(team => {
              const tokens = teamModifierTokens[team] || [];
              return <section key={team} className={`tracker-modifier-row ${team}`} aria-label={`${team} modifiers ${tokens.length} of ${teamModifierCapacity}`}>
                <strong>{team.toUpperCase()} MODIFIERS {tokens.length}/{teamModifierCapacity}</strong>
                <div>{tokens.length ? tokens.map(token => <span key={token.id} className={`modifier-${token.modifierType}`}>{{ advantage: "AV", majorAdvantage: "AVM", disadvantage: "DV", majorDisadvantage: "DVM" }[token.modifierType]}</span>) : <em>—</em>}</div>
              </section>;
            })}
          </div>}
          <div className="tracker-turns-block">
            <strong>TURN</strong>
            <div className="tracker-turns">
              {Array.from({ length: trackerSettings.turns }, (_, index) => index + 1).map(turn => (
                <button
                  key={turn}
                  className={turn === currentTurn ? "active" : turn < currentTurn ? "completed" : ""}
                  onClick={() => onSelectTurn(turn)}
                  disabled={readOnly || turnsReadOnly || !gameStarted || turn > currentTurn + 1}
                  aria-disabled={readOnly || turnsReadOnly || !gameStarted || turn > currentTurn + 1}
                >{turn}</button>
              ))}
            </div>
          </div>
          <div className="tracker-score-block">
            <span className="tracker-score-team blue">BLUE</span>
            <span className="tracker-score-value">{Number(score.blue) || 0} - {Number(score.red) || 0}</span>
            <span className="tracker-score-team red">RED</span>
          </div>
        </div>
      )}
      {!minimized && <div className="tracker-resize" onPointerDown={onResizeDown} />}
    </div>
  );
}
