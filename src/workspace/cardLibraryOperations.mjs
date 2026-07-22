/** Pure structural Card Library mutations. Visual editor field/layout changes,
 * React publication, prompts, History and Manual Multiplayer sync stay outside. */
export function planCardLibraryUpsert({ cardState, card } = {}) {
  const currentCards = cardState?.cards || [];
  return {
    ...cardState,
    cards: currentCards.some(item => item.id === card.id)
      ? currentCards.map(item => item.id === card.id ? card : item)
      : [...currentCards, card],
  };
}

export function planCardLibraryClone({ cardState, sourceCard, nextId, timestamp, isInlineImageDataUrl } = {}) {
  if (!sourceCard || !nextId) return { cardState, clonedCard: null };
  const sourceGraphics = sourceCard.graphics || {};
  const graphics = { ...sourceGraphics };
  ["frontExportDataUrl", "backExportDataUrl", "frontLocalDataUrl", "backLocalDataUrl"].forEach(key => {
    if (isInlineImageDataUrl?.(graphics[key])) graphics[key] = "";
  });
  const sourceArtwork = sourceCard.artwork || {};
  const artwork = isInlineImageDataUrl?.(sourceArtwork.customDataUrl)
    ? { ...sourceArtwork, customDataUrl: "" }
    : sourceArtwork;
  const clonedCard = {
    ...sourceCard,
    id: nextId,
    name: `${sourceCard.name} Copy`,
    graphics,
    artwork,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    cardState: planCardLibraryUpsert({ cardState, card: clonedCard }),
    clonedCard,
  };
}

export function planCardLibraryDeletion({ cardState, pieces, cardId, resetTeams, sanitizePieces } = {}) {
  const nextCardState = {
    ...cardState,
    cards: (cardState?.cards || []).filter(card => card.id !== cardId),
    teams: resetTeams,
    assignments: {},
  };
  const detachedPieces = (pieces || []).map(piece => piece.cardId === cardId ? { ...piece, cardId: null } : piece);
  return {
    cardState: nextCardState,
    pieces: sanitizePieces ? sanitizePieces(detachedPieces, nextCardState) : detachedPieces,
  };
}

export function planWorkspaceCardReset({ pieces } = {}) {
  return (pieces || []).map(piece => ({ ...piece, cardId: null }));
}
