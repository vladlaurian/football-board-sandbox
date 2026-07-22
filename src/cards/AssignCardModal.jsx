import React from "react";
import { X } from "lucide-react";
import { CardPreview } from "./CardPreview.jsx";

export function AssignCardModal({ controller }) {
  const { isOpen, assignCards, activeAssignCards, assignPreviewCardId, assignPreviewSide, assignPositionFilter, assignPositionOptions, pieces, renderContext, normalizeFrontStars, close, setAssignSortByPosition, setAssignPositionFilter, setAssignPreviewCardId, setAssignPreviewSide, assignCard } = controller;
  if (!isOpen) return null;
  const selectedPreviewCard = assignCards.find(card => card.id === assignPreviewCardId) || assignCards[0] || null;
  const assignedTeamForCard = cardId => {
    const assignedPiece = pieces.find(piece => piece.cardId === cardId && piece.team !== "BALL");
    if (!assignedPiece) return null;
    return assignedPiece.team === "A" ? "blue" : assignedPiece.team === "B" ? "red" : "assigned";
  };
  const starsFor = card => {
    const count = Math.max(0, Math.min(5, Number(normalizeFrontStars(card?.starsFront).count) || 0));
    return count ? "★".repeat(count) : "—";
  };
  return <div className="modal-backdrop" onPointerDown={close}><div className="assign-modal assign-modal-wide" onPointerDown={event => event.stopPropagation()}><div className="modal-title"><strong>Assign Card</strong><button className="icon-btn" onClick={close}><X size={18} /></button></div>{assignCards.length === 0 ? <p>Nu există carduri încă. Creează unul în Card Library.</p> : <div className="assign-picker-layout"><div className="assign-list-panel"><div className="assign-card-actions"><button type="button" className="sort-card-btn" onClick={() => setAssignSortByPosition(true)} disabled={activeAssignCards.length < 2}>Sort</button><select className="filter-card-select" value={assignPositionFilter} onChange={event => setAssignPositionFilter(event.target.value)} disabled={activeAssignCards.length === 0}><option value="ALL">Filter: All</option>{assignPositionOptions.map(position => <option key={position} value={position}>{position}</option>)}</select></div><div className="assign-list">{assignCards.map(card => { const assignedTeam = assignedTeamForCard(card.id); return <button key={card.id} type="button" className={`assign-card-row ${assignPreviewCardId === card.id ? "selected" : ""}`} onClick={() => { setAssignPreviewCardId(card.id); setAssignPreviewSide("front"); }}><span className={`assign-status-dot ${assignedTeam || "free"}`} aria-hidden="true" /><span className="assign-card-row-main"><b>{card.name}</b><small>{card.position}</small></span><span className="assign-card-stars" aria-label={`${starsFor(card)} stars`}>{starsFor(card)}</span></button>; })}</div></div><div className="assign-preview-panel">{selectedPreviewCard ? <><div className="assign-preview-card-shell"><CardPreview card={selectedPreviewCard} team="neutral" side={assignPreviewSide} renderContext={renderContext} /></div><div className="assign-preview-actions"><button type="button" onClick={() => setAssignPreviewSide(side => side === "front" ? "back" : "front")}>Flip</button><button type="button" className="assign-confirm-btn" onClick={() => assignCard(selectedPreviewCard.id)}>Assign</button></div></> : <div className="assign-empty-preview">Alege un card din listă.</div>}</div></div>}</div></div>;
}
