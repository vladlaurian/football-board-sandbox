import React, { useEffect, useState } from "react";

// The shared visual card shell used by the Editor, Inspector, assignment
// preview, and PNG export. The application shell supplies the card-canvas
// editor adapter so this component remains the single presentation path.
export function CardPreview({
  card,
  compact = false,
  team = "neutral",
  side = "back",
  flippable = false,
  controlledSide = null,
  onSideChange = null,
  showLayoutZones = false,
  renderContext,
}) {
  const [currentSide, setCurrentSide] = useState(side);
  useEffect(() => {
    if (controlledSide == null) setCurrentSide(side);
  }, [side, card?.id, controlledSide]);

  if (!card) return <div className="card-preview empty">No card</div>;

  const {
    appTheme,
    customCardTheme,
    getCardTheme,
    cardTextColors,
    safeColor,
    colorToRgbTriplet,
    VisualCanvas,
    selectedLayout,
    onSelectLayout,
  } = renderContext;
  const activeTheme = getCardTheme(card, appTheme);
  const themeClass = activeTheme === customCardTheme ? "theme-custom" : `theme-${activeTheme.toLowerCase().replace(/\s+/g, "-")}`;
  const shownSide = flippable ? (controlledSide || currentSide) : side;
  const graphicUrl = shownSide === "front" ? card?.graphics?.frontDataUrl : card?.graphics?.backDataUrl;
  const colors = cardTextColors(card);
  const previewStyle = {
    "--card-header-color": safeColor(colors.header),
    "--card-header-front-color": safeColor(colors.headerFront),
    "--card-header-back-color": safeColor(colors.headerBack),
    "--card-position-front-color": safeColor(colors.positionFront),
    "--card-position-back-color": safeColor(colors.positionBack),
    "--card-front-color": safeColor(colors.frontFields),
    "--card-attributes-front-color": safeColor(colors.attributesFront),
    "--card-bonuses-front-color": safeColor(colors.bonusesFront),
    "--card-attributes-color": safeColor(colors.attributes),
    "--card-bonuses-color": safeColor(colors.bonuses),
    "--card-attributes-title-color": safeColor(colors.attributesTitle),
    "--card-bonuses-title-color": safeColor(colors.bonusesTitle),
    "--card-area-color": safeColor(colors.defensiveArea),
    "--card-area-rgb": colorToRgbTriplet(colors.defensiveArea),
    "--card-area-title-color": safeColor(colors.defensiveAreaTitle),
    "--card-area-active-color": safeColor(colors.defensiveAreaActive, "#50be78"),
    "--card-area-active-rgb": colorToRgbTriplet(colors.defensiveAreaActive, "#50be78"),
    "--card-special-color": safeColor(colors.specialAbility),
    "--card-special-title-color": safeColor(colors.specialAbilityTitle),
  };

  return (
    <div className={`card-preview ${shownSide === "front" ? "card-front" : "card-back"} ${themeClass} ${team}`} style={previewStyle} data-compact={compact ? "true" : undefined}>
      <div className="card-preview-art-layer" aria-hidden="true">
        {graphicUrl ? <img className="card-custom-graphic" src={graphicUrl} crossOrigin="anonymous" alt="" /> : null}
      </div>
      <div className={`card-preview-content-layer ${showLayoutZones ? "layout-editing" : ""}`}>
        <VisualCanvas card={card} side={shownSide} showZones={showLayoutZones} selectedLayout={selectedLayout} onSelectLayout={onSelectLayout} />
      </div>
      {flippable && (
        <button
          type="button"
          className="card-flip-btn card-preview-flip-btn"
          title={shownSide === "front" ? "Show card back" : "Show card front"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextSide = shownSide === "front" ? "back" : "front";
            if (onSideChange) onSideChange(nextSide);
            else setCurrentSide(nextSide);
          }}
        >
          {shownSide === "front" ? "↻" : "↺"}
        </button>
      )}
    </div>
  );
}
