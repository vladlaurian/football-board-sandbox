import React from "react";

// Presentation boundary for the library and roster. The application shell
// retains all Workspace operations, browser file handling and legacy session
// synchronization through the controller callbacks.
export function CardsPanel({ controller }) {
  const {
    editingCard,
    editingCardId,
    cardsView,
    cardState,
    cardById,
    rosterSlots,
    pieces,
    sessionCode,
    workspaceLocked,
    themeOptions,
    selectedTheme,
    graphicImportSide,
    exportCardId,
    libraryPositionFilter,
    libraryPositionOptions,
    visibleLibraryCards,
    renderCardEditor,
    getCardThemeSelection,
    setGraphicImportSide,
    setExportCardId,
    setLibraryPositionFilter,
    setCardsView,
    setEditingCardId,
    close,
    startGraphicImport,
    deleteSelectedGraphic,
    canDeleteGraphic,
    exportSelectedCard,
    importCardBackup,
    exportSelectedCardPng,
    graphicFrontInputRef,
    graphicBackInputRef,
    handleFrontGraphicFile,
    handleBackGraphicFile,
    createCardFromPosition,
    sortCardsByPosition,
    cloneCard,
    deleteCard,
    canAssignPiece,
    setAssignTarget,
    removePieceCard,
  } = controller;
  const teamKey = cardsView === "red" ? "red" : "blue";
  const renderSlot = slot => (
    <div key={slot.id} className={`team-slot ${slot.isSub ? "substitute" : ""}`.trim()}>
      <div><strong>{slot.position}</strong>{slot.cardId && <small>{cardById[slot.cardId]?.name || "Missing card"}</small>}</div>
      <div className="slot-actions">
        <button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => setAssignTarget({ type: "team", team: teamKey, pieceId: slot.pieceId })}>Assign</button>
        {slot.cardId && <>{!sessionCode && <button onClick={() => { setEditingCardId(slot.cardId); setCardsView("library"); }}>Edit</button>}<button disabled={!canAssignPiece(pieces.find(piece => piece.id === slot.pieceId))} onClick={() => removePieceCard(slot.pieceId)}>Remove</button></>}
      </div>
    </div>
  );

  return (
    <div className="cards-panel">
      <div className="cards-panel-head"><strong>Player Cards</strong><div>
        <select value={selectedTheme} onChange={event => getCardThemeSelection(event.target.value)} disabled={!editingCardId}>{themeOptions.map(theme => <option key={theme} value={theme}>{theme}</option>)}</select>
        <select value={graphicImportSide} onChange={event => setGraphicImportSide(event.target.value)} disabled={!editingCardId} title="Choose which side to import"><option value="front">Front</option><option value="back">Back</option><option value="both">Both</option></select>
        <button onClick={startGraphicImport} disabled={!editingCardId}>Import Graphic</button><button onClick={deleteSelectedGraphic} disabled={!editingCardId || !canDeleteGraphic}>Delete Graphic</button>
        <select value={exportCardId} onChange={event => setExportCardId(event.target.value)} disabled={!cardState.cards.length}>{cardState.cards.length === 0 ? <option value="">No cards</option> : cardState.cards.map(card => <option key={card.id} value={card.id}>{card.name} ({card.position})</option>)}</select>
        <button onClick={exportSelectedCard}>Export Selected JSON</button><label className="import-btn">Import JSON<input type="file" accept="application/json" onChange={event => { importCardBackup(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <button onClick={() => exportSelectedCardPng("front")} disabled={!cardState.cards.length}>Export Front PNG</button><button onClick={() => exportSelectedCardPng("back")} disabled={!cardState.cards.length}>Export Back PNG</button>
        <input ref={graphicFrontInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden-file-input" onChange={event => { handleFrontGraphicFile(event.target.files?.[0]); event.target.value = ""; }} />
        <input ref={graphicBackInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden-file-input" onChange={event => { handleBackGraphicFile(event.target.files?.[0]); event.target.value = ""; }} />
        <button onClick={close}>×</button>
      </div></div>
      <div className="cards-tabs"><button className={cardsView === "library" ? "toggle-on" : ""} onClick={() => setCardsView("library")}>Card Library</button><button className={cardsView === "blue" ? "toggle-on" : ""} onClick={() => setCardsView("blue")}>Blue Team</button><button className={cardsView === "red" ? "toggle-on" : ""} onClick={() => setCardsView("red")}>Red Team</button></div>
      {cardsView === "library" ? <div className="cards-layout">
        <div className="card-library-list"><div className="card-library-actions"><button className="create-card-btn" disabled={workspaceLocked} onClick={() => createCardFromPosition("ST")}>+ Create</button><button className="sort-card-btn" onClick={sortCardsByPosition} disabled={workspaceLocked || cardState.cards.length < 2}>Sort</button><select className="filter-card-select" value={libraryPositionFilter} onChange={event => setLibraryPositionFilter(event.target.value)} disabled={cardState.cards.length === 0}><option value="ALL">Filter: All</option>{libraryPositionOptions.map(position => <option key={position} value={position}>{position}</option>)}</select></div>{visibleLibraryCards.map(card => <div key={card.id} className={`library-row ${editingCardId === card.id ? "selected" : ""}`} onClick={() => { if (!workspaceLocked) setEditingCardId(card.id); }}><span><b>{card.name}</b><small>{card.position}</small></span><div><button disabled={workspaceLocked} onClick={event => { event.stopPropagation(); cloneCard(card.id); }}>Clone</button><button disabled={workspaceLocked} onClick={event => { event.stopPropagation(); deleteCard(card.id); }}>Delete</button></div></div>)}{visibleLibraryCards.length === 0 && <div className="library-empty">No cards for this filter.</div>}</div>
        {renderCardEditor(editingCard)}
      </div> : <div className={`team-roster ${teamKey}`}><div className="roster-title">Starting IX</div><div className="team-layout">{rosterSlots[teamKey].starting.map(renderSlot)}</div><div className="roster-title substitutes-title">Substitutes</div><div className="team-layout substitutes-layout">{rosterSlots[teamKey].substitutes.map(renderSlot)}</div></div>}
    </div>
  );
}
